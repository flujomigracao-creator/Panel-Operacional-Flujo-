// Sincronización panel ↔ Kommo (con la sesión del usuario; solo organizaciones habilitadas en channel_integrations).
// POST { action: 'outbox' }    → envía a Kommo los cambios de etapa de trámites pendientes en kommo_outbox
//                                 (los encola el trigger on_client_service_stage_change: panel o automatizaciones).
// POST { action: 'pipelines' } → trae de Kommo las etapas reales del embudo Comercial y las guarda en crm_stages
//                                 (nombre y orden; agrega las nuevas; nunca borra).
// Secreto: KOMMO_API_TOKEN. Cuenta: organization_settings.kommo_base_url.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const MAX_ATTEMPTS = 5;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const auth = req.headers.get('Authorization') || '';
  const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: { user: u } } = await user.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
  if (!u) return json({ error: 'No autenticado' }, 401);
  const { data: member } = await admin.from('organization_members').select('organization_id').eq('user_id', u.id).limit(1).maybeSingle();
  if (!member) return json({ error: 'Sin acceso a la organización' }, 403);
  const orgId: string = member.organization_id;
  const { data: canal } = await admin.from('channel_integrations').select('kommo_enabled').eq('organization_id', orgId).maybeSingle();
  if (!canal?.kommo_enabled) return json({ error: 'Kommo no está habilitado para tu organización.' }, 403);

  const { data: setting } = await admin.from('organization_settings').select('value').eq('organization_id', orgId).eq('key', 'kommo_base_url').maybeSingle();
  const base = String(setting?.value ?? '').replace(/\/+$/, '');
  const token = Deno.env.get('KOMMO_API_TOKEN');
  if (!base || !token) return json({ error: 'Falta configurar Kommo (cuenta en Configuración y KOMMO_API_TOKEN).' }, 500);
  const kommo = (path: string, init: RequestInit = {}) =>
    fetch(`${base}/api/v4${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });

  let body: any;
  try { body = await req.json(); } catch { body = {}; }

  // ── Cola de cambios de etapa de trámites → Kommo ──────────────────────────────────
  if (body.action === 'outbox') {
    const { data: rows, error } = await admin.from('kommo_outbox')
      .select('id, kommo_lead_id, action, payload, attempts')
      .eq('organization_id', orgId).eq('status', 'pending').eq('action', 'sync_etapa')
      .order('created_at').limit(30);
    if (error) return json({ error: error.message }, 500);
    const result = { sent: 0, skipped: 0, failed: 0 };
    for (const r of rows || []) {
      const statusId = Number(r.payload?.status_id) || null;
      const pipelineId = Number(r.payload?.pipeline_id) || null;
      // Etapas del panel sin equivalente en Kommo (ej. "Pago confirmado"): no hay nada que mover.
      if (!statusId || !r.kommo_lead_id) {
        await admin.from('kommo_outbox').update({ status: 'done', processed_at: new Date().toISOString(), last_error: 'Sin enviar: la etapa no tiene equivalente en Kommo' }).eq('id', r.id);
        result.skipped += 1;
        continue;
      }
      const res = await kommo(`/leads/${r.kommo_lead_id}`, {
        method: 'PATCH',
        body: JSON.stringify(pipelineId ? { pipeline_id: pipelineId, status_id: statusId } : { status_id: statusId }),
      });
      if (res.ok) {
        await admin.from('kommo_outbox').update({ status: 'done', processed_at: new Date().toISOString(), attempts: (r.attempts || 0) + 1, last_error: null }).eq('id', r.id);
        result.sent += 1;
      } else {
        const txt = (await res.text().catch(() => '')).slice(0, 300);
        const attempts = (r.attempts || 0) + 1;
        await admin.from('kommo_outbox').update({ status: attempts >= MAX_ATTEMPTS || res.status === 400 || res.status === 404 ? 'error' : 'pending', attempts, last_error: `Kommo ${res.status}: ${txt}` }).eq('id', r.id);
        result.failed += 1;
        if (res.status === 401) return json({ error: 'Kommo rechazó el token (401): hay que renovarlo.', ...result }, 502);
      }
    }
    return json({ ok: true, ...result, total: rows?.length || 0 });
  }

  // ── Etapas reales del embudo Comercial desde Kommo ───────────────────────────────
  if (body.action === 'pipelines') {
    const { data: pipes } = await admin.from('crm_pipelines').select('id, kommo_pipeline_id').eq('organization_id', orgId).not('kommo_pipeline_id', 'is', null);
    let updated = 0, created = 0;
    for (const p of pipes || []) {
      const res = await kommo(`/leads/pipelines/${p.kommo_pipeline_id}`);
      if (!res.ok) return json({ error: `Kommo ${res.status} al leer el embudo ${p.kommo_pipeline_id}` }, 502);
      const data = await res.json();
      const statuses = (data?._embedded?.statuses || []).filter((s: any) => s.type !== 1); // type 1 = "leads entrantes"
      const { data: current } = await admin.from('crm_stages').select('id, kommo_status_id, name, position').eq('pipeline_id', p.id);
      const byStatus = new Map((current || []).map((s: any) => [Number(s.kommo_status_id), s]));
      for (const s of statuses) {
        const kind = s.id === 142 ? 'won' : s.id === 143 ? 'lost' : 'open';
        const position = s.id === 142 ? 10000 : s.id === 143 ? 11000 : Number(s.sort) || 0;
        const existing: any = byStatus.get(Number(s.id));
        if (existing) {
          if (existing.name !== s.name || existing.position !== position) {
            await admin.from('crm_stages').update({ name: s.name, position }).eq('id', existing.id);
            updated += 1;
          }
        } else {
          await admin.from('crm_stages').insert({ organization_id: orgId, pipeline_id: p.id, name: s.name, position, kind, kommo_status_id: s.id });
          created += 1;
        }
      }
    }
    return json({ ok: true, updated, created });
  }

  return json({ error: 'Acción desconocida' }, 400);
});

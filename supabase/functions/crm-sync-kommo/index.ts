// Sincroniza con Kommo un cambio de etapa que el panel ya guardó en Supabase (crm_move_lead_stage).
// POST { event_id }  →  lee el evento con la sesión del usuario (RLS), mueve el lead en Kommo
// y deja el resultado en crm_lead_events.sync_status (synced | failed | skipped).
// Idempotente: un evento ya sincronizado no vuelve a llamar a Kommo, y si el lead tuvo un cambio
// posterior el evento se marca 'skipped' (ya no representa el estado actual).
// Configuración: secreto KOMMO_API_TOKEN; dominio de Kommo en organization_settings (key 'kommo_base_url')
// o, en su defecto, en el secreto KOMMO_BASE_URL. Sin ORG_ID fijo: la organización sale del evento.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const auth = req.headers.get('Authorization') || '';
  const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: { user: u } } = await user.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
  if (!u) return json({ error: 'No autenticado' }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  const eventId = String(body.event_id || '');
  if (!eventId) return json({ error: 'Falta event_id' }, 400);

  // Con la sesión del usuario: si el evento no es de su organización, RLS no lo devuelve.
  const { data: ev } = await user.from('crm_lead_events').select('id, organization_id, lead_id, event_type, to_stage_id, sync_status, created_at').eq('id', eventId).maybeSingle();
  if (!ev) return json({ error: 'Evento no encontrado' }, 404);
  if (ev.event_type !== 'stage_changed') return json({ ok: true, skipped: true });
  if (ev.sync_status === 'synced') return json({ ok: true, already_synced: true });

  const fin = async (sync_status: string, sync_error: string | null = null) => {
    await admin.from('crm_lead_events').update({ sync_status, sync_error, synced_at: sync_status === 'synced' ? new Date().toISOString() : null }).eq('id', ev.id);
  };

  const { data: lead } = await user.from('comercial_leads').select('kommo_lead_id').eq('id', ev.lead_id).maybeSingle();
  const { data: stage } = await user.from('crm_stages').select('kommo_status_id, pipeline_id').eq('id', ev.to_stage_id).maybeSingle();
  if (!lead?.kommo_lead_id || !stage?.kommo_status_id) { await fin('skipped'); return json({ ok: true, skipped: true }); }

  // ¿Hubo un cambio de etapa posterior? Entonces este evento ya no manda.
  const { count: newer } = await user.from('crm_lead_events').select('id', { count: 'exact', head: true })
    .eq('lead_id', ev.lead_id).eq('event_type', 'stage_changed').gt('created_at', ev.created_at);
  if (newer) { await fin('skipped', 'reemplazado por un cambio posterior'); return json({ ok: true, superseded: true }); }

  const { data: pipe } = await user.from('crm_pipelines').select('kommo_pipeline_id').eq('id', stage.pipeline_id).maybeSingle();
  const { data: setting } = await admin.from('organization_settings').select('value').eq('organization_id', ev.organization_id).eq('key', 'kommo_base_url').maybeSingle();
  const base = String(setting?.value ?? Deno.env.get('KOMMO_BASE_URL') ?? '').replace(/\/+$/, '');
  const token = Deno.env.get('KOMMO_API_TOKEN');
  if (!base || !token) {
    const msg = 'Falta configurar Kommo (organization_settings.kommo_base_url o KOMMO_BASE_URL, y KOMMO_API_TOKEN).';
    await fin('failed', msg);
    return json({ error: msg }, 500);
  }

  const res = await fetch(`${base}/api/v4/leads/${lead.kommo_lead_id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(pipe?.kommo_pipeline_id
      ? { pipeline_id: Number(pipe.kommo_pipeline_id), status_id: Number(stage.kommo_status_id) }
      : { status_id: Number(stage.kommo_status_id) }),
  });
  if (!res.ok) {
    const txt = (await res.text().catch(() => '')).slice(0, 300);
    const msg = res.status === 401 ? 'Kommo rechazó el token (401): hay que renovarlo.' : `Kommo ${res.status}: ${txt}`;
    await fin('failed', msg);
    return json({ error: msg }, 502);
  }
  await fin('synced');
  return json({ ok: true });
});

// Mueve un lead del pipeline Comercial de Kommo a otra etapa (vista de Nora del panel) y refleja el cambio
// al toque en `comercial_leads`, sin esperar al webhook.
// POST { kommo_lead_id, status_id, etapa_nombre, etapa_position, pipeline_id? }
// Con pipeline_id de otro embudo (Operacional) solo se mueve en Kommo: el webhook del Receptor registra el caso.
// Sin ORG_ID fijo: la organización es la del usuario; la cuenta de Kommo sale de organization_settings
// (key 'kommo_base_url', o el secreto KOMMO_BASE_URL) y el embudo Comercial de crm_pipelines.
// Secreto requerido (Supabase → Edge Functions → Secrets): KOMMO_API_TOKEN
// (el mismo token de larga duración que usa la credencial "Kommo Flujo Migração" en n8n).
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
  const { data: member } = await admin.from('organization_members').select('organization_id').eq('user_id', u.id).limit(1).maybeSingle();
  if (!member) return json({ error: 'Sin acceso a la organización' }, 403);
  const orgId: string = member.organization_id;
  // El token de Kommo es de una cuenta: solo la organización habilitada en channel_integrations puede usarlo.
  const { data: canal } = await admin.from('channel_integrations').select('kommo_enabled').eq('organization_id', orgId).maybeSingle();
  if (!canal?.kommo_enabled) return json({ error: 'Kommo no está habilitado para tu organización.' }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  const kommoLeadId = Number(body.kommo_lead_id);
  const statusId = Number(body.status_id);
  const etapaNombre = String(body.etapa_nombre || '');
  const etapaPosition = Number(body.etapa_position);
  const pipelineId = Number(body.pipeline_id) || null;
  if (!kommoLeadId || !statusId || !etapaNombre) return json({ error: 'Falta kommo_lead_id, status_id o etapa_nombre' }, 400);

  // El lead tiene que ser de la organización del usuario (RLS con su sesión).
  const { data: lead } = await user.from('comercial_leads').select('id').eq('kommo_lead_id', kommoLeadId).maybeSingle();
  if (!lead) return json({ error: 'Lead no encontrado' }, 404);

  const { data: comercial } = await admin.from('crm_pipelines').select('kommo_pipeline_id').eq('organization_id', orgId).eq('code', 'comercial').maybeSingle();
  const pipelineComercial = Number(comercial?.kommo_pipeline_id) || null;
  const otroEmbudo = pipelineId !== null && pipelineId !== pipelineComercial;

  const { data: setting } = await admin.from('organization_settings').select('value').eq('organization_id', orgId).eq('key', 'kommo_base_url').maybeSingle();
  const kommoBase = String(setting?.value ?? Deno.env.get('KOMMO_BASE_URL') ?? '').replace(/\/+$/, '');
  const kommoToken = Deno.env.get('KOMMO_API_TOKEN');
  if (!kommoToken || !kommoBase) {
    return json({ error: 'Falta configurar Kommo: la cuenta (Configuración → Integraciones) y KOMMO_API_TOKEN en Supabase (Edge Functions → Secrets).' }, 500);
  }

  const kommoRes = await fetch(`${kommoBase}/api/v4/leads/${kommoLeadId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${kommoToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(otroEmbudo ? { pipeline_id: pipelineId, status_id: statusId } : { status_id: statusId }),
  });
  if (!kommoRes.ok) {
    const errText = await kommoRes.text().catch(() => '');
    if (kommoRes.status === 401) return json({ error: 'Kommo rechazó el token (401): hay que renovar el token de larga duración de Kommo.' }, 502);
    return json({ error: `Kommo ${kommoRes.status}: ${errText.slice(0, 300)}` }, 502);
  }
  if (otroEmbudo) return json({ ok: true, otro_embudo: true });

  // Con la sesión del usuario: RLS limita a su organización y la actividad queda a su nombre.
  const { error } = await user.from('comercial_leads').update({
    etapa_status_id: statusId,
    etapa_nombre: etapaNombre,
    etapa_position: etapaPosition || null,
    updated_at: new Date().toISOString(),
  }).eq('id', lead.id);
  if (error) return json({ error: error.message }, 500);

  return json({ ok: true });
});

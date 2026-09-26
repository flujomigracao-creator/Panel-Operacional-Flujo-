// Mueve un lead del pipeline Comercial de Kommo a otra etapa (drag & drop del tablero Kanban
// del panel) y refleja el cambio al toque en `comercial_leads`, sin esperar al webhook.
// POST { kommo_lead_id, status_id, etapa_nombre, etapa_position }
// Secreto requerido (Supabase → Edge Functions → Secrets): KOMMO_API_TOKEN
// (el mismo token de larga duración que usa la credencial "Kommo Flujo Migração" en n8n).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const KOMMO_BASE = 'https://flujomigracao.kommo.com';

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
  const { data: member } = await admin.from('organization_members').select('role').eq('user_id', u.id).eq('organization_id', ORG_ID).maybeSingle();
  if (!member) return json({ error: 'Sin acceso a la organización' }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  const kommoLeadId = Number(body.kommo_lead_id);
  const statusId = Number(body.status_id);
  const etapaNombre = String(body.etapa_nombre || '');
  const etapaPosition = Number(body.etapa_position);
  if (!kommoLeadId || !statusId || !etapaNombre) return json({ error: 'Falta kommo_lead_id, status_id o etapa_nombre' }, 400);

  const kommoToken = Deno.env.get('KOMMO_API_TOKEN');
  if (!kommoToken) {
    return json({ error: 'Falta configurar KOMMO_API_TOKEN en Supabase (Edge Functions → Secrets).' }, 500);
  }

  const kommoRes = await fetch(`${KOMMO_BASE}/api/v4/leads/${kommoLeadId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${kommoToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status_id: statusId }),
  });
  if (!kommoRes.ok) {
    const errText = await kommoRes.text().catch(() => '');
    return json({ error: `Kommo ${kommoRes.status}: ${errText.slice(0, 300)}` }, 502);
  }

  const { data, error } = await admin.rpc('mover_etapa_lead_comercial', {
    p_kommo_lead_id: kommoLeadId,
    p_status_id: statusId,
    p_etapa_nombre: etapaNombre,
    p_etapa_position: etapaPosition || null,
  });
  if (error) return json({ error: error.message }, 500);
  if (data?.ok === false) return json({ error: data.erro || 'No se pudo actualizar en Supabase' }, 500);

  return json({ ok: true });
});

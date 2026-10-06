// Aviso final único cuando un asesor humano toma la conversación (lo dispara el trigger nora_pausar_por_asesor).
// Solo actúa si el lead tiene asesor_tomo_at y aún no tiene aviso_asesor_at; el texto es fijo.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
const AVISO = 'Un asesor de nuestro equipo ya está atendiendo tu caso. Desde ahora, continuará contigo directamente una persona del equipo; no necesitas seguir respondiendo a Nora.';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  const id = Number(body.kommo_lead_id);
  if (!id) return json({ error: 'Falta kommo_lead_id' }, 400);
  const admin = createClient(url, key);
  const { data: lead } = await admin.from('comercial_leads')
    .update({ aviso_asesor_at: new Date().toISOString() })
    .eq('kommo_lead_id', id).not('asesor_tomo_at', 'is', null).is('aviso_asesor_at', null)
    .select('kommo_lead_id').maybeSingle();
  if (!lead) return json({ ok: true, omitido: 'sin aviso pendiente' });
  const r = await fetch(`${url}/functions/v1/enviar-whatsapp-atendente`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
    body: JSON.stringify({ kommo_lead_id: id, mensaje: AVISO, fase: 'aviso_asesor', idioma: 'es', ignorar_pausa: true }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d?.ok === false) {
    await admin.from('comercial_leads').update({ aviso_asesor_at: null }).eq('kommo_lead_id', id);
    return json({ ok: false, error: d?.error || `sender ${r.status}` }, 502);
  }
  return json({ ok: true, enviado: true });
});

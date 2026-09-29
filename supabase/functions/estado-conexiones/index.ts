// Salud de todo lo que necesita Nora para atender: Kommo (token), n8n (donde corre Nora), WhatsApp (número y token de
// Meta) y clientes esperando respuesta. El panel lo consulta cada pocos minutos y avisa si algo falla.
// POST {} → { ok, problemas: [{ servicio, motivo }] }
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const conTiempo = (url: string, init: RequestInit = {}, ms = 8000) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(ms) }).catch(() => null);

async function revisarKommo() {
  const token = Deno.env.get('KOMMO_API_TOKEN');
  if (!token) return 'Falta configurar KOMMO_API_TOKEN en Supabase.';
  const r = await conTiempo('https://flujomigracao.kommo.com/api/v4/account', { headers: { Authorization: `Bearer ${token}` } });
  if (!r) return 'No se pudo contactar a Kommo.';
  if (r.status === 401) return 'Kommo rechaza el token (vencido o revocado): generá uno nuevo y pegalo en n8n y en Supabase.';
  return r.ok ? null : `Kommo respondió ${r.status}.`;
}

async function revisarN8n() {
  // Un reintento: n8n a veces tarda un poco en contestar sin estar caído.
  for (let i = 0; i < 2; i++) {
    const r = await conTiempo('https://yhlqmdlg-n8n.cbr6xz.easypanel.host/healthz', {}, 10000);
    if (r?.ok) return null;
  }
  return 'n8n no responde: Nora no puede contestar. Reinicialo desde Easypanel.';
}

async function revisarWhatsApp() {
  const token = (Deno.env.get('WHATSAPP_TOKEN') || '').trim();
  const phoneId = (Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '').trim();
  if (!token || !phoneId) return 'Faltan WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID en Supabase.';
  const r = await conTiempo(`https://graph.facebook.com/v23.0/${phoneId}?fields=status,quality_rating`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r) return 'No se pudo contactar a Meta (WhatsApp).';
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return d?.error?.code === 190 ? 'El token de WhatsApp (Meta) venció: hay que renovarlo.' : `Meta respondió: ${d?.error?.message || r.status}`;
  if (d.status && d.status !== 'CONNECTED') return `El número de WhatsApp está ${d.status}.`;
  if (d.quality_rating === 'RED') return 'La calidad del número de WhatsApp está en ROJO: riesgo de bloqueo.';
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = Deno.env.get('SUPABASE_URL')!;
  const auth = req.headers.get('Authorization') || '';
  const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: { user: u } } = await user.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
  if (!u) return json({ error: 'No autenticado' }, 401);
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const [kommo, n8n, whatsapp, esperando] = await Promise.all([
    revisarKommo(),
    revisarN8n(),
    revisarWhatsApp(),
    admin.rpc('comercial_clientes_esperando_nora').then(({ data }) => Number(data) || 0),
  ]);
  const problemas = [
    kommo && { servicio: 'Kommo', motivo: kommo },
    n8n && { servicio: 'n8n', motivo: n8n },
    whatsapp && { servicio: 'WhatsApp', motivo: whatsapp },
    esperando > 0 && { servicio: 'Nora', motivo: `${esperando} cliente${esperando > 1 ? 's' : ''} esperando respuesta de Nora hace más de 10 minutos.` },
  ].filter(Boolean);
  return json({ ok: problemas.length === 0, problemas });
});

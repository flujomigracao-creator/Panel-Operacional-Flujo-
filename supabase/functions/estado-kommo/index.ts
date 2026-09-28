// Comprueba que el token de Kommo (KOMMO_API_TOKEN, el mismo de la credencial "Kommo Flujo Migração" de n8n)
// sigue funcionando. El panel lo usa para avisar cuando Kommo deja de sincronizar.
// POST {} → { ok: true } | { ok: false, motivo }
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
  const url = Deno.env.get('SUPABASE_URL')!;
  const auth = req.headers.get('Authorization') || '';
  const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: { user: u } } = await user.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
  if (!u) return json({ error: 'No autenticado' }, 401);

  const token = Deno.env.get('KOMMO_API_TOKEN');
  if (!token) return json({ ok: false, motivo: 'Falta configurar KOMMO_API_TOKEN en Supabase.' });
  const r = await fetch('https://flujomigracao.kommo.com/api/v4/account', { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
  if (!r) return json({ ok: false, motivo: 'No se pudo contactar a Kommo.' });
  if (r.status === 401) return json({ ok: false, motivo: 'Kommo rechaza el token (vencido o revocado).' });
  if (!r.ok) return json({ ok: false, motivo: `Kommo respondió ${r.status}.` });
  return json({ ok: true });
});

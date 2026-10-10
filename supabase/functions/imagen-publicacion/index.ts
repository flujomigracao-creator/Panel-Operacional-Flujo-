// Genera la imagen de una publicación de Facebook con la MISMA clave de OpenAI que usa el Laboratorio de creativos
// (secreto OPENAI_API_KEY, solo en este backend). La llama el workflow de n8n «Publicaciones Facebook - Publicar aprobadas»
// con la clave de servicio de Supabase: POST { id } → { ok, url, path } (URL firmada de 10 min para que Facebook la descargue).
// La imagen es opcional: si algo falla devuelve { ok:false, motivo } y el workflow publica solo el texto.
import { createClient } from 'npm:@supabase/supabase-js@2';

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const BUCKET = 'creatives';
const OPENAI = 'https://api.openai.com/v1';
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

async function openai(ruta: string, init: RequestInit = {}) {
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) throw new Error('Falta el secreto OPENAI_API_KEY en Supabase.');
  const r = await fetch(`${OPENAI}${ruta}`, { ...init, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`OpenAI (${r.status}): ${String(d?.error?.message || '').slice(0, 200)}`);
  return d;
}

/** gpt-image-N más reciente que ofrezca la cuenta (o el secreto IMAGE_MODEL); respaldo gpt-image-1. */
async function modeloImagen() {
  const fijo = Deno.env.get('IMAGE_MODEL');
  if (fijo) return fijo;
  try {
    const d = await openai('/models');
    const v = (d.data || []).map((m: any) => ({ id: String(m.id), n: /^gpt-image-(\d+(?:\.\d+)?)$/.exec(String(m.id)) }))
      .filter((x: any) => x.n).map((x: any) => ({ id: x.id, v: parseFloat(x.n[1]) })).sort((a: any, b: any) => b.v - a.v);
    return v[0]?.id || 'gpt-image-1';
  } catch { return 'gpt-image-1'; }
}

/** Prompt: ilustración editorial sobre la idea del post, SIN texto dentro (los modelos fallan con texto en español) ni documentos reales. */
function construirPrompt(p: { tema?: string | null; tipo?: string | null; imagen_idea?: string | null; texto: string }) {
  const idea = (p.imagen_idea || '').trim() || String(p.texto).split('\n')[0].slice(0, 160);
  return [
    'Flat modern editorial illustration for a social media post of an immigration-help service in Brazil, aimed at Spanish-speaking migrants.',
    `Topic: ${p.tema || 'migration paperwork in Brazil'}. Visual idea: ${idea}.`,
    'Style: clean vector look, warm friendly colors (deep blue, green and yellow accents), simple shapes, generous empty space, welcoming and trustworthy mood.',
    'Absolutely NO text, NO letters, NO numbers, NO logos, NO flags, NO official seals or government emblems, NO real-looking identity documents, NO recognizable real people.',
    'Square composition, centered subject.',
  ].join(' ');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, motivo: 'Usa POST.' }, 405);
  // verify_jwt=true ya validó la firma en el gateway; aquí solo se exige que sea la clave de servicio (rol service_role).
  const auth = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  let rol = '';
  try { rol = JSON.parse(atob(auth.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role || ''; } catch { /* no es un JWT */ }
  const servicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (rol !== 'service_role' || !servicio) return json({ ok: false, motivo: 'No autorizado.' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, servicio, { auth: { persistSession: false } });
  try {
    const { id } = await req.json();
    if (!id) return json({ ok: false, motivo: 'Falta el id de la publicación.' }, 400);

    const { data: cfgRow } = await admin.from('organization_settings').select('value').eq('organization_id', ORG_ID).eq('key', 'publicaciones_imagenes').maybeSingle();
    const cfg = { activo: true, max_por_dia: 10, ...((cfgRow?.value as object) || {}) } as { activo: boolean; max_por_dia: number };
    if (!cfg.activo) return json({ ok: false, motivo: 'Imágenes automáticas apagadas.' });

    const { data: p } = await admin.from('publicaciones').select('id, tema, tipo, texto, imagen_idea, imagen_path').eq('id', id).maybeSingle();
    if (!p) return json({ ok: false, motivo: 'La publicación no existe.' }, 404);

    let path = p.imagen_path as string | null;
    if (!path) {
      const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { count } = await admin.from('publicaciones').select('id', { count: 'exact', head: true }).gte('imagen_at', desde);
      if ((count ?? 0) >= cfg.max_por_dia) return json({ ok: false, motivo: `Tope de ${cfg.max_por_dia} imágenes por día alcanzado.` });

      const model = await modeloImagen();
      const d = await openai('/images/generations', { method: 'POST', body: JSON.stringify({ model, prompt: construirPrompt(p as any), size: '1024x1024', n: 1 }) });
      const b64 = d?.data?.[0]?.b64_json;
      if (!b64) throw new Error('OpenAI no devolvió la imagen.');
      path = `publicaciones/${p.id}.png`;
      const { error: up } = await admin.storage.from(BUCKET).upload(path, bytes(b64), { contentType: 'image/png', upsert: true });
      if (up) throw new Error(`No se pudo guardar la imagen: ${up.message}`);
      await admin.from('publicaciones').update({ imagen_path: path, imagen_at: new Date().toISOString() }).eq('id', p.id);
    }

    const { data: firmada } = await admin.storage.from(BUCKET).createSignedUrl(path, 600);
    if (!firmada?.signedUrl) throw new Error('No se pudo firmar la URL de la imagen.');
    return json({ ok: true, url: firmada.signedUrl, path });
  } catch (e) {
    return json({ ok: false, motivo: String((e as Error).message || e).slice(0, 300) });
  }
});

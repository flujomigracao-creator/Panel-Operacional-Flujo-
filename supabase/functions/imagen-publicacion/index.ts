// Genera la imagen de una publicación de Facebook con la MISMA clave de OpenAI que usa el Laboratorio de creativos
// (secreto OPENAI_API_KEY, solo en este backend). La llama el workflow de n8n «Publicaciones Facebook - Publicar aprobadas»
// con la clave de servicio de Supabase: POST { id } → { ok, url, path } (URL firmada de 10 min para que Facebook la descargue).
// La imagen es opcional: si algo falla devuelve { ok:false, motivo } y el workflow publica solo el texto.
// Con { id, red: 'instagram' } genera la imagen PROPIA de Instagram (estilo cinematográfico que llame la atención, con titular
// opcional escrito en la imagen) y la guarda aparte (ig_imagen_path); en Instagram, sin imagen no se publica.
// Con { id, red: 'instagram', slide: N } y ig_formato='carrusel' genera la lámina N (1 = portada del país de origen dirigida al
// grupo, ej. Cuba → cubanos) y guarda su ruta en ig_slides[N-1].path. Las imágenes de Instagram se guardan en JPEG.
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

/** Prompt de Instagram: foto editorial/póster llamativo, con el titular corto escrito en la imagen si lo hay. */
function construirPromptIG(p: { tema?: string | null; ig_imagen_idea?: string | null; imagen_idea?: string | null; ig_titular?: string | null; texto: string }) {
  const idea = (p.ig_imagen_idea || p.imagen_idea || '').trim() || String(p.texto).split('\n')[0].slice(0, 160);
  const titular = (p.ig_titular || '').trim().slice(0, 40);
  return [
    'Scroll-stopping square Instagram feed image for a Spanish-language account that helps Latin American migrants (mostly Cubans) with paperwork and life in Brazil.',
    `Topic: ${p.tema || 'migration paperwork in Brazil'}. Visual idea: ${idea}.`,
    'Style: cinematic editorial photography or bold modern poster look, rich saturated warm colors, strong contrast, dramatic natural light, one clear emotional focal point, shallow depth of field, authentic and aspirational, never bland stock-photo, never clip-art, never flat vector.',
    'People are welcome: fictional Latino adults with natural expressive faces. No recognizable real people, no celebrities.',
    titular
      ? `Include this headline text exactly as written, spelled perfectly, in big bold sans-serif capital letters with high contrast, placed in the upper or lower third: "${titular}". No other text anywhere.`
      : 'No text, no letters, no numbers in the image.',
    'No logos, no watermarks, no official seals or government emblems, no real-looking identity documents.',
  ].join(' ');
}

type Lamina = { titular?: string; texto?: string; idea?: string; path?: string };
const limpio = (s: unknown, max: number) => String(s || '').replace(/["“”]/g, '').trim().slice(0, max);

/** Portada del carrusel: la imagen del país de origen dirigida al grupo (ej. Cuba → cubanos), con titular y subtítulo escritos. */
function construirPortada(p: { ig_pais?: string | null; ig_grupo?: string | null; tema?: string | null }, s: Lamina) {
  const pais = limpio(p.ig_pais, 40) || 'the home country';
  const grupo = limpio(p.ig_grupo, 40) || 'migrants';
  const titular = limpio(s.titular, 40);
  const sub = limpio(s.texto, 70);
  return [
    `Cover slide (square) of an Instagram carousel for Spanish-speaking ${grupo} who live in, or are heading to, Brazil.`,
    `Show an iconic, instantly recognizable scene of ${pais} (${limpio(s.idea, 200) || 'its most emblematic landscape or street'}) in cinematic editorial photography, rich saturated colors that echo the ${pais} flag colors, dramatic light, emotional and scroll-stopping. A subtle touch of Brazil (green and yellow accent) is welcome.`,
    titular ? `Write this headline exactly as written, perfectly spelled, in huge bold sans-serif capital letters with high contrast: "${titular}".` : '',
    sub ? `Below it, a smaller subtitle exactly as written: "${sub}".` : '',
    'No other text anywhere. No logos, no watermarks, no official seals or government emblems, no real-looking identity documents, no recognizable real people or celebrities.',
  ].filter(Boolean).join(' ');
}

/** Lámina interior: póster tipográfico sobrio y consistente (mismo fondo y colores en todas), con el dato como protagonista. */
function construirLamina(p: { tema?: string | null }, s: Lamina, n: number, total: number) {
  const titular = limpio(s.titular, 40);
  const texto = limpio(s.texto, 110);
  return [
    `Slide ${n} of ${total} of an Instagram carousel (square) for Spanish-speaking migrants in Brazil. Topic: ${limpio(p.tema, 80) || 'migration in Brazil'}.`,
    'Bold modern editorial poster design: deep navy-blue background with green and yellow accents, strong typographic hierarchy, very high contrast, generous spacing, same visual language on every slide.',
    `Supporting visual: ${limpio(s.idea, 200) || 'one simple, clean icon related to the message'}.`,
    titular ? `Big headline, exactly as written and perfectly spelled: "${titular}".` : '',
    texto ? `Below it, smaller text exactly as written and perfectly spelled: "${texto}".` : '',
    'No other text anywhere. No logos, no watermarks, no official seals or government emblems, no real-looking identity documents.',
  ].filter(Boolean).join(' ');
}

/** Última lámina de TODO carrusel: invitación a seguir la cuenta para no perderse noticias y datos (texto fijo, no se improvisa). */
function construirInvitacion(n: number, total: number) {
  return [
    `Final slide ${n} of ${total} of an Instagram carousel (square) for Spanish-speaking migrants in Brazil: an invitation to follow the account.`,
    'Bold modern editorial poster design: deep navy-blue background with green and yellow accents, strong typographic hierarchy, very high contrast, generous spacing, same visual language as the other slides.',
    'Supporting visual: a big notification bell and a generic rounded "follow" button with a plus icon (no Instagram logo).',
    'Big headline, exactly as written and perfectly spelled: "SÍGUENOS".',
    'Below it, smaller text exactly as written and perfectly spelled: "Para no perderte noticias ni datos de migración en Brasil".',
    'At the bottom, in yellow, exactly as written: "@flujomigracaobr".',
    'No other text anywhere. No logos, no watermarks, no official seals or government emblems.',
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
    const { id, red, slide, regenerar } = await req.json();
    const ig = red === 'instagram';
    if (!id) return json({ ok: false, motivo: 'Falta el id de la publicación.' }, 400);

    const { data: cfgRow } = await admin.from('organization_settings').select('value').eq('organization_id', ORG_ID).eq('key', 'publicaciones_imagenes').maybeSingle();
    const cfg = { activo: true, max_por_dia: 10, ...((cfgRow?.value as object) || {}) } as { activo: boolean; max_por_dia: number };
    if (!cfg.activo) return json({ ok: false, motivo: 'Imágenes automáticas apagadas.' });

    const { data: p } = await admin.from('publicaciones').select('id, tema, tipo, texto, imagen_idea, imagen_path, ig_titular, ig_imagen_idea, ig_imagen_path, ig_formato, ig_slides, ig_pais, ig_grupo').eq('id', id).maybeSingle();
    if (!p) return json({ ok: false, motivo: 'La publicación no existe.' }, 404);

    // Carrusel: cada llamada genera UNA lámina (slide = 1..N); la 1 es la portada del país.
    const carrusel = ig && p.ig_formato === 'carrusel';
    const slides: Lamina[] = Array.isArray(p.ig_slides) ? p.ig_slides : [];
    const n = carrusel ? Math.max(1, Math.floor(Number(slide) || 1)) : 0;
    if (carrusel && !slides[n - 1]) return json({ ok: false, motivo: `La lámina ${n} no existe.` });

    let path = (carrusel ? (regenerar ? null : slides[n - 1].path || null) : ig ? p.ig_imagen_path : p.imagen_path) as string | null;
    if (!path) {
      // El tope diario se cuenta por publicación y, en carruseles, solo al generar la portada (las demás láminas completan el mismo carrusel).
      if (!carrusel || n === 1) {
        const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const [fb, insta] = await Promise.all([
          admin.from('publicaciones').select('id', { count: 'exact', head: true }).gte('imagen_at', desde),
          admin.from('publicaciones').select('id', { count: 'exact', head: true }).gte('ig_imagen_at', desde),
        ]);
        if ((fb.count ?? 0) + (insta.count ?? 0) >= cfg.max_por_dia) return json({ ok: false, motivo: `Tope de ${cfg.max_por_dia} imágenes por día alcanzado.` });
      }

      const model = await modeloImagen();
      const prompt = carrusel ? (n > 1 && n === slides.length ? construirInvitacion(n, slides.length)
          : n === 1 ? construirPortada(p as any, slides[0]) : construirLamina(p as any, slides[n - 1], n, slides.length))
        : ig ? construirPromptIG(p as any) : construirPrompt(p as any);
      // Instagram solo acepta JPEG con seguridad: sus imágenes se piden ya en JPEG; las de Facebook siguen en PNG.
      const cuerpo: Record<string, unknown> = { model, prompt, size: '1024x1024', n: 1 };
      if (ig) { cuerpo.output_format = 'jpeg'; cuerpo.output_compression = 92; }
      const d = await openai('/images/generations', { method: 'POST', body: JSON.stringify(cuerpo) });
      const b64 = d?.data?.[0]?.b64_json;
      if (!b64) throw new Error('OpenAI no devolvió la imagen.');
      path = carrusel ? `publicaciones/${p.id}-ig-${n}.jpg` : ig ? `publicaciones/${p.id}-ig.jpg` : `publicaciones/${p.id}.png`;
      const { error: up } = await admin.storage.from(BUCKET).upload(path, bytes(b64), { contentType: ig ? 'image/jpeg' : 'image/png', upsert: true });
      if (up) throw new Error(`No se pudo guardar la imagen: ${up.message}`);
      const ahora = new Date().toISOString();
      if (carrusel) {
        // Escritura atómica de SOLO esta lámina (varias se generan casi a la vez; leer-y-reescribir la lista se pisaría).
        const { error: rp } = await admin.rpc('publicacion_ig_slide_path', { p_id: p.id, p_n: n, p_path: path });
        if (rp) throw new Error(`No se pudo registrar la lámina: ${rp.message}`);
      } else {
        await admin.from('publicaciones').update(ig ? { ig_imagen_path: path, ig_imagen_at: ahora } : { imagen_path: path, imagen_at: ahora }).eq('id', p.id);
      }
    }

    const { data: firmada } = await admin.storage.from(BUCKET).createSignedUrl(path, 600);
    if (!firmada?.signedUrl) throw new Error('No se pudo firmar la URL de la imagen.');
    return json({ ok: true, url: firmada.signedUrl, path });
  } catch (e) {
    return json({ ok: false, motivo: String((e as Error).message || e).slice(0, 300) });
  }
});

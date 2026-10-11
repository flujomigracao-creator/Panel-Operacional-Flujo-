// Búsqueda DIARIA de temas para Instagram: busca en la web noticias recientes (flujo migratorio hacia Brasil y noticias de los países
// de origen), redacta carruseles en español, VERIFICA cada cifra contra el texto de la fuente y los deja como BORRADOR en «Publicaciones»
// para que el dueño los apruebe (nunca se publica nada solo). La llama el workflow de n8n «Instagram - Temas diarios» con la clave
// de servicio de Supabase: POST {} (o { dry_run: true } para ver las propuestas sin guardar).
// Usa la MISMA clave OPENAI_API_KEY que el Laboratorio y la imagen de las publicaciones (Responses API con búsqueda web).
// Ajustes en organization_settings key 'temas_diarios': { activo, por_dia, horas ['12:30','18:00'], paises [...], dias_busqueda }.
import { createClient } from 'npm:@supabase/supabase-js@2';

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const OPENAI = 'https://api.openai.com/v1';
const ZONA = 'America/Sao_Paulo';
const OFFSET = '-03:00'; // Brasil no tiene horario de verano desde 2019
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

const CFG_BASE = {
  activo: true, por_dia: 2, horas: ['12:30', '18:00'], dias_busqueda: 3,
  paises: ['Cuba', 'Venezuela', 'Colombia', 'Perú', 'Argentina', 'Uruguay', 'Paraguay'],
};

type Cifra = { valor?: string; cita?: string; url?: string };
type Fuente = { medio?: string; titulo?: string; url?: string; fecha?: string };
type Lam = { titular?: string; texto?: string; idea?: string };
type Carrusel = { tema?: string; pais?: string; grupo?: string; portada?: Lam & { subtitulo?: string }; laminas?: Lam[]; caption?: string; fuentes?: Fuente[]; cifras?: Cifra[] };

const INVITACION = {
  titular: 'SÍGUENOS',
  texto: 'Para no perderte noticias ni datos de migración en Brasil · @flujomigracaobr',
  idea: 'campana de notificación y botón de seguir con un signo más, estilo póster',
};

async function openai(ruta: string, init: RequestInit = {}) {
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) throw new Error('Falta el secreto OPENAI_API_KEY en Supabase.');
  const r = await fetch(`${OPENAI}${ruta}`, { ...init, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`OpenAI (${r.status}): ${String(d?.error?.message || '').slice(0, 300)}`);
  return d;
}

/** Modelo de texto: el secreto TEXT_MODEL, o el gpt-N más reciente de la cuenta (solo ids «gpt-5» / «gpt-5.1»…, sin sufijos); respaldo gpt-4.1. */
async function modeloTexto(): Promise<{ id: string; razona: boolean }> {
  const fijo = Deno.env.get('TEXT_MODEL');
  if (fijo) return { id: fijo, razona: /^(gpt-5|o\d)/.test(fijo) };
  try {
    const d = await openai('/models');
    const v = (d.data || []).map((m: any) => ({ id: String(m.id), n: /^gpt-(\d+(?:\.\d+)?)$/.exec(String(m.id)) }))
      .filter((x: any) => x.n).map((x: any) => ({ id: x.id, v: parseFloat(x.n[1]) })).sort((a: any, b: any) => b.v - a.v);
    const mejor = v[0];
    if (mejor && mejor.v >= 4.1) return { id: mejor.id, razona: mejor.v >= 5 };
  } catch { /* se usa el respaldo */ }
  return { id: 'gpt-4.1', razona: false };
}

const fechaSP = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(d);

function instrucciones(cfg: typeof CFG_BASE, hoy: string, recientes: string[]) {
  return `You are the news editor of @flujomigracaobr, a Spanish-language Instagram account for Latin American migrants who live in (or are heading to) Brazil. It belongs to a service that helps them with CPF, refugio, RNM and other paperwork. Today is ${hoy}. Use web search to find REAL news published in the last ${cfg.dias_busqueda} days and turn it into Instagram carousels in Spanish.

TOPICS (core audience first): (a) the migration flow into Brazil and Brazilian migration policy that affects foreigners (Polícia Federal, CONARE, OBMigra, Ministério da Justiça, Diário Oficial, Agência Brasil, ACNUR/OIM); (b) news from Cuba and Venezuela (our core audience) and, only when directly relevant to their emigrants, from ${cfg.paises.filter((p) => !/^(cuba|venezuela)$/i.test(p)).join(', ')} (migration, consular or passport changes, visas, regional policy, big economic or energy crises, remittances, flows toward Brazil).
RELEVANCE TEST: a migrant from that country living in Brazil must care because it changes their papers, their money (remittances, prices), their family back home, or their migration or travel options. REJECT: road or border-pass openings, airport or flight contingencies, weather, tourism, sports, culture, crime, ceremonies, diplomatic meetings, institutional events with no concrete effect.
Before choosing, run at least 6 DIFFERENT searches (for example "cubanos en Brasil", "Polícia Federal migrantes", "refúgio Brasil CONARE", "Cuba pasaportes migración", "remesas Cuba", "apagones Cuba", "venezolanos Brasil", plus the other countries), compare the candidates and pick the strongest ones. At least one carousel must be about Cuba, Venezuela or Brazilian migration policy.
Pick ${cfg.por_dia} DISTINCT topics. Do NOT repeat these recent topics:
${recientes.length ? recientes.map((t) => '- ' + t).join('\n') : '- (none)'}

RULES (non-negotiable):
1. Only use facts that appear in the sources you found. Never invent numbers, dates, laws or quotes. If a fact cannot be backed by a source, leave it out.
2. Prefer primary or official sources and reputable media. Be factual and non-partisan: no political opinions, no insults, no graphic content, no rumors.
3. No promises about timelines or outcomes of any procedure, no legal advice, no fees or prices, no fear-mongering.
4. Every number you use in a slide or in the caption must be listed in "cifras" with a LITERAL quote copied from the source (in the source language, at most 200 characters, containing that number) and its URL.
5. One carousel = ONE topic. The cover is about the ORIGIN COUNTRY addressed to the group (e.g. pais "Cuba", grupo "cubanos"); for Brazil-wide news use pais "Brasil" and grupo "extranjeros".
6. Latin American Spanish, short punchy hooks. Do NOT write the final "follow us" slide: the system adds it.
7. No speculation: do not say what something "could", "may" or "will" lead to unless the source says it, and do not add your own interpretation. Each slide states ONE verifiable fact, in at most 90 characters.

Return ONLY one JSON object (no markdown fences) with this exact shape:
{"carruseles":[{"tema":"short topic name","pais":"Cuba","grupo":"cubanos","portada":{"titular":"max 40 chars, uppercase hook that names the group","subtitulo":"max 70 chars","idea":"iconic, instantly recognizable scene of the origin country, in English"},"laminas":[{"titular":"max 40 chars","texto":"max 90 chars, one fact","idea":"simple supporting visual, in English"}],"caption":"Spanish caption: hook first line, 3-6 short lines, an invitation to comment, NO urls","fuentes":[{"medio":"outlet","titulo":"article title","url":"https://...","fecha":"YYYY-MM-DD"}],"cifras":[{"valor":"20.372","cita":"literal quote","url":"https://..."}]}]}
Each carousel needs 3 to 5 items in "laminas".`;
}

async function pedirPropuestas(cfg: typeof CFG_BASE, recientes: string[]) {
  const modelo = await modeloTexto();
  const hoy = fechaSP(new Date());
  const cuerpo = (tool: string) => {
    const b: Record<string, unknown> = {
      model: modelo.id,
      instructions: instrucciones(cfg, hoy, recientes),
      input: `Find the news and build the ${cfg.por_dia} carousels now. Today is ${hoy}.`,
      tools: [{ type: tool, search_context_size: 'medium', user_location: { type: 'approximate', country: 'BR', timezone: ZONA } }],
      tool_choice: 'auto',
      max_output_tokens: 9000,
    };
    if (modelo.razona) b.reasoning = { effort: 'low' };
    return JSON.stringify(b);
  };
  let d: any;
  try {
    d = await openai('/responses', { method: 'POST', body: cuerpo('web_search') });
  } catch (e) {
    if (!/tool|web_search/i.test(String((e as Error).message))) throw e;
    d = await openai('/responses', { method: 'POST', body: cuerpo('web_search_preview') });
  }
  const texto = (d.output || []).filter((o: any) => o.type === 'message').flatMap((o: any) => o.content || [])
    .filter((c: any) => c.type === 'output_text').map((c: any) => c.text).join('');
  const i = texto.indexOf('{'); const f = texto.lastIndexOf('}');
  if (i < 0 || f < i) throw new Error('El modelo no devolvió JSON: ' + texto.slice(0, 200));
  const obj = JSON.parse(texto.slice(i, f + 1));
  return { carruseles: (Array.isArray(obj.carruseles) ? obj.carruseles : []) as Carrusel[], modelo: modelo.id };
}

// ───────────── Verificación: cada cifra debe estar en el texto real de la fuente ─────────────
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const soloDigitos = (s: string) => s.replace(/[^\d]/g, '');

async function textoDePagina(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FlujoMigracaoBot/1.0)', Accept: 'text/html,*/*' }, signal: AbortSignal.timeout(9000), redirect: 'follow' });
    if (!r.ok) return null;
    const html = (await r.text()).slice(0, 1_500_000);
    return norm(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' '));
  } catch { return null; }
}

async function verificar(c: Carrusel) {
  const cifras = (c.cifras || []).filter((x) => x && x.valor);
  const urls = [...new Set([...cifras.map((x) => x.url), ...(c.fuentes || []).map((f) => f.url)].filter((u): u is string => !!u && /^https?:\/\//.test(u)))];
  const paginas = new Map<string, string | null>();
  await Promise.all(urls.map(async (u) => { paginas.set(u, await textoDePagina(u)); }));

  const avisos: string[] = [];
  let ok = 0;
  for (const x of cifras) {
    const pag = x.url ? paginas.get(x.url) : null;
    const cita = norm(x.cita || '');
    if (!cita || !soloDigitos(x.cita || '').includes(soloDigitos(x.valor || ''))) { avisos.push(`la cita de «${x.valor}» no contiene la cifra`); continue; }
    if (pag === null || pag === undefined) { avisos.push(`no pude abrir la fuente de «${x.valor}» para comprobarla`); continue; }
    if (pag.includes(cita) || pag.includes(cita.slice(0, 60))) ok++; else avisos.push(`no encontré la cita de «${x.valor}» en la fuente`);
  }
  // Toda cifra escrita en las láminas o en el texto debe estar respaldada por una cifra citada.
  const respaldadas = new Set(cifras.flatMap((x) => [soloDigitos(x.valor || ''), ...((x.cita || '').match(/\d[\d.,]*/g) || []).map(soloDigitos)]).filter(Boolean));
  const escrito = [c.portada?.titular, c.portada?.subtitulo, ...(c.laminas || []).flatMap((l) => [l.titular, l.texto]), c.caption].join(' ');
  for (const m of escrito.match(/\d[\d.,]*/g) || []) {
    const d = soloDigitos(m);
    if (d.length < 2 || (d.length === 4 && +d >= 1990 && +d <= 2100) || respaldadas.has(d)) continue;
    avisos.push(`la cifra «${m}» no está respaldada por una cita`);
  }
  // Sin cifras no hay nada que citar, pero la(s) fuente(s) tienen que existir y abrirse.
  const fuentesUrl = (c.fuentes || []).map((f) => f.url).filter((u): u is string => !!u && /^https?:\/\//.test(u));
  const abiertas = fuentesUrl.filter((u) => typeof paginas.get(u) === 'string').length;
  if (!fuentesUrl.length) avisos.push('no trae fuentes');
  else if (!abiertas) avisos.push('no pude abrir ninguna fuente');
  return { verificada: avisos.length === 0 && ok === cifras.length, citasOk: ok, citas: cifras.length, fuentesAbiertas: abiertas, fuentesTotal: fuentesUrl.length, avisos: [...new Set(avisos)] };
}

// ───────────── Armado del borrador ─────────────
const rec = (s: unknown, n: number) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

function armarBorrador(c: Carrusel, v: Awaited<ReturnType<typeof verificar>>) {
  const contenido = (c.laminas || []).filter((l) => l && (l.titular || l.texto)).slice(0, 8)
    .map((l) => ({ titular: rec(l.titular, 40), texto: rec(l.texto, 110), idea: rec(l.idea, 200) }));
  if (!c.portada?.titular || contenido.length < 3) return null;
  const slides = [
    { titular: rec(c.portada.titular, 40), texto: rec(c.portada.subtitulo, 70), idea: rec(c.portada.idea, 200) },
    ...contenido,
    { ...INVITACION }, // la ÚLTIMA lámina de todo carrusel siempre invita a seguir la cuenta
  ];
  const fuentes = (c.fuentes || []).filter((f) => f && (f.medio || f.titulo));
  let caption = String(c.caption || '').replace(/https?:\/\/\S+/g, '').replace(/[ \t]+\n/g, '\n').trim();
  if (!/siguenos|síguenos/i.test(caption)) caption += '\n\n🔔 Síguenos para no perderte las noticias y los datos de migración en Brasil.';
  if (!/link en la bio/i.test(caption)) caption += '\n\n📲 ¿Dudas con tu trámite? Escríbenos por WhatsApp: link en la bio';
  if (!/fuentes?:/i.test(caption) && fuentes.length) caption += '\n\nFuentes: ' + fuentes.map((f) => `${rec(f.medio || f.titulo, 60)}${f.fecha ? ' (' + rec(f.fecha, 12) + ')' : ''}`).join('; ') + '.';
  caption = caption.slice(0, 2200);
  const estado = v.verificada ? `VERIFICADO (${v.citasOk}/${v.citas} citas halladas en la fuente; ${v.fuentesAbiertas}/${v.fuentesTotal} fuentes abiertas)` : `REVISAR ANTES DE APROBAR: ${v.avisos.join('; ')}`;
  const fuente = `Automático · ${estado}. Fuentes: ${fuentes.map((f) => `${rec(f.medio, 40)} — ${rec(f.titulo, 120)} ${rec(f.url, 200)}`.trim()).join(' | ')}`.slice(0, 1500);
  return { slides, caption, fuente };
}

/** Próximos huecos libres (horas configuradas, hora de São Paulo), al menos 2 h en el futuro y sin otra publicación de Instagram a la misma hora. */
function huecos(horas: string[], ocupados: Set<string>, cuantos: number) {
  const out: string[] = [];
  const ahora = Date.now();
  for (let off = 0; off < 30 && out.length < cuantos; off++) {
    const dia = fechaSP(new Date(ahora + off * 86400000));
    for (const h of horas) {
      const iso = new Date(`${dia}T${h}:00${OFFSET}`).toISOString();
      if (new Date(iso).getTime() > ahora + 2 * 3600000 && !ocupados.has(iso) && !out.includes(iso)) out.push(iso);
      if (out.length >= cuantos) break;
    }
  }
  return out;
}
const franjaDe = (iso: string) => { const h = +new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, hour: '2-digit', hourCycle: 'h23' }).format(new Date(iso)); return h < 11 ? 'manana' : h < 17 ? 'tarde' : 'noche'; };

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
    const cuerpo = await req.json().catch(() => ({}));
    const dry = cuerpo?.dry_run === true;

    const { data: cfgRow } = await admin.from('organization_settings').select('value').eq('organization_id', ORG_ID).eq('key', 'temas_diarios').maybeSingle();
    const cfg = { ...CFG_BASE, ...((cfgRow?.value as object) || {}) } as typeof CFG_BASE;
    if (!cfg.activo) return json({ ok: true, creados: [], motivo: 'Temas diarios apagados.' });

    // Idempotente: si hoy ya se generaron los carruseles automáticos, no se repite (salvo dry_run).
    const hoy = fechaSP(new Date());
    const inicioHoy = new Date(`${hoy}T00:00:00${OFFSET}`).toISOString();
    const { count: yaHoy } = await admin.from('publicaciones').select('id', { count: 'exact', head: true }).like('fuente', 'Automático ·%').gte('created_at', inicioHoy);
    if (!dry && (yaHoy ?? 0) >= cfg.por_dia) return json({ ok: true, creados: [], motivo: `Hoy ya hay ${yaHoy} carruseles automáticos.` });

    const { data: previos } = await admin.from('publicaciones').select('tema, programada_at, destinos, estado').order('created_at', { ascending: false }).limit(60);
    const recientes = [...new Set((previos || []).map((p: any) => String(p.tema || '').trim()).filter(Boolean))].slice(0, 40);
    const ocupados = new Set((previos || []).filter((p: any) => (p.destinos || []).includes('instagram') && p.estado !== 'descartada').map((p: any) => new Date(p.programada_at).toISOString()));

    const { carruseles, modelo } = await pedirPropuestas(cfg, recientes);
    const ranuras = huecos(cfg.horas, ocupados, carruseles.length);
    const creados: unknown[] = [];

    for (let i = 0; i < carruseles.length; i++) {
      const c = carruseles[i];
      const v = await verificar(c);
      const b = armarBorrador(c, v);
      if (!b) { creados.push({ tema: c.tema, omitido: 'sin portada o con menos de 3 láminas' }); continue; }
      const fila = {
        organization_id: ORG_ID, programada_at: ranuras[i], franja: franjaDe(ranuras[i]), tipo: 'Carrusel', tema: rec(c.tema, 120) || 'Noticias',
        texto: b.caption, ig_texto: b.caption, fuente: b.fuente, estado: 'borrador', destinos: ['instagram'],
        ig_formato: 'carrusel', ig_pais: rec(c.pais, 40), ig_grupo: rec(c.grupo, 40), ig_slides: b.slides,
      };
      if (dry) { creados.push({ ...fila, verificada: v.verificada, avisos: v.avisos }); continue; }
      const { data, error } = await admin.from('publicaciones').insert(fila).select('id').single();
      if (error) { creados.push({ tema: c.tema, error: error.message }); continue; }
      creados.push({ id: data.id, tema: fila.tema, programada_at: fila.programada_at, verificada: v.verificada, avisos: v.avisos });
    }

    const nuevos = creados.filter((x: any) => x.id);
    if (!dry && nuevos.length) {
      const detalle = nuevos.map((x: any) => `• ${x.tema} — ${x.verificada ? 'cifras verificadas' : 'REVISAR: ' + (x.avisos || []).join('; ')}`).join('\n');
      const { error: et } = await admin.from('tasks').insert({
        organization_id: ORG_ID, kind: 'outro', title: `Revisa los ${nuevos.length} carruseles de Instagram de hoy`,
        details: `${detalle}\nAbre Publicaciones, mira las fuentes, pulsa «Generar imágenes» y aprueba los que quieras.`, priority: 'normal',
        source: 'temas_diarios', dedupe_key: `temas_diarios:${hoy}`, metadata: { publicaciones: nuevos.map((x: any) => x.id) },
      });
      if (et) console.error('No se pudo crear la tarea:', et.message);
    }
    return json({ ok: true, dry_run: dry, modelo, creados });
  } catch (e) {
    return json({ ok: false, motivo: String((e as Error).message || e).slice(0, 400) });
  }
});

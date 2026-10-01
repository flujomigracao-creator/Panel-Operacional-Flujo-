// Generación de creativos con la API de OpenAI (texto e imagen) + Storage + registro.
// La clave OPENAI_API_KEY solo se lee aquí (backend). Nunca se devuelve, se registra ni llega al navegador.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  CONCEPTOS, ESTILOS, OBJETIVOS, construirPromptPublicitario, tamanosCandidatos, validarCreativo, validarCambio,
  tipoImagen, rutaImagen, elegirModeloImagen, sanearError, ajustarPromptRegeneracion,
} from './creative_logic.ts';

export const ORG_ID = '00000000-0000-0000-0000-000000000001';
export const BUCKET = 'creatives';
const MAX_IMAGENES_POR_DIA = 40;     // tope de costo
const MAX_BYTES_IMAGEN = 8 * 1024 * 1024;
const OPENAI = 'https://api.openai.com/v1';

// ── Configuración de modelos (cambiable sin tocar código: secretos IMAGE_MODEL / OPENAI_TEXT_MODEL) ──
const MODELO_IMAGEN_RESPALDO = 'gpt-image-1';
const MODELOS_TEXTO_PREFERIDOS = ['gpt-5-mini', 'gpt-4.1-mini', 'gpt-4o-mini'];
let cacheModelos: { ids: string[]; at: number } | null = null;

const clave = () => Deno.env.get('OPENAI_API_KEY') || null;
export const openaiConfigurado = () => !!clave();

async function openai(ruta: string, init: RequestInit = {}) {
  const key = clave();
  if (!key) throw new Error('Falta el secreto OPENAI_API_KEY en Supabase (Edge Functions → Secrets).');
  const r = await fetch(`${OPENAI}${ruta}`, { ...init, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`OpenAI rechazó la solicitud (${r.status}): ${sanearError(d?.error?.message || '')}`);
  return d;
}

async function modelosDisponibles(): Promise<string[]> {
  if (cacheModelos && Date.now() - cacheModelos.at < 3_600_000) return cacheModelos.ids;
  try {
    const d = await openai('/models');
    const ids = (d.data || []).map((m: any) => String(m.id));
    cacheModelos = { ids, at: Date.now() };
    return ids;
  } catch { return []; }
}

export async function modeloImagen(): Promise<string> {
  return Deno.env.get('IMAGE_MODEL') || elegirModeloImagen(await modelosDisponibles(), MODELO_IMAGEN_RESPALDO);
}
export async function modeloTexto(): Promise<string> {
  const env = Deno.env.get('OPENAI_TEXT_MODEL');
  if (env) return env;
  const ids = await modelosDisponibles();
  return MODELOS_TEXTO_PREFERIDOS.find(m => ids.includes(m)) || 'gpt-4.1-mini';
}

// ── Bitácora de generaciones (modelo, usuario, uso). El costo solo se guarda si OpenAI lo informa. ──
async function registrarGeneracion(admin: SupabaseClient, g: { creative_id?: string | null; user_id: string; kind: 'concepts' | 'prompt' | 'image'; model: string; status: 'ok' | 'error'; usage?: unknown; error?: string }) {
  const { error } = await admin.from('creative_generations').insert({
    organization_id: ORG_ID, creative_id: g.creative_id ?? null, user_id: g.user_id, kind: g.kind, model: g.model,
    status: g.status, usage: g.usage ?? null, error: g.error ? sanearError(g.error) : null,
  });
  if (error) console.error('[creative_generations] no se pudo registrar:', sanearError(error.message));
}

const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

async function chatJson(system: string, user: string): Promise<{ json: any; usage: unknown; model: string }> {
  const model = await modeloTexto();
  const d = await openai('/chat/completions', {
    method: 'POST',
    body: JSON.stringify({ model, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  });
  let json: any = {};
  try { json = JSON.parse(d.choices?.[0]?.message?.content || '{}'); } catch { /* respuesta no JSON */ }
  return { json, usage: d.usage ?? null, model };
}

// ── Conceptos publicitarios (texto con OpenAI), registrados en creative_concepts ──
export async function proponerConceptos(admin: SupabaseClient, userId: string, i: { service: string; objective?: string; audience?: string; cantidad?: number }) {
  const err = validarCreativo({ service: i.service });
  if (err) throw new Error(err);
  const cantidad = Math.min(Math.max(Number(i.cantidad) || 3, 1), 5);
  const { data: aprend } = await admin.from('campaign_learnings').select('learning, confidence').eq('service', i.service).order('confidence', { ascending: false }).limit(8);
  const { data: top } = await admin.from('creative_resultados').select('concept, hook, ctr, costo_por_conversacion, costo_por_cliente, conversaciones, clientes_pagaron')
    .eq('service', i.service).gt('impresiones', 1000).order('conversaciones', { ascending: false, nullsFirst: false }).limit(5);
  const hayHistorial = (aprend || []).length > 0 || (top || []).length > 0;
  const contexto = hayHistorial
    ? `Patrones aprendidos (guía, NO copies anuncios): ${JSON.stringify(aprend)}. Resultados reales recientes: ${JSON.stringify(top)}.`
    : 'Aún no hay historial de resultados de este servicio: son hipótesis nuevas, no conclusiones basadas en datos.';
  let r;
  try {
    r = await chatJson(
      'Eres estratega creativo de Meta Ads para Flujo de Migração, que ayuda a extranjeros con trámites migratorios en Brasil. Respondes SOLO JSON. Texto en español neutro, claro, sin promesas de resultado garantizado ni suplantar a organismos oficiales.',
      `Servicio: ${i.service}. Objetivo: ${i.objective || 'conversaciones de WhatsApp'}. Público: ${i.audience || 'extranjeros en Brasil'}. ${contexto}\nDevuelve {"conceptos":[...${cantidad} objetos]}. Cada objeto: {"concept": uno de ${JSON.stringify(CONCEPTOS)}, "hook": frase corta, "headline": máx 40 caracteres, "primary_text": máx 300 caracteres, "cta": texto de botón corto, "visual_concept": escena en 1-2 frases}. Conceptos visuales distintos entre sí.`,
    );
  } catch (e) {
    await registrarGeneracion(admin, { user_id: userId, kind: 'concepts', model: await modeloTexto().catch(() => 'desconocido'), status: 'error', error: String(e) });
    throw e;
  }
  const conceptos = (Array.isArray(r.json.conceptos) ? r.json.conceptos : []).slice(0, cantidad).map((c: any) => {
    const concept = (CONCEPTOS as readonly string[]).includes(c.concept) ? c.concept : 'mensaje_directo';
    return {
      concept, hook: String(c.hook || '').slice(0, 120), headline: String(c.headline || '').slice(0, 40), primary_text: String(c.primary_text || '').slice(0, 300),
      cta: String(c.cta || '').slice(0, 30), visual_concept: String(c.visual_concept || '').slice(0, 300),
    };
  });
  await registrarGeneracion(admin, { user_id: userId, kind: 'concepts', model: r.model, status: conceptos.length ? 'ok' : 'error', usage: r.usage, error: conceptos.length ? undefined : 'sin conceptos válidos' });
  if (!conceptos.length) throw new Error('OpenAI no devolvió conceptos válidos. Inténtalo de nuevo.');
  const { data: guardados } = await admin.from('creative_concepts').insert(conceptos.map((c: any) => ({
    organization_id: ORG_ID, service: i.service, objective: i.objective || null, concept: c.concept, hook: c.hook, headline: c.headline,
    primary_text: c.primary_text, cta: c.cta, visual_concept: c.visual_concept, based_on_data: hayHistorial, created_by: userId,
  }))).select('id');
  return { ok: true, basado_en_datos: hayHistorial, conceptos: conceptos.map((c: any, k: number) => ({ ...c, concept_id: guardados?.[k]?.id ?? null })) };
}

// ── Prompt de imagen (texto con OpenAI) a partir de los datos del creativo; el usuario lo revisa y edita ──
export interface DatosPrompt {
  service: string; objective?: string; audience?: string; concept?: string; hook?: string; headline?: string; cta?: string; visual_concept?: string;
  style?: string; language?: string; format?: string; visual_reference?: string;
}
export async function generarPrompt(admin: SupabaseClient, userId: string, d: DatosPrompt) {
  const err = validarCreativo({ service: d.service, format: d.format });
  if (err) throw new Error(err);
  const base = construirPromptPublicitario({
    servicio: d.service, concepto: d.concept, hook: d.hook, titular: d.headline, formato: d.format || '1:1', visual_concept: d.visual_concept,
    objetivo: d.objective, publico: d.audience, cta: d.cta, estilo: d.style, idioma: d.language, referencia_visual: d.visual_reference,
  });
  const model = await modeloTexto();
  try {
    const r = await chatJson(
      'Eres director de arte de anuncios en Meta Ads. Conviertes un brief en UN prompt de generación de imagen en inglés, concreto y profesional: composición, encuadre, luz, jerarquía visual, espacio libre para el texto del anuncio, identidad de marca (azul #1E3A8A dominante, verde, dorado, blanco). IMPORTANTE: el anuncio debe llevar texto integrado en la imagen. Copia LITERALMENTE, entre comillas y sin traducir ni reescribir, el TITULAR, el SUBTÍTULO (si existe), el texto del BOTÓN CTA y la FIRMA del brief; indica dónde va cada uno (titular grande arriba, botón CTA redondeado abajo, firma en una esquina), alto contraste y tipografía gruesa legible en móvil, ortografía impecable. Ningún otro texto aparte de esos; sin logos oficiales ni sellos de gobierno, sin datos reales en documentos. Respondes SOLO JSON {"prompt": "..."}.',
      `Brief:\n${base}\nFormato: ${d.format || '1:1'} (Meta Ads).`,
    );
    const prompt = String(r.json.prompt || '').trim();
    if (!prompt) throw new Error('OpenAI no devolvió un prompt.');
    await registrarGeneracion(admin, { user_id: userId, kind: 'prompt', model: r.model, status: 'ok', usage: r.usage });
    return { ok: true, prompt, model: r.model, base };
  } catch (e) {
    await registrarGeneracion(admin, { user_id: userId, kind: 'prompt', model, status: 'error', error: String(e) });
    throw e;
  }
}

// ── Imagen (OpenAI Images API) ──
async function generarImagen(prompt: string, formato: string) {
  const model = await modeloImagen();
  let ultimoError: unknown = null;
  for (const size of tamanosCandidatos(formato)) {
    try {
      const d = await openai('/images/generations', { method: 'POST', body: JSON.stringify({ model, prompt, size, n: 1 }) });
      const b64 = d?.data?.[0]?.b64_json;
      if (!b64) throw new Error('OpenAI no devolvió la imagen.');
      // El tamaño realmente usado queda en el uso registrado (para saber si el formato fue exacto o de respaldo).
      return { bytes: b64ToBytes(b64), mime: 'image/png', model, usage: { ...(d.usage ?? {}), size, format: formato } };
    } catch (e) {
      ultimoError = e;
      if (!/\(400\)/.test(String(e))) throw e; // solo un tamaño no admitido justifica probar el siguiente
    }
  }
  throw ultimoError;
}

async function urlFirmada(admin: SupabaseClient, path: string) {
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

// ── Resolver el prompt de la biblioteca (versionado: un cambio de texto = versión nueva) ──
export async function resolverPrompt(
  admin: SupabaseClient, userId: string,
  i: { service: string; concept?: string; prompt: string; prompt_id?: string; prompt_name?: string; variables?: Record<string, string> },
): Promise<{ id: string; version: number }> {
  if (i.prompt_id) {
    const { data: ant } = await admin.from('creative_prompts').select('id, prompt, version, name, service, concept, variables').eq('id', i.prompt_id).maybeSingle();
    if (!ant) throw new Error('El prompt de la biblioteca no existe.');
    if (ant.prompt === i.prompt) return { id: ant.id, version: ant.version };
    const { data: ultima } = await admin.from('creative_prompts').select('version').eq('organization_id', ORG_ID).eq('name', ant.name).eq('service', ant.service).order('version', { ascending: false }).limit(1).maybeSingle();
    const { data: nuevo, error } = await admin.from('creative_prompts').insert({
      organization_id: ORG_ID, name: ant.name, service: ant.service, concept: i.concept ?? ant.concept, prompt: i.prompt,
      version: (ultima?.version ?? ant.version) + 1, variables: i.variables ?? ant.variables ?? {}, parent_prompt_id: ant.id, created_by: userId,
    }).select('id, version').single();
    if (error || !nuevo) throw new Error(`No se pudo versionar el prompt: ${error?.message}`);
    return nuevo;
  }
  const { data, error } = await admin.from('creative_prompts').insert({
    organization_id: ORG_ID, name: i.prompt_name || `${i.service} · ${i.concept || 'general'}`, service: i.service,
    concept: i.concept || null, prompt: i.prompt, version: 1, variables: i.variables || {}, created_by: userId,
  }).select('id, version').single();
  if (error || !data) throw new Error(`No se pudo guardar el prompt: ${error?.message}`);
  return data;
}

// ── Crear creativo: generar con OpenAI, subir una imagen propia, o regenerar una versión nueva ──
export interface EntradaCreativo {
  service: string; objective?: string; audience?: string; concept?: string; format?: string; style?: string; language?: string;
  hook?: string; headline?: string; primary_text?: string; cta?: string; visual_concept?: string; visual_reference?: string;
  prompt?: string; prompt_id?: string; prompt_name?: string; concept_id?: string;
  from_creative_id?: string; changed_variable?: string; variant?: string; experiment_id?: string;
  image_base64?: string; mime?: string;
}

const COLS = 'id, service, objective, concept, format, prompt_id, prompt_text, prompt_version, hook, headline, primary_text, cta, visual_concept, image_path, image_source, status, parent_creative_id, root_creative_id, version, variant, changed_variable, model, style, audience, language, experiment_id, campaign_id, adset_id, ad_id, created_at';

export async function crearCreativo(admin: SupabaseClient, userId: string, entrada: EntradaCreativo, modo: 'generar' | 'subir' | 'regenerar') {
  let i = { ...entrada };
  let padre: any = null;

  if (modo === 'regenerar') {
    if (!i.from_creative_id) throw new Error('Indica el creativo de origen (from_creative_id).');
    const e = validarCambio(i.changed_variable);
    if (e) throw new Error(e);
    const { data } = await admin.from('creatives').select(COLS).eq('id', i.from_creative_id).eq('organization_id', ORG_ID).maybeSingle();
    if (!data) throw new Error('Creativo de origen no encontrado.');
    padre = data;
    // Se hereda todo lo del padre; solo cambia lo que el usuario envía para la variable declarada.
    const heredado: Record<string, unknown> = {
      service: padre.service, objective: padre.objective, audience: padre.audience, concept: padre.concept, format: padre.format, style: padre.style, language: padre.language,
      hook: padre.hook, headline: padre.headline, primary_text: padre.primary_text, cta: padre.cta, visual_concept: padre.visual_concept,
      prompt_id: padre.prompt_id, experiment_id: padre.experiment_id, prompt: padre.prompt_text,
    };
    // Solo se sobrescribe con valores realmente enviados; un campo vacío del formulario no borra lo heredado.
    for (const [k, v] of Object.entries(entrada)) if (v !== undefined && v !== null && v !== '') heredado[k] = v;
    i = heredado as unknown as EntradaCreativo;
    // El prompt debe reflejar la variable declarada: si no, el registro diría "estilo" y la imagen seguiría igual.
    if (i.changed_variable === 'estilo' && i.style === padre.style) throw new Error('El estilo elegido es el mismo del creativo de origen.');
    if (i.changed_variable === 'hook' && (i.hook || '') === (padre.hook || '')) throw new Error('El hook es el mismo del creativo de origen.');
    if (!(entrada.prompt && entrada.prompt.trim())) {
      const nuevo = ajustarPromptRegeneracion(padre.prompt_text || '', i.changed_variable!, { style: i.style, hook: i.hook });
      if (nuevo === null) throw new Error('Para cambiar concepto o composición escribe el prompt nuevo; para estilo o hook indica el valor nuevo.');
      i.prompt = nuevo;
    }
  }

  const formato = i.format || '1:1';
  const err = validarCreativo({ service: i.service, format: formato });
  if (err) throw new Error(err);
  if (i.objective && !(OBJETIVOS as readonly string[]).includes(i.objective) && i.objective.length > 120) throw new Error('Objetivo demasiado largo.');
  if (i.style && !ESTILOS[i.style]) throw new Error(`Estilo no válido. Usa uno de: ${Object.keys(ESTILOS).join(', ')}.`);

  const promptTexto = (i.prompt && i.prompt.trim()) || construirPromptPublicitario({
    servicio: i.service, concepto: i.concept, hook: i.hook, titular: i.headline, formato: formato, visual_concept: i.visual_concept,
    objetivo: i.objective, publico: i.audience, cta: i.cta, estilo: i.style, idioma: i.language, referencia_visual: i.visual_reference,
  });

  let bytes: Uint8Array; let mime: string; let modelo: string | null = null; let usage: unknown = null;
  if (modo === 'subir') {
    if (!i.image_base64) throw new Error('Falta la imagen.');
    bytes = b64ToBytes(i.image_base64.replace(/^data:[^,]+,/, '')); mime = i.mime || 'image/png';
  } else {
    const hoy = new Date(); hoy.setUTCHours(0, 0, 0, 0);
    const { count } = await admin.from('creative_generations').select('id', { count: 'exact', head: true }).eq('organization_id', ORG_ID).eq('kind', 'image').eq('status', 'ok').gte('created_at', hoy.toISOString());
    if ((count ?? 0) >= MAX_IMAGENES_POR_DIA) throw new Error(`Se alcanzó el tope de ${MAX_IMAGENES_POR_DIA} imágenes generadas hoy (control de costo).`);
    try {
      const g = await generarImagen(promptTexto, formato);
      bytes = g.bytes; mime = g.mime; modelo = g.model; usage = g.usage;
    } catch (e) {
      await registrarGeneracion(admin, { user_id: userId, kind: 'image', model: await modeloImagen().catch(() => 'desconocido'), status: 'error', error: String(e) });
      throw new Error(sanearError(String(e instanceof Error ? e.message : e)));
    }
  }

  const t = tipoImagen(mime);
  if (!t) throw new Error('Formato de imagen no permitido (usa PNG, JPG o WebP).');
  if (bytes.length > MAX_BYTES_IMAGEN) throw new Error('La imagen supera 8 MB.');

  const prompt = await resolverPrompt(admin, userId, { service: i.service, concept: i.concept, prompt: promptTexto, prompt_id: i.prompt_id, prompt_name: i.prompt_name });

  // Versión: 1 si es nuevo; si es regeneración, la siguiente de su linaje. Nunca se sobrescribe una imagen previa.
  const rootId: string | null = padre ? (padre.root_creative_id || padre.id) : null;
  let version = 1;
  if (rootId) {
    const { data: v } = await admin.from('creatives').select('version').or(`id.eq.${rootId},root_creative_id.eq.${rootId}`).order('version', { ascending: false }).limit(1).maybeSingle();
    version = (v?.version ?? 1) + 1;
  }

  const id = crypto.randomUUID();
  const path = rutaImagen(i.service, id, version, t.ext);
  const up = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: t.mime, upsert: false });
  if (up.error) throw new Error(`No se pudo guardar la imagen: ${sanearError(up.error.message)}`);

  const { data, error } = await admin.from('creatives').insert({
    id, organization_id: ORG_ID, service: i.service, objective: i.objective || null, audience: i.audience || null, concept: i.concept || null, format: formato,
    style: i.style || null, language: i.language || null, prompt_id: prompt.id, prompt_text: promptTexto, prompt_version: prompt.version,
    hook: i.hook || null, headline: i.headline || null, primary_text: i.primary_text || null, cta: i.cta || null, visual_concept: i.visual_concept || null,
    image_path: path, image_source: modo === 'subir' ? 'uploaded' : 'generated', image_mime: t.mime, image_bytes: bytes.length, model: modelo,
    version, variant: i.variant || null, changed_variable: padre ? i.changed_variable : null, parent_creative_id: padre?.id ?? null, root_creative_id: rootId,
    concept_id: i.concept_id || null, experiment_id: i.experiment_id || null, created_by: userId,
  }).select(COLS).single();
  if (error || !data) {
    await admin.storage.from(BUCKET).remove([path]);
    throw new Error(`No se pudo registrar el creativo: ${sanearError(error?.message || '')}`);
  }
  if (modo !== 'subir') await registrarGeneracion(admin, { creative_id: id, user_id: userId, kind: 'image', model: modelo!, status: 'ok', usage });
  if (i.concept_id) await admin.from('creative_concepts').update({ status: 'used' }).eq('id', i.concept_id);
  return { ok: true, creativo: data, image_url: await urlFirmada(admin, path), modelo };
}

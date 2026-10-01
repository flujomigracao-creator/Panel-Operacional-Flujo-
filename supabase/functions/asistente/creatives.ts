// Laboratorio de Creativos V5 — Flujo de Migração
// Analizar → proponer → crear creativo → publicar → medir → comparar → aprender.
//
// Reglas (heredadas del V4):
//   - Todo dato sale de Supabase/Meta; lo que no existe es null, nunca 0 inventado.
//   - Jamás se publica ni se cambia nada en Meta sin propuesta + confirmación humana (ai_proposals).
//   - Los anuncios nuevos se crean SIEMPRE en PAUSED.
//   - Tokens y claves solo se leen de los secretos de la Edge Function; no se devuelven ni se registran.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { ORG_ID, getMetaConfig, META_GRAPH_VERSION } from './ads.ts';
import { consultarAprendizajes, proponerExperimentoV4, type ExperimentDesignParams } from './campaign_science.ts';
import {
  CONCEPTOS, construirPromptPublicitario, tamanoOpenAI, aspectoGemini,
  validarCreativo, tipoImagen, evaluarGanador, UMBRALES_POR_DEFECTO, type MetricasVariante,
} from './creative_logic.ts';

const MAX_GENERADOS_POR_DIA = 40; // tope de costo: cada generación de imagen se paga al proveedor
const MAX_BYTES_IMAGEN = 8 * 1024 * 1024;

const CAMPOS_CREATIVO = 'id, service, objective, concept, format, prompt_id, prompt_text, prompt_version, hook, headline, primary_text, cta, visual_concept, image_path, image_source, status, parent_creative_id, campaign_id, adset_id, ad_id, meta_creative_id, created_at';

const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
const bytesToB64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

// ── Generación de imagen ───────────────────────────────────────────────────────────

export async function generarImagen(prompt: string, formato: string): Promise<{ bytes: Uint8Array; mime: string; proveedor: string }> {
  const openai = Deno.env.get('OPENAI_API_KEY');
  const gemini = Deno.env.get('GEMINI_API_KEY');
  if (openai) {
    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${openai}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: Deno.env.get('IMAGE_MODEL') || 'gpt-image-1', prompt, size: tamanoOpenAI(formato), n: 1 }),
    });
    const d = await r.json().catch(() => ({}));
    const b64 = d?.data?.[0]?.b64_json;
    if (!r.ok || !b64) throw new Error(`El proveedor de imágenes rechazó la solicitud: ${d?.error?.message || r.status}`);
    return { bytes: b64ToBytes(b64), mime: 'image/png', proveedor: 'openai' };
  }
  if (gemini) {
    const modelo = Deno.env.get('IMAGE_MODEL') || 'gemini-2.5-flash-image';
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': gemini, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspectoGemini(formato) } },
      }),
    });
    const d = await r.json().catch(() => ({}));
    const parte = (d?.candidates?.[0]?.content?.parts || []).find((p: any) => p.inlineData?.data);
    if (!r.ok || !parte) throw new Error(`El proveedor de imágenes rechazó la solicitud: ${d?.error?.message || r.status}`);
    return { bytes: b64ToBytes(parte.inlineData.data), mime: parte.inlineData.mimeType || 'image/png', proveedor: 'gemini' };
  }
  throw new Error('No hay proveedor de imágenes configurado. Define OPENAI_API_KEY o GEMINI_API_KEY en Supabase (Edge Functions → Secrets). Mientras tanto puedes subir una imagen propia.');
}

async function guardarImagen(admin: SupabaseClient, creativeId: string, bytes: Uint8Array, mime: string): Promise<string> {
  const t = tipoImagen(mime);
  if (!t) throw new Error('Formato de imagen no permitido (usa PNG, JPG o WebP).');
  if (bytes.length > MAX_BYTES_IMAGEN) throw new Error('La imagen supera 8 MB.');
  const path = `${ORG_ID}/${creativeId}.${t.ext}`;
  const { error } = await admin.storage.from('creatives').upload(path, bytes, { contentType: t.mime, upsert: true });
  if (error) throw new Error(`No se pudo guardar la imagen: ${error.message}`);
  return path;
}

// ── Biblioteca de prompts (con versiones) ──────────────────────────────────────────

async function resolverPrompt(
  admin: SupabaseClient, userId: string,
  i: { service: string; concept?: string; prompt: string; prompt_id?: string; prompt_name?: string; variables?: Record<string, string> },
): Promise<{ id: string; version: number }> {
  if (i.prompt_id) {
    const { data: ant } = await admin.from('creative_prompts').select('id, prompt, version, name, service, concept, variables').eq('id', i.prompt_id).maybeSingle();
    if (!ant) throw new Error('El prompt de la biblioteca no existe.');
    if (ant.prompt === i.prompt) return { id: ant.id, version: ant.version };
    // El texto cambió: se guarda como una versión nueva, sin pisar la anterior.
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

export async function guardarPrompt(admin: SupabaseClient, userId: string, i: any) {
  const err = validarCreativo({ service: i.service });
  if (err) throw new Error(err);
  if (!String(i.prompt || '').trim()) throw new Error('El prompt no puede estar vacío.');
  const p = await resolverPrompt(admin, userId, i);
  const { data } = await admin.from('creative_prompts').select('*').eq('id', p.id).single();
  return { ok: true, prompt: data };
}

// ── Crear creativos (generados por IA o subidos) ───────────────────────────────────

interface CreativoInput {
  service: string; objective?: string; concept?: string; format?: string;
  hook?: string; headline?: string; primary_text?: string; cta?: string; visual_concept?: string;
  prompt?: string; prompt_id?: string; prompt_name?: string; variables?: Record<string, string>;
  parent_creative_id?: string; image_base64?: string; mime?: string; concept_id?: string;
}

async function crearCreativo(admin: SupabaseClient, userId: string, i: CreativoInput, modo: 'generar' | 'subir') {
  const formato = i.format || '1:1';
  const err = validarCreativo({ service: i.service, format: formato });
  if (err) throw new Error(err);

  let bytes: Uint8Array; let mime: string; let proveedor: string | null = null;
  const promptTexto = (i.prompt && i.prompt.trim()) || construirPromptPublicitario({ servicio: i.service, concepto: i.concept, hook: i.hook, visual_concept: i.visual_concept, variables: i.variables });

  if (modo === 'generar') {
    const hoy = new Date(); hoy.setUTCHours(0, 0, 0, 0);
    const { count } = await admin.from('creatives').select('id', { count: 'exact', head: true }).eq('organization_id', ORG_ID).eq('image_source', 'generated').gte('created_at', hoy.toISOString());
    if ((count ?? 0) >= MAX_GENERADOS_POR_DIA) throw new Error(`Se alcanzó el tope de ${MAX_GENERADOS_POR_DIA} imágenes generadas hoy (control de costo). Vuelve mañana o sube imágenes propias.`);
    const g = await generarImagen(promptTexto, formato);
    bytes = g.bytes; mime = g.mime; proveedor = g.proveedor;
  } else {
    if (!i.image_base64) throw new Error('Falta la imagen.');
    bytes = b64ToBytes(i.image_base64.replace(/^data:[^,]+,/, '')); mime = i.mime || 'image/png';
  }

  const prompt = await resolverPrompt(admin, userId, { service: i.service, concept: i.concept, prompt: promptTexto, prompt_id: i.prompt_id, prompt_name: i.prompt_name, variables: i.variables });
  const id = crypto.randomUUID();
  const image_path = await guardarImagen(admin, id, bytes, mime);
  const { data, error } = await admin.from('creatives').insert({
    id, organization_id: ORG_ID, service: i.service, objective: i.objective || null, concept: i.concept || null, format: formato,
    prompt_id: prompt.id, prompt_text: promptTexto, prompt_version: prompt.version,
    hook: i.hook || null, headline: i.headline || null, primary_text: i.primary_text || null, cta: i.cta || null, visual_concept: i.visual_concept || null,
    image_path, image_source: modo === 'generar' ? 'generated' : 'uploaded', parent_creative_id: i.parent_creative_id || null, concept_id: i.concept_id || null, created_by: userId,
  }).select(CAMPOS_CREATIVO).single();
  if (error || !data) {
    await admin.storage.from('creatives').remove([image_path]);
    throw new Error(`No se pudo guardar el creativo: ${error?.message}`);
  }
  if (i.concept_id) await admin.from('creative_concepts').update({ status: 'used' }).eq('id', i.concept_id);
  return { ok: true, creativo: data, proveedor };
}

export const generarCreativo = (admin: SupabaseClient, userId: string, i: CreativoInput) => crearCreativo(admin, userId, i, 'generar');
export const subirCreativo = (admin: SupabaseClient, userId: string, i: CreativoInput) => crearCreativo(admin, userId, i, 'subir');

// ── Ideación de conceptos con IA (usa aprendizajes y resultados reales, sin copiar anuncios) ──

export async function proponerConceptos(
  admin: SupabaseClient, groq: (p: Record<string, unknown>) => Promise<any>, model: string,
  i: { service: string; objective?: string; cantidad?: number },
  userId?: string,
) {
  const err = validarCreativo({ service: i.service });
  if (err) throw new Error(err);
  const cantidad = Math.min(Math.max(Number(i.cantidad) || 3, 1), 5);

  const aprendizajes = await consultarAprendizajes(admin, { service: i.service, limit: 8 });
  const { data: top } = await admin.from('creative_resultados').select('concept, hook, ctr, costo_por_conversacion, costo_por_cliente, conversaciones, clientes_pagaron')
    .eq('service', i.service).not('impresiones', 'is', null).gt('impresiones', 1000).order('conversaciones', { ascending: false, nullsFirst: false }).limit(5);
  const tieneHistorial = (top || []).length > 0 || aprendizajes.length > 0;

  const contexto = tieneHistorial
    ? `Patrones aprendidos (úsalos como guía, NO copies ningún anuncio): ${JSON.stringify(aprendizajes.map((a: any) => ({ aprendizaje: a.learning, confianza: a.confidence })))}. Resultados reales recientes: ${JSON.stringify(top)}.`
    : 'Aún no hay historial de resultados de creativos para este servicio: son hipótesis nuevas, no basadas en datos.';

  const r = await groq({
    model, temperature: 0.7, response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'Eres estratega creativo de publicidad en Meta Ads para Flujo de Migração, empresa que ayuda a extranjeros con trámites migratorios en Brasil. Respondes SOLO JSON. Texto del anuncio en español neutro, claro, sin promesas de resultado garantizado ni lenguaje que suplante a organismos oficiales.' },
      { role: 'user', content: `Servicio: ${i.service}. Objetivo: ${i.objective || 'conversaciones de WhatsApp'}. ${contexto}\nDevuelve {"conceptos":[...${cantidad} objetos]}. Cada objeto: {"concept": uno de ${JSON.stringify(CONCEPTOS)}, "hook": frase corta, "headline": máx 40 caracteres, "primary_text": máx 300 caracteres, "cta": texto de botón corto, "visual_concept": descripción de la escena en 1-2 frases}. Usa conceptos visuales distintos entre sí.` },
    ],
  });
  let parsed: any = {};
  try { parsed = JSON.parse(r.choices?.[0]?.message?.content || '{}'); } catch { /* respuesta inválida */ }
  const conceptos = (Array.isArray(parsed.conceptos) ? parsed.conceptos : []).slice(0, cantidad).map((c: any) => {
    const concept = (CONCEPTOS as readonly string[]).includes(c.concept) ? c.concept : 'mensaje_directo';
    return {
      concept, hook: String(c.hook || '').slice(0, 120), headline: String(c.headline || '').slice(0, 40),
      primary_text: String(c.primary_text || '').slice(0, 300), cta: String(c.cta || '').slice(0, 30),
      visual_concept: String(c.visual_concept || '').slice(0, 300),
      prompt: construirPromptPublicitario({ servicio: i.service, concepto: concept, hook: c.hook, visual_concept: c.visual_concept }),
    };
  });
  if (!conceptos.length) throw new Error('La IA no devolvió conceptos válidos. Inténtalo de nuevo.');
  // Cada concepto queda registrado, se genere o no su imagen.
  const { data: guardados } = await admin.from('creative_concepts').insert(conceptos.map((c: any) => ({
    organization_id: ORG_ID, service: i.service, objective: i.objective || null, concept: c.concept, hook: c.hook, headline: c.headline,
    primary_text: c.primary_text, cta: c.cta, visual_concept: c.visual_concept, prompt: c.prompt, based_on_data: tieneHistorial, created_by: userId || null,
  }))).select('id');
  const conId = conceptos.map((c: any, k: number) => ({ ...c, concept_id: guardados?.[k]?.id ?? null }));
  return { ok: true, conceptos: conId, basado_en_datos: tieneHistorial };
}

// ── Actualizar / aprobar / vincular a anuncios REALES de Meta ──────────────────────

export async function actualizarCreativo(admin: SupabaseClient, id: string, patch: any) {
  const { data: c } = await admin.from('creatives').select('id, status, ad_id').eq('id', id).eq('organization_id', ORG_ID).maybeSingle();
  if (!c) throw new Error('Creativo no encontrado.');
  const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of ['hook', 'headline', 'primary_text', 'cta', 'concept', 'visual_concept']) if (k in patch) upd[k] = patch[k] || null;
  if ('status' in patch) {
    if (!['draft', 'approved', 'archived'].includes(patch.status)) throw new Error("El estado 'published' lo asigna el sistema al publicar o vincular un anuncio real.");
    upd.status = patch.status;
  }
  if (patch.ad_id) {
    // El anuncio debe existir en la caché sincronizada desde Meta: no se aceptan IDs inventados.
    const { data: ad } = await admin.from('meta_ads_entities').select('entity_id, parent_id').eq('entity_type', 'ad').eq('entity_id', String(patch.ad_id)).maybeSingle();
    if (!ad) throw new Error('Ese ad_id no existe en los anuncios sincronizados de Meta. Sincroniza con Meta Ads y vuelve a intentarlo.');
    const { data: adset } = ad.parent_id ? await admin.from('meta_ads_entities').select('parent_id').eq('entity_type', 'adset').eq('entity_id', ad.parent_id).maybeSingle() : { data: null };
    const { data: otro } = await admin.from('creatives').select('id').eq('ad_id', String(patch.ad_id)).neq('id', id).maybeSingle();
    if (otro) throw new Error('Ese anuncio ya está vinculado a otro creativo.');
    Object.assign(upd, { ad_id: String(patch.ad_id), adset_id: ad.parent_id, campaign_id: adset?.parent_id ?? null, status: 'published' });
  }
  const { data, error } = await admin.from('creatives').update(upd).eq('id', id).select(CAMPOS_CREATIVO).single();
  if (error) throw new Error(`No se pudo actualizar: ${error.message}`);
  return { ok: true, creativo: data };
}

// ── Publicación en Meta (siempre vía propuesta confirmada; el anuncio nace PAUSED) ──

export async function proponerPublicacion(
  ctx: { admin: SupabaseClient; userId: string },
  i: { creative_id: string; adset_id: string; nombre_anuncio?: string },
) {
  const { data: c } = await ctx.admin.from('creatives').select(CAMPOS_CREATIVO).eq('id', i.creative_id).eq('organization_id', ORG_ID).maybeSingle();
  if (!c) throw new Error('Creativo no encontrado.');
  if (c.status !== 'approved') throw new Error('Solo se pueden publicar creativos aprobados. Apruébalo primero.');
  if (c.ad_id) throw new Error('Este creativo ya está vinculado a un anuncio.');
  if (!c.image_path || !c.headline || !c.primary_text) throw new Error('El creativo necesita imagen, titular y texto principal.');
  const { data: adset } = await ctx.admin.from('meta_ads_entities').select('entity_id, name, parent_id').eq('entity_type', 'adset').eq('entity_id', String(i.adset_id)).maybeSingle();
  if (!adset) throw new Error('Ese conjunto de anuncios no existe en los datos sincronizados de Meta.');

  const payload = {
    creative_id: c.id, adset_id: adset.entity_id, adset_nombre: adset.name, campaign_id: adset.parent_id,
    nombre_anuncio: i.nombre_anuncio || `${c.service} · ${c.concept || 'creativo'} · ${c.id.slice(0, 6)}`,
    servicio: c.service, formato: c.format, titular: c.headline, texto_principal: c.primary_text, cta: c.cta, image_path: c.image_path,
    riesgos: ['El anuncio se crea en estado PAUSED: no gasta hasta que lo actives.', 'Se publicará en un conjunto existente; no cambia presupuestos ni públicos.'],
  };
  const resumen = `Publicar el creativo "${c.headline}" (${c.service}) en el conjunto "${adset.name}" de Meta, en pausa.`;
  const { data: propuesta, error } = await ctx.admin.from('ai_proposals').insert({
    organization_id: ORG_ID, user_id: ctx.userId, tipo: 'ads_publicar_creativo', payload, resumen,
  }).select('id, tipo, payload, resumen, status, created_at').single();
  if (error || !propuesta) throw new Error(`No se pudo crear la propuesta: ${error?.message}`);
  return { ok: true, propuesta };
}

/** Ejecuta la publicación ya confirmada. Reutilizado por el ejecutor de propuestas y por los experimentos. */
export async function publicarCreativoEnMeta(
  admin: SupabaseClient,
  i: { creative_id: string; adset_id: string; nombre_anuncio?: string; variant_id?: string },
) {
  const { token, accountId } = getMetaConfig();
  const pageId = Deno.env.get('META_PAGE_ID');
  if (!token || !accountId) throw new Error('Faltan credenciales META_ADS_TOKEN / META_AD_ACCOUNT_ID en Supabase.');
  if (!pageId) throw new Error('Falta el secreto META_PAGE_ID (id de la página de Facebook que publica los anuncios).');

  const { data: c } = await admin.from('creatives').select(CAMPOS_CREATIVO).eq('id', i.creative_id).maybeSingle();
  if (!c || !c.image_path) throw new Error('Creativo o imagen no encontrados.');
  if (c.ad_id) throw new Error('Este creativo ya está vinculado a un anuncio.');

  const { data: blob, error: eImg } = await admin.storage.from('creatives').download(c.image_path);
  if (eImg || !blob) throw new Error(`No se pudo leer la imagen: ${eImg?.message}`);
  const base = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
  const post = async (ruta: string, cuerpo: Record<string, unknown>) => {
    const r = await fetch(`${base}/${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...cuerpo, access_token: token }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.error) throw new Error(d.error?.message || `Meta API error (${r.status})`);
    return d;
  };

  const img = await post(`${accountId}/adimages`, { bytes: bytesToB64(new Uint8Array(await blob.arrayBuffer())) });
  const hash = Object.values(img.images || {}).map((x: any) => x.hash)[0] as string | undefined;
  if (!hash) throw new Error('Meta no devolvió el hash de la imagen.');

  const creative = await post(`${accountId}/adcreatives`, {
    name: `Creativo ${c.id.slice(0, 8)}`,
    object_story_spec: {
      page_id: pageId,
      link_data: {
        image_hash: hash, link: 'https://api.whatsapp.com/send', message: c.primary_text, name: c.headline,
        call_to_action: { type: 'WHATSAPP_MESSAGE', value: { app_destination: 'WHATSAPP' } },
      },
    },
  });
  const ad = await post(`${accountId}/ads`, {
    name: i.nombre_anuncio || `${c.service} · ${c.id.slice(0, 6)}`, adset_id: i.adset_id, creative: { creative_id: creative.id }, status: 'PAUSED',
  });

  const { data: adset } = await admin.from('meta_ads_entities').select('parent_id').eq('entity_type', 'adset').eq('entity_id', String(i.adset_id)).maybeSingle();
  await admin.from('creatives').update({
    ad_id: ad.id, adset_id: String(i.adset_id), campaign_id: adset?.parent_id ?? null, meta_creative_id: creative.id, status: 'published', updated_at: new Date().toISOString(),
  }).eq('id', c.id);
  if (i.variant_id) await admin.from('campaign_variants').update({ ad_id: ad.id, adset_id: String(i.adset_id), creative_id: creative.id }).eq('id', i.variant_id);
  return { ad_id: ad.id as string, meta_creative_id: creative.id as string, adset_id: String(i.adset_id) };
}

// ── Experimentos con creativos (reutiliza el V4: una sola variable, Control explícito) ──

export async function crearExperimentoCreativos(
  ctx: { admin: SupabaseClient; userId: string; conversationId?: string | null; proposals?: any[] },
  i: { name?: string; hypothesis: string; variable_tested: string; creative_ids: string[]; daily_budget: number; primary_metric?: string; objective?: string },
) {
  const ids = [...new Set(i.creative_ids || [])];
  if (ids.length < 2 || ids.length > 4) throw new Error('Elige entre 2 y 4 creativos (el primero será el Control).');
  const { data: lista } = await ctx.admin.from('creatives').select(CAMPOS_CREATIVO).in('id', ids);
  const porId = new Map((lista || []).map((c: any) => [c.id, c]));
  const orden = ids.map(id => porId.get(id)).filter(Boolean) as any[];
  if (orden.length !== ids.length) throw new Error('Alguno de los creativos no existe.');
  const servicios = new Set(orden.map(c => c.service));
  if (servicios.size > 1) throw new Error('Un experimento compara creativos de un solo servicio; no se mezclan intenciones.');
  const sinAprobar = orden.filter(c => !['approved', 'published'].includes(c.status));
  if (sinAprobar.length) throw new Error('Todos los creativos deben estar aprobados antes de entrar a un experimento.');

  const servicio = orden[0].service;
  const params: ExperimentDesignParams = {
    name: i.name || `Creativos ${servicio} · ${i.variable_tested}`,
    service: servicio,
    question: `¿Qué ${i.variable_tested} genera mejores resultados en ${servicio}?`,
    hypothesis: i.hypothesis,
    variable_tested: i.variable_tested,
    control_description: orden[0].headline || 'Creativo de control',
    treatment_description: orden.slice(1).map(c => c.headline).filter(Boolean).join(' | ') || 'Variantes del creativo',
    objective: (i.objective as any) || 'OUTCOME_MESSAGES',
    primary_metric: i.primary_metric || 'cost_per_customer',
    audience_definition: {},
    daily_budget: Number(i.daily_budget),
    variants: orden.map((c, idx) => ({
      variant_name: idx === 0 ? 'Control' : `Variante ${String.fromCharCode(65 + idx - 1)}`,
      hook: c.hook || c.headline || '', copy: c.primary_text || '', cta: c.cta || '',
      creative_reference: c.image_path, creative_asset_id: c.id,
      variable_changed: idx === 0 ? 'control' : i.variable_tested,
    })),
    decision_rules: {
      scale_condition: 'Ganador con confianza media o alta (volumen, periodo y consistencia suficientes).',
      pause_condition: 'Sin conversaciones tras 3 días con gasto.',
      iterate_condition: 'Tendencia sin ganador claro: repetir cambiando una sola variable.',
    },
  };
  const proposals: any[] = ctx.proposals ?? [];
  const r = await proponerExperimentoV4({ admin: ctx.admin, userId: ctx.userId, conversationId: (ctx.conversationId ?? null) as any, proposals }, params);
  return { ...r, propuesta: proposals[proposals.length - 1] ?? null };
}

// ── Cierre de experimento: medir con datos reales y aprender SOLO si hay evidencia ──

export async function cerrarExperimentoCreativos(admin: SupabaseClient, experimentId: string, opts: { concluirInconcluso?: boolean } = {}) {
  const { data: exp } = await admin.from('campaign_experiments').select('*').eq('id', experimentId).maybeSingle();
  if (!exp) throw new Error('Experimento no encontrado.');
  const { data: variantes } = await admin.from('campaign_variants').select('id, variant_name, ad_id, creative_asset_id').eq('experiment_id', experimentId);
  const conAnuncio = (variantes || []).filter((v: any) => v.ad_id);
  if (conAnuncio.length < 2) {
    return { ok: true, veredicto: 'sin_datos', mensaje: 'Menos de 2 variantes tienen un anuncio real de Meta vinculado; no hay nada que medir todavía.' };
  }
  const adIds = conAnuncio.map((v: any) => v.ad_id);
  const { data: res } = await admin.from('creative_resultados').select('ad_id, id, concept, hook, ctr, impresiones, clics, gasto, conversaciones, leads, clientes_pagaron, ingresos').in('ad_id', adIds);
  // Anuncios que no pasaron por el laboratorio: se miden igual desde meta_ads_resultados.
  const { data: dias } = await admin.from('meta_ads_insights').select('fecha').in('ad_id', adIds);
  const nDias = new Set((dias || []).map((d: any) => d.fecha)).size;
  const porAd = new Map((res || []).map((r: any) => [r.ad_id, r]));

  const metricas: MetricasVariante[] = conAnuncio.map((v: any) => {
    const r: any = porAd.get(v.ad_id);
    const num = (x: any) => (x == null ? null : Number(x));
    return { nombre: v.variant_name, impresiones: num(r?.impresiones), clics: num(r?.clics), gasto: num(r?.gasto), conversaciones: num(r?.conversaciones), clientes_pagaron: num(r?.clientes_pagaron) };
  });

  // Medición registrada (null cuando el dato no existe).
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  for (const v of conAnuncio) {
    const r: any = porAd.get(v.ad_id);
    if (!r) continue;
    await admin.from('campaign_measurements').insert({
      experiment_id: experimentId, variant_id: v.id, date: hoy, spend: r.gasto, impressions: r.impresiones, clicks: r.clics,
      ctr: r.ctr ?? null, conversations: r.conversaciones, leads: r.leads, customers: r.clientes_pagaron, revenue: r.ingresos,
      cost_per_customer: r.clientes_pagaron ? Number(r.gasto) / Number(r.clientes_pagaron) : null,
    });
  }

  // Umbrales congelados al crear el experimento (si no existen, los de por defecto).
  const umbrales = { ...UMBRALES_POR_DEFECTO, ...(exp.decision_thresholds || {}) };
  const evaluacion = evaluarGanador(metricas, nDias, umbrales);
  if (evaluacion.veredicto !== 'ganador' && opts.concluirInconcluso) {
    // El dueño decide cerrar sin ganador: queda INCONCLUSO, sin aprendizaje.
    await admin.from('campaign_hypotheses').update({ result: 'inconclusive', confidence: 0.3, evidence: { ...evaluacion }, decision: `Inconcluso: ${evaluacion.motivo}` }).eq('experiment_id', experimentId);
    await admin.from('campaign_experiments').update({ status: 'completed', end_date: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', experimentId);
    return { ok: true, ...evaluacion, veredicto: 'inconcluso', mensaje: `Experimento cerrado como INCONCLUSO. ${evaluacion.motivo} No se guardó ningún aprendizaje.` };
  }
  if (evaluacion.veredicto !== 'ganador') {
    return { ok: true, ...evaluacion, mensaje: `Sin ganador declarado. ${evaluacion.motivo} El experimento sigue abierto.` };
  }

  const esControl = /control/i.test(evaluacion.ganador || '');
  const ganadora: any = porAd.get(conAnuncio.find((v: any) => v.variant_name === evaluacion.ganador)?.ad_id);
  await admin.from('campaign_hypotheses').update({
    result: esControl ? 'not_supported' : 'supported',
    confidence: evaluacion.confianza === 'alta' ? 0.85 : 0.6,
    evidence: { ...evaluacion }, decision: esControl ? 'Mantener el control.' : 'Adoptar la variante ganadora y probar una sola variable nueva.',
  }).eq('experiment_id', experimentId);
  await admin.from('campaign_experiments').update({ status: 'completed', end_date: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', experimentId);

  const metrica = evaluacion.metrica === 'costo_por_cliente' ? 'costo por cliente pagante' : 'costo por conversación';
  const { data: aprendizaje } = await admin.from('campaign_learnings').insert({
    organization_id: ORG_ID, service: exp.service, creative_angle: ganadora?.concept ?? null, hook: ganadora?.hook ?? null, channel: 'Meta Ads + WhatsApp',
    learning: `En ${exp.service}, "${evaluacion.ganador}" ${esControl ? '(el control) ' : ''}ganó por ${metrica}. ${evaluacion.motivo}`,
    evidence: JSON.stringify({ muestra: evaluacion.muestra, metrica: evaluacion.metrica }),
    confidence: evaluacion.confianza === 'alta' ? 0.85 : 0.6,
    sample_size: evaluacion.muestra.impresiones,
    next_experiment: `Mantener lo que ganó y cambiar únicamente una variable distinta a "${exp.treatment_description ? 'la anterior' : 'la probada'}".`,
    source_experiment_id: experimentId,
  }).select().single();
  return { ok: true, ...evaluacion, aprendizaje };
}

// ── Lectura para el Asistente (Nora) ───────────────────────────────────────────────

export async function rankingCreativos(
  admin: SupabaseClient,
  f: { servicio?: string; formato?: string; concepto?: string; orden?: string; limite?: number },
) {
  const orden = ['ctr', 'conversaciones', 'costo_por_conversacion', 'clientes_pagaron', 'costo_por_cliente', 'ingresos'].includes(f.orden || '') ? f.orden! : 'conversaciones';
  const asc = orden.startsWith('costo_');
  let q = admin.from('creative_resultados').select('id, service, concept, format, hook, headline, status, ad_id, impresiones, clics, ctr, gasto, conversaciones, costo_por_conversacion, leads, clientes_pagaron, costo_por_cliente, ingresos, roas, prompt_id, prompt_version');
  if (f.servicio) q = q.eq('service', f.servicio);
  if (f.formato) q = q.eq('format', f.formato);
  if (f.concepto) q = q.eq('concept', f.concepto);
  const { data, error } = await q.order(orden, { ascending: asc, nullsFirst: false }).limit(Math.min(f.limite || 15, 50));
  if (error) throw new Error(error.message);
  return {
    total: (data || []).length, ordenado_por: orden, creativos: data || [],
    nota: 'Las métricas vacías (null) significan que el creativo aún no tiene un anuncio de Meta vinculado o no hay datos; no son ceros.',
  };
}

export async function biblioteca(admin: SupabaseClient, servicio?: string) {
  let q = admin.from('prompt_resultados').select('id, name, service, concept, version, creativos_generados, creativos_publicados, impresiones, conversaciones, leads, clientes, gasto, ingresos, costo_por_cliente');
  if (servicio) q = q.eq('service', servicio);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(50);
  if (error) throw new Error(error.message);
  return { total: (data || []).length, prompts: data || [] };
}


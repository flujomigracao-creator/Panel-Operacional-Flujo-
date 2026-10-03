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
import { proponerExperimentoV4, type ExperimentDesignParams } from './campaign_science.ts';
import { validarCreativo, evaluarGanador, UMBRALES_POR_DEFECTO, type MetricasVariante } from '../_shared/creative_logic.ts';
import { resolverPrompt } from '../_shared/creative_store.ts';
import { publicosPorVariante } from '../_shared/publicos_meta.ts';

const CAMPOS_CREATIVO = 'id, service, objective, concept, format, prompt_id, prompt_text, prompt_version, hook, headline, primary_text, cta, visual_concept, image_path, image_source, status, parent_creative_id, campaign_id, adset_id, ad_id, meta_creative_id, generation_id, created_at';

const bytesToB64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

// ── Biblioteca de prompts (con versiones): la lógica vive en _shared/creative_store.ts ──

export async function guardarPrompt(admin: SupabaseClient, userId: string, i: any) {
  const err = validarCreativo({ service: i.service });
  if (err) throw new Error(err);
  if (!String(i.prompt || '').trim()) throw new Error('El prompt no puede estar vacío.');
  const p = await resolverPrompt(admin, userId, i);
  const { data } = await admin.from('creative_prompts').select('*').eq('id', p.id).single();
  return { ok: true, prompt: data };
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
  i: { name?: string; hypothesis: string; variable_tested: string; creative_ids: string[]; daily_budget: number; primary_metric?: string; objective?: string; aprobar_seleccion?: boolean; publico_codigos?: string[] },
) {
  const ids = [...new Set(i.creative_ids || [])];
  if (ids.length < 2 || ids.length > 4) throw new Error('Elige entre 2 y 4 creativos (el primero será el Control).');
  // Públicos de Meta por variante: se validan ahora (existen y son de adquisición) para fallar antes de proponer nada.
  const publicos = publicosPorVariante(i.publico_codigos, ids.length);
  const codigosUsados = [...new Set(publicos.filter(Boolean))] as string[];
  if (codigosUsados.length) {
    const { data: defs } = await ctx.admin.from('publicos_definiciones').select('codigo, tipo').eq('organization_id', ORG_ID).in('codigo', codigosUsados);
    for (const c of codigosUsados) {
      const d = (defs || []).find((x: any) => x.codigo === c);
      if (!d) throw new Error(`El público «${c}» no existe. Usa listar_publicos para ver los disponibles.`);
      if (d.tipo !== 'adquisicion') throw new Error(`El público «${c}» es de tipo «${d.tipo}»: solo los de adquisición se usan en un conjunto de anuncios.`);
    }
  }
  const { data: lista } = await ctx.admin.from('creatives').select(CAMPOS_CREATIVO).in('id', ids);
  const porId = new Map((lista || []).map((c: any) => [c.id, c]));
  const orden = ids.map(id => porId.get(id)).filter(Boolean) as any[];
  if (orden.length !== ids.length) throw new Error('Alguno de los creativos no existe.');
  const servicios = new Set(orden.map(c => c.service));
  if (servicios.size > 1) throw new Error('Un experimento compara creativos de un solo servicio; no se mezclan intenciones.');
  // El dueño eligió estas imágenes en el chat: su elección es la aprobación de los borradores.
  if (i.aprobar_seleccion) {
    const borradores = orden.filter(c => c.status === 'draft' && c.image_path);
    if (borradores.length) {
      await ctx.admin.from('creatives').update({ status: 'approved', updated_at: new Date().toISOString() }).in('id', borradores.map(c => c.id));
      for (const c of borradores) c.status = 'approved';
    }
  }
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
      creative_reference: c.image_path, creative_asset_id: c.id, creative_generation_id: c.generation_id || undefined,
      variable_changed: idx === 0 ? 'control' : i.variable_tested,
      ...(publicos[idx] ? { publico_codigo: publicos[idx] as string } : {}),
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


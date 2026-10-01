import { supabase } from '@shared/config/supabaseClient';

// Llama a la Edge Function `asistente` con la sesión del usuario.
// Si responde con error, devuelve el mensaje que explica el problema.
async function invoke(body) {
  const { data, error } = await supabase.functions.invoke('asistente', { body });
  if (error) {
    let msg = error.message;
    try {
      const detail = await error.context?.json?.();
      if (detail?.error) msg = detail.error;
      if (detail?.propuesta) return { ...detail, ok: false, error: msg };
    } catch { /* respuesta sin JSON */ }
    throw new Error(msg);
  }
  return data;
}

export const sendMessage = (mensaje, conversationId, contexto) =>
  invoke({ accion: 'mensaje', mensaje, conversation_id: conversationId || undefined, contexto });

export const executeProposal = (proposalId, filas) =>
  invoke({ accion: 'ejecutar', proposal_id: proposalId, filas });

export const cancelProposal = (proposalId) =>
  invoke({ accion: 'cancelar', proposal_id: proposalId });

// ── Servicios del Centro de Inteligencia y Meta Ads ─

// Leads cuyo `lead_source` declara un origen de Meta: es evidencia de procedencia, pero NO
// dice qué campaña los generó (para eso están los referidos de meta_ads_referidos).
const FUENTES_META_LEAD = /(^|[^a-z])(meta|facebook|instagram|fb|ig|messenger|paid_?social)([^a-z]|$)/i;

// Mismo criterio de período que el backend (supabase/functions/asistente/ads.ts):
// el fallback local no debe mostrar totales históricos cuando el panel pide 7 días.
// Fecha local (no UTC): toISOString() puede adelantar un día en Brasil (UTC-3) de noche.
// Mismo patrón que financeService.hoyLocal: sin esto "Últimos 7 días" pedía hasta
// 2026-10-01 siendo todavía 2026-09-30 (fecha futura que el panel no debería consultar).
const isoDiaLocal = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function rangoAFechas(rango) {
  const pedido = typeof rango === 'string' ? rango : rango?.periodo || '7d';
  // Período personalizado: las fechas explícitas mandan sobre el atajo.
  const desdePedido = typeof rango === 'string' ? undefined : rango?.desde;
  const hastaPedido = typeof rango === 'string' ? undefined : rango?.hasta;
  if (desdePedido || hastaPedido) {
    const desde = desdePedido || undefined;
    const hasta = hastaPedido || isoDiaLocal(new Date());
    return { desde, hasta, etiqueta: desde ? `${desde} — ${hasta}` : `Hasta ${hasta}` };
  }
  if (pedido === 'all' || pedido === 'todo') return { etiqueta: 'Todo el histórico' };
  const dias = pedido === '30d' ? 30 : pedido === '14d' ? 14 : 7;
  const hoy = new Date();
  const desde = new Date(hoy);
  desde.setDate(desde.getDate() - (dias - 1));
  return { desde: isoDiaLocal(desde), hasta: isoDiaLocal(hoy), etiqueta: `Últimos ${dias} días` };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fuentes de datos del Centro de Inteligencia (ver docs/architecture/0003):
//   métricas históricas ....... meta_ads_insights   (Supabase)
//   estado/presupuesto actual . meta_ads_entities   (sincronizado desde Meta Graph API)
//   leads atribuidos a Meta ... meta_ads_referidos  (payload crudo del webhook)
//   leads comerciales ......... comercial_leads      (CRM)
//   ingresos .................. payments            (cobros)
//   análisis con IA ........... Edge Function `asistente` (accion 'mensaje')
//
// El dashboard NUNCA llama a la Edge Function: un 400 de `asistente` no puede dejar sin
// métricas a la pantalla. El asistente se usa solo con "Analizar con Asistente".
// OJO: los builders de Supabase (from().select().order()) son "thenable" pero NO exponen
// `.catch()`: el error se lee SIEMPRE del resultado { data, error } del await.
// ── Atribución real de referidos (meta_ads_referidos) ─────────────────────────
// La tabla solo tiene `ad_id` + el payload crudo del webhook (`raw`/`body`): no hay
// `created_at` ni `campaign_id`. Por eso NO se reparte "a ojo":
//   - la fecha sale del payload; sin fecha el referido no entra en el corte del período;
//   - la campaña sale del payload o del cruce real ad_id → campaign_id;
//   - lo que no se puede determinar queda como "no atribuido".
const parseJsonSeguro = (v) => {
  if (v && typeof v === 'object') return v;
  if (typeof v === 'string' && v.trim().startsWith('{')) {
    try { return JSON.parse(v); } catch { return null; }
  }
  return null;
};

const fechaDePayload = (payload) => {
  if (!payload) return null;
  const bruto = payload.created_time ?? payload.created_at ?? payload.entry_time ?? payload.timestamp;
  if (bruto === null || bruto === undefined || bruto === '') return null;
  const d = new Date(typeof bruto === 'number' ? bruto * 1000 : bruto);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

export function atribuirReferidos(filas, rowsInsights, periodo) {
  const mapa = new Map();
  for (const r of rowsInsights || []) {
    if (r?.ad_id && r?.campaign_id && !mapa.has(String(r.ad_id))) mapa.set(String(r.ad_id), String(r.campaign_id));
  }
  const porCampana = {};
  let total = 0;
  let sinCampana = 0;
  let sinFecha = 0;
  let fueraDePeriodo = 0;

  for (const f of filas || []) {
    const payload = parseJsonSeguro(f?.raw) ?? parseJsonSeguro(f?.body);
    const dia = fechaDePayload(payload);
    if (!dia) { sinFecha++; continue; }
    if (periodo?.desde && dia < periodo.desde) { fueraDePeriodo++; continue; }
    if (periodo?.hasta && dia > periodo.hasta) { fueraDePeriodo++; continue; }

    const directo = payload?.campaign_id ?? payload?.campaign?.id ?? payload?.adset?.campaign_id ?? payload?.campaign;
    let cid = directo !== undefined && directo !== null && String(directo).trim() !== '' ? String(directo) : null;
    if (!cid && f?.ad_id && mapa.has(String(f.ad_id))) cid = mapa.get(String(f.ad_id));
    if (cid) { porCampana[cid] = (porCampana[cid] || 0) + 1; total++; } else { sinCampana++; }
  }
  return { disponible: true, total, por_campana: porCampana, sin_campana: sinCampana, sin_fecha: sinFecha, fuera_de_periodo: fueraDePeriodo };
}

export async function getAdsData(rango) {
  const periodo = rangoAFechas(rango);

  const consultar = async (builder, tabla) => {
    try {
      const { data, error } = await builder;
      if (error) {
        return { data: null, error: { message: error.message || `${tabla}: error de consulta`, code: error.code || null } };
      }
      return { data: data || [], error: null };
    } catch (err) {
      return { data: null, error: { message: err?.message || `${tabla}: error de consulta`, code: null } };
    }
  };

  // Columnas REALES de public.meta_ads_insights (tabla creada fuera de este repo, esquema en
  // español): fecha, campaign_id, campaign_name, adset_id, ad_id, gasto, impresiones, clics,
  // conversaciones, moneda, organization_id. NO existen `date`, `spend`, `impressions`,
  // `clicks`, `status`, `daily_budget` ni `leads`: filtrar por `date` devolvía el error 42703
  // "column meta_ads_insights.date does not exist" y dejaba el Centro de Inteligencia en rojo.
  let qInsights = supabase.from('meta_ads_insights').select('*').order('fecha', { ascending: false });
  if (periodo.desde) qInsights = qInsights.gte('fecha', periodo.desde);
  if (periodo.hasta) qInsights = qInsights.lte('fecha', periodo.hasta);

  // Estado actual (status, presupuestos, conjuntos y anuncios): lo sincroniza la Edge Function
  // leyendo la Meta Graph API con credenciales de servidor. El frontend solo lee la caché.
  const qEntidades = supabase
    .from('meta_ads_entities')
    .select('entity_type, entity_id, parent_id, name, status, effective_status, daily_budget, lifetime_budget, objective, account_id, creative_name, synced_at, last_synced_at')
    .limit(2000);

  // Referidos de Meta Ads: la tabla solo guarda `ad_id` y el payload crudo del webhook.
  const qReferidos = supabase.from('meta_ads_referidos').select('ad_id, raw, body').limit(1000);

  // Bitácora de sincronizaciones con Meta: permite mostrar "Última sincronización" y por qué
  // falló el último intento, sin adivinar.
  const qSync = supabase
    .from('meta_ads_sync_log')
    .select('ok, account_id, campanas, conjuntos, anuncios, errores, iniciado_en, terminado_en')
    .order('iniciado_en', { ascending: false })
    .limit(5);

  let qLeads = supabase
    .from('comercial_leads')
    .select('id, nombre, tramite_texto, precio, etapa_nombre, client_id, lead_source, updated_at')
    .order('updated_at', { ascending: false })
    .limit(500);
  if (periodo.desde) qLeads = qLeads.gte('updated_at', `${periodo.desde}T00:00:00`);
  if (periodo.hasta) qLeads = qLeads.lte('updated_at', `${periodo.hasta}T23:59:59`);

  let qPagos = supabase.from('payments').select('amount, paid_at, status, client_id').eq('status', 'paid');
  if (periodo.desde) qPagos = qPagos.gte('paid_at', `${periodo.desde}T00:00:00`);
  if (periodo.hasta) qPagos = qPagos.lte('paid_at', `${periodo.hasta}T23:59:59`);

  const [insightsRes, entidadesRes, referidosRes, leadsRes, pagosRes, syncRes] = await Promise.all([
    consultar(qInsights, 'meta_ads_insights'),
    consultar(qEntidades, 'meta_ads_entities'),
    consultar(qReferidos, 'meta_ads_referidos'),
    consultar(qLeads, 'comercial_leads'),
    consultar(qPagos, 'payments'),
    consultar(qSync, 'meta_ads_sync_log'),
  ]);

  // Las métricas históricas son la fuente principal: si fallan, es un error real y se propaga.
  if (insightsRes.error) {
    const err = new Error(`No se pudieron leer las métricas de Meta Ads: ${insightsRes.error.message}`);
    err.origen = 'meta_ads_insights';
    err.detalle = insightsRes.error;
    throw err;
  }

  // Avisos en lenguaje de negocio: la pantalla no muestra errores técnicos internos.
  const advertencias = [];
  if (entidadesRes.error) advertencias.push('Estado y presupuesto de campañas sin sincronizar con Meta Ads todavía.');
  if (referidosRes.error) advertencias.push('Sin datos de referidos de Meta Ads: no se puede atribuir leads por campaña.');
  if (leadsRes.error) advertencias.push('Leads comerciales no disponibles para el período.');
  if (pagosRes.error) advertencias.push('Cobros no disponibles para el período.');

  const rows = insightsRes.data || [];
  const entidades = entidadesRes.data || [];
  const campanasCache = new Map(
    entidades.filter(e => e.entity_type === 'campaign').map(e => [String(e.entity_id), e])
  );
  const referred = atribuirReferidos(referidosRes.data || [], rows, periodo);

  const porCampana = {};
  let gastoTotal = 0;
  let convTotal = 0;
  let clicksTotal = 0;
  let impTotal = 0;
  let leadsTotal = 0;

  for (const r of rows) {
    const cid = r.campaign_id || r.campaign_name || 'default';
    if (!porCampana[cid]) {
      // Estado y presupuesto vienen de `meta_ads_entities` (sincronizado desde la Graph API).
      // Si la campaña no está en la caché, quedan sin dato: nunca se inventa 'ACTIVE'.
      const cache = campanasCache.get(String(cid));
      porCampana[cid] = {
        id: cid,
        name: r.campaign_name || cache?.name || 'Campaña General',
        status: cache?.status || null,
        effective_status: cache?.effective_status || null,
        objective: cache?.objective || null,
        daily_budget: cache?.daily_budget != null ? Number(cache.daily_budget) : undefined,
        lifetime_budget: cache?.lifetime_budget != null ? Number(cache.lifetime_budget) : undefined,
        estado_actualizado_en: cache?.last_synced_at || cache?.synced_at || null,
        // Estado operacional de Meta (puede diferir de `status`, p. ej.learning / in_process).
        estado_operacional: cache?.effective_status || null,
        // Leads atribuidos a ESTA campaña (evidencia real de meta_ads_referidos). No se suman
        // los leads comerciales: esos no tienen campaña demostrable.
        leads_atribuidos: referred.por_campana[cid] || 0,
        metrics: {
          spend: 0,
          impressions: 0,
          clicks: 0,
          ctr: 0,
          cpc: 0,
          cpm: 0,
          conversations: 0,
          leads: 0,
          costPerConversation: null,
          costPerLead: null,
          attributionStatus: 'estimated',
        },
      };
    }
    // Métricas con los nombres reales de la tabla local (en español).
    const sp = Number(r.gasto) || 0;
    const im = Number(r.impresiones) || 0;
    const cl = Number(r.clics) || 0;
    const co = Number(r.conversaciones) || 0;
    const le = Number(r.leads) || 0;

    porCampana[cid].metrics.spend += sp;
    porCampana[cid].metrics.impressions += im;
    porCampana[cid].metrics.clicks += cl;
    porCampana[cid].metrics.conversations += co;
    porCampana[cid].metrics.leads += le;

    gastoTotal += sp;
    impTotal += im;
    clicksTotal += cl;
    convTotal += co;
    leadsTotal += le;
  }

  // Recalcular métricas de cada campaña (misma fórmula que calculateAdsMetrics del backend)
  const campanas = Object.values(porCampana).map(c => {
    const m = c.metrics;
    m.ctr = m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0;
    m.cpc = m.clicks > 0 ? m.spend / m.clicks : 0;
    m.cpm = m.impressions > 0 ? (m.spend / m.impressions) * 1000 : 0;
    m.costPerConversation = m.conversations > 0 ? m.spend / m.conversations : null;
    m.costPerLead = m.leads > 0 ? m.spend / m.leads : null;
    m.conversationRate = m.clicks > 0 ? (m.conversations / m.clicks) * 100 : null;
    m.conversionRate = m.leads > 0 && m.conversations > 0 ? (m.leads / m.conversations) * 100 : null;
    // Costo por lead atribuido: solo si hay referidos con campaña demostrable.
    m.costPerLeadAtribuido = c.leads_atribuidos > 0 ? m.spend / c.leads_atribuidos : null;
    return c;
  });

  // Conjuntos y anuncios: estado actual desde la caché de Meta (sin métricas: no se inventan).
  const conjuntos = entidades
    .filter(e => e.entity_type === 'adset')
    .map(e => ({
      id: e.entity_id,
      name: e.name || 'Conjunto sin nombre',
      campaign_id: e.parent_id,
      status: e.status || null,
      daily_budget: e.daily_budget != null ? Number(e.daily_budget) : undefined,
      lifetime_budget: e.lifetime_budget != null ? Number(e.lifetime_budget) : undefined,
      synced_at: e.synced_at,
    }));
  const anuncios = entidades
    .filter(e => e.entity_type === 'ad')
    .map(e => ({
      id: e.entity_id,
      name: e.name || 'Anuncio sin nombre',
      adset_id: e.parent_id,
      status: e.status || null,
      creative_name: e.creative_name || null,
      synced_at: e.synced_at,
    }));
  const ultimaSync = entidades.reduce((max, e) => (e.synced_at && e.synced_at > max ? e.synced_at : max), '');

  // Avisos de negocio: lo que la fuente no tiene se informa, nunca se rellena con inventos.
  // Estado de la sincronización con Meta (bitácora real, no suposiciones).
  const intentos = syncRes.data || [];
  const ultimoIntento = intentos[0] || null;
  const ultimaOk = intentos.find(i => i.ok) || null;
  const sincronizacion = {
    estado: ultimoIntento ? (ultimoIntento.ok ? 'sincronizado' : 'fallida') : 'nunca',
    ultima_ok: ultimaOk?.terminado_en || ultimaOk?.iniciado_en || null,
    ultimo_intento: ultimoIntento?.iniciado_en || null,
    campanas: ultimaOk?.campanas ?? null,
    conjuntos: ultimaOk?.conjuntos ?? null,
    anuncios: ultimaOk?.anuncios ?? null,
    account_id: ultimaOk?.account_id || null,
    error_ultimo: ultimoIntento && !ultimoIntento.ok
      ? (Array.isArray(ultimoIntento.errores) && ultimoIntento.errores.length
        ? ultimoIntento.errores[0].mensaje
        : 'Error desconocido de la Graph API')
      : null,
  };
  const conEstado = campanas.some(c => c.status);
  if (sincronizacion.estado === 'nunca') {
    advertencias.push('Estado y presupuesto sin sincronizar: todavía no se ha sincronizado con Meta Ads.');
  } else if (sincronizacion.estado === 'fallida') {
    advertencias.push(
      `No se pudo sincronizar Meta Ads. Última sincronización disponible: ${sincronizacion.ultima_ok ? sincronizacion.ultima_ok.slice(0, 16).replace('T', ' ') : 'nunca'}.`
    );
  }
  if (referred.sin_campana > 0 && referred.total === 0) {
    advertencias.push('Hay referidos de Meta Ads pero no se puede determinar a qué campaña pertenecen.');
  }

  const pagos = pagosRes.data || [];
  const totalCobrado = pagos.reduce((acc, p) => acc + Number(p.amount || 0), 0);
  const leadsOk = !leadsRes.error;
  const leadsComerciales = leadsOk ? leadsRes.data || [] : [];
  const clientesQuePagaron = new Set(pagos.map(p => p.client_id).filter(Boolean)).size;
  // Un lead comercial NO cuenta como lead de Meta: solo los referidos con campaña real.
  const declaradosMeta = leadsComerciales.filter(l => FUENTES_META_LEAD.test(String(l.lead_source || ''))).length;
  const atribucionEstado =
    referred.total > 0 || declaradosMeta > 0
      ? 'confirmada'
      : leadsOk && leadsComerciales.length + pagos.length > 0
        ? 'estimada'
        : 'no_disponible';

  return {
    ok: true,
    periodo,
    origen: 'supabase_directo',
    advertencias,
    campanas,
    conjuntos,
    anuncios,
    sincronizacion,
    // Fuentes visibles en la interfaz (requisito: el usuario ve de dónde sale cada número).
    fuentes: {
      metricas_historicas: 'Meta Ads · Supabase (meta_ads_insights)',
      estado_presupuesto: ultimaSync
        ? `Meta Ads (sincronizado ${ultimaSync.slice(0, 10)})`
        : 'Meta Ads (sin sincronizar)',
      leads_atribuidos: referred.disponible ? 'Meta Ads + CRM (meta_ads_referidos)' : 'Meta Ads + CRM (sin datos)',
      leads_comerciales: 'CRM (comercial_leads)',
      pagos: 'Cobros (payments)',
      analisis_ia: 'Asistente (Edge Function)',
    },
    analisis: {
      estado: campanas.length > 0 ? 'analizado' : 'sin_datos',
      sin_datos: rows.length === 0,
      periodo,
      metricas_globales: {
        gasto_total: Math.round(gastoTotal * 100) / 100,
        conversaciones_totales: convTotal,
        costo_promedio_conversacion: convTotal > 0 ? Math.round((gastoTotal / convTotal) * 100) / 100 : null,
        campanas_activas: conEstado ? campanas.filter(c => c.status === 'ACTIVE').length : null,
        clics_totales: clicksTotal,
        impresiones_totales: impTotal,
        leads_totales: leadsTotal,
        leads_atribuidos_meta: referred.total,
      },
      hallazgos: [],
      recomendaciones: [],
    },
    atribucion: {
      periodo,
      // Categorías explícitas: los leads comerciales NO se presentan como leads de Meta Ads.
      leads: {
        comerciales: leadsOk ? leadsComerciales.length : null,
        atribuidos_meta: referred.total,
        declarados_origen_meta: declaradosMeta,
        no_atribuidos: leadsOk ? Math.max(0, leadsComerciales.length - declaradosMeta) : null,
      },
      leads_analizados: leadsOk ? leadsComerciales.length : null,
      leads_atribuidos_por_campana: referred.por_campana,
      referidos_sin_campana: referred.sin_campana,
      referidos_sin_fecha: referred.sin_fecha,
      leads_en_propuesta_o_pago: leadsOk
        ? leadsComerciales.filter(l => /propuesta|pago/i.test(String(l.etapa_nombre || ''))).length
        : null,
      clientes_que_pagaron: clientesQuePagaron,
      ingresos_totales_registrados: pagos.length ? Math.round(totalCobrado * 100) / 100 : null,
      inversion_periodo: Math.round(gastoTotal * 100) / 100,
      roas_global_estimado: gastoTotal > 0 ? Math.round((totalCobrado / gastoTotal) * 100) / 100 : null,
      costo_por_lead_global: referred.total > 0 ? Math.round((gastoTotal / referred.total) * 100) / 100 : null,
      costo_por_cliente_global: clientesQuePagaron > 0 ? Math.round((gastoTotal / clientesQuePagaron) * 100) / 100 : null,
      atribucion_estado: atribucionEstado,
      nota:
        'Los leads atribuidos por campaña salen de meta_ads_referidos (payload de Meta) y solo se asignan a una campaña cuando hay evidencia. Los leads comerciales sin campaña demostrable quedan como "no atribuidos"; el ROAS es global, no por campaña.',
    },
    // Límites de seguridad: los valores por defecto del código. La configuración por organización
    // vive en organization_settings y la lee la Edge Function (`accion: 'ads_data'`).
    limites: {
      maxDailyBudgetChange: 150,
      maxBudgetIncreasePercent: 50,
      maxCampaignCreationBudget: 250,
      maxTotalDailySpend: 1500,
      origen: 'local_por_defecto',
    },
  };
}

/**
 * Sincroniza estado, presupuestos, conjuntos y anuncios desde la Meta Graph API.
 * Única acción del panel que llama a la Edge Function para Meta Ads: las credenciales viven
 * en los secretos de Supabase y nunca chegam al navegador.
 */
export async function sincronizarMetaAds() {
  const res = await invoke({ accion: 'ads_sync' });
  if (!res?.ok) {
    const err = new Error(res?.error || res?.sync?.motivo || 'No se pudo sincronizar Meta Ads.');
    err.sync = res?.sync || null;
    throw err;
  }
  return res;
}

export async function compareAdsPeriods(actualRange, previoRange) {
  return invoke({ accion: 'ads_compare', actual: actualRange, previo: previoRange });
}

// Historial: RLS deja ver solo las conversaciones propias.
export async function listConversations() {
  const { data, error } = await supabase
    .from('ai_conversations')
    .select('id, title, client_id, updated_at')
    .order('updated_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return data || [];
}

export async function loadConversation(conversationId) {
  const [{ data: msgs, error: e1 }, { data: props, error: e2 }] = await Promise.all([
    supabase.from('ai_messages').select('id, role, content, proposal_ids, created_at').eq('ai_conversation_id', conversationId).order('created_at'),
    supabase.from('ai_proposals').select('id, tipo, payload, resumen, status, result, created_at').eq('ai_conversation_id', conversationId),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const byId = Object.fromEntries((props || []).map(p => [p.id, p]));
  return (msgs || []).map(m => ({
    id: m.id,
    role: m.role,
    content: m.content,
    propuestas: (m.proposal_ids || []).map(id => byId[id]).filter(Boolean),
  }));
}

// ── Motor Científico V4: Experimentos y Aprendizajes (Lectura directa de Supabase) ──

export async function getCampaignExperiments(limit = 20) {
  const { data, error } = await supabase
    .from('campaign_experiments')
    .select(`
      id, name, service, status, hypothesis, objective, primary_metric, secondary_metrics, budget,
      start_date, end_date, control_description, treatment_description, created_at,
      campaign_variants(id, variant_name, hook, copy, cta, campaign_id, adset_id, ad_id),
      campaign_hypotheses(id, hypothesis, result, confidence, decision),
      campaign_measurements(id, date, spend, impressions, clicks, ctr, cpc, conversations, cost_per_lead, roas)
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[Campaign Experiments] Error:', error.message);
    return [];
  }
  return data || [];
}

export async function getCampaignLearnings(service) {
  let q = supabase
    .from('campaign_learnings')
    .select('*')
    .order('confidence', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(30);

  if (service) {
    q = q.ilike('service', `%${service}%`);
  }

  const { data, error } = await q;
  if (error) {
    console.error('[Campaign Learnings] Error:', error.message);
    return [];
  }
  return data || [];
}

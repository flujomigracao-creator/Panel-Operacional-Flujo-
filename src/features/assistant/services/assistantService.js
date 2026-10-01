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

// ── Servicios del Centro de Inteligencia y Meta Ads ──

// Mismo criterio de período que el backend (supabase/functions/asistente/ads.ts):
// el fallback local no debe mostrar totales históricos cuando el panel pide 7 días.
function rangoAFechas(rango) {
  const pedido = typeof rango === 'string' ? rango : rango?.periodo || '7d';
  if (pedido === 'all' || pedido === 'todo') return { etiqueta: 'Todo el histórico' };
  const dias = pedido === '30d' ? 30 : pedido === '14d' ? 14 : 7;
  const hoy = new Date();
  const desde = new Date(hoy);
  desde.setDate(desde.getDate() - (dias - 1));
  const iso = (d) => d.toISOString().slice(0, 10);
  return { desde: iso(desde), hasta: iso(hoy), etiqueta: `Últimos ${dias} días` };
}

export async function getAdsData(rango) {
  try {
    const res = await invoke({ accion: 'ads_data', rango });
    if (res?.ok) return res;
  } catch (err) {
    console.warn('Error consultando ads_data vía edge function:', err.message);
  }

  // Fallback directo a Supabase si la edge function aún no está desplegada en local/remoto.
  const periodo = rangoAFechas(rango);
  const noDisponible = (tabla) => ({ data: [], error: { message: `${tabla} no disponible` } });

  let qInsights = supabase.from('meta_ads_insights').select('*').order('date', { ascending: false });
  if (periodo.desde) qInsights = qInsights.gte('date', periodo.desde);
  if (periodo.hasta) qInsights = qInsights.lte('date', periodo.hasta);

  let qLeads = supabase
    .from('comercial_leads')
    .select('id, nombre, tramite_texto, precio, etapa_nombre, client_id, updated_at')
    .order('updated_at', { ascending: false })
    .limit(500);
  if (periodo.desde) qLeads = qLeads.gte('updated_at', `${periodo.desde}T00:00:00`);
  if (periodo.hasta) qLeads = qLeads.lte('updated_at', `${periodo.hasta}T23:59:59`);

  let qPagos = supabase.from('payments').select('amount, paid_at, status, client_id').eq('status', 'paid');
  if (periodo.desde) qPagos = qPagos.gte('paid_at', `${periodo.desde}T00:00:00`);
  if (periodo.hasta) qPagos = qPagos.lte('paid_at', `${periodo.hasta}T23:59:59`);

  const [insightsRes, leadsRes, pagosRes] = await Promise.all([
    qInsights.catch(() => noDisponible('meta_ads_insights')),
    qLeads.catch(() => noDisponible('comercial_leads')),
    qPagos.catch(() => noDisponible('payments')),
  ]);

  const rows = insightsRes.data || [];
  const porCampana = {};
  let gastoTotal = 0;
  let convTotal = 0;
  let clicksTotal = 0;
  let impTotal = 0;
  let leadsTotal = 0;

  for (const r of rows) {
    const cid = r.campaign_id || r.campaign_name || 'default';
    if (!porCampana[cid]) {
      porCampana[cid] = {
        id: cid,
        name: r.campaign_name || 'Campaña General',
        status: r.status || 'ACTIVE',
        daily_budget: r.daily_budget ? Number(r.daily_budget) : undefined,
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
    const sp = Number(r.spend) || 0;
    const im = Number(r.impressions) || 0;
    const cl = Number(r.clicks) || 0;
    const co = Number(r.conversations || r.messaging_conversations) || 0;
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
    return c;
  });

  const pagos = pagosRes.data || [];
  const totalCobrado = pagos.reduce((acc, p) => acc + Number(p.amount || 0), 0);
  const leadsOk = !leadsRes.error;
  const clientesQuePagaron = new Set(pagos.map(p => p.client_id).filter(Boolean)).size;
  const atribucionEstado = leadsOk && (leadsRes.data || []).length + pagos.length > 0 ? 'estimada' : 'no_disponible';

  return {
    ok: true,
    periodo,
    campanas,
    analisis: {
      estado: campanas.length > 0 ? 'analizado' : 'sin_datos',
      periodo,
      metricas_globales: {
        gasto_total: Math.round(gastoTotal * 100) / 100,
        conversaciones_totales: convTotal,
        costo_promedio_conversacion: convTotal > 0 ? Math.round((gastoTotal / convTotal) * 100) / 100 : null,
        campanas_activas: campanas.filter(c => c.status === 'ACTIVE').length,
        clics_totales: clicksTotal,
        impresiones_totales: impTotal,
        leads_totales: leadsTotal,
      },
      hallazgos: [],
      recomendaciones: [],
    },
    atribucion: {
      periodo,
      leads_analizados: leadsOk ? (leadsRes.data || []).length : null,
      leads_en_propuesta_o_pago: leadsOk
        ? (leadsRes.data || []).filter(l => /propuesta|pago/i.test(String(l.etapa_nombre || ''))).length
        : null,
      clientes_que_pagaron: clientesQuePagaron,
      ingresos_totales_registrados: pagos.length ? Math.round(totalCobrado * 100) / 100 : null,
      inversion_periodo: Math.round(gastoTotal * 100) / 100,
      roas_global_estimado: gastoTotal > 0 ? Math.round((totalCobrado / gastoTotal) * 100) / 100 : null,
      costo_por_cliente_global: clientesQuePagaron > 0 ? Math.round((gastoTotal / clientesQuePagaron) * 100) / 100 : null,
      atribucion_estado: atribucionEstado,
      nota: 'Fallback local: no hay evidencia de atribución por anuncio. Los cruces son correlación del período.',
    },
    // Ejecutado sin la Edge Function: estos son los valores por defecto del código, no los de la BD.
    limites: {
      maxDailyBudgetChange: 150,
      maxBudgetIncreasePercent: 50,
      maxCampaignCreationBudget: 250,
      maxTotalDailySpend: 1500,
      origen: 'local_por_defecto',
    },
  };
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

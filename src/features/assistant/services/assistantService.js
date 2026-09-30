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

export async function getAdsData(rango) {
  try {
    const res = await invoke({ accion: 'ads_data', rango });
    if (res?.ok) return res;
  } catch (err) {
    console.warn('Error consultando ads_data vía edge function:', err.message);
  }

  // Fallback directo a Supabase si la edge function aún no está desplegada en local/remoto
  const [insightsRes, leadsRes, pagosRes] = await Promise.all([
    supabase.from('meta_ads_insights').select('*').order('date', { ascending: false }).catch(() => ({ data: [] })),
    supabase.from('comercial_leads').select('id, nombre, tramite_texto, precio, etapa_nombre, client_id, updated_at').order('updated_at', { ascending: false }).limit(50).catch(() => ({ data: [] })),
    supabase.from('payments').select('amount, paid_at, status').eq('status', 'paid').catch(() => ({ data: [] })),
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

  // Recalcular métricas de cada campaña
  const campanas = Object.values(porCampana).map(c => {
    const m = c.metrics;
    m.ctr = m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0;
    m.cpc = m.clicks > 0 ? m.spend / m.clicks : 0;
    m.cpm = m.impressions > 0 ? (m.spend / m.impressions) * 1000 : 0;
    m.costPerConversation = m.conversations > 0 ? m.spend / m.conversations : null;
    m.costPerLead = m.leads > 0 ? m.spend / m.leads : null;
    return c;
  });

  const totalCobrado = (pagosRes.data || []).reduce((acc, p) => acc + Number(p.amount || 0), 0);

  return {
    ok: true,
    campanas,
    analisis: {
      estado: campanas.length > 0 ? 'analizado' : 'sin_datos',
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
      leads_analizados: (leadsRes.data || []).length,
      ingresos_totales_registrados: Math.round(totalCobrado * 100) / 100,
      atribucion_estado: 'estimada',
    },
    limites: {
      maxDailyBudgetChange: 150,
      maxBudgetIncreasePercent: 50,
      maxCampaignCreationBudget: 250,
      maxTotalDailySpend: 1500,
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

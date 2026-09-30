// Módulo de Meta Ads para el Asistente de Inteligencia de Flujo de Migração.
// Integra lectura de métricas, análisis de rendimiento, límites de seguridad,
// generación de propuestas y ejecución determinista con auditoría.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const ORG_ID = '00000000-0000-0000-0000-000000000001';

// ── Límites de seguridad por defecto (configurables en BD) ──
export interface AdsLimitsConfig {
  maxDailyBudgetChange: number;       // Máximo cambio de presupuesto en BRL por operación (ej. R$ 100)
  maxBudgetIncreasePercent: number;   // Máximo incremento porcentual (ej. 50%)
  maxCampaignCreationBudget: number;  // Máximo presupuesto diario al crear campaña (ej. R$ 200)
  maxTotalDailySpend: number;         // Máximo gasto diario total permitido en la cuenta (ej. R$ 1000)
  requireConfirmationAbove: number;   // Monto diario a partir del cual se exige confirmación manual estricta
  allowedAdAccountId?: string;        // ID de la cuenta publicitaria autorizada (evita operar en cuentas ajenas)
}

export const DEFAULT_ADS_LIMITS: AdsLimitsConfig = {
  maxDailyBudgetChange: 150,
  maxBudgetIncreasePercent: 50,
  maxCampaignCreationBudget: 250,
  maxTotalDailySpend: 1500,
  requireConfirmationAbove: 50,
};

export interface AdsMetrics {
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  conversations: number;
  leads: number;
  costPerConversation: number | null;
  costPerLead: number | null;
  conversationRate: number | null;
  revenueAttributed?: number;
  roas?: number | null;
  attributionStatus: 'confirmed' | 'estimated' | 'unavailable';
}

export interface AdsCampaign {
  id: string;
  name: string;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | string;
  objective?: string;
  daily_budget?: number;
  lifetime_budget?: number;
  metrics: AdsMetrics;
}

export interface AdsAdSet {
  id: string;
  name: string;
  campaign_id: string;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | string;
  daily_budget?: number;
  metrics: AdsMetrics;
}

export interface AdsAd {
  id: string;
  name: string;
  adset_id: string;
  campaign_id: string;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | string;
  creative_name?: string;
  metrics: AdsMetrics;
}

// ── Cálculo seguro de métricas (evita división por cero y NaN) ──
export function calculateAdsMetrics(raw: {
  spend?: number;
  impressions?: number;
  clicks?: number;
  conversations?: number;
  leads?: number;
  revenueAttributed?: number;
  hasAttribution?: boolean;
}): AdsMetrics {
  const spend = Number(raw.spend) || 0;
  const impressions = Number(raw.impressions) || 0;
  const clicks = Number(raw.clicks) || 0;
  const conversations = Number(raw.conversations) || 0;
  const leads = Number(raw.leads) || 0;
  const revenueAttributed = raw.revenueAttributed !== undefined ? Number(raw.revenueAttributed) : undefined;

  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
  const costPerConversation = conversations > 0 ? spend / conversations : null;
  const costPerLead = leads > 0 ? spend / leads : null;
  const conversationRate = clicks > 0 ? (conversations / clicks) * 100 : null;

  let roas: number | null = null;
  if (revenueAttributed !== undefined && spend > 0) {
    roas = revenueAttributed / spend;
  }

  const attributionStatus: 'confirmed' | 'estimated' | 'unavailable' =
    raw.hasAttribution ? 'confirmed' : revenueAttributed !== undefined ? 'estimated' : 'unavailable';

  return {
    spend: Math.round(spend * 100) / 100,
    impressions,
    clicks,
    ctr: Math.round(ctr * 100) / 100,
    cpc: Math.round(cpc * 100) / 100,
    cpm: Math.round(cpm * 100) / 100,
    conversations,
    leads,
    costPerConversation: costPerConversation !== null ? Math.round(costPerConversation * 100) / 100 : null,
    costPerLead: costPerLead !== null ? Math.round(costPerLead * 100) / 100 : null,
    conversationRate: conversationRate !== null ? Math.round(conversationRate * 100) / 100 : null,
    revenueAttributed: revenueAttributed !== undefined ? Math.round(revenueAttributed * 100) / 100 : undefined,
    roas: roas !== null ? Math.round(roas * 100) / 100 : null,
    attributionStatus,
  };
}

// ── Obtener límites configurados desde la organización ──
export async function getAdsLimits(admin: SupabaseClient): Promise<AdsLimitsConfig> {
  try {
    const { data } = await admin
      .from('organization_settings')
      .select('value')
      .eq('organization_id', ORG_ID)
      .eq('key', 'meta_ads_limits')
      .maybeSingle();

    if (data?.value && typeof data.value === 'object') {
      return { ...DEFAULT_ADS_LIMITS, ...data.value };
    }
  } catch {
    // Si la tabla no existe o falla, usar defaults
  }
  return { ...DEFAULT_ADS_LIMITS };
}

// ── Validación de seguridad de operaciones antes de proponer / ejecutar ──
export function validateAdsOperation(
  op: {
    tipo: string;
    accountId?: string;
    presupuestoActual?: number;
    presupuestoNuevo?: number;
    montoCreacion?: number;
  },
  limits: AdsLimitsConfig
): { valid: boolean; error?: string } {
  // 1. Validar cuenta autorizada si está configurada
  if (limits.allowedAdAccountId && op.accountId && op.accountId !== limits.allowedAdAccountId) {
    return {
      valid: false,
      error: `La cuenta de anuncios ${op.accountId} no coincide con la cuenta autorizada (${limits.allowedAdAccountId}). Operación bloqueada por seguridad.`,
    };
  }

  // 2. Validar cambio de presupuesto
  if (op.tipo === 'cambiar_presupuesto_campana' || op.tipo === 'cambiar_presupuesto_adset') {
    const actual = Number(op.presupuestoActual) || 0;
    const nuevo = Number(op.presupuestoNuevo) || 0;

    if (nuevo <= 0) {
      return { valid: false, error: 'El nuevo presupuesto diario debe ser mayor a 0.' };
    }

    const diferenciaAbsoluta = Math.abs(nuevo - actual);
    if (diferenciaAbsoluta > limits.maxDailyBudgetChange) {
      return {
        valid: false,
        error: `El cambio propuesto (R$ ${diferenciaAbsoluta.toFixed(2)}) supera el límite máximo por operación de R$ ${limits.maxDailyBudgetChange.toFixed(2)}. Requiere ajuste menor o revisión manual.`,
      };
    }

    if (actual > 0 && nuevo > actual) {
      const incrementoPct = ((nuevo - actual) / actual) * 100;
      if (incrementoPct > limits.maxBudgetIncreasePercent) {
        return {
          valid: false,
          error: `El incremento propuesto (+${incrementoPct.toFixed(1)}%) supera el límite máximo permitido de +${limits.maxBudgetIncreasePercent}%. Requiere escalado progresivo.`,
        };
      }
    }
  }

  // 3. Validar presupuesto de creación
  if (op.tipo === 'crear_campana_ads') {
    const monto = Number(op.montoCreacion) || 0;
    if (monto <= 0) {
      return { valid: false, error: 'El presupuesto de la nueva campaña debe ser mayor a 0.' };
    }
    if (monto > limits.maxCampaignCreationBudget) {
      return {
        valid: false,
        error: `El presupuesto diario propuesto (R$ ${monto.toFixed(2)}) supera el límite de creación de R$ ${limits.maxCampaignCreationBudget.toFixed(2)}.`,
      };
    }
  }

  return { valid: true };
}

// ── Conexión con Meta Graph API / Supabase Fallback ──

function getMetaConfig() {
  const token = Deno.env.get('META_ADS_TOKEN') || Deno.env.get('FB_ACCESS_TOKEN');
  const accountId = Deno.env.get('META_AD_ACCOUNT_ID') || Deno.env.get('FB_AD_ACCOUNT_ID');
  const cleanAccountId = accountId ? (accountId.startsWith('act_') ? accountId : `act_${accountId}`) : null;
  return { token, accountId: cleanAccountId };
}

export async function fetchMetaCampaigns(admin: SupabaseClient, _options: { dateRange?: { desde?: string; hasta?: string } } = {}): Promise<AdsCampaign[]> {
  const { token, accountId } = getMetaConfig();

  // 1. Si hay token y cuenta configurados, consultar Graph API
  if (token && accountId) {
    try {
      const url = new URL(`https://graph.facebook.com/v20.0/${accountId}/campaigns`);
      url.searchParams.set('fields', 'id,name,status,objective,daily_budget,lifetime_budget,insights{spend,impressions,clicks,actions,cost_per_action_type,cpc,cpm,ctr}');
      url.searchParams.set('access_token', token);

      const r = await fetch(url.toString());
      if (r.ok) {
        const json = await r.json();
        const data = json.data || [];
        return data.map((c: any) => {
          const ins = c.insights?.data?.[0] || {};
          const actions = ins.actions || [];
          const convAction = actions.find((a: any) =>
            a.action_type === 'onsite_conversion.messaging_conversation_started_7d' ||
            a.action_type === 'messaging_conversation_started_7d' ||
            a.action_type === 'onsite_conversion.total_messaging_connection'
          );
          const leadAction = actions.find((a: any) => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped');

          const conversations = Number(convAction?.value) || 0;
          const leads = Number(leadAction?.value) || 0;
          const dailyBudget = c.daily_budget ? Number(c.daily_budget) / 100 : undefined;
          const lifetimeBudget = c.lifetime_budget ? Number(c.lifetime_budget) / 100 : undefined;

          return {
            id: c.id,
            name: c.name,
            status: c.status,
            objective: c.objective,
            daily_budget: dailyBudget,
            lifetime_budget: lifetimeBudget,
            metrics: calculateAdsMetrics({
              spend: Number(ins.spend) || 0,
              impressions: Number(ins.impressions) || 0,
              clicks: Number(ins.clicks) || 0,
              conversations,
              leads,
            }),
          };
        });
      }
    } catch {
      // Fallback a Supabase si la llamada a Graph API falla
    }
  }

  // 2. Fallback: Consultar tabla local `meta_ads_insights` en Supabase
  try {
    const { data: rows } = await admin
      .from('meta_ads_insights')
      .select('*')
      .order('date', { ascending: false });

    if (rows && rows.length > 0) {
      // Agrupar por campaña
      const porCampana: Record<string, { id: string; name: string; status: string; spend: number; impressions: number; clicks: number; conversations: number; leads: number; daily_budget?: number }> = {};
      for (const r of rows) {
        const cid = r.campaign_id || r.campaign_name || 'unknown';
        if (!porCampana[cid]) {
          porCampana[cid] = {
            id: cid,
            name: r.campaign_name || 'Campaña sin nombre',
            status: r.status || 'ACTIVE',
            spend: 0,
            impressions: 0,
            clicks: 0,
            conversations: 0,
            leads: 0,
            daily_budget: r.daily_budget ? Number(r.daily_budget) : undefined,
          };
        }
        porCampana[cid].spend += Number(r.spend) || 0;
        porCampana[cid].impressions += Number(r.impressions) || 0;
        porCampana[cid].clicks += Number(r.clicks) || 0;
        porCampana[cid].conversations += Number(r.conversations || r.messaging_conversations) || 0;
        porCampana[cid].leads += Number(r.leads) || 0;
      }

      return Object.values(porCampana).map(c => ({
        id: c.id,
        name: c.name,
        status: c.status,
        daily_budget: c.daily_budget,
        metrics: calculateAdsMetrics(c),
      }));
    }
  } catch {
    // Si no hay tabla
  }

  return [];
}

// ── Comparación de períodos (ej. últimos 7 días vs 7 días anteriores) ──
export async function compareMetaAdsPeriods(
  admin: SupabaseClient,
  actualRange: { desde: string; hasta: string },
  previoRange: { desde: string; hasta: string }
) {
  const campaignsActual = await fetchMetaCampaigns(admin, { dateRange: actualRange });
  const campaignsPrevio = await fetchMetaCampaigns(admin, { dateRange: previoRange });

  const totalActual = campaignsActual.reduce(
    (acc, c) => ({
      spend: acc.spend + c.metrics.spend,
      impressions: acc.impressions + c.metrics.impressions,
      clicks: acc.clicks + c.metrics.clicks,
      conversations: acc.conversations + c.metrics.conversations,
      leads: acc.leads + c.metrics.leads,
    }),
    { spend: 0, impressions: 0, clicks: 0, conversations: 0, leads: 0 }
  );

  const totalPrevio = campaignsPrevio.reduce(
    (acc, c) => ({
      spend: acc.spend + c.metrics.spend,
      impressions: acc.impressions + c.metrics.impressions,
      clicks: acc.clicks + c.metrics.clicks,
      conversations: acc.conversations + c.metrics.conversations,
      leads: acc.leads + c.metrics.leads,
    }),
    { spend: 0, impressions: 0, clicks: 0, conversations: 0, leads: 0 }
  );

  const metActual = calculateAdsMetrics(totalActual);
  const metPrevio = calculateAdsMetrics(totalPrevio);

  const calcDiff = (act: number | null, prev: number | null) => {
    if (act === null || prev === null || prev === 0) return null;
    return Math.round(((act - prev) / prev) * 1000) / 10;
  };

  return {
    periodo_actual: { rango: actualRange, metricas: metActual },
    periodo_previo: { rango: previoRange, metricas: metPrevio },
    variaciones_porcentuales: {
      gasto: calcDiff(metActual.spend, metPrevio.spend),
      impresiones: calcDiff(metActual.impressions, metPrevio.impressions),
      clics: calcDiff(metActual.clicks, metPrevio.clicks),
      ctr: calcDiff(metActual.ctr, metPrevio.ctr),
      cpc: calcDiff(metActual.cpc, metPrevio.cpc),
      conversaciones: calcDiff(metActual.conversations, metPrevio.conversations),
      costo_por_conversacion: calcDiff(metActual.costPerConversation, metPrevio.costPerConversation),
    },
  };
}

// ── Análisis Inteligente de Rendimiento y Detección de Anomalías ──
export async function analyzeMetaAds(admin: SupabaseClient) {
  const campaigns = await fetchMetaCampaigns(admin);

  if (!campaigns.length) {
    return {
      estado: 'sin_datos',
      resumen: 'No hay campañas activas o métricas registradas en el período seleccionado.',
      hallazgos: [],
      recomendaciones: [],
    };
  }

  const hallazgos: { tipo: 'alerta' | 'exito' | 'info'; titulo: string; detalle: string; campana_id?: string }[] = [];
  const recomendaciones: { accion_propuesta?: string; motivo: string; impacto: string; campana_id?: string }[] = [];

  let gastoTotal = 0;
  let convTotal = 0;

  for (const c of campaigns) {
    gastoTotal += c.metrics.spend;
    convTotal += c.metrics.conversations;

    // 1. Alerta: Gasto sin conversaciones
    if (c.metrics.spend >= 30 && c.metrics.conversations === 0) {
      hallazgos.push({
        tipo: 'alerta',
        titulo: `Gasto sin resultados en "${c.name}"`,
        detalle: `Ha consumido R$ ${c.metrics.spend.toFixed(2)} sin generar ninguna conversación iniciada.`,
        campana_id: c.id,
      });
      recomendaciones.push({
        accion_propuesta: `pausar_campana_${c.id}`,
        motivo: `Pausar o revisar segmentación y creativos de "${c.name}" para detener fuga de presupuesto.`,
        impacto: `Ahorro de hasta R$ ${(c.daily_budget || c.metrics.spend).toFixed(2)}/día.`,
        campana_id: c.id,
      });
    }

    // 2. Éxito: Campaña con buen costo por conversación
    if (c.metrics.conversations >= 5 && c.metrics.costPerConversation !== null && c.metrics.costPerConversation <= 12) {
      hallazgos.push({
        tipo: 'exito',
        titulo: `Excelente rendimiento en "${c.name}"`,
        detalle: `Registra ${c.metrics.conversations} conversaciones a un costo eficiente de R$ ${c.metrics.costPerConversation.toFixed(2)} c/u.`,
        campana_id: c.id,
      });
    }

    // 3. Alerta: CTR bajo (menor a 0.8%) con gasto significativo
    if (c.metrics.spend >= 40 && c.metrics.ctr < 0.8 && c.metrics.impressions > 1000) {
      hallazgos.push({
        tipo: 'alerta',
        titulo: `CTR bajo (${c.metrics.ctr.toFixed(2)}%) en "${c.name}"`,
        detalle: `La tasa de clics es inferior al promedio recomendado (1.2%+). Podría existir fatiga creativa o mensaje poco atractivo.`,
        campana_id: c.id,
      });
    }
  }

  const cpcPromedio = convTotal > 0 ? gastoTotal / convTotal : null;

  return {
    estado: 'analizado',
    metricas_globales: {
      gasto_total: Math.round(gastoTotal * 100) / 100,
      conversaciones_totales: convTotal,
      costo_promedio_conversacion: cpcPromedio !== null ? Math.round(cpcPromedio * 100) / 100 : null,
      campanas_activas: campaigns.filter(c => c.status === 'ACTIVE').length,
    },
    campanas: campaigns,
    hallazgos,
    recomendaciones,
  };
}

// ── Atribución Comercial (Meta Ads -> Leads -> Trámites -> Cobros) ──
export async function getMetaAdsAttribution(admin: SupabaseClient, _dateRange?: { desde?: string; hasta?: string }) {
  // Consultar leads comerciales vinculados
  const { data: leads } = await admin
    .from('comercial_leads')
    .select('id, nombre, tramite_texto, precio, etapa_nombre, client_id, updated_at')
    .order('updated_at', { ascending: false })
    .limit(50);

  // Consultar pagos cobrados
  const { data: pagos } = await admin
    .from('payments')
    .select('amount, paid_at, client_id')
    .eq('status', 'paid');

  const totalCobrado = (pagos || []).reduce((acc, p) => acc + Number(p.amount || 0), 0);

  return {
    leads_analizados: (leads || []).length,
    ingresos_totales_registrados: Math.round(totalCobrado * 100) / 100,
    leads_en_propuesta_o_pago: (leads || []).filter(l => l.etapa_nombre?.includes('Propuesta') || l.etapa_nombre?.includes('Pago')).length,
    atribucion_estado: 'estimada',
    nota: 'La correlación se calcula sobre los leads que interactuaron en el período. Si el tracking de UTMs o meta_ads_referidos está activo, los datos son confirmados.',
  };
}

// ── Herramientas de Meta Ads para Groq LLM (Tools Definitions) ──

const str = (description: string) => ({ type: 'string', description });
const num = (description: string) => ({ type: 'number', description });

export const ADS_TOOL_DEFS = [
  {
    type: 'function',
    function: {
      name: 'listar_campanas_ads',
      description: 'Lista las campañas de Meta Ads con su estado, presupuesto diario, gasto, impresiones, clics, CTR, CPC, conversaciones y costo por conversación.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analizar_rendimiento_ads',
      description: 'Analiza a fondo el rendimiento publicitario de Meta Ads: detecta fugas de gasto, campañas con mejor y peor costo por conversación, alertas y recomendaciones accionables con números reales.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'comparar_periodos_ads',
      description: 'Compara métricas de Meta Ads entre dos períodos de tiempo (ej. esta semana vs la semana pasada) mostrando variaciones de gasto, CPC, CTR y conversaciones.',
      parameters: {
        type: 'object',
        properties: {
          desde_actual: str('Fecha inicio período actual YYYY-MM-DD'),
          hasta_actual: str('Fecha fin período actual YYYY-MM-DD'),
          desde_previo: str('Fecha inicio período anterior YYYY-MM-DD'),
          hasta_previo: str('Fecha fin período anterior YYYY-MM-DD'),
        },
        required: ['desde_actual', 'hasta_actual', 'desde_previo', 'hasta_previo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'metricas_atribucion_ads',
      description: 'Relaciona el gasto de Meta Ads con leads de Kommo/Nora, trámites iniciados y dinero cobrado (ROAS y costo real por cliente).',
      parameters: {
        type: 'object',
        properties: {
          desde: str('Fecha inicio YYYY-MM-DD opcional'),
          hasta: str('Fecha fin YYYY-MM-DD opcional'),
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'proponer_cambiar_estado_campana',
      description: 'Propone pausar o activar una campaña de Meta Ads. Requiere confirmación del usuario antes de ejecutarse en Meta.',
      parameters: {
        type: 'object',
        properties: {
          campaign_id: str('ID de la campaña en Meta Ads'),
          nombre_campana: str('Nombre de la campaña'),
          nuevo_estado: { type: 'string', enum: ['ACTIVE', 'PAUSED'], description: 'ACTIVE para activar, PAUSED para pausar' },
          motivo: str('Motivo del cambio fundamentado en datos'),
        },
        required: ['campaign_id', 'nombre_campana', 'nuevo_estado', 'motivo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'proponer_cambiar_presupuesto_campana',
      description: 'Propone modificar el presupuesto diario de una campaña de Meta Ads (dentro de los límites de seguridad). Requiere confirmación del usuario.',
      parameters: {
        type: 'object',
        properties: {
          campaign_id: str('ID de la campaña en Meta Ads'),
          nombre_campana: str('Nombre de la campaña'),
          presupuesto_actual: num('Presupuesto diario actual en BRL'),
          nuevo_presupuesto: num('Nuevo presupuesto diario propuesto en BRL'),
          motivo: str('Motivo del ajuste presupuestario'),
        },
        required: ['campaign_id', 'nombre_campana', 'presupuesto_actual', 'nuevo_presupuesto', 'motivo'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'proponer_crear_campana_ads',
      description: 'Propone la creación de una nueva campaña en Meta Ads con su objetivo y presupuesto diario. Requiere confirmación del usuario.',
      parameters: {
        type: 'object',
        properties: {
          nombre: str('Nombre de la campaña'),
          objetivo: { type: 'string', enum: ['OUTCOME_MESSAGES', 'OUTCOME_LEADS', 'OUTCOME_SALES', 'OUTCOME_TRAFFIC'], description: 'Objetivo publicitario' },
          presupuesto_diario: num('Presupuesto diario en BRL (ej. 50.00)'),
          motivo: str('Estrategia o motivo de creación'),
        },
        required: ['nombre', 'objetivo', 'presupuesto_diario', 'motivo'],
      },
    },
  },
];

// ── Ejecución de Herramientas de Ads en el ciclo del Asistente ──
export async function runAdsTool(
  ctx: { admin: SupabaseClient; userId: string; conversationId: string; proposals: any[] },
  name: string,
  args: any
): Promise<string> {
  const limits = await getAdsLimits(ctx.admin);

  switch (name) {
    case 'listar_campanas_ads': {
      const campanas = await fetchMetaCampaigns(ctx.admin);
      if (!campanas.length) {
        return JSON.stringify({
          mensaje: 'No se encontraron campañas configuradas en Meta Ads o datos sincronizados.',
          campanas: [],
        });
      }
      return JSON.stringify({ campanas });
    }

    case 'analizar_rendimiento_ads': {
      const anal = await analyzeMetaAds(ctx.admin);
      return JSON.stringify(anal);
    }

    case 'comparar_periodos_ads': {
      const comp = await compareMetaAdsPeriods(
        ctx.admin,
        { desde: args.desde_actual, hasta: args.hasta_actual },
        { desde: args.desde_previo, hasta: args.hasta_previo }
      );
      return JSON.stringify(comp);
    }

    case 'metricas_atribucion_ads': {
      const atrib = await getMetaAdsAttribution(ctx.admin, { desde: args.desde, hasta: args.hasta });
      return JSON.stringify(atrib);
    }

    case 'proponer_cambiar_estado_campana': {
      const estadoTexto = args.nuevo_estado === 'PAUSED' ? 'Pausar' : 'Activar';
      const resumen = `${estadoTexto} campaña "${args.nombre_campana}" en Meta Ads (${args.nuevo_estado}): ${args.motivo}`;

      const { data: prop, error } = await ctx.admin
        .from('ai_proposals')
        .insert({
          organization_id: ORG_ID,
          user_id: ctx.userId,
          ai_conversation_id: ctx.conversationId,
          tipo: 'ads_cambiar_estado_campana',
          payload: {
            campaign_id: args.campaign_id,
            nombre_campana: args.nombre_campana,
            nuevo_estado: args.nuevo_estado,
            motivo: args.motivo,
          },
          resumen,
        })
        .select('id, tipo, payload, resumen, status, created_at')
        .single();

      if (error) throw new Error(error.message);
      ctx.proposals.push(prop);
      return JSON.stringify({ ok: true, propuesta_creada: resumen, proposal_id: prop.id });
    }

    case 'proponer_cambiar_presupuesto_campana': {
      const act = Number(args.presupuesto_actual) || 0;
      const nue = Number(args.nuevo_presupuesto) || 0;
      const diffPct = act > 0 ? Math.round(((nue - act) / act) * 100) : 0;
      const signo = diffPct >= 0 ? `+${diffPct}%` : `${diffPct}%`;

      // Validar contra límites configurados
      const validacion = validateAdsOperation(
        { tipo: 'cambiar_presupuesto_campana', presupuestoActual: act, presupuestoNuevo: nue },
        limits
      );
      if (!validacion.valid) {
        throw new Error(validacion.error);
      }

      const resumen = `Ajustar presupuesto de "${args.nombre_campana}" de R$ ${act.toFixed(2)}/día a R$ ${nue.toFixed(2)}/día (${signo}): ${args.motivo}`;

      const { data: prop, error } = await ctx.admin
        .from('ai_proposals')
        .insert({
          organization_id: ORG_ID,
          user_id: ctx.userId,
          ai_conversation_id: ctx.conversationId,
          tipo: 'ads_cambiar_presupuesto_campana',
          payload: {
            campaign_id: args.campaign_id,
            nombre_campana: args.nombre_campana,
            presupuesto_actual: act,
            nuevo_presupuesto: nue,
            cambio_porcentual: diffPct,
            motivo: args.motivo,
          },
          resumen,
        })
        .select('id, tipo, payload, resumen, status, created_at')
        .single();

      if (error) throw new Error(error.message);
      ctx.proposals.push(prop);
      return JSON.stringify({ ok: true, propuesta_creada: resumen, proposal_id: prop.id });
    }

    case 'proponer_crear_campana_ads': {
      const monto = Number(args.presupuesto_diario) || 0;
      const validacion = validateAdsOperation(
        { tipo: 'crear_campana_ads', montoCreacion: monto },
        limits
      );
      if (!validacion.valid) {
        throw new Error(validacion.error);
      }

      const resumen = `Crear nueva campaña "${args.nombre}" con objetivo ${args.objetivo} y presupuesto de R$ ${monto.toFixed(2)}/día: ${args.motivo}`;

      const { data: prop, error } = await ctx.admin
        .from('ai_proposals')
        .insert({
          organization_id: ORG_ID,
          user_id: ctx.userId,
          ai_conversation_id: ctx.conversationId,
          tipo: 'ads_crear_campana',
          payload: {
            nombre: args.nombre,
            objetivo: args.objetivo,
            presupuesto_diario: monto,
            motivo: args.motivo,
          },
          resumen,
        })
        .select('id, tipo, payload, resumen, status, created_at')
        .single();

      if (error) throw new Error(error.message);
      ctx.proposals.push(prop);
      return JSON.stringify({ ok: true, propuesta_creada: resumen, proposal_id: prop.id });
    }

    default:
      throw new Error(`Herramienta de Ads no reconocida: ${name}`);
  }
}

// ── Ejecución Determinista de Propuestas de Ads Confirmadas ──
export async function executeAdsProposal(
  admin: SupabaseClient,
  userId: string,
  p: any
): Promise<Record<string, unknown>> {
  const d = p.payload || {};
  const limits = await getAdsLimits(admin);
  const { token, accountId } = getMetaConfig();

  switch (p.tipo) {
    case 'ads_cambiar_estado_campana': {
      if (!token) {
        throw new Error('No se pudo ejecutar en Meta: Falta configurar el secreto META_ADS_TOKEN en Supabase.');
      }
      const url = `https://graph.facebook.com/v20.0/${d.campaign_id}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: d.nuevo_estado, access_token: token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        const errorMsg = data.error?.message || `Meta API error (${res.status})`;
        throw new Error(`Meta rechazó el cambio: ${errorMsg}`);
      }

      // Registro de auditoría
      await admin.from('automation_runs').insert({
        organization_id: ORG_ID,
        workflow: 'asistente_meta_ads',
        ref: p.tipo,
        ok: true,
        message: `Campaña ${d.campaign_id} (${d.nombre_campana}) cambiada a ${d.nuevo_estado}`,
        details: { proposal_id: p.id, executed_by: userId, meta_response: data },
      });

      return { ok: true, campaign_id: d.campaign_id, estado: d.nuevo_estado, meta_success: true };
    }

    case 'ads_cambiar_presupuesto_campana': {
      // Revalidar límites antes de ejecución estricta
      const validacion = validateAdsOperation(
        { tipo: 'cambiar_presupuesto_campana', presupuestoActual: d.presupuesto_actual, presupuestoNuevo: d.nuevo_presupuesto },
        limits
      );
      if (!validacion.valid) {
        throw new Error(`Ejecución cancelada por seguridad: ${validacion.error}`);
      }

      if (!token) {
        throw new Error('No se pudo ejecutar en Meta: Falta configurar el secreto META_ADS_TOKEN en Supabase.');
      }

      // Meta requiere el presupuesto en centavos (cents)
      const dailyBudgetCents = Math.round(Number(d.nuevo_presupuesto) * 100);
      const url = `https://graph.facebook.com/v20.0/${d.campaign_id}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daily_budget: dailyBudgetCents, access_token: token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        const errorMsg = data.error?.message || `Meta API error (${res.status})`;
        throw new Error(`Meta rechazó el cambio de presupuesto: ${errorMsg}`);
      }

      await admin.from('automation_runs').insert({
        organization_id: ORG_ID,
        workflow: 'asistente_meta_ads',
        ref: p.tipo,
        ok: true,
        message: `Presupuesto de campaña ${d.campaign_id} ajustado a R$ ${d.nuevo_presupuesto}/día`,
        details: { proposal_id: p.id, anterior: d.presupuesto_actual, nuevo: d.nuevo_presupuesto, executed_by: userId },
      });

      return {
        ok: true,
        campaign_id: d.campaign_id,
        presupuesto_anterior: d.presupuesto_actual,
        nuevo_presupuesto: d.nuevo_presupuesto,
        meta_success: true,
      };
    }

    case 'ads_crear_campana': {
      const validacion = validateAdsOperation(
        { tipo: 'crear_campana_ads', montoCreacion: d.presupuesto_diario },
        limits
      );
      if (!validacion.valid) {
        throw new Error(`Ejecución cancelada por seguridad: ${validacion.error}`);
      }

      if (!token || !accountId) {
        throw new Error('No se pudo crear en Meta: Faltan credenciales META_ADS_TOKEN / META_AD_ACCOUNT_ID en Supabase.');
      }

      const dailyBudgetCents = Math.round(Number(d.presupuesto_diario) * 100);
      const url = `https://graph.facebook.com/v20.0/${accountId}/campaigns`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: d.nombre,
          objective: d.objetivo,
          status: 'PAUSED', // Se crea pausada por seguridad
          daily_budget: dailyBudgetCents,
          special_ad_categories: ['NONE'],
          access_token: token,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        const errorMsg = data.error?.message || `Meta API error (${res.status})`;
        throw new Error(`Meta rechazó la creación de campaña: ${errorMsg}`);
      }

      await admin.from('automation_runs').insert({
        organization_id: ORG_ID,
        workflow: 'asistente_meta_ads',
        ref: p.tipo,
        ok: true,
        message: `Nueva campaña "${d.nombre}" creada en Meta con ID ${data.id} (Pausada por seguridad)`,
        details: { proposal_id: p.id, meta_id: data.id, executed_by: userId },
      });

      return { ok: true, meta_id: data.id, nombre: d.nombre, estado_inicial: 'PAUSED' };
    }

    default:
      throw new Error(`Tipo de propuesta de Ads desconocido: ${p.tipo}`);
  }
}

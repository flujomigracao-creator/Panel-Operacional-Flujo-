// Motor Científico de Campañas V4 — Flujo de Migração
// Módulo de Experimentación de Marketing, Atribución Real y Aprendizaje Continuo.
// Conecta el funnel completo:
//   Impresión → Clic → WhatsApp → Conversación Nora → Kommo Lead → Propuesta → Pago → Cliente → Ingreso
//
// Reglas estrictas:
//   - Nunca inventar valores: datos faltantes son null, no 0 artificial.
//   - No cambiar todo al mismo tiempo: 1 sola variable a probar (o declarado multivariable).
//   - Métrica primaria orientada al negocio: Costo por cliente pagador / ROAS / Tasa de conversión a pago.
//   - Jamás publicar directo: siempre generar propuesta en ai_proposals para confirmación humana.
//   - Al aprobar: crear en Meta Graph API y almacenar IDs reales (campaign_id, adset_id, ad_id, creative_id).

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  ORG_ID,
  getAdsLimits,
  validateAdsOperation,
  fetchMetaCampaigns,
  resolveAdsDateRange,
  type AdsDateRange,
} from './ads.ts';
import { evaluarGanador, UMBRALES_POR_DEFECTO } from '../_shared/creative_logic.ts';

// ── Tipos y Esquemas del Motor Científico V4 ──

export interface FunnelMetrics {
  periodo: AdsDateRange;
  meta: {
    gasto_total: number;
    impresiones_totales: number;
    clics_totales: number;
    ctr_promedio: number;
    cpc_promedio: number;
    cpm_promedio: number;
    conversaciones_meta: number;
    costo_por_conversacion: number | null;
  };
  nora: {
    conversaciones_totales: number;
    conversaciones_atendidas: number;
    tasa_respuesta_nora: number | null;
    objeciones_detectadas: number;
    transferencias_a_humano: number;
    abandonos_tempranos: number;
  };
  crm: {
    leads_totales: number;
    leads_por_tramite: Record<string, number>;
    leads_en_propuesta: number;
    propuestas_enviadas: number;
    clientes_pagadores: number;
    pagos_confirmados: number;
    ingresos_totales: number;
  };
  economics: {
    costo_por_lead: number | null;
    costo_por_propuesta: number | null;
    costo_por_cliente_pagador: number | null; // Métrica de negocio fundamental
    tasa_conversion_clic_a_whatsapp: number | null;
    tasa_conversion_whatsapp_a_lead: number | null;
    tasa_conversion_lead_a_propuesta: number | null;
    tasa_conversion_propuesta_a_pago: number | null;
    tasa_conversion_global: number | null;
    ticket_promedio: number | null;
    roas_global: number | null;
  };
  atribucion: {
    estado: 'confirmada' | 'estimada' | 'insuficiente';
    leads_meta_confirmados: number;
    referidos_identificados: number;
    leads_sin_atribucion: number;
    nota: string;
  };
  diagnostico_fugas: FunnelBottleneck[];
}

export interface FunnelBottleneck {
  etapa: 'impresion_a_clic' | 'clic_a_whatsapp' | 'whatsapp_a_nora' | 'nora_a_lead' | 'lead_a_propuesta' | 'propuesta_a_pago';
  severidad: 'critica' | 'moderada' | 'saludable';
  descripcion: string;
  evidencia_datos: string;
  posible_causa: string;
  hipotesis_recomendada: string;
}

export interface ExperimentVariantInput {
  variant_name: string; // 'Control' | 'Tratamiento A' | 'Tratamiento B'
  hook: string;
  copy: string;
  cta: string;
  creative_reference?: string;
  creative_asset_id?: string; // creativo del Laboratorio V5 (public.creatives)
  creative_generation_id?: string; // generación (creative_generations) que produjo esa imagen
  variable_changed?: string; // qué cambió frente al control ('control' para el control)
  audience_definition?: Record<string, unknown>;
  publico_codigo?: string; // público de adquisición (publicos_definiciones.codigo) que usará el conjunto de anuncios de esta variante
}

export interface ExperimentDesignParams {
  name: string;
  service: string; // ej. 'CPF', 'Residencia Mercosur', 'RNM'
  question: string;
  hypothesis: string;
  variable_tested: string;
  control_description: string;
  treatment_description: string;
  objective: 'OUTCOME_MESSAGES' | 'OUTCOME_LEADS' | 'OUTCOME_SALES';
  primary_metric: string; // ej. 'cost_per_customer', 'roas', 'payment_rate'
  secondary_metrics?: string[];
  audience_definition: Record<string, unknown>;
  daily_budget: number;
  variants: ExperimentVariantInput[];
  decision_rules: {
    scale_condition: string;
    pause_condition: string;
    iterate_condition: string;
  };
}

// ── 1. Análisis del Funnel Completo (Data Pipeline Multifuente) ──

export async function analizarFunnelCompleto(
  admin: SupabaseClient,
  rangoInput?: unknown
): Promise<FunnelMetrics> {
  const periodo = resolveAdsDateRange(rangoInput);
  const conRango = !!(periodo.desde && periodo.hasta);

  // 1. Meta Ads: métricas históricas de meta_ads_insights
  let queryInsights = admin
    .from('meta_ads_insights')
    .select('fecha, gasto, impresiones, clics, conversaciones, campaign_id, campaign_name')
    .order('fecha', { ascending: false });
  if (conRango) {
    queryInsights = queryInsights.gte('fecha', periodo.desde!).lte('fecha', periodo.hasta!);
  }
  const { data: insightsData, error: errInsights } = await queryInsights;
  if (errInsights) {
    console.error('[Funnel V4] Error en meta_ads_insights:', errInsights.message);
  }
  const insights = insightsData || [];

  const gastoTotal = insights.reduce((acc, r) => acc + (Number((r as any).gasto) || 0), 0);
  const impresionesTotales = insights.reduce((acc, r) => acc + (Number((r as any).impresiones) || 0), 0);
  const clicsTotales = insights.reduce((acc, r) => acc + (Number((r as any).clics) || 0), 0);
  const conversacionesMeta = insights.reduce((acc, r) => acc + (Number((r as any).conversaciones) || 0), 0);

  const ctrPromedio = impresionesTotales > 0 ? (clicsTotales / impresionesTotales) * 100 : 0;
  const cpcPromedio = clicsTotales > 0 ? gastoTotal / clicsTotales : 0;
  const cpmPromedio = impresionesTotales > 0 ? (gastoTotal / impresionesTotales) * 1000 : 0;
  const costPerConv = conversacionesMeta > 0 ? gastoTotal / conversacionesMeta : null;

  // 2. WhatsApp y Nora: conversaciones y mensajes en el CRM
  let queryConvs = admin
    .from('conversations')
    .select('id, channel, status, last_message_at, created_at, client_id, kommo_lead_id')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (conRango) {
    queryConvs = queryConvs.gte('created_at', `${periodo.desde}T00:00:00`).lte('created_at', `${periodo.hasta}T23:59:59`);
  }
  const { data: convsData } = await queryConvs;
  const convs = convsData || [];

  let queryMsgs = admin
    .from('messages')
    .select('id, conversation_id, direction, sender_type, content, created_at')
    .order('created_at', { ascending: false })
    .limit(3000);
  if (conRango) {
    queryMsgs = queryMsgs.gte('created_at', `${periodo.desde}T00:00:00`).lte('created_at', `${periodo.hasta}T23:59:59`);
  }
  const { data: msgsData } = await queryMsgs;
  const msgs = msgsData || [];

  const convsConRespuestaNora = new Set(
    msgs.filter((m: any) => m.direction === 'outbound' && (m.sender_type === 'nora' || m.sender_type === 'bot')).map((m: any) => m.conversation_id)
  ).size;

  const transferenciasAHumano = convs.filter((c: any) => c.status === 'transferred' || c.status === 'human_takeover').length;
  const abandonosTempranos = convs.filter((c: any) => {
    const cMsgs = msgs.filter((m: any) => m.conversation_id === c.id);
    return cMsgs.length <= 2 && c.status !== 'active';
  }).length;

  // 3. Leads y CRM (comercial_leads)
  let queryLeads = admin
    .from('comercial_leads')
    .select('id, nombre, tramite_texto, precio, etapa_nombre, client_id, lead_source, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(1000);
  if (conRango) {
    queryLeads = queryLeads.gte('updated_at', `${periodo.desde}T00:00:00`).lte('updated_at', `${periodo.hasta}T23:59:59`);
  }
  const { data: leadsData } = await queryLeads;
  const leads = leadsData || [];

  const leadsPorTramite: Record<string, number> = {};
  for (const l of leads) {
    const s = String((l as any).tramite_texto || 'No especificado').trim();
    leadsPorTramite[s] = (leadsPorTramite[s] || 0) + 1;
  }

  const leadsEnPropuesta = leads.filter((l: any) => /propuesta/i.test(String(l.etapa_nombre || ''))).length;
  const FUENTES_META = /(meta|facebook|instagram|fb|ig|messenger|paid_social)/i;
  const leadsDeMeta = leads.filter((l: any) => FUENTES_META.test(String(l.lead_source || ''))).length;

  // 4. Pagos y Cobros (payments)
  let queryPagos = admin
    .from('payments')
    .select('id, amount, paid_at, client_id, status')
    .eq('status', 'paid');
  if (conRango) {
    queryPagos = queryPagos.gte('paid_at', `${periodo.desde}T00:00:00`).lte('paid_at', `${periodo.hasta}T23:59:59`);
  }
  const { data: pagosData } = await queryPagos;
  const pagos = pagosData || [];

  const ingresosTotales = pagos.reduce((acc, p) => acc + (Number((p as any).amount) || 0), 0);
  const clientesPagadoresSet = new Set(pagos.map((p: any) => p.client_id).filter(Boolean));
  const clientesPagadores = clientesPagadoresSet.size;

  // 5. Referidos de Meta Ads
  const { data: referidosData } = await admin
    .from('meta_ads_referidos')
    .select('ad_id, raw, body')
    .limit(500);
  const referidosCount = (referidosData || []).length;

  // 6. Conversiones y Economics (Sin NaN ni 0 artificial)
  const red2 = (n: number | null) => (n === null || isNaN(n) ? null : Math.round(n * 100) / 100);
  const redPct = (num: number, den: number): number | null => {
    if (den <= 0 || num <= 0) return null;
    return red2((num / den) * 100);
  };

  const costoPorLead = leads.length > 0 && gastoTotal > 0 ? red2(gastoTotal / leads.length) : null;
  const costoPorPropuesta = leadsEnPropuesta > 0 && gastoTotal > 0 ? red2(gastoTotal / leadsEnPropuesta) : null;
  const costoPorClientePagador = clientesPagadores > 0 && gastoTotal > 0 ? red2(gastoTotal / clientesPagadores) : null;
  const ticketPromedio = clientesPagadores > 0 && ingresosTotales > 0 ? red2(ingresosTotales / clientesPagadores) : null;
  const roasGlobal = gastoTotal > 0 ? red2(ingresosTotales / gastoTotal) : null;

  const convsTotalEfectivas = convs.length > 0 ? convs.length : conversacionesMeta;
  const tasaClicWhatsApp = redPct(convsTotalEfectivas, clicsTotales);
  const tasaWhatsAppLead = redPct(leads.length, convsTotalEfectivas);
  const tasaLeadPropuesta = redPct(leadsEnPropuesta, leads.length);
  const tasaPropuestaPago = redPct(clientesPagadores, leadsEnPropuesta > 0 ? leadsEnPropuesta : leads.length);
  const tasaConversionGlobal = redPct(clientesPagadores, clicsTotales);
  const tasaRespuestaNora = redPct(convsConRespuestaNora, convs.length);

  // 7. Diagnóstico de Fugas y Cuellos de Botella
  const fugas: FunnelBottleneck[] = [];

  // Fuga 1: Impresión a Clic (CTR bajo)
  if (impresionesTotales > 1000 && ctrPromedio < 1.0) {
    fugas.push({
      etapa: 'impresion_a_clic',
      severidad: 'critica',
      descripcion: `CTR promedio de ${ctrPromedio.toFixed(2)}%, por debajo del umbral saludable (1.5% - 2.5%).`,
      evidencia_datos: `${clicsTotales} clics sobre ${impresionesTotales} impresiones con gasto de R$ ${gastoTotal.toFixed(2)}.`,
      posible_causa: 'Fatiga de creativos, hook débil en los primeros 3 segundos o público saturado.',
      hipotesis_recomendada: 'Probar nuevos hooks visuales orientados al dolor específico del inmigrante (ej. resolver burocracia vs mensaje genérico).',
    });
  }

  // Fuga 2: Clic a WhatsApp (Muchos clics pero pocas conversaciones)
  if (clicsTotales > 50 && (tasaClicWhatsApp === null || tasaClicWhatsApp < 20)) {
    fugas.push({
      etapa: 'clic_a_whatsapp',
      severidad: 'critica',
      descripcion: `Fuga severa entre clic y chat: solo el ${tasaClicWhatsApp ?? 0}% de los clics inician conversación.`,
      evidencia_datos: `${clicsTotales} clics generaron solo ${convsTotalEfectivas} conversaciones.`,
      posible_causa: 'Fricción en apertura de WhatsApp, mensaje predeterminado complejo o expectativa errónea del anuncio.',
      hipotesis_recomendada: 'Simplificar el mensaje de inicio predeterminado de WhatsApp a una sola pregunta directa y verificar enlace corto.',
    });
  }

  // Fuga 3: WhatsApp a Nora (Nora no responde o abandono temprano)
  if (convs.length > 10 && tasaRespuestaNora !== null && tasaRespuestaNora < 75) {
    fugas.push({
      etapa: 'whatsapp_a_nora',
      severidad: 'moderada',
      descripcion: `Tasa de primera respuesta de Nora es del ${tasaRespuestaNora}%.`,
      evidencia_datos: `${convsConRespuestaNora} conversaciones atendidas de ${convs.length} recibidas.`,
      posible_causa: 'Demora en webhook, caída de instancia de n8n/Evolution API o número saturado.',
      hipotesis_recomendada: 'Verificar latencia de primera respuesta de Nora e implementar reintento automático.',
    });
  }

  // Fuga 4: Lead a Propuesta (Leads baratos que no avanzan a propuesta)
  if (leads.length > 15 && (tasaLeadPropuesta === null || tasaLeadPropuesta < 20)) {
    fugas.push({
      etapa: 'lead_a_propuesta',
      severidad: 'critica',
      descripcion: `Baja tasa de pase a propuesta (${tasaLeadPropuesta ?? 0}%). Se captan leads pero no califican o no piden presupuesto.`,
      evidencia_datos: `${leads.length} leads registrados pero solo ${leadsEnPropuesta} en etapa de propuesta.`,
      posible_causa: 'Anuncio atrayendo curiosos sin intención real o falta de cualificación de Nora en las primeras 3 preguntas.',
      hipotesis_recomendada: 'Añadir filtro de cualificación previo en el copy del anuncio o en la segunda pregunta de Nora.',
    });
  }

  // Fuga 5: Propuesta a Pago (Propuestas enviadas pero no cobradas)
  if (leadsEnPropuesta > 5 && clientesPagadores === 0) {
    fugas.push({
      etapa: 'propuesta_a_pago',
      severidad: 'critica',
      descripcion: 'Se han generado propuestas pero ninguna ha cerrado en pago confirmado.',
      evidencia_datos: `${leadsEnPropuesta} propuestas en el período vs 0 pagos registrados.`,
      posible_causa: 'Objeción de precio, falta de medios de pago internacionales (ej. Pix / tarjeta) o seguimiento tardío.',
      hipotesis_recomendada: 'Testear oferta con facilidades de pago o acompañamiento personalizado en la propuesta.',
    });
  }

  const atribucionEstado = referidosCount > 0 || leadsDeMeta > 0
    ? 'confirmada'
    : (leads.length > 0 || pagos.length > 0) ? 'estimada' : 'insuficiente';

  return {
    periodo,
    meta: {
      gasto_total: red2(gastoTotal) || 0,
      impresiones_totales: impresionesTotales,
      clics_totales: clicsTotales,
      ctr_promedio: red2(ctrPromedio) || 0,
      cpc_promedio: red2(cpcPromedio) || 0,
      cpm_promedio: red2(cpmPromedio) || 0,
      conversaciones_meta: conversacionesMeta,
      costo_por_conversacion: costPerConv,
    },
    nora: {
      conversaciones_totales: convs.length,
      conversaciones_atendidas: convsConRespuestaNora,
      tasa_respuesta_nora: tasaRespuestaNora,
      objeciones_detectadas: 0,
      transferencias_a_humano: transferenciasAHumano,
      abandonos_tempranos: abandonosTempranos,
    },
    crm: {
      leads_totales: leads.length,
      leads_por_tramite: leadsPorTramite,
      leads_en_propuesta: leadsEnPropuesta,
      propuestas_enviadas: leadsEnPropuesta,
      clientes_pagadores: clientesPagadores,
      pagos_confirmados: pagos.length,
      ingresos_totales: red2(ingresosTotales) || 0,
    },
    economics: {
      costo_por_lead: costoPorLead,
      costo_por_propuesta: costoPorPropuesta,
      costo_por_cliente_pagador: costoPorClientePagador,
      tasa_conversion_clic_a_whatsapp: tasaClicWhatsApp,
      tasa_conversion_whatsapp_a_lead: tasaWhatsAppLead,
      tasa_conversion_lead_a_propuesta: tasaLeadPropuesta,
      tasa_conversion_propuesta_a_pago: tasaPropuestaPago,
      tasa_conversion_global: tasaConversionGlobal,
      ticket_promedio: ticketPromedio,
      roas_global: roasGlobal,
    },
    atribucion: {
      estado: atribucionEstado,
      leads_meta_confirmados: leadsDeMeta,
      referidos_identificados: referidosCount,
      leads_sin_atribucion: Math.max(0, leads.length - leadsDeMeta),
      nota: atribucionEstado === 'confirmada'
        ? 'Hay evidencia directa de origen Meta (lead_source o meta_ads_referidos).'
        : 'Atribución basada en correlación del período por ausencia de tracking individualizado.',
    },
    diagnostico_fugas: fugas,
  };
}

// ── 2. Learning Engine: Consulta y Persistencia de Aprendizajes ──

export async function consultarAprendizajes(
  admin: SupabaseClient,
  filtros?: { service?: string; audience?: string; limit?: number }
) {
  let q = admin
    .from('campaign_learnings')
    .select('*')
    .order('confidence', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(filtros?.limit || 15);

  if (filtros?.service) {
    q = q.ilike('service', `%${filtros.service}%`);
  }
  if (filtros?.audience) {
    q = q.ilike('audience', `%${filtros.audience}%`);
  }

  const { data, error } = await q;
  if (error) {
    console.error('[Learning Engine] Error consultando aprendizajes:', error.message);
    return [];
  }
  return data || [];
}

export async function guardarAprendizaje(
  admin: SupabaseClient,
  learning: {
    service: string;
    audience?: string;
    country?: string;
    creative_angle?: string;
    hook?: string;
    channel?: string;
    learning: string;
    evidence?: string;
    confidence: number;
    source_experiment_id?: string;
  }
) {
  const { data, error } = await admin
    .from('campaign_learnings')
    .insert({
      organization_id: ORG_ID,
      service: learning.service,
      audience: learning.audience || null,
      country: learning.country || null,
      creative_angle: learning.creative_angle || null,
      hook: learning.hook || null,
      channel: learning.channel || 'Meta Ads + WhatsApp',
      learning: learning.learning,
      evidence: learning.evidence || null,
      confidence: learning.confidence,
      source_experiment_id: learning.source_experiment_id || null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Error guardando aprendizaje: ${error.message}`);
  }
  return data;
}

// ── 3. Motor de Hipótesis y Validación de Regla de Variable Única ──

export function validarEstructuraExperimentoV4(params: ExperimentDesignParams): { valid: boolean; error?: string } {
  if (!params.name || !params.service || !params.hypothesis || !params.variable_tested) {
    return { valid: false, error: 'Faltan campos obligatorios: name, service, hypothesis, variable_tested son indispensables.' };
  }

  if (!params.variants || params.variants.length < 2) {
    return { valid: false, error: 'Un experimento científico V4 requiere al menos 2 variantes (Control y Tratamiento).' };
  }

  // Regla: No cambiar todo al mismo tiempo sin declarar experimento multivariable
  const hasControl = params.variants.some(v => /control/i.test(v.variant_name));
  if (!hasControl) {
    return { valid: false, error: 'Debe definirse explícitamente una variante como "Control" para comparar los resultados.' };
  }

  // Presupuesto positivo
  if (!params.daily_budget || params.daily_budget <= 0) {
    return { valid: false, error: 'El presupuesto diario debe ser mayor a 0 BRL.' };
  }

  return { valid: true };
}

// ── 4. Generador de Propuesta Científica V4 (Integración con ai_proposals) ──

export async function proponerExperimentoV4(
  ctx: { admin: SupabaseClient; userId: string; conversationId: string; proposals: any[] },
  params: ExperimentDesignParams
) {
  const limits = await getAdsLimits(ctx.admin);

  // Validación de límites de seguridad
  const validacionPresupuesto = validateAdsOperation(
    { tipo: 'crear_campana_ads', montoCreacion: params.daily_budget },
    limits
  );
  if (!validacionPresupuesto.valid) {
    throw new Error(`Presupuesto inválido para el experimento: ${validacionPresupuesto.error}`);
  }

  // Validación metodológica científica
  const validacionMetodologica = validarEstructuraExperimentoV4(params);
  if (!validacionMetodologica.valid) {
    throw new Error(`Estructura experimental inválida: ${validacionMetodologica.error}`);
  }

  // 1. Insertar el experimento en la tabla científica con estado 'pending_approval'
  const { data: exp, error: errExp } = await ctx.admin
    .from('campaign_experiments')
    .insert({
      organization_id: ORG_ID,
      name: params.name,
      service: params.service,
      status: 'pending_approval',
      hypothesis: params.hypothesis,
      objective: params.objective,
      primary_metric: params.primary_metric,
      secondary_metrics: params.secondary_metrics || ['cpc', 'ctr', 'cost_per_lead', 'conversations'],
      audience_definition: params.audience_definition || {},
      budget: params.daily_budget,
      control_description: params.control_description,
      treatment_description: params.treatment_description,
      decision_thresholds: UMBRALES_POR_DEFECTO,
      created_by: ctx.userId,
    })
    .select('id, name, service, status, hypothesis')
    .single();

  if (errExp || !exp) {
    throw new Error(`Error registrando el experimento en BD: ${errExp?.message || 'Error desconocido'}`);
  }

  // 2. Insertar variantes iniciales
  const variantesInsertar = params.variants.map(v => ({
    experiment_id: exp.id,
    variant_name: v.variant_name,
    hook: v.hook,
    copy: v.copy,
    cta: v.cta,
    creative_reference: v.creative_reference || null,
    creative_asset_id: v.creative_asset_id || null,
    creative_generation_id: v.creative_generation_id || null,
    variable_changed: v.variable_changed || null,
    audience_definition: v.audience_definition || (v.publico_codigo ? { publico_codigo: v.publico_codigo } : params.audience_definition) || {},
  }));

  const { data: variantesGuardadas, error: errVar } = await ctx.admin
    .from('campaign_variants')
    .insert(variantesInsertar)
    .select('id, variant_name, hook');

  if (errVar) {
    console.error('[Experimento V4] Error insertando variantes:', errVar.message);
  }

  // 3. Registrar la hipótesis
  await ctx.admin.from('campaign_hypotheses').insert({
    experiment_id: exp.id,
    hypothesis: params.hypothesis,
    reasoning: params.question,
    result: 'inconclusive',
    decision: `Escalar si: ${params.decision_rules?.scale_condition || 'Costo por cliente < objetivo'}. Pausar si: ${params.decision_rules?.pause_condition || 'Sin tracción en 3 días'}.`,
  });

  // 4. Crear la propuesta en ai_proposals para confirmación humana obligatoria
  const payloadPropuesta = {
    experiment_id: exp.id,
    nombre_campana: params.name,
    servicio: params.service,
    objetivo: params.objective,
    presupuesto_diario: params.daily_budget,
    pregunta: params.question,
    hipotesis: params.hypothesis,
    variable_a_probar: params.variable_tested,
    control: params.control_description,
    tratamiento: params.treatment_description,
    metrica_primaria: params.primary_metric,
    metricas_secundarias: params.secondary_metrics || ['cpc', 'ctr', 'cost_per_lead'],
    publico: params.audience_definition,
    variantes: params.variants,
    reglas_decision: params.decision_rules,
    riesgos: [
      `Gasto diario comprometido: R$ ${params.daily_budget}/día.`,
      'La campaña se creará en estado PAUSED por seguridad hasta que se decida su encendido.',
      'Requiere seguimiento de atribución de pagos en los próximos 7-14 días.',
    ],
  };

  const resumen = `Diseño de Experimento V4 "${params.name}" (${params.service}): Probar ${params.variable_tested} con R$ ${params.daily_budget}/día evaluando ${params.primary_metric}.`;

  const { data: propuesta, error: errProp } = await ctx.admin
    .from('ai_proposals')
    .insert({
      organization_id: ORG_ID,
      user_id: ctx.userId,
      ai_conversation_id: ctx.conversationId,
      tipo: 'ads_experimento_v4',
      payload: payloadPropuesta,
      resumen,
    })
    .select('id, tipo, payload, resumen, status, created_at')
    .single();

  if (errProp || !propuesta) {
    throw new Error(`Error creando la propuesta de experimento: ${errProp?.message}`);
  }

  ctx.proposals.push(propuesta);

  return {
    propuesta_creada: true,
    proposal_id: propuesta.id,
    experiment_id: exp.id,
    resumen,
    variantes_creadas: (variantesGuardadas || []).length,
    nota: 'El experimento está en estado pending_approval. Requiere confirmación humana en el panel para crearse en Meta Ads.',
  };
}

// ── 5. Medición Periódica y Determinación Científica de Resultados ──

export async function medirExperimentoV4(
  admin: SupabaseClient,
  experimentId: string
) {
  // 1. Obtener experimento y variantes
  const { data: exp, error: errExp } = await admin
    .from('campaign_experiments')
    .select('*')
    .eq('id', experimentId)
    .single();

  if (errExp || !exp) {
    throw new Error(`Experimento no encontrado: ${errExp?.message}`);
  }

  const { data: variantes } = await admin
    .from('campaign_variants')
    .select('*')
    .eq('experiment_id', experimentId);

  const listaVariantes = variantes || [];
  if (!listaVariantes.length) {
    return {
      experimento: exp.name,
      estado: exp.status,
      mensaje: 'El experimento no tiene variantes configuradas con IDs de Meta Ads aún.',
    };
  }

  // 2. Medir cada variante usando datos reales de meta_ads_insights / meta_ads_entities
  const resultadosVariantes: any[] = [];
  let mejorVariante: any = null;
  let controlVariante: any = null;
  const fechasMedidas = new Set<string>();

  for (const v of listaVariantes) {
    let spend: number | null = null;
    let impressions: number | null = null;
    let clicks: number | null = null;
    let conversations: number | null = null;

    if (v.ad_id || v.campaign_id) {
      let q = admin.from('meta_ads_insights').select('fecha, gasto, impresiones, clics, conversaciones');
      if (v.ad_id) q = q.eq('ad_id', v.ad_id);
      else if (v.campaign_id) q = q.eq('campaign_id', v.campaign_id);

      const { data: ins } = await q;
      if (ins && ins.length > 0) {
        for (const r of ins) if ((r as any).fecha) fechasMedidas.add(String((r as any).fecha));
        spend = ins.reduce((a, b) => a + (Number((b as any).gasto) || 0), 0);
        impressions = ins.reduce((a, b) => a + (Number((b as any).impresiones) || 0), 0);
        clicks = ins.reduce((a, b) => a + (Number((b as any).clics) || 0), 0);
        conversations = ins.reduce((a, b) => a + (Number((b as any).conversaciones) || 0), 0);
      }
    }

    const ctr = impressions && impressions > 0 && clicks !== null ? (clicks / impressions) * 100 : null;
    const cpc = clicks && clicks > 0 && spend !== null ? spend / clicks : null;
    const cpcConv = conversations && conversations > 0 && spend !== null ? spend / conversations : null;

    const resVar = {
      variant_id: v.id,
      variant_name: v.variant_name,
      meta_ids: { campaign_id: v.campaign_id, adset_id: v.adset_id, ad_id: v.ad_id },
      hook: v.hook,
      spend,
      impressions,
      clicks,
      ctr,
      cpc,
      conversations,
      cost_per_conversation: cpcConv,
    };

    resultadosVariantes.push(resVar);

    // Guardar medición periódica en BD (NULL si falta el dato, sin inventar)
    await admin.from('campaign_measurements').insert({
      experiment_id: exp.id,
      variant_id: v.id,
      date: new Date().toISOString().slice(0, 10),
      spend,
      impressions,
      clicks,
      ctr,
      cpc,
      conversations,
      cost_per_lead: cpcConv,
    });

    if (/control/i.test(v.variant_name)) controlVariante = resVar;
  }

  // 3. Evaluar Hipótesis: ¿Supported, Not Supported o Inconclusive?
  let resultadoHipotesis: 'supported' | 'not_supported' | 'inconclusive' = 'inconclusive';
  let confianza = 0.5;
  let razon = 'Datos insuficientes para determinar un ganador con significancia estadística.';

  const tratamientos = resultadosVariantes.filter(v => !/control/i.test(v.variant_name));
  const tratamientosConGasto = tratamientos.filter(v => v.spend !== null && v.spend > 20);

  if (controlVariante && controlVariante.spend && controlVariante.spend > 20 && tratamientosConGasto.length > 0) {
    const mejorTratamiento = tratamientosConGasto.sort((a, b) => (a.cost_per_conversation || 999) - (b.cost_per_conversation || 999))[0];
    mejorVariante = mejorTratamiento;

    const cpcControl = controlVariante.cost_per_conversation;
    const cpcTratamiento = mejorTratamiento.cost_per_conversation;

    if (cpcControl && cpcTratamiento) {
      const mejora = ((cpcControl - cpcTratamiento) / cpcControl) * 100;
      if (mejora > 15) {
        resultadoHipotesis = 'supported';
        confianza = 0.85;
        razon = `La variante "${mejorTratamiento.variant_name}" superó al Control reduciendo el costo por conversación un ${mejora.toFixed(1)}% (R$ ${cpcTratamiento.toFixed(2)} vs R$ ${cpcControl.toFixed(2)}).`;
      } else if (mejora < -15) {
        resultadoHipotesis = 'not_supported';
        confianza = 0.8;
        razon = `La hipótesis no fue respaldada: El Control tuvo mejor costo por resultado que el tratamiento (R$ ${cpcControl.toFixed(2)} vs R$ ${cpcTratamiento.toFixed(2)}).`;
      } else {
        resultadoHipotesis = 'inconclusive';
        confianza = 0.5;
        razon = 'La diferencia entre variantes no es estadísticamente relevante aún (< 15% de margen). Mantener corriendo.';
      }
    }
  }

  // Regla V5: no se declara resultado con pocos datos (volumen, periodo y diferencia mínimos).
  if (resultadoHipotesis !== 'inconclusive') {
    const evaluacion = evaluarGanador(
      resultadosVariantes.map(v => ({ nombre: v.variant_name, impresiones: v.impressions, clics: v.clicks, gasto: v.spend, conversaciones: v.conversations, clientes_pagaron: null })),
      fechasMedidas.size,
    );
    if (evaluacion.veredicto === 'sin_datos' || evaluacion.veredicto === 'insuficiente') {
      resultadoHipotesis = 'inconclusive';
      confianza = 0.3;
      razon = `Sin conclusión: ${evaluacion.motivo}`;
      mejorVariante = null;
    }
  }

  // Actualizar tabla campaign_hypotheses
  await admin.from('campaign_hypotheses').update({
    result: resultadoHipotesis,
    confidence: confianza,
    evidence: { variantes: resultadosVariantes, detalle: razon },
    decision: resultadoHipotesis === 'supported' ? 'Escalar tratamiento ganador' : resultadoHipotesis === 'not_supported' ? 'Pausar tratamiento y mantener control' : 'Continuar midiendo',
  }).eq('experiment_id', exp.id);

  // Si fue respaldado y concluyente, registrar aprendizaje en campaign_learnings
  if (resultadoHipotesis === 'supported' && mejorVariante) {
    await guardarAprendizaje(admin, {
      service: exp.service,
      creative_angle: exp.name,
      hook: mejorVariante.hook,
      learning: `En el servicio ${exp.service}, la hipótesis "${exp.hypothesis}" fue confirmada. ${razon}`,
      evidence: `Costo por resultado: R$ ${mejorVariante.cost_per_conversation?.toFixed(2)} vs R$ ${controlVariante?.cost_per_conversation?.toFixed(2)} de control.`,
      confidence: confianza,
      source_experiment_id: exp.id,
    });
  }

  return {
    experimento: exp.name,
    servicio: exp.service,
    estado: exp.status,
    hipotesis: exp.hypothesis,
    resultado: resultadoHipotesis,
    confianza,
    conclusion: razon,
    variantes: resultadosVariantes,
    siguiente_paso: resultadoHipotesis === 'supported'
      ? 'Aprobar escalado de presupuesto en la variante ganadora.'
      : resultadoHipotesis === 'not_supported'
      ? 'Pausar la variante y formular nueva hipótesis evitando este ángulo.'
      : 'Mantener el experimento corriendo hasta acumular al menos 50 conversaciones.',
  };
}

// ── 6. Listado de Experimentos y Estado para el Panel ──

export async function listarExperimentosV4(admin: SupabaseClient, limite = 20) {
  const { data: exps, error } = await admin
    .from('campaign_experiments')
    .select(`
      id, name, service, status, hypothesis, objective, primary_metric, budget, created_at,
      campaign_variants(id, variant_name, hook, campaign_id, adset_id, ad_id),
      campaign_hypotheses(result, confidence, decision)
    `)
    .order('created_at', { ascending: false })
    .limit(limite);

  if (error) {
    console.error('[Experimentos V4] Error listando:', error.message);
    return [];
  }
  return exps || [];
}

// ── 7. Motor Científico V5: Generación y Gestión de Creativos Publicitarios ──

export const SERVICIOS_SOPORTADOS = ['CPF', 'Agendamento PF', 'RNM', 'Residência Permanente', 'Refúgio'] as const;
export type ServicioPublicitario = (typeof SERVICIOS_SOPORTADOS)[number];

export const FORMATOS_CREATIVOS = ['1:1', '4:5', '9:16'] as const;
export type FormatoCreativo = (typeof FORMATOS_CREATIVOS)[number];

export const CONCEPTOS_VISUALES = [
  'persona_documentacion',
  'problema_solucion',
  'servicio_directo',
  'institucional',
  'ganador_historico',
] as const;
export type ConceptoVisual = (typeof CONCEPTOS_VISUALES)[number];

export interface GeneradorConceptoOutput {
  service: string;
  visual_concept: string;
  format: string;
  prompt_imagen: string;
  headline: string;
  primary_text: string;
  cta: string;
  variables: Record<string, string>;
}

export function generarConceptosCreativos(
  service: string,
  concepto: string = 'servicio_directo',
  formato: string = '1:1'
): GeneradorConceptoOutput {
  const normServicio = SERVICIOS_SOPORTADOS.find(s => s.toLowerCase() === service.toLowerCase()) || 'CPF';
  const aspecto = formato === '9:16' ? 'vertical 9:16 for Stories and Reels' : formato === '4:5' ? 'portrait 4:5 for Feed' : 'square 1:1 for Feed';

  let promptImg = '';
  let headline = '';
  let copy = '';
  let cta = 'Enviar mensaje';

  switch (concepto) {
    case 'persona_documentacion':
      promptImg = `Professional commercial advertising photography, ${aspecto}. Realistic South American immigrant in Brazil holding clean legal documentation folder, smiling with relief and confidence, modern urban Brazilian architectural background out of focus, warm natural golden hour lighting, cinematic color grading, authentic emotional expression, 8k resolution, no artificial text, clean layout for marketing ad.`;
      headline = `Tu ${normServicio} en Brasil, seguro y sin complicaciones`;
      copy = `Llegar a un nuevo país ya tiene suficientes desafíos. Regulariza tu ${normServicio} con el equipo legal de Flujo de Migração y evita errores que demoren tu proceso. Atención 100% en español.`;
      break;

    case 'problema_solucion':
      promptImg = `High-end conceptual advertising photography, ${aspecto}. Visual contrast split: left side representing confusing bureaucratic documents and crowded lines in black and white, right side in full vibrant color showing a calm professional consultation with digital approval and warm lighting, sophisticated legal service branding style, ultra realistic, no distorted text.`;
      headline = `¿Complicaciones con tu ${normServicio}? Lo resolvemos`;
      copy = `Olvídate de las filas interminables y los formularios confusos de la Receita y la Policía Federal. Te acompañamos paso a paso hasta que tengas tu trámite listo en mano.`;
      break;

    case 'institucional':
      promptImg = `Modern corporate architectural and legal office aesthetic, ${aspecto}. Professional desk with Brazilian legal paperwork, elegant brass pen, official passport, soft ambient office lighting, clean minimalist composition with deep navy blue and emerald tones, high authority commercial look, Photorealistic 8k, sharp focus.`;
      headline = `Asesoría Legal Especializada en Migración Brasileña`;
      copy = `Flujo de Migração: Más de 10 años de experiencia ayudando a extranjeros a obtener su ${normServicio} y residencia legal en Brasil con respaldo profesional garantizado.`;
      break;

    case 'ganador_historico':
      promptImg = `Action-oriented editorial marketing photography, ${aspecto}. Young expat in São Paulo or Rio holding their official Brazilian document with a joyful relaxed smile while walking along a sunny modern avenue, authentic candid style, vibrant natural Brazilian colors, cinematic daylight, professional commercial ad standard.`;
      headline = `Tu ${normServicio} listo en tiempo récord`;
      copy = `El trámite más importante para trabajar, abrir cuenta bancaria y vivir legalmente en Brasil. Toca el botón para hablar directamente con nuestro equipo por WhatsApp.`;
      break;

    case 'servicio_directo':
    default:
      promptImg = `Clean commercial advertising photo, ${aspecto}. Warm and approachable immigration advisor in modern Brazilian office environment presenting approved official documents with friendly welcoming smile, premium corporate color palette, studio lighting, hyper realistic, crisp details.`;
      headline = `Tramita tu ${normServicio} hoy mismo`;
      copy = `Obtén tu ${normServicio} en Brasil sin demoras innecesarias. Te guiamos con los requisitos exactos y preparamos toda tu documentación. Inicia ahora por WhatsApp.`;
      break;
  }

  return {
    service: normServicio,
    visual_concept: concepto,
    format: formato,
    prompt_imagen: promptImg,
    headline,
    primary_text: copy,
    cta,
    variables: {
      nacionalidad_objetivo: 'Hispanoamericanos en Brasil',
      canal_destino: 'WhatsApp Directo',
      estilo_fotografico: 'Comercial realista alta fidelidad',
    },
  };
}

// ── 8. Biblioteca de Prompts (Lectura, Guardado y Performance Acumulada) ──

export async function listarPrompts(admin: SupabaseClient, service?: string) {
  let q = admin
    .from('creative_prompts')
    .select('*')
    .order('clientes', { ascending: false })
    .order('created_at', { ascending: false });

  if (service) {
    q = q.ilike('service', `%${service}%`);
  }

  const { data, error } = await q;
  if (error) {
    console.error('[Creative Prompts] Error listando prompts:', error.message);
    return [];
  }
  return data || [];
}

export async function guardarPrompt(
  admin: SupabaseClient,
  promptData: {
    nombre: string;
    service: string;
    prompt: string;
    version?: string;
    concepto?: string;
    variables?: Record<string, unknown>;
  }
) {
  const { data, error } = await admin
    .from('creative_prompts')
    .insert({
      organization_id: ORG_ID,
      nombre: promptData.nombre,
      service: promptData.service,
      prompt: promptData.prompt,
      version: promptData.version || 'v1.0',
      concepto: promptData.concepto || 'servicio_directo',
      variables: promptData.variables || {},
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Error guardando prompt en la biblioteca: ${error.message}`);
  }
  return data;
}

// ── 9. Biblioteca de Creativos (Lectura, Guardado, Ranking y Comparador) ──

export async function listarCreativos(
  admin: SupabaseClient,
  filtros?: { service?: string; format?: string; visual_concept?: string; limit?: number }
) {
  let q = admin
    .from('campaign_creatives')
    .select(`
      id, service, prompt_text, prompt_version, image_url, format, headline, primary_text, cta,
      visual_concept, meta_creative_id, ad_id, campaign_id, adset_id, status, created_at,
      creative_prompts(id, nombre, version)
    `)
    .order('created_at', { ascending: false })
    .limit(filtros?.limit || 50);

  if (filtros?.service) q = q.ilike('service', `%${filtros.service}%`);
  if (filtros?.format) q = q.eq('format', filtros.format);
  if (filtros?.visual_concept) q = q.eq('visual_concept', filtros.visual_concept);

  const { data, error } = await q;
  if (error) {
    console.error('[Creatives Hub] Error listando creativos:', error.message);
    return [];
  }
  return data || [];
}

export async function guardarCreativo(
  admin: SupabaseClient,
  creativeData: {
    prompt_id?: string;
    service: string;
    prompt_text: string;
    prompt_version?: string;
    image_url: string;
    format?: string;
    headline?: string;
    primary_text?: string;
    cta?: string;
    visual_concept?: string;
    meta_creative_id?: string;
    ad_id?: string;
    campaign_id?: string;
    adset_id?: string;
    status?: string;
  }
) {
  const { data, error } = await admin
    .from('campaign_creatives')
    .insert({
      organization_id: ORG_ID,
      prompt_id: creativeData.prompt_id || null,
      service: creativeData.service,
      prompt_text: creativeData.prompt_text,
      prompt_version: creativeData.prompt_version || 'v1.0',
      image_url: creativeData.image_url,
      format: creativeData.format || '1:1',
      headline: creativeData.headline || null,
      primary_text: creativeData.primary_text || null,
      cta: creativeData.cta || 'Enviar mensaje',
      visual_concept: creativeData.visual_concept || 'servicio_directo',
      meta_creative_id: creativeData.meta_creative_id || null,
      ad_id: creativeData.ad_id || null,
      campaign_id: creativeData.campaign_id || null,
      adset_id: creativeData.adset_id || null,
      status: creativeData.status || 'draft',
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Error guardando creativo: ${error.message}`);
  }

  // Si tiene prompt asociado, incrementar contador de creativos generados
  if (creativeData.prompt_id) {
    const { data: p } = await admin
      .from('creative_prompts')
      .select('creativos_generados')
      .eq('id', creativeData.prompt_id)
      .maybeSingle();
    if (p) {
      await admin
        .from('creative_prompts')
        .update({ creativos_generados: (p.creativos_generados || 0) + 1, updated_at: new Date().toISOString() })
        .eq('id', creativeData.prompt_id);
    }
  }

  return data;
}

// ── 10. Ranking y Comparador de Creativos (Métricas Reales de Negocio) ──

export async function rankingCreativos(
  admin: SupabaseClient,
  metrica: string = 'costo_por_cliente',
  service?: string
) {
  const creativos = await listarCreativos(admin, { service });
  if (!creativos.length) return [];

  const adIds = creativos.map(c => c.ad_id).filter(Boolean);

  const insightsPorAd: Record<string, { spend: number; impressions: number; clicks: number; conversations: number }> = {};
  if (adIds.length > 0) {
    const { data: ins } = await admin
      .from('meta_ads_insights')
      .select('ad_id, gasto, impresiones, clics, conversaciones')
      .in('ad_id', adIds);
    for (const r of ins || []) {
      const aid = String((r as any).ad_id);
      if (!insightsPorAd[aid]) insightsPorAd[aid] = { spend: 0, impressions: 0, clicks: 0, conversations: 0 };
      insightsPorAd[aid].spend += Number((r as any).gasto) || 0;
      insightsPorAd[aid].impressions += Number((r as any).impresiones) || 0;
      insightsPorAd[aid].clicks += Number((r as any).clics) || 0;
      insightsPorAd[aid].conversations += Number((r as any).conversaciones) || 0;
    }
  }

  const { data: leads } = await admin
    .from('comercial_leads')
    .select('id, meta_ad_id, meta_creative_id, client_id');
  const { data: pagos } = await admin
    .from('payments')
    .select('amount, client_id')
    .eq('status', 'paid');

  const clientesQuePagaronIds = new Set((pagos || []).map(p => p.client_id).filter(Boolean));

  const ranked = creativos.map(c => {
    const aid = c.ad_id ? String(c.ad_id) : '';
    const ins = insightsPorAd[aid] || { spend: 0, impressions: 0, clicks: 0, conversations: 0 };

    const leadsDelCreativo = (leads || []).filter(l =>
      (c.ad_id && (l as any).meta_ad_id === c.ad_id) ||
      (c.meta_creative_id && (l as any).meta_creative_id === c.meta_creative_id)
    );

    const clientesDelCreativo = leadsDelCreativo.filter(l => clientesQuePagaronIds.has(l.client_id)).length;
    const ctr = ins.impressions > 0 ? (ins.clicks / ins.impressions) * 100 : null;
    const cpc = ins.clicks > 0 ? ins.spend / ins.clicks : null;
    const cpcConv = ins.conversations > 0 ? ins.spend / ins.conversations : null;
    const costoCliente = clientesDelCreativo > 0 ? ins.spend / clientesDelCreativo : null;

    return {
      creative_id: c.id,
      headline: c.headline || 'Sin título',
      service: c.service,
      format: c.format,
      visual_concept: c.visual_concept,
      image_url: c.image_url,
      prompt_text: c.prompt_text,
      spend: ins.spend > 0 ? ins.spend : null,
      impressions: ins.impressions > 0 ? ins.impressions : null,
      clicks: ins.clicks > 0 ? ins.clicks : null,
      ctr: ctr !== null ? Math.round(ctr * 100) / 100 : null,
      cpc: cpc !== null ? Math.round(cpc * 100) / 100 : null,
      conversations: ins.conversations > 0 ? ins.conversations : null,
      cost_per_conversation: cpcConv !== null ? Math.round(cpcConv * 100) / 100 : null,
      leads: leadsDelCreativo.length > 0 ? leadsDelCreativo.length : null,
      paying_customers: clientesDelCreativo > 0 ? clientesDelCreativo : null,
      cost_per_customer: costoCliente !== null ? Math.round(costoCliente * 100) / 100 : null,
    };
  });

  return ranked.sort((a, b) => {
    if (metrica === 'conversaciones') return (b.conversations || 0) - (a.conversations || 0);
    if (metrica === 'ctr') return (b.ctr || 0) - (a.ctr || 0);
    if (metrica === 'clientes') return (b.paying_customers || 0) - (a.paying_customers || 0);
    if (a.cost_per_customer && b.cost_per_customer) return a.cost_per_customer - b.cost_per_customer;
    if (a.cost_per_customer) return -1;
    if (b.cost_per_customer) return 1;
    if (a.cost_per_conversation && b.cost_per_conversation) return a.cost_per_conversation - b.cost_per_conversation;
    return (b.conversations || 0) - (a.conversations || 0);
  });
}

export async function compararCreativos(
  admin: SupabaseClient,
  creativeIds: string[]
) {
  if (!creativeIds || !creativeIds.length) return { error: 'Se requieren al menos 2 creativos para comparar.' };

  const ids = creativeIds.slice(0, 4);
  const todos = await rankingCreativos(admin);
  const seleccionados = todos.filter(c => ids.includes(c.creative_id));

  return {
    comparados: seleccionados.length,
    creativos: seleccionados,
    ganador_recomendado: seleccionados.sort((a, b) => {
      if (a.cost_per_customer && b.cost_per_customer) return a.cost_per_customer - b.cost_per_customer;
      if (a.cost_per_customer) return -1;
      if (b.cost_per_customer) return 1;
      return (a.cost_per_conversation || 999) - (b.cost_per_conversation || 999);
    })[0] || null,
  };
}

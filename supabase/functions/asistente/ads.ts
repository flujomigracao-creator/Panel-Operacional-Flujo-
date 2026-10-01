// Módulo de Meta Ads para el Asistente de Inteligencia de Flujo de Migração.
// Integra lectura de métricas, análisis de rendimiento, límites de seguridad,
// generación de propuestas y ejecución determinista con auditoría.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const ORG_ID = '00000000-0000-0000-0000-000000000001';

// ── Períodos: convierte '7d' | '14d' | '30d' | 'all' o fechas ISO en un rango real ──
export interface AdsDateRange {
  desde?: string;
  hasta?: string;
  etiqueta: string;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

// "Hoy" en America/Sao_Paulo: el runtime de las Edge Functions vive en UTC, así que
// toISOString() devuelve ya mañana a partir de las 21:00 en Brasil (UTC-3) — el panel
// terminaba pidiendo `lte.2026-10-01` siendo todavía 2026-09-30. Mismo criterio que la
// fecha del prompt en index.ts.
const spDay = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);

/**
 * Resuelve el rango pedido por el panel o por el modelo a fechas ISO (America/Sao_Paulo).
 * Sin esto, el selector de período del Centro de Inteligencia no tenía ningún efecto.
 */
export function resolveAdsDateRange(input?: unknown, ahora: Date = new Date()): AdsDateRange {
  // Ancla al día de São Paulo a mediodía UTC: `setDate` sobre esa ancla nunca cruza de
  // calendario ni vuelve a introducir el desfase UTC.
  const hoy = new Date(`${spDay(ahora)}T12:00:00Z`);
  const dias = (n: number) => {
    const hasta = new Date(hoy);
    const desde = new Date(hoy);
    desde.setDate(desde.getDate() - (n - 1));
    return { desde: isoDay(desde), hasta: isoDay(hasta), etiqueta: `Últimos ${n} días` };
  };

  if (!input) return dias(7);
  if (typeof input === 'string') {
    const v = input.trim().toLowerCase();
    if (v === '7d' || v === '7') return dias(7);
    if (v === '14d' || v === '14') return dias(14);
    if (v === '30d' || v === '30' || v === 'mes' || v === 'este_mes') return dias(30);
    if (v === 'all' || v === 'todo') return { etiqueta: 'Todo el histórico' };
    return dias(7);
  }

  const obj = input as Record<string, unknown>;
  if (typeof obj.periodo === 'string') return resolveAdsDateRange(obj.periodo, ahora);
  const desde = typeof obj.desde === 'string' && obj.desde ? obj.desde : undefined;
  const hasta = typeof obj.hasta === 'string' && obj.hasta ? obj.hasta : undefined;
  if (desde && hasta) return { desde, hasta, etiqueta: `${desde} — ${hasta}` };
  if (desde) return { desde, hasta: isoDay(hoy), etiqueta: `${desde} — ${isoDay(hoy)}` };
  if (hasta) return { desde: dias(7).desde, hasta, etiqueta: `${dias(7).desde} — ${hasta}` };
  return dias(7);
}

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
  /** Clientes que efectivamente pagaron, solo si la atribución lo permite. */
  clients?: number;
  costPerConversation: number | null;
  costPerLead: number | null;
  /** Conversaciones / clics (calidad del tráfico). */
  conversationRate: number | null;
  /** Leads / conversaciones: qué proporción de las conversaciones es un lead real. */
  conversionRate: number | null;
  revenueAttributed?: number;
  roas?: number | null;
  /** Gasto / clientes que pagaron. Solo existe con atribución confirmada. */
  costPerClient?: number | null;
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
  clients?: number;
  revenueAttributed?: number;
  hasAttribution?: boolean;
}): AdsMetrics {
  const spend = Number(raw.spend) || 0;
  const impressions = Number(raw.impressions) || 0;
  const clicks = Number(raw.clicks) || 0;
  const conversations = Number(raw.conversations) || 0;
  const leads = Number(raw.leads) || 0;
  const clients = raw.clients !== undefined ? Number(raw.clients) : undefined;
  const revenueAttributed = raw.revenueAttributed !== undefined ? Number(raw.revenueAttributed) : undefined;

  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpc = clicks > 0 ? spend / clicks : 0;
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
  const costPerConversation = conversations > 0 ? spend / conversations : null;
  const costPerLead = leads > 0 ? spend / leads : null;
  const conversationRate = clicks > 0 ? (conversations / clicks) * 100 : null;
  // Solo se calcula si Meta reportó leads: sin ese dato no hay tasa de conversión honesta.
  const conversionRate = leads > 0 && conversations > 0 ? (leads / conversations) * 100 : null;
  const costPerClient = clients !== undefined && clients > 0 ? spend / clients : null;

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
    clients,
    costPerConversation: costPerConversation !== null ? Math.round(costPerConversation * 100) / 100 : null,
    costPerLead: costPerLead !== null ? Math.round(costPerLead * 100) / 100 : null,
    conversationRate: conversationRate !== null ? Math.round(conversationRate * 100) / 100 : null,
    conversionRate: conversionRate !== null ? Math.round(conversionRate * 100) / 100 : null,
    revenueAttributed: revenueAttributed !== undefined ? Math.round(revenueAttributed * 100) / 100 : undefined,
    roas: roas !== null ? Math.round(roas * 100) / 100 : null,
    costPerClient: costPerClient !== null ? Math.round(costPerClient * 100) / 100 : null,
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

// ── Estado actual de campañas / conjuntos / anuncios (persistencia en Supabase) ──
//
// Fuente de verdad del `status` y de los presupuestos: META GRAPH API (lado servidor).
// `meta_ads_insights` solo guarda métricas históricas, así que el estado se persiste aparte en
// `meta_ads_entities` (migración 20260930000002) y el frontend lo lee de ahí. Cuando Meta no
// respondió, el estado queda vacío (null): nunca se inventa 'ACTIVE'.

export interface MetaEntityRow {
  entity_type: 'campaign' | 'adset' | 'ad';
  entity_id: string;
  parent_id: string | null;
  name: string | null;
  status: string | null;
  effective_status: string | null;
  daily_budget: number | null;
  lifetime_budget: number | null;
  objective: string | null;
  account_id: string | null;
  creative_name: string | null;
  synced_at: string;
}

const META_ENTITY_COLS =
  'entity_type, entity_id, parent_id, name, status, effective_status, daily_budget, lifetime_budget, objective, account_id, creative_name, synced_at';

/** Lee la caché de entidades. Si la migración aún no está aplicada devuelve [] sin romper nada. */
export async function leerMetaEntidades(
  admin: SupabaseClient,
  tipo?: 'campaign' | 'adset' | 'ad'
): Promise<MetaEntityRow[]> {
  let q = admin.from('meta_ads_entities').select(META_ENTITY_COLS).limit(2000);
  if (tipo) q = q.eq('entity_type', tipo);
  const { data, error } = await q;
  if (error) return [];
  return (data || []) as MetaEntityRow[];
}

/**
 * Completa estado/presupuesto de las campañas con la última sincronización de Meta.
 * Solo rellena lo que faltaba: lo que acaba de llegar de la Graph API manda.
 */
async function aplicarEstadoPersistido(admin: SupabaseClient, campanas: AdsCampaign[]): Promise<AdsCampaign[]> {
  const entidades = await leerMetaEntidades(admin, 'campaign');
  if (!entidades.length) return campanas;
  const porId = new Map(entidades.map(e => [e.entity_id, e]));
  return campanas.map(c => {
    const e = porId.get(c.id);
    if (!e) return c;
    return {
      ...c,
      name: c.name || e.name || c.name,
      status: c.status || e.status || '',
      objective: c.objective || e.objective || undefined,
      daily_budget: c.daily_budget ?? (e.daily_budget ?? undefined),
      lifetime_budget: c.lifetime_budget ?? (e.lifetime_budget ?? undefined),
    } as AdsCampaign;
  });
}

/** Lectura directa de Meta SOLO para estado actual (sin insights: estado y presupuestos). */
async function leerEntidadesMeta(
  ruta: string,
  fields: string
): Promise<{ disponible: boolean; motivo?: string; datos: any[] }> {
  const { token } = getMetaConfig();
  if (!token) {
    return {
      disponible: false,
      motivo: 'Faltan las credenciales META_ADS_TOKEN / FB_ACCESS_TOKEN en los secretos de Supabase.',
      datos: [],
    };
  }
  try {
    const url = new URL(`https://graph.facebook.com/v20.0/${ruta}`);
    url.searchParams.set('fields', fields);
    url.searchParams.set('limit', '500');
    url.searchParams.set('access_token', token);
    const r = await fetch(url.toString());
    const json = await r.json().catch(() => ({}));
    if (!r.ok || json.error) {
      return { disponible: false, motivo: json?.error?.message || `Meta Graph API error (${r.status})`, datos: [] };
    }
    return { disponible: true, datos: json.data || [] };
  } catch (e) {
    return { disponible: false, motivo: e instanceof Error ? e.message : String(e), datos: [] };
  }
}

export interface MetaSyncResult {
  disponible: boolean;
  motivo?: string;
  campanas: number;
  conjuntos: number;
  anuncios: number;
  sincronizado_en: string | null;
}

/**
 * Sincroniza campañas, conjuntos y anuncios de la Graph API hacia `meta_ads_entities`.
 * Solo la Edge Function lo ejecuta (service_role): el frontend nunca habla con Meta.
 */
export async function syncMetaEntidades(admin: SupabaseClient): Promise<MetaSyncResult> {
  const { accountId } = getMetaConfig();
  const ahora = new Date().toISOString();
  const vacio = (motivo: string): MetaSyncResult => ({
    disponible: false, motivo, campanas: 0, conjuntos: 0, anuncios: 0, sincronizado_en: null,
  });
  if (!accountId) {
    return vacio('Faltan las credenciales META_ADS_TOKEN / META_AD_ACCOUNT_ID en los secretos de Supabase.');
  }

  const [campanas, conjuntos, anuncios] = await Promise.all([
    leerEntidadesMeta(`${accountId}/campaigns`, 'id,name,status,effective_status,daily_budget,lifetime_budget,objective,account_id'),
    leerEntidadesMeta(`${accountId}/adsets`, 'id,name,status,effective_status,daily_budget,lifetime_budget,campaign_id,account_id'),
    leerEntidadesMeta(`${accountId}/ads`, 'id,name,status,effective_status,adset_id,campaign_id,account_id,creative{id,name}'),
  ]);
  if (!(campanas.disponible || conjuntos.disponible || anuncios.disponible)) {
    return vacio(campanas.motivo || conjuntos.motivo || anuncios.motivo || 'Meta Graph API no respondió');
  }

  // La Graph API devuelve presupuestos en centavos: se guardan en BRL como en el resto del panel.
  const bzl = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v) / 100);
  const filas: Record<string, unknown>[] = [];
  for (const c of campanas.disponible ? campanas.datos : []) {
    filas.push({
      organization_id: ORG_ID, entity_type: 'campaign', entity_id: String(c.id), parent_id: null,
      name: c.name ?? null, status: c.status ?? null, effective_status: c.effective_status ?? null,
      daily_budget: bzl(c.daily_budget), lifetime_budget: bzl(c.lifetime_budget),
      objective: c.objective ?? null, account_id: c.account_id ?? accountId, synced_at: ahora,
    });
  }
  for (const s of conjuntos.disponible ? conjuntos.datos : []) {
    filas.push({
      organization_id: ORG_ID, entity_type: 'adset', entity_id: String(s.id),
      parent_id: s.campaign_id ? String(s.campaign_id) : null,
      name: s.name ?? null, status: s.status ?? null, effective_status: s.effective_status ?? null,
      daily_budget: bzl(s.daily_budget), lifetime_budget: bzl(s.lifetime_budget),
      objective: null, account_id: s.account_id ?? accountId, synced_at: ahora,
    });
  }
  for (const a of anuncios.disponible ? anuncios.datos : []) {
    filas.push({
      organization_id: ORG_ID, entity_type: 'ad', entity_id: String(a.id),
      parent_id: a.adset_id ? String(a.adset_id) : null,
      name: a.name ?? null, status: a.status ?? null, effective_status: a.effective_status ?? null,
      daily_budget: null, lifetime_budget: null, objective: null,
      account_id: a.account_id ?? accountId, creative_name: a.creative?.name ?? null, synced_at: ahora,
    });
  }
  if (!filas.length) return { disponible: true, campanas: 0, conjuntos: 0, anuncios: 0, sincronizado_en: null };

  const { error } = await admin.from('meta_ads_entities').upsert(filas, { onConflict: 'entity_type,entity_id' });
  if (error) return vacio(`No se pudo guardar meta_ads_entities: ${error.message}`);
  return {
    disponible: true,
    campanas: campanas.disponible ? campanas.datos.length : 0,
    conjuntos: conjuntos.disponible ? conjuntos.datos.length : 0,
    anuncios: anuncios.disponible ? anuncios.datos.length : 0,
    sincronizado_en: ahora,
  };
}

/** Conjuntos y anuncios desde la caché persistida (el dashboard no necesita llamar a Meta). */
export async function listarMetaEntidadesPersistidas(admin: SupabaseClient) {
  const [conjuntos, anuncios] = await Promise.all([leerMetaEntidades(admin, 'adset'), leerMetaEntidades(admin, 'ad')]);
  return { conjuntos, anuncios };
}

export async function fetchMetaCampaigns(
  admin: SupabaseClient,
  options: { dateRange?: { desde?: string; hasta?: string } } = {}
): Promise<AdsCampaign[]> {
  const { token, accountId } = getMetaConfig();
  const range = options.dateRange;
  const conRango = !!(range && (range.desde || range.hasta));

  // 1. Si hay token y cuenta configurados, consultar Graph API
  if (token && accountId) {
    try {
      const url = new URL(`https://graph.facebook.com/v20.0/${accountId}/campaigns`);
      // El período va dentro de la expansión de insights: sin esto todos los números eran históricos.
      const expansion = conRango
        ? `insights.time_range(${JSON.stringify({ since: range!.desde, until: range!.hasta })}){spend,impressions,clicks,actions,cpc,cpm,ctr}`
        : 'insights{spend,impressions,clicks,actions,cpc,cpm,ctr}';
      url.searchParams.set('fields', `id,name,status,objective,daily_budget,lifetime_budget,${expansion}`);
      url.searchParams.set('limit', '100');
      url.searchParams.set('access_token', token);

      const r = await fetch(url.toString());
      if (r.ok) {
        const json = await r.json();
        const data = json.data || [];
        // Sale de la Graph API; `aplicarEstadoPersistido` solo rellena lo que viniera vacío.
        const campanas = data.map((c: any) => {
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
        return aplicarEstadoPersistido(admin, campanas as AdsCampaign[]);
      }
    } catch {
      // Fallback a Supabase si la llamada a Graph API falla
    }
  }

  // 2. Fallback: tabla local `meta_ads_insights` (fuente única del panel).
  //
  // Esquema REAL (tabla creada fuera de este repo, columnas en español): fecha, campaign_id,
  // campaign_name, adset_id, ad_id, gasto, impresiones, clics, conversaciones, moneda,
  // organization_id. NO existen `date`, `spend`, `status`, `daily_budget` ni `leads`.
  // Un fallo aquí es un error real (sin permisos o esquema cambiado): se propaga en vez de
  // devolver [] y hacer creer al panel que "no hay datos" en el período.
  const { data: rows, error: errorInsights } = await admin
    .from('meta_ads_insights')
    .select('*')
    .order('fecha', { ascending: false });
  if (errorInsights) {
    throw new Error(`No se pudieron leer las métricas de meta_ads_insights: ${errorInsights.message}`);
  }

  // El período también filtra el fallback: si no, el selector del panel mentía.
  const dentro = (r: any) => {
    if (!conRango || !r?.fecha) return true;
    const dia = String(r.fecha).slice(0, 10);
    if (range!.desde && dia < range!.desde) return false;
    if (range!.hasta && dia > range!.hasta) return false;
    return true;
  };
  const periodo = (rows || []).filter(dentro);
  if (!periodo.length) return [];

  // Agrupar por campaña
  const porCampana: Record<string, { id: string; name: string; status: string; spend: number; impressions: number; clicks: number; conversations: number; leads: number; daily_budget?: number }> = {};
  for (const r of periodo) {
    const cid = r.campaign_id || r.campaign_name || 'unknown';
    if (!porCampana[cid]) {
      porCampana[cid] = {
        id: cid,
        name: r.campaign_name || 'Campaña sin nombre',
        // '' = estado desconocido: la tabla local no lo guarda y no se inventa 'ACTIVE'.
        status: r.status || '',
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversations: 0,
        leads: 0,
        daily_budget: r.daily_budget ? Number(r.daily_budget) : undefined,
      };
    }
    // Nombres reales de las columnas (en español). `leads` solo suma si la columna existe.
    porCampana[cid].spend += Number(r.gasto) || 0;
    porCampana[cid].impressions += Number(r.impresiones) || 0;
    porCampana[cid].clicks += Number(r.clics) || 0;
    porCampana[cid].conversations += Number(r.conversaciones) || 0;
    porCampana[cid].leads += Number(r.leads) || 0;
  }

  const desdeInsights = Object.values(porCampana).map(c => ({
    id: c.id,
    name: c.name,
    // '' = estado desconocido: la tabla histórica no lo guarda y no se inventa 'ACTIVE'.
    status: c.status,
    daily_budget: c.daily_budget,
    metrics: calculateAdsMetrics(c),
  })) as AdsCampaign[];
  // Sin credenciales de Meta, el estado y los presupuestos salen de la última sincronización
  // persistida en `meta_ads_entities`. Si tampoco hay caché, quedan sin dato (no inventados).
  return aplicarEstadoPersistido(admin, desdeInsights);
}

// ── Conjuntos de anuncios y anuncios (nivel de detalle que faltaba) ──
//
// Solo se leen de la Graph API: `meta_ads_insights` es a nivel de campaña, así que si no hay
// credenciales se devuelve "no disponible" en lugar de inventar números.

export interface AdsReadResult<T> {
  disponible: boolean;
  motivo?: string;
  periodo?: { desde?: string; hasta?: string };
  datos: T[];
}

const META_MESSAGING_ACTIONS = [
  'onsite_conversion.messaging_conversation_started_7d',
  'messaging_conversation_started_7d',
  'onsite_conversion.total_messaging_connection',
];

function metricsFromInsight(ins: any): AdsMetrics {
  const actions = ins?.actions || [];
  const convAction = actions.find((a: any) => META_MESSAGING_ACTIONS.includes(a.action_type));
  const leadAction = actions.find((a: any) => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped');
  return calculateAdsMetrics({
    spend: Number(ins?.spend) || 0,
    impressions: Number(ins?.impressions) || 0,
    clicks: Number(ins?.clicks) || 0,
    conversations: Number(convAction?.value) || 0,
    leads: Number(leadAction?.value) || 0,
  });
}

async function leerNivelMeta(
  ruta: string,
  fields: string,
  options: { dateRange?: { desde?: string; hasta?: string } },
  mapear: (nodo: any) => any
): Promise<{ disponible: boolean; motivo?: string; datos: any[] }> {
  const { token, accountId } = getMetaConfig();
  if (!token || !accountId) {
    return {
      disponible: false,
      motivo: 'Faltan las credenciales META_ADS_TOKEN / META_AD_ACCOUNT_ID en los secretos de Supabase.',
      datos: [],
    };
  }

  const range = options.dateRange;
  const conRango = !!(range && (range.desde || range.hasta));
  try {
    const url = new URL(`https://graph.facebook.com/v20.0/${ruta}`);
    const expansion = conRango
      ? `insights.time_range(${JSON.stringify({ since: range!.desde, until: range!.hasta })}){spend,impressions,clicks,actions}`
      : 'insights{spend,impressions,clicks,actions}';
    url.searchParams.set('fields', `${fields},${expansion}`);
    url.searchParams.set('limit', '200');
    url.searchParams.set('access_token', token);

    const r = await fetch(url.toString());
    const json = await r.json().catch(() => ({}));
    if (!r.ok || json.error) {
      return {
        disponible: false,
        motivo: json?.error?.message || `Meta Graph API error (${r.status})`,
        datos: [],
      };
    }
    return { disponible: true, datos: (json.data || []).map(mapear) };
  } catch (e) {
    return { disponible: false, motivo: e instanceof Error ? e.message : String(e), datos: [] };
  }
}

/** Conjuntos de anuncios (ad sets) de la cuenta o de una campaña concreta. */
export async function fetchMetaAdSets(
  options: { dateRange?: { desde?: string; hasta?: string }; campaignId?: string } = {}
): Promise<AdsReadResult<AdsAdSet>> {
  const ruta = options.campaignId ? `${options.campaignId}/adsets` : `${getMetaConfig().accountId}/adsets`;
  const res = await leerNivelMeta(
    ruta,
    'id,name,status,campaign_id,daily_budget,lifetime_budget',
    options,
    (n) => ({
      id: n.id,
      name: n.name,
      campaign_id: n.campaign_id,
      status: n.status,
      daily_budget: n.daily_budget ? Number(n.daily_budget) / 100 : undefined,
      metrics: metricsFromInsight(n.insights?.data?.[0]),
    })
  );
  return { ...res, periodo: options.dateRange, datos: res.datos };
}

/** Anuncios (creativos) de la cuenta, de una campaña o de un conjunto concreto. */
export async function fetchMetaAds(
  options: { dateRange?: { desde?: string; hasta?: string }; campaignId?: string; adsetId?: string } = {}
): Promise<AdsReadResult<AdsAd>> {
  const ruta = options.adsetId
    ? `${options.adsetId}/ads`
    : options.campaignId
    ? `${options.campaignId}/ads`
    : `${getMetaConfig().accountId}/ads`;
  const res = await leerNivelMeta(
    ruta,
    'id,name,status,adset_id,campaign_id,creative{id,name}',
    options,
    (n) => ({
      id: n.id,
      name: n.name,
      adset_id: n.adset_id,
      campaign_id: n.campaign_id,
      status: n.status,
      creative_name: n.creative?.name,
      metrics: metricsFromInsight(n.insights?.data?.[0]),
    })
  );
  return { ...res, periodo: options.dateRange, datos: res.datos };
}

// ── Comparación de períodos (ej. últimos 7 días vs 7 días anteriores) ──
export async function compareMetaAdsPeriods(
  admin: SupabaseClient,
  actualRange?: { desde?: string; hasta?: string },
  previoRange?: { desde?: string; hasta?: string }
) {
  // El período anterior se deriva si no viene explícito: mismo tamaño, justo antes.
  const siete = resolveAdsDateRange('7d');
  const pedido = resolveAdsDateRange(actualRange || '7d');
  const actual = pedido.desde && pedido.hasta
    ? { desde: pedido.desde, hasta: pedido.hasta }
    : { desde: siete.desde!, hasta: siete.hasta! };

  let previo: { desde: string; hasta: string };
  if (previoRange?.desde && previoRange?.hasta) {
    previo = { desde: previoRange.desde, hasta: previoRange.hasta };
  } else {
    const dia = 86_400_000;
    const finActual = new Date(`${actual.hasta}T00:00:00Z`).getTime();
    const iniActual = new Date(`${actual.desde}T00:00:00Z`).getTime();
    const dias = Math.max(1, Math.round((finActual - iniActual) / dia) + 1);
    const finPrevio = finActual - dia;
    previo = {
      desde: new Date(finPrevio - (dias - 1) * dia).toISOString().slice(0, 10),
      hasta: new Date(finPrevio).toISOString().slice(0, 10),
    };
  }

  const campaignsActual = await fetchMetaCampaigns(admin, { dateRange: actual });
  const campaignsPrevio = await fetchMetaCampaigns(admin, { dateRange: previo });

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
    periodo_actual: { rango: actual, metricas: metActual },
    periodo_previo: { rango: previo, metricas: metPrevio },
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
export async function analyzeMetaAds(
  admin: SupabaseClient,
  options: { dateRange?: { desde?: string; hasta?: string }; incluirAnuncios?: boolean } = {}
) {
  const campaigns = await fetchMetaCampaigns(admin, { dateRange: options.dateRange });

  if (!campaigns.length) {
    return {
      estado: 'sin_datos',
      resumen: 'No hay campañas activas o métricas registradas en el período seleccionado.',
      periodo: options.dateRange || null,
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

  // ── Nivel de anuncio: detecta creativos que gastan sin generar conversaciones ──
  // Solo cuando hay credenciales; si no, se declara la limitación en lugar de suponer.
  const datos_anuncios: Record<string, unknown> = { disponible: false };
  if (options.incluirAnuncios) {
    const anuncios = await fetchMetaAds({ dateRange: options.dateRange });
    datos_anuncios.disponible = anuncios.disponible;
    if (!anuncios.disponible) {
      datos_anuncios.motivo = anuncios.motivo;
    } else {
      datos_anuncios.total = anuncios.datos.length;
      for (const a of anuncios.datos) {
        if (a.metrics.spend >= 20 && a.metrics.conversations === 0) {
          hallazgos.push({
            tipo: 'alerta',
            titulo: `Anuncio sin conversaciones: "${a.name}"`,
            detalle: `Gastó R$ ${a.metrics.spend.toFixed(2)} con ${a.metrics.impressions} impresiones y 0 conversaciones iniciadas.`,
            campana_id: a.campaign_id,
          });
          recomendaciones.push({
            accion_propuesta: `revisar_anuncio_${a.id}`,
            motivo: `Revisar o pausar el creativo "${a.name}": está consumiendo presupuesto sin generar conversaciones.`,
            impacto: `Hasta R$ ${a.metrics.spend.toFixed(2)} del período.`,
            campana_id: a.campaign_id,
          });
        }
      }
    }
  }

  const cpcPromedio = convTotal > 0 ? gastoTotal / convTotal : null;
  const mejor = campaigns
    .filter(c => c.metrics.conversations > 0 && c.metrics.costPerConversation !== null)
    .sort((a, b) => (a.metrics.costPerConversation as number) - (b.metrics.costPerConversation as number))[0];

  return {
    estado: 'analizado',
    periodo: options.dateRange || null,
    metricas_globales: {
      gasto_total: Math.round(gastoTotal * 100) / 100,
      conversaciones_totales: convTotal,
      costo_promedio_conversacion: cpcPromedio !== null ? Math.round(cpcPromedio * 100) / 100 : null,
      campanas_activas: campaigns.some(c => c.status)
        ? campaigns.filter(c => c.status === 'ACTIVE').length
        // '' = estado desconocido (fallback local sin columna de estado): no se cuenta.
        : null,
      // Se calcula aquí para no repetir el ordenamiento en el frontend ni en el prompt.
      campana_mas_eficiente: mejor ? { id: mejor.id, nombre: mejor.name, costo_por_conversacion: mejor.metrics.costPerConversation } : null,
    },
    campanas: campaigns,
    anuncios: datos_anuncios,
    hallazgos,
    recomendaciones,
  };
}

// ── Atribución Comercial (Meta Ads -> Leads -> Trámites -> Cobros) ──
//
// Regla: no se afirma que un lead vino de Meta si no hay evidencia (`lead_source` o
// `meta_ads_referidos`). Cuando solo hay correlación, se marca como 'estimada'.
const FUENTES_META = /(^|[^a-z])(meta|facebook|instagram|fb|ig|messenger|paid_?social)([^a-z]|$)/i;

// ── Atribución real de referidos (meta_ads_referidos) ──
//
// La tabla NO tiene `created_at` ni `campaign_id`: solo `ad_id` y el payload crudo del webhook
// (`raw`/`body`). Por eso no se filtra por fecha en SQL ni se reparte "a ojo":
//   - la fecha sale del propio payload (`created_time`), y si no hay fecha el referido queda
//     fuera del período del corte (no se inventa que sea de hoy);
//   - la campaña sale del payload o de cruzar `ad_id` con `meta_ads_insights`;
//   - lo que no se puede determinar queda como "no atribuido".

const parseJson = (v: unknown): any => {
  if (v && typeof v === 'object') return v;
  if (typeof v === 'string' && v.trim().startsWith('{')) {
    try { return JSON.parse(v); } catch { return null; }
  }
  return null;
};

const fechaDePayload = (payload: any): string | null => {
  if (!payload) return null;
  const bruto = payload.created_time ?? payload.created_at ?? payload.entry_time ?? payload.timestamp;
  if (bruto === null || bruto === undefined || bruto === '') return null;
  const d = new Date(typeof bruto === 'number' ? bruto * 1000 : bruto);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

const dentroDeRango = (dia: string, rango?: { desde?: string; hasta?: string }) => {
  if (!rango || (!rango.desde && !rango.hasta)) return true;
  if (rango.desde && dia < rango.desde) return false;
  if (rango.hasta && dia > rango.hasta) return false;
  return true;
};

/** campaign_id de un referido: primero el payload, luego el cruce real ad_id → campaign_id. */
const campanaDeReferido = (payload: any, adId: string | null, mapa: Map<string, string>): string | null => {
  const directo = payload?.campaign_id ?? payload?.campaign?.id ?? payload?.adset?.campaign_id ?? payload?.campaign;
  if (directo !== undefined && directo !== null && String(directo).trim() !== '') return String(directo);
  if (adId && mapa.has(adId)) return mapa.get(adId)!;
  return null;
};

/** Mapa ad_id → campaign_id tomado de datos reales (`meta_ads_insights` y la caché de Meta). */
async function mapaAdACampana(admin: SupabaseClient): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const { data: insights } = await admin.from('meta_ads_insights').select('ad_id, campaign_id').limit(5000);
  for (const r of insights || []) {
    if (r?.ad_id && r?.campaign_id && !mapa.has(String(r.ad_id))) mapa.set(String(r.ad_id), String(r.campaign_id));
  }
  const entidades = await leerMetaEntidades(admin);
  const adsetACampana = new Map<string, string>();
  for (const e of entidades) {
    if (e.entity_type === 'adset' && e.parent_id) adsetACampana.set(e.entity_id, e.parent_id);
  }
  for (const e of entidades) {
    if (e.entity_type !== 'ad' || !e.parent_id) continue;
    const campana = adsetACampana.get(e.parent_id);
    if (campana && !mapa.has(e.entity_id)) mapa.set(e.entity_id, campana);
  }
  return mapa;
}

export interface ReferidosResumen {
  disponible: boolean;
  total: number;
  por_campana: Record<string, number>;
  sin_campana: number;
  fuera_de_periodo: number;
  sin_fecha: number;
}

/** Lee `meta_ads_referidos` y reparte los referidos por campaña solo con evidencia real. */
export async function leerReferidosAtribuidos(
  admin: SupabaseClient,
  dateRange?: { desde?: string; hasta?: string }
): Promise<ReferidosResumen> {
  const vacio: ReferidosResumen = { disponible: false, total: 0, por_campana: {}, sin_campana: 0, fuera_de_periodo: 0, sin_fecha: 0 };
  const { data: filas, error } = await admin
    .from('meta_ads_referidos')
    .select('ad_id, raw, body')
    .limit(1000);
  if (error) return vacio;

  const mapa = await mapaAdACampana(admin);
  const porCampana: Record<string, number> = {};
  let total = 0;
  let sinCampana = 0;
  let fueraDePeriodo = 0;
  let sinFecha = 0;

  for (const f of filas || []) {
    const payload = parseJson((f as any)?.raw) ?? parseJson((f as any)?.body);
    const dia = fechaDePayload(payload);
    if (!dia) sinFecha++;
    else if (!dentroDeRango(dia, dateRange)) { fueraDePeriodo++; continue; }

    const campana = campanaDeReferido(payload, (f as any)?.ad_id ? String((f as any).ad_id) : null, mapa);
    if (campana) {
      porCampana[campana] = (porCampana[campana] || 0) + 1;
      total++;
    } else {
      sinCampana++;
    }
  }
  return { disponible: true, total, por_campana: porCampana, sin_campana: sinCampana, fuera_de_periodo: fueraDePeriodo, sin_fecha: sinFecha };
}

export async function getMetaAdsAttribution(
  admin: SupabaseClient,
  dateRange?: { desde?: string; hasta?: string }
) {
  const conRango = !!(dateRange && (dateRange.desde || dateRange.hasta));

  // Leads comerciales: el período se aplica sobre la última actividad del lead.
  let consultaLeads = admin
    .from('comercial_leads')
    .select('id, nombre, tramite_texto, precio, etapa_nombre, client_id, lead_source, updated_at')
    .order('updated_at', { ascending: false })
    .limit(500);
  if (conRango) {
    if (dateRange!.desde) consultaLeads = consultaLeads.gte('updated_at', `${dateRange!.desde}T00:00:00`);
    if (dateRange!.hasta) consultaLeads = consultaLeads.lte('updated_at', `${dateRange!.hasta}T23:59:59`);
  }
  const { data: leads } = await consultaLeads;

  // Pagos cobrados dentro del período.
  let consultaPagos = admin
    .from('payments')
    .select('amount, paid_at, client_id')
    .eq('status', 'paid');
  if (conRango) {
    if (dateRange!.desde) consultaPagos = consultaPagos.gte('paid_at', `${dateRange!.desde}T00:00:00`);
    if (dateRange!.hasta) consultaPagos = consultaPagos.lte('paid_at', `${dateRange!.hasta}T23:59:59`);
  }
  const { data: pagos } = await consultaPagos;

  // Evidencia de atribución real: referidos de Meta Ads repartidos por campaña SOLO cuando hay
  // datos que lo permitan (payload del webhook o cruce ad_id → campaign_id).
  const referidosResumen = await leerReferidosAtribuidos(admin, conRango ? dateRange : undefined);
  const referidos = referidosResumen.total;
  const referidosDisponible = referidosResumen.disponible;

  const listaLeads = leads || [];
  const listaPagos = pagos || [];
  const totalCobrado = listaPagos.reduce((acc, p) => acc + Number(p.amount || 0), 0);
  // Leads comerciales con origen declarado de Meta: evidencia de procedência, no de campaña.
  const leadsDeMeta = listaLeads.filter(l => FUENTES_META.test(String((l as any).lead_source || ''))).length;
  const clientesQuePagaron = new Set(listaPagos.map(p => (p as any).client_id).filter(Boolean)).size;

  // Inversión del mismo período, para poder hablar de ROAS con el mismo corte de fechas.
  const campanas = await fetchMetaCampaigns(admin, { dateRange });
  const inversion = campanas.reduce((acc, c) => acc + c.metrics.spend, 0);
  const conversaciones = campanas.reduce((acc, c) => acc + c.metrics.conversations, 0);

  const red = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);
  const hayDatos = listaLeads.length > 0 || listaPagos.length > 0;
  const atribucionEstado: 'confirmada' | 'estimada' | 'no_disponible' =
    referidos > 0 || leadsDeMeta > 0 ? 'confirmada' : hayDatos ? 'estimada' : 'no_disponible';

  return {
    periodo: dateRange || null,
    leads_analizados: listaLeads.length,
    leads_de_meta_confirmados: leadsDeMeta,
    referidos_registrados: referidos,
    meta_ads_referidos_disponible: referidosDisponible,
    // Categorías separadas (un lead comercial nunca se cuenta como lead de Meta):
    //   - comerciales: todos los leads del CRM;
    //   - atribuidos_meta: referidos de Meta Ads con campaña determinable por evidencia real;
    //   - declarados_origen_meta: leads cuyo lead_source dice Meta, sin campaña identificable;
    //   - no_atribuidos: el resto.
    leads: {
      comerciales: listaLeads.length,
      atribuidos_meta: referidos,
      declarados_origen_meta: leadsDeMeta,
      no_atribuidos: Math.max(0, listaLeads.length - leadsDeMeta),
    },
    referidos_por_campana: referidosResumen.por_campana,
    referidos_sin_campana: referidosResumen.sin_campana,
    fuentes: {
      metricas_historicas: 'meta_ads_insights',
      estado_presupuesto: 'meta_ads_entities (sincronizado desde Meta Graph API)',
      referidos: 'meta_ads_referidos',
      leads_comerciales: 'comercial_leads',
      pagos: 'payments',
    },
    leads_en_propuesta_o_pago: listaLeads.filter(l => /propuesta|pago/i.test(String(l.etapa_nombre || ''))).length,
    clientes_que_pagaron: clientesQuePagaron,
    ingresos_totales_registrados: Math.round(totalCobrado * 100) / 100,
    inversion_periodo: red(inversion),
    conversaciones_periodo: conversaciones,
    // ROAS global del negocio en el período. NO es ROAS por campaña: para eso haría falta
    // atribución por anuncio, que hoy no existe.
    roas_global_estimado: inversion > 0 ? red(totalCobrado / inversion) : null,
    costo_por_lead_global: red(listaLeads.length > 0 ? inversion / listaLeads.length : null),
    costo_por_cliente_global: clientesQuePagaron > 0 ? red(inversion / clientesQuePagaron) : null,
    atribucion_estado: atribucionEstado,
    nota: atribucionEstado === 'confirmada'
      ? 'Hay evidencia de procedencia (lead_source de Meta o registros en meta_ads_referidos); el ROAS sigue siendo global, no por campaña.'
      : 'No hay evidencia de atribución por anuncio. Los cruces son correlación del período, no atribución confirmada.',
  };
}

// ── Herramientas de Meta Ads para Groq LLM (Tools Definitions) ──

const str = (description: string) => ({ type: 'string', description });
const num = (description: string) => ({ type: 'number', description });
const bool = (description: string) => ({ type: 'boolean', description });

export const ADS_TOOL_DEFS = [
  {
    type: 'function',
    function: {
      name: 'listar_campanas_ads',
      description: 'Lista las campañas de Meta Ads con su estado, presupuesto diario, gasto, impresiones, clics, CTR, CPC, conversaciones y costo por conversación para el período pedido.',
      parameters: {
        type: 'object',
        properties: {
          periodo: { type: 'string', enum: ['7d', '14d', '30d', 'all'], description: 'Atajo de período (por defecto 7d)' },
          desde: str('Fecha inicio YYYY-MM-DD (si viene junto a hasta, reemplaza al atajo periodo)'),
          hasta: str('Fecha fin YYYY-MM-DD'),
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'analizar_rendimiento_ads',
      description: 'Analiza a fondo el rendimiento publicitario de Meta Ads: detecta fugas de gasto, campañas con mejor y peor costo por conversación, creativos que gastan sin conversaciones, alertas y recomendaciones accionables con números reales.',
      parameters: {
        type: 'object',
        properties: {
          periodo: { type: 'string', enum: ['7d', '14d', '30d', 'all'], description: 'Atajo de período (por defecto 7d)' },
          desde: str('Fecha inicio YYYY-MM-DD'),
          hasta: str('Fecha fin YYYY-MM-DD'),
          incluir_anuncios: bool('Analizar también el nivel de anuncio/creativo (por defecto true)'),
        },
        required: [],
      },
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
      name: 'listar_conjuntos_ads',
      description: 'Lista los conjuntos de anuncios (ad sets) de Meta Ads con presupuesto, gasto, clics y conversaciones. Si no hay credenciales de Meta configuradas, responde que el dato no está disponible (nunca inventa números).',
      parameters: {
        type: 'object',
        properties: {
          campaign_id: str('ID de la campaña para filtrar (opcional)'),
          desde: str('Fecha inicio YYYY-MM-DD (opcional)'),
          hasta: str('Fecha fin YYYY-MM-DD (opcional)'),
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listar_anuncios_ads',
      description: 'Lista los anuncios (creativos) de Meta Ads con estado, gasto, clics, CTR y conversaciones, para detectar creativos que consumen presupuesto sin generar resultados.',
      parameters: {
        type: 'object',
        properties: {
          campaign_id: str('ID de la campaña para filtrar (opcional)'),
          adset_id: str('ID del conjunto de anuncios para filtrar (opcional)'),
          desde: str('Fecha inicio YYYY-MM-DD (opcional)'),
          hasta: str('Fecha fin YYYY-MM-DD (opcional)'),
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
          estado_anterior: { type: 'string', enum: ['ACTIVE', 'PAUSED'], description: 'Estado actual conocido (opcional, para la auditoría)' },
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
      name: 'proponer_cambiar_presupuesto_conjunto',
      description: 'Propone modificar el presupuesto diario de un conjunto de anuncios (ad set), dentro de los límites de seguridad. Requiere confirmación del usuario antes de ejecutarse en Meta.',
      parameters: {
        type: 'object',
        properties: {
          adset_id: str('ID del conjunto de anuncios en Meta Ads'),
          nombre_conjunto: str('Nombre del conjunto de anuncios'),
          campaign_id: str('ID de la campaña a la que pertenece (opcional)'),
          nombre_campana: str('Nombre de la campaña (opcional)'),
          presupuesto_actual: num('Presupuesto diario actual en BRL'),
          nuevo_presupuesto: num('Nuevo presupuesto diario propuesto en BRL'),
          motivo: str('Motivo del ajuste fundamentado en datos'),
        },
        required: ['adset_id', 'nombre_conjunto', 'presupuesto_actual', 'nuevo_presupuesto', 'motivo'],
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

  // Período pedido por el modelo: fechas explícitas o atajo ('7d', '30d'...).
  const rangoDe = (a: any) =>
    a?.desde || a?.hasta
      ? { desde: a.desde as string | undefined, hasta: a.hasta as string | undefined }
      : resolveAdsDateRange(a?.periodo || '7d');

  switch (name) {
    case 'listar_campanas_ads': {
      const dateRange = rangoDe(args);
      const campanas = await fetchMetaCampaigns(ctx.admin, { dateRange });
      if (!campanas.length) {
        return JSON.stringify({
          mensaje: 'No se encontraron campañas configuradas en Meta Ads o datos sincronizados para el período.',
          periodo: dateRange,
          campanas: [],
        });
      }
      return JSON.stringify({ periodo: dateRange, campanas });
    }

    case 'analizar_rendimiento_ads': {
      const dateRange = rangoDe(args);
      const anal = await analyzeMetaAds(ctx.admin, {
        dateRange,
        incluirAnuncios: args?.incluir_anuncios !== false,
      });
      return JSON.stringify(anal);
    }

    case 'listar_conjuntos_ads': {
      const dateRange = rangoDe(args);
      const res = await fetchMetaAdSets({ dateRange, campaignId: args?.campaign_id || undefined });
      if (!res.disponible) {
        return JSON.stringify({
          disponible: false,
          motivo: res.motivo,
          mensaje: 'Datos no disponibles: no se pudo leer el nivel de conjuntos de anuncios en Meta.',
        });
      }
      return JSON.stringify({ disponible: true, periodo: dateRange, conjuntos: res.datos });
    }

    case 'listar_anuncios_ads': {
      const dateRange = rangoDe(args);
      const res = await fetchMetaAds({
        dateRange,
        campaignId: args?.campaign_id || undefined,
        adsetId: args?.adset_id || undefined,
      });
      if (!res.disponible) {
        return JSON.stringify({
          disponible: false,
          motivo: res.motivo,
          mensaje: 'Datos no disponibles: no se pudo leer el nivel de anuncios en Meta.',
        });
      }
      return JSON.stringify({ disponible: true, periodo: dateRange, anuncios: res.datos });
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
      const dateRange = args?.desde || args?.hasta ? { desde: args.desde, hasta: args.hasta } : undefined;
      const atrib = await getMetaAdsAttribution(ctx.admin, dateRange);
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
            estado_anterior: args.estado_anterior ?? null,
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

    case 'proponer_cambiar_presupuesto_conjunto': {
      const act = Number(args.presupuesto_actual) || 0;
      const nue = Number(args.nuevo_presupuesto) || 0;
      const diffPct = act > 0 ? Math.round(((nue - act) / act) * 100) : 0;
      const signo = diffPct >= 0 ? `+${diffPct}%` : `${diffPct}%`;

      // La propuesta se valida antes de crearse: el usuario solo confirma lo que ya cabe en los límites.
      const validacion = validateAdsOperation(
        { tipo: 'cambiar_presupuesto_adset', presupuestoActual: act, presupuestoNuevo: nue },
        limits
      );
      if (!validacion.valid) throw new Error(validacion.error);

      const resumen = `Ajustar presupuesto del conjunto "${args.nombre_conjunto}" de R$ ${act.toFixed(2)}/día a R$ ${nue.toFixed(2)}/día (${signo}): ${args.motivo}`;

      const { data: prop, error } = await ctx.admin
        .from('ai_proposals')
        .insert({
          organization_id: ORG_ID,
          user_id: ctx.userId,
          ai_conversation_id: ctx.conversationId,
          tipo: 'ads_cambiar_presupuesto_adset',
          payload: {
            adset_id: args.adset_id,
            nombre_conjunto: args.nombre_conjunto,
            campaign_id: args.campaign_id || null,
            nombre_campana: args.nombre_campana || null,
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
        details: {
          proposal_id: p.id,
          executed_by: userId,
          accion: 'ads_cambiar_estado_campana',
          campana: { id: d.campaign_id, nombre: d.nombre_campana || null },
          estado_anterior: d.estado_anterior ?? null,
          estado_nuevo: d.nuevo_estado,
          motivo: d.motivo || null,
          resultado: 'ok',
          meta_response: data,
        },
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
        details: {
          proposal_id: p.id,
          executed_by: userId,
          accion: 'ads_cambiar_presupuesto_campana',
          campana: { id: d.campaign_id, nombre: d.nombre_campana || null },
          valor_anterior: d.presupuesto_actual,
          valor_nuevo: d.nuevo_presupuesto,
          cambio_porcentual: d.cambio_porcentual ?? null,
          motivo: d.motivo || null,
          resultado: 'ok',
        },
      });

      return {
        ok: true,
        campaign_id: d.campaign_id,
        presupuesto_anterior: d.presupuesto_actual,
        nuevo_presupuesto: d.nuevo_presupuesto,
        meta_success: true,
      };
    }

    case 'ads_cambiar_presupuesto_adset': {
      // Mismo contrato que el presupuesto de campaña, pero sobre el conjunto de anuncios.
      const validacion = validateAdsOperation(
        { tipo: 'cambiar_presupuesto_adset', presupuestoActual: d.presupuesto_actual, presupuestoNuevo: d.nuevo_presupuesto },
        limits
      );
      if (!validacion.valid) {
        throw new Error(`Ejecución cancelada por seguridad: ${validacion.error}`);
      }
      if (!token) {
        throw new Error('No se pudo ejecutar en Meta: Falta configurar el secreto META_ADS_TOKEN en Supabase.');
      }

      const cents = Math.round(Number(d.nuevo_presupuesto) * 100);
      const url = `https://graph.facebook.com/v20.0/${d.adset_id}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daily_budget: cents, access_token: token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        const errorMsg = data.error?.message || `Meta API error (${res.status})`;
        throw new Error(`Meta rechazó el cambio de presupuesto del conjunto: ${errorMsg}`);
      }

      await admin.from('automation_runs').insert({
        organization_id: ORG_ID,
        workflow: 'asistente_meta_ads',
        ref: p.tipo,
        ok: true,
        message: `Presupuesto del conjunto ${d.adset_id} ajustado a R$ ${d.nuevo_presupuesto}/día`,
        details: {
          proposal_id: p.id,
          executed_by: userId,
          accion: 'ads_cambiar_presupuesto_adset',
          conjunto: { id: d.adset_id, nombre: d.nombre_conjunto || null },
          campana: { id: d.campaign_id || null, nombre: d.nombre_campana || null },
          valor_anterior: d.presupuesto_actual,
          valor_nuevo: d.nuevo_presupuesto,
          cambio_porcentual: d.cambio_porcentual ?? null,
          motivo: d.motivo || null,
          resultado: 'ok',
        },
      });

      return {
        ok: true,
        adset_id: d.adset_id,
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
        details: {
          proposal_id: p.id,
          executed_by: userId,
          accion: 'ads_crear_campana',
          campana: { id: data.id, nombre: d.nombre },
          objetivo: d.objetivo || null,
          valor_nuevo: d.presupuesto_diario,
          estado_inicial: 'PAUSED',
          motivo: d.motivo || null,
          resultado: 'ok',
        },
      });

      return { ok: true, meta_id: data.id, nombre: d.nombre, estado_inicial: 'PAUSED' };
    }

    default:
      throw new Error(`Tipo de propuesta de Ads desconocido: ${p.tipo}`);
  }
}

// Módulo de Meta Ads para el Asistente de Inteligencia de Flujo de Migração.
// Integra lectura de métricas, análisis de rendimiento, límites de seguridad,
// generación de propuestas y ejecución determinista con auditoría.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  analizarFunnelCompleto,
  consultarAprendizajes,
  proponerExperimentoV4,
  medirExperimentoV4,
  listarExperimentosV4,
} from './campaign_science.ts';
import {
  rankingCreativos,
  biblioteca,
  proponerPublicacion,
  crearExperimentoCreativos,
  cerrarExperimentoCreativos,
  publicarCreativoEnMeta,
} from './creatives.ts';
import { crearCreativo, generarPrompt, proponerConceptos } from '../_shared/creative_store.ts';
import { buscarTendencias, listarTendencias } from '../_shared/trends.ts';

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

export function getMetaConfig() {
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

/** Versión de la Graph API que ya usa el proyecto (no cambiarla sin motivo). */
export const META_GRAPH_VERSION = 'v20.0';

export interface MetaLectura {
  disponible: boolean;
  endpoint: string;
  http_status: number | null;
  mensaje?: string;
  motivo?: string;
  paginas: number;
  datos: any[];
}

/**
 * Lee una colección de la Graph API siguiendo la paginación (`paging.next`).
 * Meta devuelve las campañas en varias páginas: sin esto la sincronización se quedaría
 * con la primera tanda y el resto de campañas nunca se guardaría.
 */
async function leerEntidadesMeta(ruta: string, fields: string): Promise<MetaLectura> {
  const { token } = getMetaConfig();
  const endpoint = `${META_GRAPH_VERSION}/${ruta}`;
  if (!token) {
    return {
      disponible: false,
      endpoint,
      http_status: null,
      mensaje: 'Faltan las credenciales META_ADS_TOKEN / FB_ACCESS_TOKEN en los secretos de Supabase.',
      motivo: 'sin_credenciales',
      paginas: 0,
      datos: [],
    };
  }

  const datos: any[] = [];
  let paginas = 0;
  let status: number | null = null;
  let url: string | null =
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${ruta}` +
    `?fields=${encodeURIComponent(fields)}&limit=500&access_token=${encodeURIComponent(token)}`;

  try {
    while (url) {
      if (paginas >= 25) break; // tope de seguridad: nadie tiene 12.500 campañas en una cuenta
      const r: Response = await fetch(url);
      status = r.status;
      const json: any = await r.json().catch(() => ({}));
      if (!r.ok || json?.error) {
        return {
          disponible: false,
          endpoint,
          http_status: r.status,
          mensaje: json?.error?.message || `Meta Graph API respondió ${r.status}`,
          motivo: 'error_graph_api',
          paginas,
          datos,
        };
      }
      datos.push(...(json.data || []));
      paginas++;
      // Solo se sigue el `next` que devuelve Meta (ya incluye el token de la propia respuesta).
      const next: unknown = json.paging?.next;
      url = typeof next === 'string' && next.startsWith('https://graph.facebook.com/') ? next : null;
    }
    return { disponible: true, endpoint, http_status: status, paginas, datos };
  } catch (e) {
    return {
      disponible: false,
      endpoint,
      http_status: status,
      mensaje: e instanceof Error ? e.message : String(e),
      motivo: 'excepcion',
      paginas,
      datos,
    };
  }
}

/** Error de una lectura de la Graph API (endpoint + código HTTP + mensaje), para la bitácora. */
export interface MetaSyncError {
  endpoint: string | null;
  http_status: number | null;
  mensaje: string;
}

/**
 * Bitácora de sincronizaciones (`meta_ads_sync_log`). Se escribe SIEMPRE, también cuando
 * Meta falla: así el panel puede decir "no se pudo sincronizar" y la fecha del último acierto
 * sin borrar los datos válidos que ya había.
 */
export async function registrarSync(
  admin: SupabaseClient,
  datos: {
    ok: boolean;
    account_id?: string | null;
    errores?: MetaSyncError[];
    campanas?: number;
    conjuntos?: number;
    anuncios?: number;
    iniciado_en: string;
  }
) {
  const fin = new Date().toISOString();
  const { error } = await admin.from('meta_ads_sync_log').insert({
    organization_id: ORG_ID,
    account_id: datos.account_id || null,
    ok: datos.ok,
    campanas: datos.campanas || 0,
    conjuntos: datos.conjuntos || 0,
    anuncios: datos.anuncios || 0,
    errores: datos.errores || [],
    iniciado_en: datos.iniciado_en,
    terminado_en: fin,
  });
  if (error) console.error('[Meta Ads sync] no se pudo escribir meta_ads_sync_log:', error.message);
}

/** Último intento de sincronización registrado (lo usa el dashboard). */
export async function leerUltimaSincronizacion(admin: SupabaseClient) {
  const { data } = await admin
    .from('meta_ads_sync_log')
    .select('ok, account_id, campanas, conjuntos, anuncios, errores, iniciado_en, terminado_en')
    .order('iniciado_en', { ascending: false })
    .limit(1);
  return (data || [])[0] || null;
}

export interface MetaSyncResult {
  disponible: boolean;
  motivo?: string;
  account_id: string | null;
  endpoint: string | null;
  http_status: number | null;
  errores: MetaSyncError[];
  paginas: number;
  campanas: number;
  conjuntos: number;
  anuncios: number;
  iniciado_en: string;
  sincronizado_en: string | null;
}

/**
 * Sincroniza campañas, conjuntos y anuncios de la Graph API hacia `meta_ads_entities`.
 * Solo la Edge Function lo ejecuta (service_role): el frontend nunca habla con Meta.
 */
export async function syncMetaEntidades(admin: SupabaseClient): Promise<MetaSyncResult> {
  const { accountId } = getMetaConfig();
  const iniciadoEn = new Date().toISOString();
  const vacio = (motivo: string, endpoint: string | null = null, http: number | null = null): MetaSyncResult => ({
    disponible: false,
    motivo,
    account_id: accountId || null,
    endpoint,
    http_status: http,
    errores: [{ endpoint, http_status: http, mensaje: motivo }],
    paginas: 0,
    campanas: 0,
    conjuntos: 0,
    anuncios: 0,
    iniciado_en: iniciadoEn,
    sincronizado_en: null,
  });
  if (!accountId) {
    const r = vacio('Faltan las credenciales META_ADS_TOKEN / META_AD_ACCOUNT_ID en los secretos de Supabase.');
    await registrarSync(admin, { ok: false, account_id: null, errores: r.errores, iniciado_en: iniciadoEn });
    return r;
  }

  const [campanas, conjuntos, anuncios] = await Promise.all([
    leerEntidadesMeta(`${accountId}/campaigns`, 'id,name,status,effective_status,daily_budget,lifetime_budget,objective,account_id'),
    leerEntidadesMeta(`${accountId}/adsets`, 'id,name,status,effective_status,daily_budget,lifetime_budget,campaign_id,account_id'),
    leerEntidadesMeta(`${accountId}/ads`, 'id,name,status,effective_status,adset_id,campaign_id,account_id,creative{id,name}'),
  ]);

  const lecturas = [campanas, conjuntos, anuncios];
  const fallos: MetaSyncError[] = lecturas
    .filter(l => !l.disponible)
    .map(l => ({ endpoint: l.endpoint, http_status: l.http_status, mensaje: l.mensaje || l.motivo || 'error desconocido' }));

  // Si falló TODO, no se toca la caché: el panel sigue viendo el último estado válido.
  if (fallos.length === lecturas.length) {
    console.error('[Meta Ads sync] Graph API falló en todas las colecciones:', JSON.stringify(fallos));
    await registrarSync(admin, { ok: false, account_id: accountId, errores: fallos, iniciado_en: iniciadoEn });
    return vacio(fallos[0].mensaje, fallos[0].endpoint, fallos[0].http_status);
  }
  // Fallos parciales: se registra y se sigue con lo que sí se pudo leer.
  if (fallos.length) console.warn('[Meta Ads sync] fallos parciales:', JSON.stringify(fallos));

  // La Graph API devuelve presupuestos en centavos: se guardan en BRL como en el resto del panel.
  const bzl = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v) / 100);
  const sello = new Date().toISOString();
  const filas: Record<string, unknown>[] = [];
  for (const c of campanas.disponible ? campanas.datos : []) {
    filas.push({
      organization_id: ORG_ID, entity_type: 'campaign', entity_id: String(c.id), parent_id: null,
      name: c.name ?? null, status: c.status ?? null, effective_status: c.effective_status ?? null,
      daily_budget: bzl(c.daily_budget), lifetime_budget: bzl(c.lifetime_budget),
      objective: c.objective ?? null, account_id: c.account_id ?? accountId, synced_at: sello, last_synced_at: sello,
    });
  }
  for (const s of conjuntos.disponible ? conjuntos.datos : []) {
    filas.push({
      organization_id: ORG_ID, entity_type: 'adset', entity_id: String(s.id),
      parent_id: s.campaign_id ? String(s.campaign_id) : null,
      name: s.name ?? null, status: s.status ?? null, effective_status: s.effective_status ?? null,
      daily_budget: bzl(s.daily_budget), lifetime_budget: bzl(s.lifetime_budget),
      objective: null, account_id: s.account_id ?? accountId, synced_at: sello, last_synced_at: sello,
    });
  }
  for (const a of anuncios.disponible ? anuncios.datos : []) {
    filas.push({
      organization_id: ORG_ID, entity_type: 'ad', entity_id: String(a.id),
      parent_id: a.adset_id ? String(a.adset_id) : null,
      name: a.name ?? null, status: a.status ?? null, effective_status: a.effective_status ?? null,
      daily_budget: null, lifetime_budget: null, objective: null,
      account_id: a.account_id ?? accountId, creative_name: a.creative?.name ?? null, synced_at: sello, last_synced_at: sello,
    });
  }
  const nCampanas = campanas.disponible ? campanas.datos.length : 0;
  const nConjuntos = conjuntos.disponible ? conjuntos.datos.length : 0;
  const nAnuncios = anuncios.disponible ? anuncios.datos.length : 0;
  if (!filas.length) {
    const motivo = fallos[0]?.mensaje || 'Meta no devolvió ninguna campaña en esta cuenta.';
    await registrarSync(admin, { ok: false, account_id: accountId, errores: fallos, iniciado_en: iniciadoEn });
    return { ...vacio(motivo), account_id: accountId, errores: fallos };
  }

  // Identidad lógica: (account_id, entity_type, entity_id) — la misma clave que la PK de la tabla.
  // Sincronizar N veces NO duplica campañas: siempre es un UPSERT del mismo registro.
  const { error } = await admin.from('meta_ads_entities').upsert(filas, { onConflict: 'account_id,entity_type,entity_id' });
  if (error) {
    const motivo = `No se pudo guardar meta_ads_entities: ${error.message}`;
    console.error('[Meta Ads sync]', motivo);
    await registrarSync(admin, {
      ok: false,
      account_id: accountId,
      errores: [...fallos, { endpoint: 'supabase:meta_ads_entities', http_status: null, mensaje: motivo }],
      campanas: nCampanas,
      conjuntos: nConjuntos,
      anuncios: nAnuncios,
      iniciado_en: iniciadoEn,
    });
    return vacio(motivo);
  }

  const fin = new Date().toISOString();
  await registrarSync(admin, {
    ok: fallos.length === 0,
    account_id: accountId,
    errores: fallos,
    campanas: nCampanas,
    conjuntos: nConjuntos,
    anuncios: nAnuncios,
    iniciado_en: iniciadoEn,
  });
  console.log(
    `[Meta Ads sync] ${nCampanas} campañas, ${nConjuntos} conjuntos, ${nAnuncios} anuncios ` +
    `(páginas ${campanas.paginas}/${conjuntos.paginas}/${anuncios.paginas})`
  );

  return {
    disponible: true,
    account_id: accountId,
    endpoint: campanas.endpoint,
    http_status: campanas.http_status,
    errores: fallos,
    paginas: campanas.paginas,
    campanas: nCampanas,
    conjuntos: nConjuntos,
    anuncios: nAnuncios,
    iniciado_en: iniciadoEn,
    sincronizado_en: fin,
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
const nullableStr = (description: string) => ({ type: ['string', 'null'], description });
const num = (description: string) => ({ type: 'number', description });
const bool = (description: string) => ({ type: 'boolean', description });

// Propiedades comunes de un creativo (nombres en español para el modelo).
const CREATIVO_PROPS: Record<string, unknown> = {
  servicio: str('CPF | Agendamento PF | RNM | Residência Permanente | Refúgio'),
  objetivo: { type: 'string', enum: ['conversaciones', 'leads', 'clientes', 'otro'], description: 'Objetivo del anuncio' },
  publico: str('Público, ej. extranjeros recién llegados a Brasil'),
  concepto: { type: 'string', enum: ['persona', 'documento', 'problema_solucion', 'institucional', 'mensaje_directo', 'variacion_ganadora'] },
  titular: str('Titular que se dibuja grande en la imagen (máx. 40 caracteres)'),
  hook: str('Subtítulo/hook breve bajo el titular (máx. 60 caracteres)'),
  texto_principal: str('Texto principal del anuncio en Meta (máx. 300 caracteres)'),
  cta: str('Texto del botón de acción, ej. Escríbenos por WhatsApp'),
  escena: str('Escena visual en 1-2 frases'),
  estilo: { type: 'string', enum: ['fotografia_realista', 'ilustracion', 'minimalista_corporativo', 'documento_destacado'] },
  formato: { type: 'string', enum: ['1:1', '4:5', '9:16'] },
  idioma: { type: 'string', enum: ['es', 'pt'] },
};

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
          desde: nullableStr('Fecha inicio YYYY-MM-DD; puede ser null si se usa periodo'),
          hasta: nullableStr('Fecha fin YYYY-MM-DD; puede ser null si se usa periodo'),
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
  {
    type: 'function',
    function: {
      name: 'diagnosticar_funnel_campanas',
      description: 'Analiza el funnel completo de marketing y ventas (Meta Ads → Nora/WhatsApp → Kommo Leads → Propuestas → Pagos/Clientes), identificando cuellos de botella y respondiendo a "¿dónde estoy perdiendo dinero?".',
      parameters: {
        type: 'object',
        properties: {
          periodo: { type: 'string', enum: ['7d', '14d', '30d', 'all'], description: 'Atajo de período (por defecto 7d)' },
          desde: str('Fecha inicio YYYY-MM-DD'),
          hasta: str('Fecha fin YYYY-MM-DD'),
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_aprendizajes_campanas',
      description: 'Consulta los aprendizajes acumulados de experimentos anteriores en Supabase para fundamentar nuevas hipótesis sobre datos validados.',
      parameters: {
        type: 'object',
        properties: {
          servicio: str('Filtrar por servicio (ej. CPF, RNM, Residencia)'),
          audiencia: str('Filtrar por tipo de audiencia'),
          limite: num('Límite de aprendizajes a devolver (por defecto 15)'),
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'disenar_campana_v4',
      description: 'Diseña un experimento controlado V4 para un servicio (ej. CPF): define variable única vs control, hipótesis científica, métrica primaria de negocio (costo por cliente pagador / ROAS), variantes de hook/copy y presupuesto, generando propuesta para confirmación humana (NUNCA publica directo).',
      parameters: {
        type: 'object',
        properties: {
          name: str('Nombre del experimento o campaña'),
          service: str('Servicio objetivo (ej. CPF, Residencia Mercosur, etc.)'),
          question: str('¿Qué queremos descubrir? (Pregunta de investigación)'),
          hypothesis: str('¿Qué creemos que ocurrirá? (Hipótesis empírica)'),
          variable_tested: str('Variable única que se modifica frente al control'),
          control_description: str('Descripción del control (lo que permanece igual)'),
          treatment_description: str('Descripción del tratamiento (la variación introducida)'),
          objective: { type: 'string', enum: ['OUTCOME_MESSAGES', 'OUTCOME_LEADS', 'OUTCOME_SALES'], description: 'Objetivo publicitario en Meta' },
          primary_metric: str('Métrica primaria de negocio para evaluar (cost_per_customer, roas, payment_rate)'),
          secondary_metrics: { type: 'array', items: { type: 'string' }, description: 'Métricas secundarias diagnósticas (ctr, cpc, cpl, conversaciones)' },
          daily_budget: num('Presupuesto diario en BRL'),
          variants: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                variant_name: str('Nombre de la variante, ej. Control o Tratamiento A'),
                hook: str('Gancho inicial / primeros 3 segundos'),
                copy: str('Texto principal del anuncio'),
                cta: str('Llamado a la acción, ej. Enviar mensaje por WhatsApp'),
                creative_reference: str('Referencia visual o descripción del creativo'),
              },
              required: ['variant_name', 'hook', 'copy', 'cta'],
            },
            description: 'Variantes del experimento (mínimo 2: Control y Tratamiento)',
          },
          decision_rules: {
            type: 'object',
            properties: {
              scale_condition: str('Condición para escalar presupuesto'),
              pause_condition: str('Condición para pausar el experimento'),
              iterate_condition: str('Condición para iterar'),
            },
            required: ['scale_condition', 'pause_condition'],
          },
        },
        required: ['name', 'service', 'question', 'hypothesis', 'variable_tested', 'control_description', 'treatment_description', 'objective', 'primary_metric', 'daily_budget', 'variants'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'medir_experimento_v4',
      description: 'Mide y compara variantes de un experimento V4 activo usando datos reales de Meta y CRM, evalúa si la hipótesis fue respaldada (supported), no respaldada (not_supported) o inconclusa, y guarda el aprendizaje.',
      parameters: {
        type: 'object',
        properties: {
          experiment_id: str('UUID del experimento en Supabase'),
        },
        required: ['experiment_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listar_experimentos_v4',
      description: 'Lista los experimentos de campañas V4 registrados en Supabase con su estado, hipótesis, métrica y resultado empírico.',
      parameters: {
        type: 'object',
        properties: {
          limite: num('Cantidad máxima de experimentos (por defecto 20)'),
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'ranking_creativos',
      description: 'Ranking interno de creativos (imagen + copy + prompt) con el embudo real: impresiones, CTR, conversaciones, costo/conversación, leads, clientes que pagaron, costo/cliente e ingresos. Filtra por servicio, formato o concepto. Los null significan "sin datos", no cero.',
      parameters: {
        type: 'object',
        properties: {
          servicio: str('CPF | Agendamento PF | RNM | Residência Permanente | Refúgio'),
          formato: str('1:1 | 4:5 | 9:16'),
          concepto: str('persona | documento | problema_solucion | institucional | mensaje_directo | variacion_ganadora'),
          orden: str('ctr | conversaciones | costo_por_conversacion | clientes_pagaron | costo_por_cliente | ingresos'),
          limite: num('Máximo de creativos (por defecto 15)'),
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'biblioteca_prompts',
      description: 'Biblioteca de prompts de creativos con sus resultados reales agregados (creativos generados, conversaciones, clientes, costo por cliente). Sirve para saber qué tipo de instrucción produce mejores creativos.',
      parameters: { type: 'object', properties: { servicio: str('Filtrar por servicio (opcional)') }, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'proponer_experimento_creativos',
      description: 'Crea una PROPUESTA de experimento que compara 2-4 creativos aprobados del mismo servicio (el primero es el Control) cambiando UNA sola variable. No gasta nada hasta que el dueño la confirme.',
      parameters: {
        type: 'object',
        properties: {
          hypothesis: str('Hipótesis a probar'),
          variable_tested: str('Única variable que cambia: imagen | hook | copy | composición'),
          creative_ids: { type: 'array', items: { type: 'string' }, description: 'ids de creativos (el primero es el Control)' },
          daily_budget: num('Presupuesto diario total en BRL'),
          name: str('Nombre del experimento (opcional)'),
        },
        required: ['hypothesis', 'variable_tested', 'creative_ids', 'daily_budget'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'proponer_publicar_creativo',
      description: 'Crea una PROPUESTA para publicar un creativo APROBADO en un conjunto de anuncios existente de Meta. El anuncio nace en pausa y requiere confirmación humana.',
      parameters: {
        type: 'object',
        properties: { creative_id: str('Id del creativo'), adset_id: str('Id real del conjunto de anuncios en Meta') },
        required: ['creative_id', 'adset_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'buscar_tendencias',
      description: 'Busca en la web tendencias RECIENTES útiles para anuncios (formatos y hooks que funcionan, cambios de normas, dolores de la comunidad migrante, novedades de Meta Ads) y las guarda con sus fuentes. Son HIPÓTESIS de mercado, no evidencia del negocio: úsalas para proponer experimentos, nunca como prueba.',
      parameters: { type: 'object', properties: { servicio: str('CPF | Agendamento PF | RNM | Residência Permanente | Refúgio (opcional)'), tema: str('Foco concreto, ej. urgencia en citas de la Polícia Federal (opcional)') }, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'consultar_tendencias',
      description: 'Lista las tendencias de mercado ya buscadas y guardadas (con fuentes). Consúltalas antes de proponer conceptos para no repetir búsquedas.',
      parameters: { type: 'object', properties: { servicio: str('Filtrar por servicio (opcional)'), limite: num('Máximo (por defecto 15)') }, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'proponer_conceptos_creativos',
      description: 'Genera 1-5 conceptos publicitarios (hook, titular, texto, CTA, escena) para un servicio, usando aprendizajes, resultados reales y tendencias guardadas. Quedan registrados. No gasta en Meta.',
      parameters: { type: 'object', properties: { servicio: str('CPF | Agendamento PF | RNM | Residência Permanente | Refúgio'), objetivo: str('Ej. Conversaciones WhatsApp'), publico: str('Ej. extranjeros recién llegados a Brasil'), cantidad: num('1 a 5 (por defecto 3)') }, required: ['servicio'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generar_prompt_creativo',
      description: 'Redacta el prompt de imagen profesional de un anuncio a partir de sus datos. El prompt EXIGE titular grande, botón CTA y firma de marca dentro de la imagen. Úsalo para que el dueño revise el prompt antes de generar.',
      parameters: { type: 'object', properties: CREATIVO_PROPS, required: ['servicio', 'titular', 'cta'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generar_creativo',
      description: 'GENERA la imagen real del anuncio con OpenAI (cuesta dinero, máx. 40 al día) y la guarda como BORRADOR con su prompt versionado. La imagen sale con titular, subtítulo, botón CTA y firma. Genera de a UNA y solo cuando el dueño lo pidió. Después se muestra con markdown ![](image_url). No publica nada en Meta.',
      parameters: { type: 'object', properties: { ...CREATIVO_PROPS, prompt: str('Prompt ya revisado (opcional; si falta se arma con la identidad de marca)'), concept_id: str('Id del concepto registrado (opcional)') }, required: ['servicio', 'titular', 'cta'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'regenerar_creativo',
      description: 'Crea una VERSIÓN NUEVA (v2, v3…) de un creativo cambiando UNA sola variable declarada (estilo, hook, concepto, composicion o imagen). Conserva la anterior. Para concepto/composicion hay que dar el prompt nuevo.',
      parameters: { type: 'object', properties: { creative_id: str('Id del creativo de origen'), variable: { type: 'string', enum: ['estilo', 'hook', 'concepto', 'composicion', 'imagen'], description: 'La única variable que cambia' }, estilo: str('Nuevo estilo si variable=estilo'), hook: str('Nuevo hook si variable=hook'), prompt: str('Prompt nuevo si variable=concepto o composicion') }, required: ['creative_id', 'variable'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'origen_clientes',
      description: 'UNIFICA el embudo: para cada lead/cliente que cierra Nora, de dónde vino y qué anuncio tocó (anuncio → campaña → creativo → prompt) con sus pagos. Incluye la COBERTURA de atribución (cuántos leads tienen origen demostrable). Si el origen es sin_origen se dice tal cual: no se adivina.',
      parameters: { type: 'object', properties: { solo_cerrados: bool('Solo leads ganados o con pagos'), origen: { type: 'string', enum: ['anuncio', 'meta_declarado', 'sin_origen'], description: 'Filtrar por tipo de origen' }, limite: num('Máximo de filas (por defecto 25)') }, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cerrar_experimento_creativos',
      description: 'Mide un experimento con datos reales y, solo si hay volumen, periodo y diferencia suficientes, declara ganador y guarda el aprendizaje. Con pocos datos responde "insuficiente" o "tendencia" y deja el experimento abierto.',
      parameters: { type: 'object', properties: { experiment_id: str('Id del experimento'), concluir_inconcluso: bool('true SOLO si el dueño pidió cerrar sin ganador: queda INCONCLUSO y no se guarda aprendizaje') }, required: ['experiment_id'] },
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
  const rangoDe = (a: any) => {
    const desde = typeof a?.desde === 'string' && a.desde.trim() ? a.desde.trim() : undefined;
    const hasta = typeof a?.hasta === 'string' && a.hasta.trim() ? a.hasta.trim() : undefined;
    return desde || hasta
      ? { desde, hasta }
      : resolveAdsDateRange(typeof a?.periodo === 'string' ? a.periodo : '7d');
  };

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

    case 'diagnosticar_funnel_campanas': {
      // Groq puede serializar campos opcionales como null. Nunca pasar null como fecha.
      const argsNormalizados = {
        periodo: typeof args?.periodo === 'string' ? args.periodo : undefined,
        desde: typeof args?.desde === 'string' && args.desde.trim() ? args.desde.trim() : undefined,
        hasta: typeof args?.hasta === 'string' && args.hasta.trim() ? args.hasta.trim() : undefined,
      };
      const funnel = await analizarFunnelCompleto(ctx.admin, argsNormalizados);
      return JSON.stringify(funnel);
    }

    case 'consultar_aprendizajes_campanas': {
      const learnings = await consultarAprendizajes(ctx.admin, {
        service: args.servicio,
        audience: args.audiencia,
        limit: args.limite,
      });
      return JSON.stringify({ total: learnings.length, aprendizajes: learnings });
    }

    case 'disenar_campana_v4': {
      const resultado = await proponerExperimentoV4(ctx, {
        name: args.name,
        service: args.service,
        question: args.question,
        hypothesis: args.hypothesis,
        variable_tested: args.variable_tested,
        control_description: args.control_description,
        treatment_description: args.treatment_description,
        objective: args.objective,
        primary_metric: args.primary_metric,
        secondary_metrics: args.secondary_metrics,
        audience_definition: args.audience_definition || {},
        daily_budget: args.daily_budget,
        variants: args.variants,
        decision_rules: args.decision_rules || {
          scale_condition: 'Costo por cliente menor al objetivo y ROAS > 3',
          pause_condition: 'Sin conversiones tras 3 días o costo 2x superior al control',
          iterate_condition: 'Diferencia no concluyente entre variantes',
        },
      });
      return JSON.stringify(resultado);
    }

    case 'medir_experimento_v4': {
      const medicion = await medirExperimentoV4(ctx.admin, args.experiment_id);
      return JSON.stringify(medicion);
    }

    case 'listar_experimentos_v4': {
      const experimentos = await listarExperimentosV4(ctx.admin, args.limite || 20);
      return JSON.stringify({ total: experimentos.length, experimentos });
    }

    case 'ranking_creativos':
      return JSON.stringify(await rankingCreativos(ctx.admin, args));

    case 'biblioteca_prompts':
      return JSON.stringify(await biblioteca(ctx.admin, args.servicio));

    case 'proponer_experimento_creativos': {
      const r = await crearExperimentoCreativos(ctx, args);
      // proponerExperimentoV4 devuelve la propuesta en su propio arreglo: se registra en la del chat.
      return JSON.stringify(r);
    }

    case 'proponer_publicar_creativo': {
      const r = await proponerPublicacion(ctx, args);
      ctx.proposals.push(r.propuesta);
      return JSON.stringify({ propuesta_creada: true, proposal_id: r.propuesta.id, resumen: r.propuesta.resumen });
    }

    case 'buscar_tendencias':
      return JSON.stringify(await buscarTendencias(ctx.admin, ctx.userId, { service: args.servicio, tema: args.tema }));

    case 'consultar_tendencias':
      return JSON.stringify(await listarTendencias(ctx.admin, { service: args.servicio, limite: args.limite }));

    case 'proponer_conceptos_creativos':
      return JSON.stringify(await proponerConceptos(ctx.admin, ctx.userId, { service: args.servicio, objective: args.objetivo, audience: args.publico, cantidad: args.cantidad }));

    case 'generar_prompt_creativo':
      return JSON.stringify(await generarPrompt(ctx.admin, ctx.userId, {
        service: args.servicio, objective: args.objetivo, audience: args.publico, concept: args.concepto, hook: args.hook, headline: args.titular,
        cta: args.cta, visual_concept: args.escena, style: args.estilo, format: args.formato || '1:1', language: args.idioma || 'es',
      }));

    case 'generar_creativo': {
      const r = await crearCreativo(ctx.admin, ctx.userId, {
        service: args.servicio, objective: args.objetivo, audience: args.publico, concept: args.concepto, hook: args.hook, headline: args.titular,
        primary_text: args.texto_principal, cta: args.cta, visual_concept: args.escena, style: args.estilo, format: args.formato || '1:1',
        language: args.idioma || 'es', prompt: args.prompt, concept_id: args.concept_id,
      }, 'generar');
      return JSON.stringify({ ok: true, creative_id: r.creativo.id, version: r.creativo.version, formato: r.creativo.format, estado: r.creativo.status, modelo: r.modelo, image_url: r.image_url, nota: 'Borrador guardado. No está en Meta. Muéstralo con ![](image_url); hay que aprobarlo antes de proponer su publicación.' });
    }

    case 'regenerar_creativo': {
      const r = await crearCreativo(ctx.admin, ctx.userId, {
        from_creative_id: args.creative_id, changed_variable: args.variable, style: args.estilo, hook: args.hook, prompt: args.prompt,
      } as any, 'regenerar');
      return JSON.stringify({ ok: true, creative_id: r.creativo.id, version: r.creativo.version, cambio: r.creativo.changed_variable, image_url: r.image_url, nota: 'Versión nueva; la anterior se conserva.' });
    }

    case 'origen_clientes': {
      let q = ctx.admin.from('origen_leads').select('lead_id, nombre, tramite_texto, etapa_nombre, ganado, origen, ad_name, campaign_name, creative_headline, creative_style, creative_version, prompt_name, prompt_version, pagos, ingresos, created_at').order('created_at', { ascending: false }).limit(Math.min(Number(args.limite) || 25, 100));
      if (args.origen) q = q.eq('origen', args.origen);
      if (args.solo_cerrados) q = q.or('ganado.eq.true,pagos.gt.0');
      const [{ data, error }, { data: cob }] = await Promise.all([q, ctx.admin.from('cobertura_atribucion').select('*').maybeSingle()]);
      if (error) throw new Error(error.message);
      const sinAnuncio = !!cob && Number(cob.con_anuncio) === 0;
      return JSON.stringify({
        cobertura: cob || null,
        interpretacion: sinAnuncio
          ? 'ESPERANDO TRÁFICO REAL: ningún lead tiene anuncio de origen demostrable (meta_ads_referidos recibió ' + (cob?.referidos_recibidos ?? 0) + ' referidos). No se puede afirmar qué anuncio trajo a ningún cliente; no lo adivines.'
          : 'Solo los leads con origen = anuncio tienen atribución demostrable; el resto es sin_origen.',
        total_filas: (data || []).length, leads: data || [],
      });
    }

    case 'cerrar_experimento_creativos':
      return JSON.stringify(await cerrarExperimentoCreativos(ctx.admin, args.experiment_id, { concluirInconcluso: args.concluir_inconcluso === true }));

    default:
      throw new Error(`Herramienta de Ads no reconocida: ${name}`);
  }
}

/** Diagnóstico seguro de errores de escritura de Meta: nunca registra el access token. */
function extraerErrorMeta(data: any, httpStatus: number) {
  const e = data?.error || {};
  return { http_status: httpStatus, type: e?.type ?? null, code: e?.code ?? null, error_subcode: e?.error_subcode ?? null, message: e?.message ?? null, fbtrace_id: e?.fbtrace_id ?? null };
}
async function registrarErrorEscrituraMeta(admin: SupabaseClient, userId: string, p: any, accion: string, metaError: Record<string, unknown>, target: Record<string, unknown>) {
  const { error } = await admin.from('automation_runs').insert({
    organization_id: ORG_ID, workflow: 'asistente_meta_ads', ref: p.tipo, ok: false,
    message: String(metaError.message || 'Meta API error'),
    details: { proposal_id: p.id, executed_by: userId, accion, target, resultado: 'meta_rejected', meta_error: metaError },
  });
  if (error) console.error('[Meta Ads] no se pudo registrar el error de Meta:', error.message);
}
async function verificarObjetoMeta(token: string, accountId: string, objectId: string, objectType: 'campaign' | 'adset') {
  const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(objectId)}?fields=id,account_id,status`;
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.error) throw new Error(`No se pudo validar ${objectType} ${objectId} en Meta: ${data?.error?.message || `HTTP ${res.status}`}`);
  const expected = String(accountId).replace(/^act_/, '');
  const actual = String(data?.account_id ?? '').replace(/^act_/, '');
  if (!actual || actual !== expected) throw new Error(`Seguridad: el ${objectType} ${objectId} no pertenece a la cuenta publicitaria configurada.`);
  return data;
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
      if (!accountId) throw new Error('No se pudo ejecutar en Meta: Falta configurar el secreto META_AD_ACCOUNT_ID en Supabase.');
      await verificarObjetoMeta(token, accountId, String(d.campaign_id), 'campaign');
      const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(d.campaign_id)}`;
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: d.nuevo_estado, access_token: token }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        const metaError = extraerErrorMeta(data, res.status);
        await registrarErrorEscrituraMeta(admin, userId, p, 'ads_cambiar_estado_campana', metaError, { campaign_id: String(d.campaign_id), account_id: String(accountId).replace(/^act_/, ''), requested_status: d.nuevo_estado });
        const suffix = [metaError.code, metaError.error_subcode].filter(Boolean).join('/');
        throw new Error(`Meta rechazó el cambio: ${metaError.message || `HTTP ${res.status}`}${suffix ? ` (code ${suffix})` : ''}${metaError.fbtrace_id ? ` [fbtrace_id ${metaError.fbtrace_id}]` : ''}`);
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
      if (!accountId) throw new Error('No se pudo ejecutar en Meta: Falta configurar el secreto META_AD_ACCOUNT_ID en Supabase.');
      await verificarObjetoMeta(token, accountId, String(d.campaign_id), 'campaign');
      const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(d.campaign_id)}`;
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ daily_budget: dailyBudgetCents, access_token: token }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        const metaError = extraerErrorMeta(data, res.status);
        await registrarErrorEscrituraMeta(admin, userId, p, 'ads_cambiar_presupuesto_campana', metaError, { campaign_id: String(d.campaign_id), account_id: String(accountId).replace(/^act_/, ''), requested_daily_budget_brl: d.nuevo_presupuesto });
        throw new Error(`Meta rechazó el cambio de presupuesto: ${metaError.message || `HTTP ${res.status}`}${metaError.code ? ` (code ${metaError.code}${metaError.error_subcode ? `/${metaError.error_subcode}` : ''})` : ''}${metaError.fbtrace_id ? ` [fbtrace_id ${metaError.fbtrace_id}]` : ''}`);
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

      if (!accountId) throw new Error('No se pudo ejecutar en Meta: Falta configurar el secreto META_AD_ACCOUNT_ID en Supabase.');
      await verificarObjetoMeta(token, accountId, String(d.adset_id), 'adset');
      const cents = Math.round(Number(d.nuevo_presupuesto) * 100);
      const url = `https://graph.facebook.com/v20.0/${encodeURIComponent(d.adset_id)}`;
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ daily_budget: cents, access_token: token }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        const metaError = extraerErrorMeta(data, res.status);
        await registrarErrorEscrituraMeta(admin, userId, p, 'ads_cambiar_presupuesto_adset', metaError, { adset_id: String(d.adset_id), account_id: String(accountId).replace(/^act_/, ''), requested_daily_budget_brl: d.nuevo_presupuesto });
        throw new Error(`Meta rechazó el cambio de presupuesto del conjunto: ${metaError.message || `HTTP ${res.status}`}${metaError.code ? ` (code ${metaError.code}${metaError.error_subcode ? `/${metaError.error_subcode}` : ''})` : ''}${metaError.fbtrace_id ? ` [fbtrace_id ${metaError.fbtrace_id}]` : ''}`);
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

    case 'ads_experimento_v4': {
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
      const campUrl = `https://graph.facebook.com/v20.0/${accountId}/campaigns`;
      const campRes = await fetch(campUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: d.nombre_campana,
          objective: d.objetivo || 'OUTCOME_MESSAGES',
          status: 'PAUSED',
          daily_budget: dailyBudgetCents,
          special_ad_categories: ['NONE'],
          access_token: token,
        }),
      });
      const campData = await campRes.json().catch(() => ({}));
      if (!campRes.ok || campData.error) {
        const errorMsg = campData.error?.message || `Meta API error (${campRes.status})`;
        throw new Error(`Meta rechazó la creación de la campaña experimental: ${errorMsg}`);
      }
      const metaCampaignId = campData.id;

      // Crear AdSets y Ads para las variantes
      const variantesResult: any[] = [];
      const variantes = d.variantes || [];
      const adsetBudgetCents = variantes.length > 0 ? Math.max(100, Math.round(dailyBudgetCents / variantes.length)) : dailyBudgetCents;

      for (const v of variantes) {
        let adsetId: string | null = null;
        let adId: string | null = null;
        let creativeId: string | null = null;

        try {
          const adsetRes = await fetch(`https://graph.facebook.com/v20.0/${accountId}/adsets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: `${d.nombre_campana} - ${v.variant_name || 'Variante'}`,
              campaign_id: metaCampaignId,
              daily_budget: adsetBudgetCents,
              billing_event: 'IMPRESSIONS',
              optimization_goal: d.objetivo === 'OUTCOME_LEADS' ? 'LEAD_GENERATION' : 'CONVERSATIONS',
              bid_strategy: 'LOWEST_COST_WITHOUT_BID_CAP',
              status: 'PAUSED',
              targeting: { geo_locations: { countries: ['BR'] } },
              access_token: token,
            }),
          });
          const adsetData = await adsetRes.json().catch(() => ({}));
          if (adsetRes.ok && adsetData.id && v.creative_asset_id) {
            // Variante con creativo del Laboratorio V5: sube la imagen real y crea el anuncio en PAUSED.
            adsetId = adsetData.id;
            const pub = await publicarCreativoEnMeta(admin, {
              creative_id: v.creative_asset_id, adset_id: adsetData.id,
              nombre_anuncio: `${d.nombre_campana} - ${v.variant_name || 'Variante'}`,
            });
            adId = pub.ad_id;
            creativeId = pub.meta_creative_id;
          } else if (adsetRes.ok && adsetData.id) {
            adsetId = adsetData.id;

            const creativeRes = await fetch(`https://graph.facebook.com/v20.0/${accountId}/adcreatives`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: `Creative - ${v.variant_name || 'Variante'}`,
                object_story_spec: {
                  page_id: accountId.replace(/\D/g, ''),
                  link_data: {
                    message: v.copy || v.hook || d.nombre_campana,
                    name: v.hook || d.nombre_campana,
                    call_to_action: { type: 'LEARN_MORE' },
                  },
                },
                access_token: token,
              }),
            });
            const creativeData = await creativeRes.json().catch(() => ({}));
            creativeId = creativeData.id || null;

            if (creativeId) {
              const adRes = await fetch(`https://graph.facebook.com/v20.0/${accountId}/ads`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  name: `Ad - ${v.variant_name || 'Variante'}`,
                  adset_id: adsetId,
                  creative: { creative_id: creativeId },
                  status: 'PAUSED',
                  access_token: token,
                }),
              });
              const adData = await adRes.json().catch(() => ({}));
              adId = adData.id || null;
            }
          }
        } catch (errVar) {
          console.error(`[Meta Graph API V4] Error creando variante ${v.variant_name}:`, errVar);
        }

        if (d.experiment_id) {
          await admin
            .from('campaign_variants')
            .update({
              campaign_id: metaCampaignId,
              adset_id: adsetId,
              ad_id: adId,
              creative_id: creativeId,
            })
            .eq('experiment_id', d.experiment_id)
            .eq('variant_name', v.variant_name);
        }

        variantesResult.push({
          variant_name: v.variant_name,
          adset_id: adsetId,
          ad_id: adId,
          creative_id: creativeId,
        });
      }

      if (d.experiment_id) {
        await admin
          .from('campaign_experiments')
          .update({
            status: 'approved',
            start_date: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', d.experiment_id);
      }

      await admin.from('meta_ads_entities').upsert({
        organization_id: ORG_ID,
        entity_type: 'campaign',
        entity_id: metaCampaignId,
        name: d.nombre_campana,
        status: 'PAUSED',
        effective_status: 'PAUSED',
        daily_budget: d.presupuesto_diario,
        objective: d.objetivo,
        account_id: accountId,
        synced_at: new Date().toISOString(),
        last_synced_at: new Date().toISOString(),
      }, { onConflict: 'account_id,entity_type,entity_id' });

      await admin.from('automation_runs').insert({
        organization_id: ORG_ID,
        workflow: 'asistente_meta_ads_v4',
        ref: p.tipo,
        ok: true,
        message: `Experimento V4 "${d.nombre_campana}" creado en Meta con ID ${metaCampaignId} (Pausado por seguridad)`,
        details: {
          proposal_id: p.id,
          experiment_id: d.experiment_id,
          executed_by: userId,
          accion: 'ads_experimento_v4',
          campaign_id: metaCampaignId,
          nombre_campana: d.nombre_campana,
          presupuesto_diario: d.presupuesto_diario,
          variantes: variantesResult,
          resultado: 'ok',
        },
      });

      return {
        ok: true,
        meta_id: metaCampaignId,
        campaign_id: metaCampaignId,
        nombre: d.nombre_campana,
        variantes: variantesResult,
        estado_inicial: 'PAUSED',
      };
    }

    case 'ads_publicar_creativo': {
      // Revalidar en el momento de ejecutar: el creativo sigue aprobado y el conjunto sigue existiendo.
      const { data: c } = await admin.from('creatives').select('status, ad_id').eq('id', d.creative_id).maybeSingle();
      if (!c || c.status !== 'approved' || c.ad_id) {
        throw new Error('El creativo ya no está aprobado o ya fue vinculado a un anuncio. Genera una propuesta nueva.');
      }
      if (!token || !accountId) throw new Error('No se pudo publicar en Meta: faltan META_ADS_TOKEN / META_AD_ACCOUNT_ID en Supabase.');
      await verificarObjetoMeta(token, accountId, String(d.adset_id), 'adset');
      const pub = await publicarCreativoEnMeta(admin, {
        creative_id: d.creative_id, adset_id: d.adset_id, nombre_anuncio: d.nombre_anuncio,
      });
      await admin.from('automation_runs').insert({
        organization_id: ORG_ID,
        workflow: 'asistente_meta_ads',
        ref: p.tipo,
        ok: true,
        message: `Creativo ${d.creative_id} publicado como anuncio ${pub.ad_id} en el conjunto ${d.adset_id} (PAUSED)`,
        details: { proposal_id: p.id, executed_by: userId, accion: p.tipo, ...pub, resultado: 'ok' },
      });
      return { ok: true, ...pub, estado_inicial: 'PAUSED' };
    }

    default:
      throw new Error(`Tipo de propuesta de Ads desconocido: ${p.tipo}`);
  }
}

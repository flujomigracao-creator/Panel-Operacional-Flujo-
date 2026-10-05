// Lógica pura del resumen ejecutivo del Inicio (sin React ni Supabase: se prueba con node --test).
// Regla: la ausencia de dato NO es 0. Sin denominador o sin base de comparación → `null` ("—").
import { resolverPeriodos, variacion } from '../assistant/services/resumenMeta.js';

export const ZONA = 'America/Sao_Paulo';
// Si la última sincronización correcta de Meta tiene más de esto, se avisa (el sync corre cada 5 min).
export const META_ATRASADO_MIN = 30;

/** "Hoy" en São Paulo (no en el navegador): el RPC agrupa por día de São Paulo y ambos deben coincidir. */
export function hoySaoPaulo(ahora = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora);
  const [y, m, d] = p.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export const FILTROS = [
  { id: 'hoy', label: 'Hoy' },
  { id: '7d', label: '7 días' },
  { id: '30d', label: '30 días' },
  { id: 'custom', label: 'Personalizado' },
];

/** Filtro de la UI → { desde, hasta, previo, etiqueta } o null si el personalizado está incompleto. */
export function periodoDeFiltro(filtro, custom = {}, ahora = new Date()) {
  const hoy = hoySaoPaulo(ahora);
  if (filtro === 'custom') {
    if (!custom.desde || !custom.hasta) return null;
    return resolverPeriodos({ desde: custom.desde, hasta: custom.hasta }, hoy);
  }
  return resolverPeriodos(filtro, hoy);
}

const num = (v) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const dividir = (a, b) => (a != null && b != null && b > 0 ? a / b : null);

/**
 * Datos crudos del RPC → números listos para pintar. `null` = sin dato (se muestra "—").
 * Un período sin filas de pagos/leads SÍ es 0 (la tabla se consultó y no hubo nada); sin filas de gasto es "sin dato".
 */
export function derivarResumen(r) {
  if (!r) return null;
  const la = r.leads?.actual || {};
  const lp = r.leads?.previo || {};
  const personas = num(la.personas) ?? 0;
  const personasPrev = num(lp.personas) ?? 0;
  const cobrado = num(r.cobrado?.actual?.total) ?? 0;
  const cobradoPrev = num(r.cobrado?.previo?.total) ?? 0;
  const gasto = num(r.gasto?.actual?.total);
  const gastoPrev = num(r.gasto?.previo?.total);
  const convMeta = num(r.gasto?.actual?.conversaciones);
  const pagaron = num(la.personas_pagaron) ?? 0;
  const pagaronPrev = num(lp.personas_pagaron) ?? 0;
  return {
    leads: { personas, brutos: num(la.brutos) ?? 0, meta: num(la.personas_meta) ?? 0, var: variacion(personas, personasPrev), previo: personasPrev },
    cobrado: { total: cobrado, pagos: num(r.cobrado?.actual?.n) ?? 0, var: variacion(cobrado, cobradoPrev), previo: cobradoPrev },
    conversion: {
      pct: personas > 0 ? (pagaron / personas) * 100 : null,
      pagaron, personas,
      previoPct: personasPrev > 0 ? (pagaronPrev / personasPrev) * 100 : null,
    },
    gasto: {
      total: gasto, previo: gastoPrev, var: variacion(gasto, gastoPrev), conversaciones: convMeta,
      costoConversacion: dividir(gasto, convMeta),
      atribuidosPct: personas > 0 ? ((num(la.personas_meta) ?? 0) / personas) * 100 : null,
    },
    potencial: { total: num(r.potencial?.total) ?? 0, n: num(r.potencial?.n) ?? 0 },
    conversacionesPendientes: num(r.conversaciones_pendientes),
    porServicio: (r.ingresos_por_servicio || []).map((s) => ({ servicio: s.servicio, total: Number(s.total) || 0, n: Number(s.n) || 0 })),
    meta: saludMeta(r.meta_sync),
    generadoEn: r.generado_en || null,
  };
}

/** Distingue "nunca sincronizó" / "atrasada" / "falló la última" / "al día". */
export function saludMeta(sync, ahora = new Date()) {
  if (!sync || !sync.ultimo_ok) return { estado: 'sin_datos', texto: 'Meta Ads sin sincronizaciones registradas' };
  const min = Math.floor((ahora - new Date(sync.ultimo_ok)) / 60000);
  if (sync.ultimo_resultado === false) return { estado: 'error', min, texto: 'La última sincronización de Meta falló' };
  if (min > META_ATRASADO_MIN) return { estado: 'atrasado', min, texto: `Meta Ads sin actualizar hace ${min >= 120 ? `${Math.floor(min / 60)} h` : `${min} min`}` };
  return { estado: 'ok', min, texto: 'Meta Ads al día' };
}

export const fmtBRL = (v) => (v == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v));
export const fmtPct = (v, dec = 1) => (v == null ? '—' : `${v.toLocaleString('es', { maximumFractionDigits: dec })} %`);
export const fmtVar = (v) => (v == null ? null : `${v > 0 ? '+' : ''}${Math.round(v)} %`);

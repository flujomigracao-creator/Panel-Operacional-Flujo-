// Lógica pura del resumen ejecutivo del Inicio (sin React ni Supabase: se prueba con node --test).
// Regla: la ausencia de dato NO es 0. Sin denominador o sin base de comparación → `null` ("—").
//
// Vocabulario (ver supabase/migrations/20261008000002_resumen_inicio_v2.sql):
//   OPORTUNIDAD = un lead por servicio solicitado · PERSONA = contacto distinto.
//   RESULTADOS DEL PERÍODO dependen del filtro · SITUACIÓN ACTUAL es la foto de hoy (no depende del filtro).
import { resolverPeriodos, variacion, sumarDias, diasEntre } from '../assistant/services/resumenMeta.js';

export const ZONA = 'America/Sao_Paulo';
// Si la última sincronización correcta de Meta tiene más de esto, se avisa (el sync corre cada 5 min).
export const META_ATRASADO_MIN = 30;
// Mínimo de pagos atribuidos para mostrar un costo por cliente (con menos es ruido).
export const MIN_PAGOS_ATRIBUIDOS = 5;
export const MAX_DIAS_PERIODO = 366;

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

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const fechaValida = (iso) => {
  if (!ISO.test(iso || '')) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const f = new Date(y, m - 1, d);
  return f.getFullYear() === y && f.getMonth() === m - 1 && f.getDate() === d;
};

/**
 * Filtro de la UI → período { desde, hasta, dias, etiqueta, previo }.
 * Devuelve null si el personalizado está incompleto y { error } si es inválido (invertido, futuro o demasiado largo).
 */
export function periodoDeFiltro(filtro, custom = {}, ahora = new Date()) {
  const hoy = hoySaoPaulo(ahora);
  if (filtro !== 'custom') return resolverPeriodos(filtro, hoy);
  if (!custom.desde || !custom.hasta) return null;
  if (!fechaValida(custom.desde) || !fechaValida(custom.hasta)) return { error: 'Fecha no válida.' };
  if (custom.desde > custom.hasta) return { error: 'La fecha inicial es posterior a la final.' };
  const hoyIso = resolverPeriodos('hoy', hoy).hasta;
  if (custom.hasta > hoyIso) return { error: 'La fecha final no puede ser futura.' };
  if (diasEntre(custom.desde, custom.hasta) > MAX_DIAS_PERIODO) return { error: `El período no puede superar ${MAX_DIAS_PERIODO} días.` };
  return resolverPeriodos({ desde: custom.desde, hasta: custom.hasta }, hoy);
}

const num = (v) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const cero = (v) => num(v) ?? 0;
const dividir = (a, b) => (a != null && b != null && b > 0 ? a / b : null);
const pct = (a, b) => { const q = dividir(a, b); return q == null ? null : q * 100; };

/**
 * Datos crudos del RPC v2 → números listos para pintar. `null` = sin dato (se muestra "—").
 * Una tabla consultada sin filas SÍ es 0 (oportunidades, pagos); sin filas de gasto es "sin dato".
 */
export function derivarResumen(r) {
  if (!r || r.version !== 2) return null;
  const rp = r.resultados_periodo || {};
  const sa = r.situacion_actual || {};
  const a = rp.oportunidades?.actual || {};
  const p = rp.oportunidades?.previo || {};
  const opp = cero(a.oportunidades);
  const oppPrev = cero(p.oportunidades);
  const cobrado = cero(rp.cobrado?.actual?.total);
  const cobradoPrev = cero(rp.cobrado?.previo?.total);
  const gasto = num(rp.gasto?.actual?.total);
  const gastoPrev = num(rp.gasto?.previo?.total);
  const conAnuncio = cero(a.con_anuncio);
  const pagadasConAnuncio = cero(a.pagadas_con_anuncio);

  return {
    oportunidades: { total: opp, personas: cero(a.personas), sinServicio: cero(a.sin_servicio_elegido), var: variacion(opp, oppPrev), previo: oppPrev },
    cobrado: { total: cobrado, pagos: cero(rp.cobrado?.actual?.n), sinOportunidad: cero(rp.cobrado?.actual?.sin_oportunidad), var: variacion(cobrado, cobradoPrev) },
    // Conversión por OPORTUNIDAD: pago posterior, mismo cliente y mismo servicio. Las de plazo solo cuentan las que ya lo cumplieron.
    conversion: {
      acumulada: pct(cero(a.pagadas), opp), pagadas: cero(a.pagadas), oportunidades: opp,
      d7: pct(cero(a.pagadas_7d), cero(a.maduras_7d)), maduras7: cero(a.maduras_7d),
      d30: pct(cero(a.pagadas_30d), cero(a.maduras_30d)), maduras30: cero(a.maduras_30d),
    },
    gasto: {
      total: gasto, previo: gastoPrev, var: variacion(gasto, gastoPrev), conversaciones: num(rp.gasto?.actual?.conversaciones),
      costoConversacion: dividir(gasto, num(rp.gasto?.actual?.conversaciones)),
    },
    // "Con anuncio identificado" ≠ "Meta lo originó": solo hay un meta_ad_id registrado en la oportunidad.
    atribucion: {
      conAnuncio, sinAtribucion: cero(a.sin_atribucion), conAnuncioPct: pct(conAnuncio, opp),
      pagadasConAnuncio, ingresosConAnuncio: cero(a.ingresos_con_anuncio),
      costoPorOportunidad: dividir(gasto, conAnuncio),
      costoPorCliente: pagadasConAnuncio >= MIN_PAGOS_ATRIBUIDOS ? dividir(gasto, pagadasConAnuncio) : null,
      muestraSuficiente: pagadasConAnuncio >= MIN_PAGOS_ATRIBUIDOS,
    },
    porServicio: (rp.ingresos_por_servicio || []).map((s) => ({ servicio: s.servicio, total: cero(s.total), n: cero(s.n) })),
    actual: {
      potencial: { total: cero(sa.potencial?.total), n: cero(sa.potencial?.n), sinMovimiento14d: cero(sa.potencial?.sin_movimiento_14d) },
      conversacionesPendientes: num(sa.conversaciones_pendientes),
      meta: saludMeta(sa.meta_sync),
    },
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

// Importes: con centavos donde importan (cobrado, costos unitarios), sin ellos en totales grandes.
export const fmtBRL = (v, dec = 0) => (v == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v));
export const fmtPct = (v, dec = 1) => (v == null ? '—' : `${v.toLocaleString('es', { maximumFractionDigits: dec })} %`);
export const fmtVar = (v) => (v == null ? null : `${v > 0 ? '+' : ''}${Math.round(v)} %`);

export { sumarDias };

/**
 * Embudo por oportunidad (cohorte del período): oportunidad → propuesta → pago → trámite iniciado.
 * `tasa` = % respecto al paso anterior (null si no hay base). "Servicio elegido" NO es un paso: se informa como calidad de dato.
 */
export function derivarEmbudo(e) {
  if (!e || e.version !== 1) return null;
  const a = e.embudo?.actual || {};
  const opp = cero(a.oportunidades);
  const pasos = [
    { id: 'oportunidades', label: 'Oportunidades', n: opp },
    { id: 'propuesta', label: 'Propuesta enviada', n: cero(a.propuesta) },
    { id: 'pago', label: 'Pago confirmado', n: cero(a.pago) },
    { id: 'iniciado', label: 'Trámite iniciado', n: cero(a.iniciado) },
  ];
  // La tasa del último paso es respecto al pago solo si hay pagos; un trámite sin pago no entra en esa tasa.
  const conTasa = pasos.map((p, i) => ({ ...p, tasa: i === 0 ? null : pct(p.n, pasos[i - 1].n), deOportunidades: pct(p.n, opp) }));
  return {
    pasos: conTasa,
    perdidas: cero(a.perdidas),
    perdidasPct: pct(cero(a.perdidas), opp),
    sinServicio: opp - cero(a.con_servicio),
    iniciadoSinPago: cero(a.iniciado_sin_pago),
    costos: {
      gastosRegistrados: cero(e.costos_conocidos?.gastos_registrados?.n),
      gastosTotal: cero(e.costos_conocidos?.gastos_registrados?.total),
      servicios: cero(e.costos_conocidos?.catalogo?.servicios),
      conPrecio: cero(e.costos_conocidos?.catalogo?.con_precio),
      conCosto: cero(e.costos_conocidos?.catalogo?.con_costo),
    },
  };
}

/**
 * Economía del período con lo que realmente se sabe. NO es margen neto: solo se descuenta el gasto en Meta;
 * los costos operativos y por trámite no están registrados, así que el resultado es "tras publicidad".
 * Cobrado y gasto son del mismo período pero de naturaleza distinta (caja vs inversión): no son causa-efecto.
 */
export function derivarEconomia(resumen, embudo) {
  if (!resumen) return null;
  const cobrado = resumen.cobrado.total;
  const gasto = resumen.gasto.total;
  const c = embudo?.costos;
  const faltan = [];
  if (c) {
    if (c.gastosRegistrados === 0) faltan.push('gastos operativos (no hay ninguno registrado)');
    if (c.servicios > 0 && c.conCosto < c.servicios) faltan.push(`costo por servicio (${c.conCosto} de ${c.servicios} cargados)`);
  }
  return {
    cobrado, gasto,
    resultadoTrasPublicidad: gasto == null ? null : cobrado - gasto,
    roas: dividir(cobrado, gasto),
    roasAtribuido: dividir(resumen.atribucion.ingresosConAnuncio, gasto),
    margenNetoDisponible: !!c && c.gastosRegistrados > 0 && c.conCosto === c.servicios && c.servicios > 0,
    faltan,
  };
}

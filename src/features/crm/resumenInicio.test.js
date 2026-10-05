import test from 'node:test';
import assert from 'node:assert/strict';
import { hoySaoPaulo, periodoDeFiltro, derivarResumen, saludMeta, fmtVar, fmtBRL, MIN_PAGOS_ATRIBUIDOS } from './resumenInicio.js';

const AHORA = new Date('2026-10-05T15:00:00Z');

test('hoySaoPaulo usa el día de São Paulo aunque en UTC ya sea el siguiente', () => {
  const d = hoySaoPaulo(new Date('2026-10-06T01:30:00Z'));
  assert.equal([d.getFullYear(), d.getMonth() + 1, d.getDate()].join('-'), '2026-10-5');
});

test('periodoDeFiltro: 7 días y previo de igual duración', () => {
  const p = periodoDeFiltro('7d', {}, AHORA);
  assert.equal(p.desde, '2026-09-29');
  assert.equal(p.hasta, '2026-10-05');
  assert.deepEqual([p.previo.desde, p.previo.hasta], ['2026-09-22', '2026-09-28']);
});

test('periodoDeFiltro: personalizado incompleto → null; válido → período', () => {
  assert.equal(periodoDeFiltro('custom', { desde: '2026-10-01' }, AHORA), null);
  assert.equal(periodoDeFiltro('custom', { desde: '2026-10-01', hasta: '2026-10-03' }, AHORA).dias, 3);
});

test('periodoDeFiltro: rechaza invertido, futuro, inexistente y demasiado largo', () => {
  assert.match(periodoDeFiltro('custom', { desde: '2026-10-05', hasta: '2026-10-01' }, AHORA).error, /posterior/);
  assert.match(periodoDeFiltro('custom', { desde: '2026-10-01', hasta: '2026-10-09' }, AHORA).error, /futura/);
  assert.match(periodoDeFiltro('custom', { desde: '2026-02-31', hasta: '2026-03-02' }, AHORA).error, /no válida/);
  assert.match(periodoDeFiltro('custom', { desde: '2024-01-01', hasta: '2026-10-05' }, AHORA).error, /366/);
});

const crudo = (extra = {}) => ({
  version: 2,
  generado_en: '2026-10-05T05:00:00Z',
  resultados_periodo: {
    oportunidades: {
      actual: { oportunidades: 264, personas: 253, con_anuncio: 78, sin_atribucion: 186, sin_servicio_elegido: 151, pagadas: 3,
        maduras_7d: 142, pagadas_7d: 1, maduras_30d: 0, pagadas_30d: 0, pagadas_con_anuncio: 2, ingresos_con_anuncio: 129 },
      previo: null,
    },
    cobrado: { actual: { n: 14, total: 1208, sin_oportunidad: 9 }, previo: null },
    gasto: { actual: { total: 564.01, conversaciones: 177 }, previo: null },
    ingresos_por_servicio: [{ servicio: 'RNM', total: '229.00', n: 3 }],
  },
  situacion_actual: {
    potencial: { n: 138, total: 8196, sin_movimiento_14d: 0 },
    conversaciones_pendientes: 39,
    meta_sync: { ultimo_ok: '2026-10-05T04:50:00Z', ultimo_resultado: true },
  },
  ...extra,
});

test('derivarResumen ignora respuestas que no son de la versión 2', () => {
  assert.equal(derivarResumen(null), null);
  assert.equal(derivarResumen({ leads: {}, cobrado: {} }), null);
});

test('conversión por oportunidad: acumulada y a plazo solo con oportunidades maduras', () => {
  const c = derivarResumen(crudo()).conversion;
  assert.ok(Math.abs(c.acumulada - (3 / 264) * 100) < 1e-9);
  assert.ok(Math.abs(c.d7 - (1 / 142) * 100) < 1e-9);
  assert.equal(c.d30, null); // ninguna oportunidad ha cumplido 30 días: no hay tasa, no 0 %
  assert.equal(c.maduras30, 0);
});

test('oportunidades vs personas: no se confunden', () => {
  const o = derivarResumen(crudo()).oportunidades;
  assert.equal(o.total, 264);
  assert.equal(o.personas, 253);
  assert.equal(o.sinServicio, 151);
});

test('sin período previo no inventa variación (null, no 0 ni infinito)', () => {
  const r = derivarResumen(crudo());
  assert.equal(r.oportunidades.var, null);
  assert.equal(r.cobrado.var, null);
  assert.equal(r.gasto.previo, null);
  assert.equal(r.gasto.var, null);
});

test('atribución: con anuncio identificado no es lo mismo que cliente atribuido', () => {
  const at = derivarResumen(crudo()).atribucion;
  assert.equal(at.conAnuncio, 78);
  assert.ok(Math.abs(at.conAnuncioPct - (78 / 264) * 100) < 1e-9);
  assert.ok(Math.abs(at.costoPorOportunidad - 564.01 / 78) < 1e-9);
  // solo 2 pagos atribuidos (< mínimo): no se muestra costo por cliente
  assert.equal(at.muestraSuficiente, false);
  assert.equal(at.costoPorCliente, null);
});

test('costo por cliente atribuido aparece solo con muestra suficiente', () => {
  const base = crudo();
  base.resultados_periodo.oportunidades.actual.pagadas_con_anuncio = MIN_PAGOS_ATRIBUIDOS;
  const at = derivarResumen(base).atribucion;
  assert.equal(at.muestraSuficiente, true);
  assert.ok(Math.abs(at.costoPorCliente - 564.01 / MIN_PAGOS_ATRIBUIDOS) < 1e-9);
});

test('sin gasto no hay costos; sin oportunidades no hay porcentaje', () => {
  const base = crudo();
  base.resultados_periodo.gasto = { actual: null, previo: null };
  base.resultados_periodo.oportunidades.actual = { oportunidades: 0 };
  const r = derivarResumen(base);
  assert.equal(r.gasto.total, null);
  assert.equal(r.gasto.costoConversacion, null);
  assert.equal(r.atribucion.costoPorOportunidad, null);
  assert.equal(r.conversion.acumulada, null);
  assert.equal(r.atribucion.conAnuncioPct, null);
});

test('pagos sin oportunidad asociable se exponen (el cruce no explica todo el cobrado)', () => {
  const c = derivarResumen(crudo()).cobrado;
  assert.equal(c.pagos, 14);
  assert.equal(c.sinOportunidad, 9);
});

test('situación actual va aparte de los resultados del período', () => {
  const r = derivarResumen(crudo());
  assert.equal(r.actual.potencial.n, 138);
  assert.equal(r.actual.conversacionesPendientes, 39);
  assert.equal(r.actual.meta.estado === 'ok' || r.actual.meta.estado === 'atrasado', true);
});

test('saludMeta: al día / atrasada / falló / sin datos', () => {
  const ahora = new Date('2026-10-05T05:00:00Z');
  assert.equal(saludMeta({ ultimo_ok: '2026-10-05T04:50:00Z', ultimo_resultado: true }, ahora).estado, 'ok');
  assert.equal(saludMeta({ ultimo_ok: '2026-10-05T03:00:00Z', ultimo_resultado: true }, ahora).estado, 'atrasado');
  assert.equal(saludMeta({ ultimo_ok: '2026-10-05T04:55:00Z', ultimo_resultado: false }, ahora).estado, 'error');
  assert.equal(saludMeta(null, ahora).estado, 'sin_datos');
});

test('formato: variación y moneda con y sin centavos', () => {
  assert.equal(fmtVar(null), null);
  assert.equal(fmtVar(12.4), '+12 %');
  assert.equal(fmtBRL(null), '—');
  assert.match(fmtBRL(1208, 2), /1\.208,00/);
  assert.match(fmtBRL(1208), /1\.208$/);
});

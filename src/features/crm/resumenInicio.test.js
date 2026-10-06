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
      actual: { oportunidades: 264, personas: 253, con_anuncio: 78, sin_atribucion: 186, sin_servicio_elegido: 159, sin_servicio_activas: 58, sin_servicio_perdidas: 101, pagadas: 3,
        maduras_7d: 142, pagadas_7d: 1, maduras_30d: 0, pagadas_30d: 0, pagadas_con_anuncio: 2, ingresos_con_anuncio: 129 },
      previo: null,
    },
    cobrado: { actual: { n: 16, total: 1365, atribuido: 5, ambiguo: 0, sin_coincidencia: 2, sin_oportunidad: 9 }, previo: null },
    gasto: { actual: { total: 564.01, conversaciones: 177 }, previo: null },
    ingresos_por_servicio: [{ servicio: 'RNM', total: '229.00', n: 3 }],
  },
  situacion_actual: {
    potencial: { n: 143, total: 9508, sin_actividad_7d: 109, sin_actividad_14d: 0 },
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
  assert.equal(o.sinServicio, 159);
  // las perdidas no cuentan como trabajo pendiente
  assert.equal(o.sinServicioActivas, 58);
  assert.equal(o.sinServicioPerdidas, 101);
  assert.equal(o.sinServicioActivas + o.sinServicioPerdidas, o.sinServicio);
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

test('conciliación de pagos: atribuidos vs sin atribución confirmada', () => {
  const c = derivarResumen(crudo()).cobrado;
  assert.equal(c.pagos, 16);
  assert.equal(c.atribuidos, 5);
  assert.equal(c.sinOportunidad, 9);
  assert.equal(c.sinCoincidencia, 2);
  assert.equal(c.sinAtribucionConfirmada, 11);
  assert.equal(c.atribuidos + c.sinAtribucionConfirmada, c.pagos);
});

test('propuestas abiertas: la inactividad se mide con actividad real', () => {
  const p = derivarResumen(crudo()).actual.potencial;
  assert.equal(p.sinActividad7d, 109);
  assert.equal(p.sinActividad14d, 0);
});

test('situación actual va aparte de los resultados del período', () => {
  const r = derivarResumen(crudo());
  assert.equal(r.actual.potencial.n, 143);
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

import { derivarEmbudo, derivarEconomia } from './resumenInicio.js';

const crudoEmbudo = () => ({
  version: 1,
  embudo: { actual: { oportunidades: 264, con_servicio: 113, propuesta: 141, pago: 3, iniciado: 5, iniciado_sin_pago: 2, perdidas: 171 }, previo: null },
  costos_conocidos: { gastos_registrados: { n: 0, total: 0 }, catalogo: { servicios: 10, con_precio: 9, con_costo: 0 } },
});

test('embudo: pasos, tasa respecto al paso anterior y servicio elegido fuera de los pasos', () => {
  const e = derivarEmbudo(crudoEmbudo());
  assert.deepEqual(e.pasos.map((p) => p.id), ['oportunidades', 'propuesta', 'pago', 'iniciado']);
  assert.equal(e.pasos[0].tasa, null);
  assert.ok(Math.abs(e.pasos[1].tasa - (141 / 264) * 100) < 1e-9);
  assert.ok(Math.abs(e.pasos[2].tasa - (3 / 141) * 100) < 1e-9);
  assert.equal(e.sinServicio, 151);
  assert.equal(e.iniciadoSinPago, 2);
  assert.ok(Math.abs(e.perdidasPct - (171 / 264) * 100) < 1e-9);
});

test('embudo: sin pagos la tasa del siguiente paso es null (no 0 ni infinito)', () => {
  const c = crudoEmbudo();
  c.embudo.actual.pago = 0;
  const e = derivarEmbudo(c);
  assert.equal(e.pasos[3].tasa, null);
  assert.equal(derivarEmbudo({ version: 9 }), null);
});

test('economía: solo resultado tras publicidad, nunca margen neto sin costos registrados', () => {
  const eco = derivarEconomia(derivarResumen(crudo()), derivarEmbudo(crudoEmbudo()));
  assert.ok(Math.abs(eco.resultadoTrasPublicidad - (1365 - 564.01)) < 1e-9);
  assert.ok(Math.abs(eco.roas - 1365 / 564.01) < 1e-9);
  assert.equal(eco.margenNetoDisponible, false);
  assert.equal(eco.faltan.length, 2);
});

test('economía: sin gasto de Meta no hay resultado ni ROAS (null)', () => {
  const base = crudo();
  base.resultados_periodo.gasto = { actual: null, previo: null };
  const eco = derivarEconomia(derivarResumen(base), derivarEmbudo(crudoEmbudo()));
  assert.equal(eco.resultadoTrasPublicidad, null);
  assert.equal(eco.roas, null);
});

test('economía: el margen neto solo se habilita con gastos y costos cargados', () => {
  const e = crudoEmbudo();
  e.costos_conocidos = { gastos_registrados: { n: 3, total: 100 }, catalogo: { servicios: 10, con_precio: 10, con_costo: 10 } };
  const eco = derivarEconomia(derivarResumen(crudo()), derivarEmbudo(e));
  assert.equal(eco.margenNetoDisponible, true);
  assert.equal(eco.faltan.length, 0);
});

test('embudo: un paso mayor que el anterior no muestra tasa >100 % (se compara con las oportunidades)', () => {
  const e = derivarEmbudo(crudoEmbudo());
  // trámite iniciado (5) > pago (3): sin tasa de avance, pero sí su peso sobre las oportunidades
  assert.equal(e.pasos[3].tasa, null);
  assert.ok(Math.abs(e.pasos[3].deOportunidades - (5 / 264) * 100) < 1e-9);
  // los pasos que sí avanzan conservan su tasa
  assert.ok(e.pasos[2].tasa <= 100);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { hoySaoPaulo, periodoDeFiltro, derivarResumen, saludMeta, fmtVar, fmtBRL } from './resumenInicio.js';

test('hoySaoPaulo usa el día de São Paulo aunque en UTC ya sea el siguiente', () => {
  // 2026-10-06 01:30 UTC = 2026-10-05 22:30 en São Paulo
  const d = hoySaoPaulo(new Date('2026-10-06T01:30:00Z'));
  assert.equal([d.getFullYear(), d.getMonth() + 1, d.getDate()].join('-'), '2026-10-5');
});

test('periodoDeFiltro: 7 días y previo de igual duración', () => {
  const p = periodoDeFiltro('7d', {}, new Date('2026-10-05T15:00:00Z'));
  assert.equal(p.desde, '2026-09-29');
  assert.equal(p.hasta, '2026-10-05');
  assert.deepEqual([p.previo.desde, p.previo.hasta], ['2026-09-22', '2026-09-28']);
});

test('periodoDeFiltro: personalizado incompleto devuelve null', () => {
  assert.equal(periodoDeFiltro('custom', { desde: '2026-10-01' }), null);
  assert.equal(periodoDeFiltro('custom', { desde: '2026-10-01', hasta: '2026-10-03' }).dias, 3);
});

const crudo = {
  leads: { actual: { brutos: 261, personas: 250, personas_meta: 77, personas_pagaron: 4 }, previo: null },
  cobrado: { actual: { n: 14, total: 1208 }, previo: null },
  gasto: { actual: { total: 564.01, conversaciones: 177 }, previo: null },
  potencial: { n: 137, total: 8215 },
  conversaciones_pendientes: 37,
  ingresos_por_servicio: [{ servicio: 'RNM', total: '229.00', n: 3 }],
  meta_sync: { ultimo_ok: '2026-10-05T04:50:00Z', ultimo_resultado: true },
};

test('derivarResumen: conversión por cohorte y costos', () => {
  const r = derivarResumen(crudo);
  assert.equal(r.leads.personas, 250);
  assert.ok(Math.abs(r.conversion.pct - 1.6) < 1e-9);
  assert.ok(Math.abs(r.gasto.costoConversacion - 564.01 / 177) < 1e-9);
  assert.ok(Math.abs(r.gasto.atribuidosPct - 30.8) < 0.1);
});

test('derivarResumen: sin período previo no inventa variación (null, no 0)', () => {
  const r = derivarResumen(crudo);
  // previo sin filas: leads/cobrado se tratan como 0 reales → sin base (null) y no +Infinity
  assert.equal(r.leads.var, null);
  assert.equal(r.cobrado.var, null);
  // gasto previo ausente es "sin dato", no 0
  assert.equal(r.gasto.previo, null);
  assert.equal(r.gasto.var, null);
});

test('derivarResumen: sin gasto no hay costo por conversación', () => {
  const r = derivarResumen({ ...crudo, gasto: { actual: null, previo: null } });
  assert.equal(r.gasto.total, null);
  assert.equal(r.gasto.costoConversacion, null);
});

test('derivarResumen: sin leads la conversión es null, no 0 %', () => {
  const r = derivarResumen({ ...crudo, leads: { actual: null, previo: null } });
  assert.equal(r.conversion.pct, null);
  assert.equal(r.leads.personas, 0);
});

test('saludMeta: al día / atrasada / falló / sin datos', () => {
  const ahora = new Date('2026-10-05T05:00:00Z');
  assert.equal(saludMeta({ ultimo_ok: '2026-10-05T04:50:00Z', ultimo_resultado: true }, ahora).estado, 'ok');
  assert.equal(saludMeta({ ultimo_ok: '2026-10-05T03:00:00Z', ultimo_resultado: true }, ahora).estado, 'atrasado');
  assert.equal(saludMeta({ ultimo_ok: '2026-10-05T04:55:00Z', ultimo_resultado: false }, ahora).estado, 'error');
  assert.equal(saludMeta(null, ahora).estado, 'sin_datos');
});

test('formato: variación y moneda', () => {
  assert.equal(fmtVar(null), null);
  assert.equal(fmtVar(12.4), '+12 %');
  assert.equal(fmtVar(-3.6), '-4 %');
  assert.equal(fmtBRL(null), '—');
});

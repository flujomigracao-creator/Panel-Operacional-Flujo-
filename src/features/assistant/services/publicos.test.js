import test from 'node:test';
import assert from 'node:assert/strict';
import { agruparPublicos, conteoIntencion, esNoCompra, resumenExclusion } from './publicos.js';

const AHORA = new Date('2026-11-10T12:00:00Z');
const lead = (o) => ({ pais: 'CU', servicio: 'CPF', intencion: 'COLD', pagos: 0, ingresos: 0, propuesta_enviada: false, created_at: '2026-11-01T00:00:00Z', last_inbound_at: null, meta_ctwa_clid: null, ...o });

test('agruparPublicos: cuenta etapas y mide contra pagos reales', () => {
  const filas = agruparPublicos([
    lead({ intencion: 'PAID', pagos: 1, ingresos: 79, meta_ctwa_clid: 'x' }),
    lead({ intencion: 'PROPOSAL' }),
    lead({ intencion: 'COLD' }),
    lead({ pais: 'VE', servicio: 'RNM', intencion: 'COLD' }),
  ], 'pais');
  const cu = filas.find((f) => f.clave === 'CU');
  assert.deepEqual([cu.leads, cu.calificados, cu.propuestas, cu.pagos, cu.ingresos, cu.deAnuncio], [3, 2, 2, 1, 79, 1]);
  assert.equal(cu.pctPago, 1 / 3);
  assert.equal(filas[0].clave, 'CU'); // el de más ingresos primero
});

test('agruparPublicos: país + servicio combina las dos claves', () => {
  const filas = agruparPublicos([lead({}), lead({ servicio: 'RNM' })], 'pais_servicio');
  assert.deepEqual(filas.map((f) => f.clave).sort(), ['CU · CPF', 'CU · RNM']);
});

test('conteoIntencion: siempre devuelve las 7 intenciones', () => {
  const c = conteoIntencion([lead({ intencion: 'LOST' })]);
  assert.equal(Object.keys(c).length, 7);
  assert.equal(c.LOST, 1);
  assert.equal(c.PAID, 0);
});

test('esNoCompra: exige propuesta, sin pago y 30+ días sin escribir', () => {
  const viejo = { propuesta_enviada: true, last_inbound_at: '2026-10-01T00:00:00Z' };
  assert.equal(esNoCompra(lead(viejo), AHORA), true);
  assert.equal(esNoCompra(lead({ ...viejo, pagos: 1 }), AHORA), false);
  assert.equal(esNoCompra(lead({ ...viejo, propuesta_enviada: false }), AHORA), false);
  assert.equal(esNoCompra(lead({ propuesta_enviada: true, last_inbound_at: '2026-11-05T00:00:00Z' }), AHORA), false);
});

test('esNoCompra: un lead movido a Perdido sin criterio de comportamiento no cuenta', () => {
  assert.equal(esNoCompra(lead({ intencion: 'LOST', propuesta_enviada: false }), AHORA), false);
});

test('resumenExclusion: separa los que ya entran de los que están en espera y da la próxima fecha', () => {
  const r = resumenExclusion([
    lead({ propuesta_enviada: true, last_inbound_at: '2026-10-01T00:00:00Z' }),
    lead({ propuesta_enviada: true, last_inbound_at: '2026-11-05T00:00:00Z' }),
    lead({ propuesta_enviada: true, last_inbound_at: '2026-11-08T00:00:00Z' }),
  ], AHORA);
  assert.equal(r.total, 1);
  assert.equal(r.enEspera, 2);
  assert.equal(r.proximaEntrada.toISOString().slice(0, 10), '2026-12-05');
});

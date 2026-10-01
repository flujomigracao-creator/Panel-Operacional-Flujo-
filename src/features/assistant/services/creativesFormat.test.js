import test from 'node:test';
import assert from 'node:assert/strict';
import { formatear, mejoresIndices, METRICAS } from './creativesFormat.js';

test('formatear nunca convierte la ausencia de dato en 0', () => {
  assert.equal(formatear(null, 'int'), '—');
  assert.equal(formatear(undefined, 'brl'), '—');
  assert.equal(formatear('', 'pct'), '—');
  assert.equal(formatear(0, 'int'), '0');
  assert.equal(formatear(12.5, 'pct'), '12.50 %');
});

test('mejoresIndices: costos se minimizan, volumen se maximiza', () => {
  assert.deepEqual(mejoresIndices([30, 10, 20], 'min'), [1]);
  assert.deepEqual(mejoresIndices([30, 10, 20], 'max'), [0]);
});

test('mejoresIndices ignora nulos y no marca nada sin al menos 2 datos o con empate total', () => {
  assert.deepEqual(mejoresIndices([null, 5, null], 'max'), []);
  assert.deepEqual(mejoresIndices([null, 5, 9], 'max'), [2]);
  assert.deepEqual(mejoresIndices([4, 4, 4], 'min'), []);
});

test('el comparador cubre las métricas pedidas', () => {
  const claves = METRICAS.map(m => m.key);
  for (const k of ['impresiones', 'ctr', 'conversaciones', 'costo_por_conversacion', 'clientes_pagaron', 'costo_por_cliente']) assert.ok(claves.includes(k), k);
});

import { resumirPorServicio } from './creativesFormat.js';

test('resumirPorServicio suma datos reales y deja null cuando no hay ninguno', () => {
  const r = resumirPorServicio(
    [
      { service: 'CPF', conversaciones: 7, clientes_pagaron: 1, ingresos: 100, leads: 2 },
      { service: 'CPF', conversaciones: 3, clientes_pagaron: null, ingresos: null, leads: null },
      { service: 'RNM', conversaciones: null, clientes_pagaron: null, ingresos: null, leads: null },
    ],
    [{ service: 'CPF', status: 'completed' }, { service: 'CPF', status: 'running' }],
  );
  const cpf = r.find(x => x.servicio === 'CPF');
  assert.deepEqual([cpf.creativos, cpf.experimentos, cpf.concluidos, cpf.conversaciones, cpf.clientes, cpf.ingresos], [2, 2, 1, 10, 1, 100]);
  const rnm = r.find(x => x.servicio === 'RNM');
  assert.equal(rnm.conversaciones, null);
  assert.equal(rnm.clientes, null);
});

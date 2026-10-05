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

import { unirConversion, resumenCobertura } from './creativesFormat.js';

test('unirConversion ordena por clientes y conversaciones reales; sin dato va al final (no cuenta como 0)', () => {
  const r = unirConversion(
    [
      { id: 'a', status: 'draft', prompt_id: 'p1', clientes_pagaron: null, conversaciones: null },
      { id: 'b', status: 'published', prompt_id: 'p1', clientes_pagaron: 1, conversaciones: 5 },
      { id: 'c', status: 'published', prompt_id: 'p2', clientes_pagaron: 3, conversaciones: 2 },
      { id: 'd', status: 'archived', prompt_id: 'p2', clientes_pagaron: 9, conversaciones: 9 },
    ],
    [{ id: 'p1', name: 'CPF · persona' }, { id: 'p2', name: 'RNM · documento' }],
  );
  assert.deepEqual(r.map(x => x.id), ['c', 'b', 'a']);
  assert.equal(r[0].prompt_nombre, 'RNM · documento');
});

test('resumenCobertura dice ESPERANDO TRÁFICO REAL sin anuncios y no inventa porcentajes', () => {
  const e = resumenCobertura({ leads: 160, con_anuncio: 0, referidos_recibidos: 0 });
  assert.equal(e.estado, 'esperando');
  assert.match(e.texto, /ESPERANDO TRÁFICO REAL: de 160 leads, ninguno/);
  const p = resumenCobertura({ leads: 100, con_anuncio: 25, cerrados: 4, cerrados_con_anuncio: 1 });
  assert.equal(p.estado, 'parcial');
  assert.match(p.texto, /25 de 100 leads \(25 %\).*1 de 4 cerrados/);
  assert.equal(resumenCobertura(null).estado, 'desconocido');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { parsearTendencias } from './trends.ts';

test('parsearTendencias extrae el JSON aunque venga con texto alrededor y normaliza la confianza', () => {
  const t = parsearTendencias('Aquí tienes:\n{"tendencias":[{"tema":"Citas PF","resumen":"Hay más demanda","como_aplicarlo_en_anuncio":"Hook de urgencia","fecha_o_periodo":"2026","confianza":"alta"},{"tema":"X","resumen":"Y","confianza":"rara"}]}\nfin');
  assert.equal(t.length, 2);
  assert.equal(t[0].aplicacion, 'Hook de urgencia');
  assert.equal(t[1].confianza, 'baja');
});

test('parsearTendencias devuelve null si no hay JSON válido o no hay tendencias completas', () => {
  assert.equal(parsearTendencias('sin json'), null);
  assert.equal(parsearTendencias('{"tendencias":[{"tema":"","resumen":""}]}'), null);
  assert.equal(parsearTendencias('{rota'), null);
});

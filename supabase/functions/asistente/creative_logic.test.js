// Pruebas del Laboratorio de Creativos V5 (lógica pura).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluarGanador, pValorDosProporciones, construirPromptPublicitario, validarCreativo, tipoImagen, tamanoOpenAI,
} from './creative_logic.ts';

const v = (nombre, imp, conv, gasto, cli = 0) => ({ nombre, impresiones: imp, clics: Math.round(imp / 50), gasto, conversaciones: conv, clientes_pagaron: cli });

test('sin impresiones o con una sola variante no hay datos', () => {
  assert.equal(evaluarGanador([v('A', 5000, 20, 100)], 7).veredicto, 'sin_datos');
  assert.equal(evaluarGanador([v('A', 0, 0, 0), v('B', null, null, null)], 7).veredicto, 'sin_datos');
});

test('con pocas impresiones, pocos días o pocas conversaciones es insuficiente y NO declara ganador', () => {
  const pocasImp = evaluarGanador([v('A', 400, 5, 20), v('B', 5000, 40, 100)], 7);
  assert.equal(pocasImp.veredicto, 'insuficiente');
  assert.equal(pocasImp.ganador, null);
  assert.equal(evaluarGanador([v('A', 5000, 20, 100), v('B', 5000, 40, 100)], 2).veredicto, 'insuficiente');
  assert.equal(evaluarGanador([v('A', 5000, 3, 100), v('B', 5000, 4, 100)], 7).veredicto, 'insuficiente');
});

test('diferencia pequeña entre variantes es tendencia, no ganador', () => {
  const r = evaluarGanador([v('A', 5000, 50, 100), v('B', 5000, 55, 100)], 7);
  assert.equal(r.veredicto, 'tendencia');
  assert.equal(r.ganador, null);
});

test('ventaja grande y significativa en conversaciones declara ganador (confianza media sin pagos)', () => {
  const r = evaluarGanador([v('A', 8000, 30, 200), v('B', 8000, 90, 200)], 7);
  assert.equal(r.veredicto, 'ganador');
  assert.equal(r.ganador, 'B');
  assert.equal(r.metrica, 'costo_por_conversacion');
  assert.equal(r.confianza, 'media');
  assert.match(r.motivo, /sin clientes pagantes|Aún sin clientes/);
});

test('con clientes pagantes suficientes la métrica es costo por cliente y la confianza sube a alta', () => {
  const r = evaluarGanador([v('A', 8000, 30, 200, 1), v('B', 8000, 90, 200, 4)], 10);
  assert.equal(r.metrica, 'costo_por_cliente');
  assert.equal(r.ganador, 'B');
  assert.equal(r.confianza, 'alta');
});

test('prueba z: iguales ≈ p 1; muy distintas ≈ p muy bajo; sin muestra = null', () => {
  assert.ok(pValorDosProporciones(50, 1000, 50, 1000) > 0.9);
  assert.ok(pValorDosProporciones(10, 1000, 100, 1000) < 0.001);
  assert.equal(pValorDosProporciones(0, 0, 1, 10), null);
});

test('el prompt conserva la identidad de marca, separa el servicio y sustituye variables', () => {
  const p = construirPromptPublicitario({ servicio: 'CPF', concepto: 'persona', hook: 'Tu CPF sin filas', variables: {} });
  assert.match(p, /CPF/);
  assert.match(p, /#1e40af/);
  assert.match(p, /Tu CPF sin filas/);
  assert.doesNotMatch(p, /Refúgio|RNM/);
  assert.equal(construirPromptPublicitario({ servicio: 'RNM', visual_concept: 'en {{lugar}}', variables: { lugar: 'São Paulo' } }).includes('São Paulo'), true);
});

test('validación de servicio, formato e imagen', () => {
  assert.equal(validarCreativo({ service: 'CPF', format: '4:5' }), null);
  assert.match(validarCreativo({ service: 'Visa Turista' }), /Servicio inválido/);
  assert.match(validarCreativo({ service: 'CPF', format: '16:9' }), /Formato inválido/);
  assert.equal(tipoImagen('image/jpg').ext, 'jpg');
  assert.equal(tipoImagen('image/svg+xml'), null);
  assert.equal(tamanoOpenAI('9:16'), '1024x1536');
});

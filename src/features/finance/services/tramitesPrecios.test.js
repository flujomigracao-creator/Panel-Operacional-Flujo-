import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMonto, validarTramite, calcularMargen } from './tramitesPrecios.js';

test('parseMonto entiende formatos habituales y rechaza basura', () => {
  assert.equal(parseMonto('90'), 90);
  assert.equal(parseMonto('1234.5'), 1234.5);
  assert.equal(parseMonto('1.234,50'), 1234.5);
  assert.equal(parseMonto('R$ 79,90'), 79.9);
  assert.equal(parseMonto(''), null);
  assert.equal(parseMonto('abc'), null);
  assert.equal(parseMonto('-5'), null);
  assert.equal(parseMonto(null), null);
});

test('validarTramite exige nombre y precio; el costo es opcional', () => {
  const vacio = validarTramite({ nombre: '  ', precio: '' });
  assert.equal(vacio.ok, false);
  assert.ok(vacio.errores.nombre && vacio.errores.precio);

  const ok = validarTramite({ nombre: ' Antecedentes ', descripcion: ' x ', precio: '120', costo: '' });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.datos, { nombre: 'Antecedentes', descripcion: 'x', precio: 120, costo: null });
});

test('validarTramite rechaza costo inválido o mayor que el precio', () => {
  assert.ok(validarTramite({ nombre: 'A', precio: '50', costo: 'x' }).errores.costo);
  assert.ok(validarTramite({ nombre: 'A', precio: '50', costo: '80' }).errores.costo);
  assert.equal(validarTramite({ nombre: 'A', precio: '50', costo: '50' }).ok, true);
});

test('calcularMargen devuelve null si falta un dato, nunca inventa', () => {
  assert.equal(calcularMargen(100, null), null);
  assert.equal(calcularMargen(null, 10), null);
  assert.equal(calcularMargen(0, 0), null);
  assert.deepEqual(calcularMargen(100, 40), { monto: 60, porcentaje: 60 });
});

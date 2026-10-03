import test from 'node:test';
import assert from 'node:assert/strict';
import { filtrarCatalogo, agruparEmplazamientos } from './catalogoMeta.js';

const FILAS = [
  { clase: 'behaviors', meta_id: '6015559470583', nombre: 'Vive en el extranjero', ruta: 'Comportamientos > Expatriados' },
  { clase: 'behaviors', meta_id: '6018797127383', nombre: 'Vivieron en Cuba (anteriormente expatriados - Cuba)', ruta: 'Comportamientos > Expatriados' },
  { clase: 'locale', meta_id: '1002', nombre: 'Español (todos)', ruta: null },
  { clase: 'region', meta_id: '459', nombre: 'São Paulo', ruta: 'Brasil' },
];

test('filtrarCatalogo: filtra por clase y busca sin acentos ni mayúsculas', () => {
  assert.equal(filtrarCatalogo(FILAS, 'behaviors').length, 2);
  assert.deepEqual(filtrarCatalogo(FILAS, 'locale', 'ESPANOL').map((f) => f.meta_id), ['1002']);
  assert.deepEqual(filtrarCatalogo(FILAS, 'region', 'sao paulo').map((f) => f.meta_id), ['459']);
});

test('filtrarCatalogo: busca también por ruta y por id, y ordena por nombre', () => {
  const porRuta = filtrarCatalogo(FILAS, 'behaviors', 'expatriados');
  assert.equal(porRuta.length, 2);
  assert.equal(porRuta[0].nombre, 'Vive en el extranjero');
  assert.deepEqual(filtrarCatalogo(FILAS, 'behaviors', '6018797').map((f) => f.meta_id), ['6018797127383']);
});

test('agruparEmplazamientos: suma por clave y deja el costo en null sin conversaciones', () => {
  const r = agruparEmplazamientos([
    { clave: 'facebook|feed', gasto: 100, conversaciones: 20 },
    { clave: 'facebook|feed', gasto: 50, conversaciones: 10 },
    { clave: 'whatsapp|status', gasto: 16, conversaciones: null },
  ]);
  assert.equal(r[0].nombre, 'Facebook · Feed');
  assert.equal(r[0].gasto, 150);
  assert.equal(r[0].costo, 5);
  assert.equal(r[1].nombre, 'WhatsApp · Estados');
  assert.equal(r[1].costo, null);
});

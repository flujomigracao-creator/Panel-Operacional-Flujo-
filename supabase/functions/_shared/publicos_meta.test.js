import test from 'node:test';
import assert from 'node:assert/strict';
import { elegirIdiomaEspanol, armarSegmentacion, publicosPorVariante } from './publicos_meta.ts';

const CATALOGO = [
  { clase: 'locale', meta_id: '23', nombre: 'Español' },
  { clase: 'locale', meta_id: '7', nombre: 'Español (España)' },
  { clase: 'locale', meta_id: '1002', nombre: 'Español (todos)' },
  { clase: 'behaviors', meta_id: '6015559470583', nombre: 'Vive en el extranjero' },
  { clase: 'behaviors', meta_id: '6018797127383', nombre: 'Vivieron en Cuba (anteriormente expatriados - Cuba)' },
];
const DEF = {
  codigo: 'CU_CPF_ADQ', nombre: 'Cuba · CPF', tipo: 'adquisicion', ubicacion: { paises: ['BR'] }, edad_min: 21, edad_max: 65,
  comportamientos: [{ empieza: 'Vive en el extranjero' }, { empieza: 'Vivieron en Cuba' }],
};

test('elegirIdiomaEspanol: prefiere «Español (todos)» y cae al genérico', () => {
  assert.equal(elegirIdiomaEspanol(CATALOGO), 1002);
  assert.equal(elegirIdiomaEspanol(CATALOGO.filter((o) => o.meta_id !== '1002')), 23);
  assert.equal(elegirIdiomaEspanol([]), null);
});

test('armarSegmentacion: Brasil + español + edad + comportamientos juntos («o»)', () => {
  const t = armarSegmentacion(DEF, CATALOGO);
  assert.deepEqual(t.geo_locations, { countries: ['BR'] });
  assert.deepEqual([t.age_min, t.age_max], [21, 65]);
  assert.deepEqual(t.locales, [1002]);
  assert.equal(t.flexible_spec.length, 1);
  assert.deepEqual(t.flexible_spec[0].behaviors.map((b) => b.id), ['6015559470583', '6018797127383']);
});

test('armarSegmentacion: el control no lleva comportamientos', () => {
  const t = armarSegmentacion({ ...DEF, codigo: 'CU_CONTROL_ADQ', comportamientos: [], es_control: true }, CATALOGO);
  assert.equal('flexible_spec' in t, false);
});

test('armarSegmentacion: si falta una opción, falla sin sustituir', () => {
  const sin = CATALOGO.filter((o) => !o.nombre.startsWith('Vivieron en Cuba'));
  assert.throws(() => armarSegmentacion(DEF, sin), /Vivieron en Cuba/);
});

test('armarSegmentacion: sin idioma o sin comportamientos (y sin ser control) falla', () => {
  assert.throws(() => armarSegmentacion(DEF, CATALOGO.filter((o) => o.clase !== 'locale')), /idioma español/);
  assert.throws(() => armarSegmentacion({ ...DEF, comportamientos: [] }, CATALOGO), /no tiene comportamientos/);
});

test('armarSegmentacion: solo los públicos de adquisición van a conjuntos de anuncios', () => {
  assert.throws(() => armarSegmentacion({ ...DEF, tipo: 'exclusion' }, CATALOGO), /adquisici/);
});

test('publicosPorVariante: uno para todos, uno por variante o error', () => {
  assert.deepEqual(publicosPorVariante(undefined, 2), [null, null]);
  assert.deepEqual(publicosPorVariante(['A'], 3), ['A', 'A', 'A']);
  assert.deepEqual(publicosPorVariante(['A', 'B'], 2), ['A', 'B']);
  assert.throws(() => publicosPorVariante(['A', 'B', 'C'], 2), /uno por variante/);
});

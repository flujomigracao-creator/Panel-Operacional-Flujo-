import test from 'node:test';
import assert from 'node:assert/strict';
import { diaSP, horaSP, etiquetaDia, aInputSP, deInputSP, franjaDeHora, esVencida, contarPorEstado, filtrar, agruparPorDia, parchePara, accionesDe, enlaceValido } from './publicaciones.js';

const P = (id, iso, estado = 'borrador') => ({ id, programada_at: iso, estado });

test('día y hora se muestran en São Paulo, no en UTC', () => {
  // 08/10 00:30 UTC = 07/10 21:30 en São Paulo
  assert.equal(diaSP('2026-10-08T00:30:00Z'), '2026-10-07');
  assert.equal(horaSP('2026-10-08T00:30:00Z'), '21:30');
  assert.equal(horaSP('2026-10-08T10:30:00Z'), '07:30');
});

test('etiquetaDia: día de la semana en español', () => {
  assert.match(etiquetaDia('2026-10-08'), /jueves/i);
  assert.match(etiquetaDia('2026-10-08'), /8 de octubre/);
});

test('aInputSP y deInputSP son inversos', () => {
  const iso = '2026-10-08T10:30:00.000Z';
  assert.equal(aInputSP(iso), '2026-10-08T07:30');
  assert.equal(deInputSP('2026-10-08T07:30'), iso);
});

test('deInputSP rechaza texto que no es fecha', () => {
  assert.equal(deInputSP(''), null);
  assert.equal(deInputSP('mañana'), null);
  assert.equal(deInputSP('2026-13-45T99:99'), null);
});

test('franjaDeHora', () => {
  assert.equal(franjaDeHora('07:30'), 'manana');
  assert.equal(franjaDeHora('12:30'), 'tarde');
  assert.equal(franjaDeHora('20:30'), 'noche');
});

test('vencida: solo si está pendiente y su hora ya pasó', () => {
  const ahora = new Date('2026-10-08T15:00:00Z');
  assert.equal(esVencida(P(1, '2026-10-08T10:30:00Z', 'borrador'), ahora), true);
  assert.equal(esVencida(P(2, '2026-10-08T10:30:00Z', 'aprobada'), ahora), true);
  assert.equal(esVencida(P(3, '2026-10-08T10:30:00Z', 'publicada'), ahora), false);
  assert.equal(esVencida(P(4, '2026-10-08T10:30:00Z', 'descartada'), ahora), false);
  assert.equal(esVencida(P(5, '2026-10-09T10:30:00Z', 'borrador'), ahora), false);
});

test('contarPorEstado y filtrar', () => {
  const ahora = new Date('2026-10-08T15:00:00Z');
  const l = [P(1, '2026-10-08T10:30:00Z', 'borrador'), P(2, '2026-10-09T10:30:00Z', 'aprobada'), P(3, '2026-10-07T10:30:00Z', 'publicada'), P(4, '2026-10-09T15:30:00Z', 'descartada')];
  assert.deepEqual(contarPorEstado(l, ahora), { total: 4, borrador: 1, aprobada: 1, publicada: 1, descartada: 1, vencidas: 1 });
  assert.deepEqual(filtrar(l, 'pendientes').map((p) => p.id), [1, 2]);
  assert.deepEqual(filtrar(l, 'publicada').map((p) => p.id), [3]);
  assert.equal(filtrar(l, 'todas').length, 4);
});

test('agruparPorDia: agrupa por día de São Paulo y ordena por hora', () => {
  const g = agruparPorDia([
    P('c', '2026-10-09T23:30:00Z'), // 09/10 20:30 SP
    P('a', '2026-10-08T10:30:00Z'), // 08/10 07:30 SP
    P('b', '2026-10-08T15:30:00Z'), // 08/10 12:30 SP
  ]);
  assert.deepEqual(g.map((x) => x.dia), ['2026-10-08', '2026-10-09']);
  assert.deepEqual(g[0].items.map((p) => p.id), ['a', 'b']);
});

test('la noche de São Paulo que cae en el día siguiente en UTC se agrupa en su día local', () => {
  // 09/10 00:10 UTC = 08/10 21:10 SP: pertenece al día 8
  assert.equal(agruparPorDia([P('x', '2026-10-09T00:10:00Z')])[0].dia, '2026-10-08');
});

test('parchePara: publicar guarda fecha y enlace; salir de publicada los limpia', () => {
  const ahora = new Date('2026-10-08T15:00:00Z');
  assert.deepEqual(parchePara('publicar', ahora, ' https://facebook.com/p/1 '), { estado: 'publicada', publicada_at: '2026-10-08T15:00:00.000Z', enlace_publicacion: 'https://facebook.com/p/1' });
  assert.equal(parchePara('publicar', ahora).enlace_publicacion, null);
  assert.deepEqual(parchePara('quitarAprobacion'), { estado: 'borrador', publicada_at: null, enlace_publicacion: null });
  assert.equal(parchePara('aprobar').estado, 'aprobada');
  assert.equal(parchePara('descartar').estado, 'descartada');
  assert.equal(parchePara('restaurar').estado, 'borrador');
  assert.throws(() => parchePara('borrar'));
});

test('accionesDe: lo que se puede hacer según el estado', () => {
  assert.deepEqual(accionesDe('borrador'), ['aprobar', 'publicar', 'descartar']);
  assert.deepEqual(accionesDe('aprobada'), ['publicar', 'quitarAprobacion', 'descartar']);
  assert.deepEqual(accionesDe('descartada'), ['restaurar']);
  assert.deepEqual(accionesDe('inventado'), []);
});

test('enlaceValido: vacío o http(s)', () => {
  assert.equal(enlaceValido(''), true);
  assert.equal(enlaceValido('https://facebook.com/x'), true);
  assert.equal(enlaceValido('javascript:alert(1)'), false);
  assert.equal(enlaceValido('no es un enlace'), false);
});

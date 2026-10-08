import test from 'node:test';
import assert from 'node:assert/strict';
import { leerClasificacion, decidir, respuestaPublica, mensajePrivado, extraerComentarios, UMBRAL_BORRAR } from './decision.js';

const C = (clase, confianza) => ({ clase, confianza });

test('leerClasificacion: JSON válido, inválido y clase inventada', () => {
  assert.deepEqual(leerClasificacion('{"clase":"malo","confianza":0.98,"motivo":"insulto"}'), { clase: 'malo', confianza: 0.98, motivo: 'insulto', valida: true });
  assert.equal(leerClasificacion('no es json').clase, 'neutro');
  assert.equal(leerClasificacion('no es json').confianza, 0);
  assert.equal(leerClasificacion('{"clase":"borrar_todo","confianza":1}').valida, false);
  assert.equal(leerClasificacion('{"clase":"malo","confianza":7}').confianza, 1);
  assert.equal(leerClasificacion({ clase: 'elogio', confianza: 'x' }).confianza, 0);
});

test('lo malo solo se borra con confianza alta', () => {
  assert.equal(decidir(C('malo', 0.99)).accion, 'borrar');
  assert.equal(decidir(C('malo', UMBRAL_BORRAR)).accion, 'borrar');
  assert.equal(decidir(C('malo', 0.9)).accion, 'tarea');
  assert.equal(decidir(C('malo', 0.5)).accion, 'tarea');
});

test('una clasificación inválida (neutro sin confianza) nunca borra ni responde', () => {
  assert.equal(decidir(leerClasificacion('basura')).accion, 'ninguna');
});

test('las quejas legítimas nunca se borran: tarea para una persona', () => {
  assert.equal(decidir(C('queja_legitima', 0.99)).accion, 'tarea');
});

test('elogio e interés: responden solo con confianza suficiente y en comentarios de primer nivel', () => {
  assert.equal(decidir(C('elogio', 0.99)).accion, 'responder');
  assert.equal(decidir(C('interes', 0.85)).accion, 'responder');
  assert.equal(decidir(C('interes', 0.6)).accion, 'ninguna');
  assert.equal(decidir(C('interes', 0.99), {}, true).accion, 'ninguna');
});

test('un malo dentro de una respuesta sí se puede borrar (la moderación no depende del nivel)', () => {
  assert.equal(decidir(C('malo', 0.99), {}, true).accion, 'borrar');
});

test('neutro no hace nada', () => {
  assert.equal(decidir(C('neutro', 0.99)).accion, 'ninguna');
});

test('interruptores del panel: bot apagado y borrado desactivado', () => {
  const apagado = decidir(C('malo', 0.99), { activo: false });
  assert.equal(apagado.accion, 'ninguna');
  assert.equal(apagado.estado, 'omitido');
  assert.equal(decidir(C('elogio', 0.99), { activo: false }).accion, 'ninguna');
  assert.equal(decidir(C('malo', 0.99), { borrar: false }).accion, 'tarea');
  assert.equal(decidir(C('elogio', 0.99), { borrar: false }).accion, 'responder');
});

test('respuestaPublica: estable por comentario y siempre pregunta si llegó el mensaje', () => {
  assert.equal(respuestaPublica('123_456'), respuestaPublica('123_456'));
  const todas = new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map(respuestaPublica));
  assert.ok(todas.size > 1);
  for (const t of todas) assert.match(t, /llegó|recibiste/);
});

test('mensajePrivado: saludo con el primer nombre, enlace y número de WhatsApp, y origen', () => {
  const m = mensajePrivado('María José Pérez', 'facebook');
  assert.match(m, /^Hola María 👋/);
  assert.match(m, /https:\/\/wa\.me\/5548984553306\?text=Hola%2C%20te%20escribo%20desde%20Facebook/);
  assert.match(m, /\+55 48 98455-3306/);
  assert.match(mensajePrivado('', 'instagram'), /^Hola 👋/);
  assert.match(mensajePrivado('x', 'instagram'), /desde%20Instagram/);
});

test('extraerComentarios (Facebook): comentario nuevo, respuesta y comentario propio', () => {
  const cuerpo = { object: 'page', entry: [{ id: 'PAGE1', changes: [
    { field: 'feed', value: { item: 'comment', verb: 'add', comment_id: 'p_1', post_id: 'P_9', parent_id: 'P_9', from: { id: 'U1', name: 'Ana' }, message: 'Hola' } },
    { field: 'feed', value: { item: 'comment', verb: 'add', comment_id: 'p_2', post_id: 'P_9', parent_id: 'p_1', from: { id: 'U2', name: 'Luis' }, message: 'yo también' } },
    { field: 'feed', value: { item: 'comment', verb: 'add', comment_id: 'p_3', post_id: 'P_9', parent_id: 'P_9', from: { id: 'PAGE1', name: 'Flujo' }, message: 'respuesta nuestra' } },
    { field: 'feed', value: { item: 'comment', verb: 'edited', comment_id: 'p_4', from: { id: 'U3' }, message: 'x' } },
    { field: 'feed', value: { item: 'status', verb: 'add', post_id: 'P_10' } },
  ] }] };
  const r = extraerComentarios(cuerpo);
  assert.deepEqual(r.map((x) => [x.comment_id, x.es_respuesta]), [['p_1', false], ['p_2', true]]);
  assert.equal(r[0].autor_nombre, 'Ana');
  assert.equal(r[0].plataforma, 'facebook');
});

test('extraerComentarios (Instagram) y cuerpos vacíos', () => {
  const r = extraerComentarios({ object: 'instagram', entry: [{ id: 'IG1', changes: [{ field: 'comments', value: { id: 'c9', text: 'info', from: { id: 'U5', username: 'maria' }, media: { id: 'M1' } } }] }] });
  assert.deepEqual([r[0].plataforma, r[0].comment_id, r[0].autor_nombre, r[0].post_id, r[0].cuenta_id], ['instagram', 'c9', 'maria', 'M1', 'IG1']);
  assert.deepEqual(extraerComentarios(null), []);
  assert.deepEqual(extraerComentarios({ object: 'page', entry: [] }), []);
});

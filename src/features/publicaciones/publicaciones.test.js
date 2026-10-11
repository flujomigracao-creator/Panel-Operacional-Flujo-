import test from 'node:test';
import assert from 'node:assert/strict';
import { diaSP, horaSP, etiquetaDia, aInputSP, deInputSP, franjaDeHora, esVencida, contarPorEstado, filtrar, agruparPorDia, parchePara, accionesDe, enlaceValido, destinosDe, alternarDestino, parcheReintentarIG, textoParaInstagram, editarLamina, quitarLamina, agregarLamina, laminaVacia, olvidarImagenLamina, imagenesFaltantes, rutasDeImagenes, problemasCarrusel, INVITACION_SEGUIR, esInvitacion, conInvitacionFinal } from './publicaciones.js';

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
  assert.deepEqual(contarPorEstado(l, ahora), { total: 4, borrador: 1, aprobada: 1, publicando: 0, publicada: 1, error: 0, descartada: 1, vencidas: 1 });
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
  assert.deepEqual(parchePara('publicar', ahora, ' https://facebook.com/p/1 '), { estado: 'publicada', publicada_at: '2026-10-08T15:00:00.000Z', enlace_publicacion: 'https://facebook.com/p/1', error: null });
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

test('estados del publicador automático: publicando y error', () => {
  const ahora = new Date('2026-10-08T15:00:00Z');
  const l = [P(1, '2026-10-08T10:30:00Z', 'publicando'), P(2, '2026-10-08T10:30:00Z', 'error'), P(3, '2026-10-08T10:30:00Z', 'aprobada')];
  assert.deepEqual(filtrar(l, 'pendientes').map((p) => p.id), [1, 2, 3]);
  assert.equal(contarPorEstado(l, ahora).vencidas, 1); // solo la aprobada: publicando/error no son «hora vencida»
  assert.deepEqual(accionesDe('error'), ['reintentar', 'publicar', 'descartar']);
  assert.deepEqual(accionesDe('publicando'), []);
  const r = parchePara('reintentar', ahora);
  assert.equal(r.estado, 'aprobada');
  assert.equal(r.error, null);
  assert.equal(r.programada_at, '2026-10-08T15:02:00.000Z');
  assert.equal(parchePara('aprobar').error, null);
});

test('destinos: por defecto Facebook; nunca queda vacío; orden estable', () => {
  assert.deepEqual(destinosDe({}), ['facebook']);
  assert.deepEqual(destinosDe({ destinos: ['instagram'] }), ['instagram']);
  assert.deepEqual(alternarDestino(['facebook'], 'instagram'), ['facebook', 'instagram']);
  assert.deepEqual(alternarDestino(['instagram'], 'facebook'), ['facebook', 'instagram']);
  assert.deepEqual(alternarDestino(['facebook', 'instagram'], 'facebook'), ['instagram']);
  assert.equal(alternarDestino(['facebook'], 'facebook'), null);
  assert.equal(alternarDestino(['facebook'], 'tiktok'), null);
});

test('reintento de Instagram: solo Instagram vuelve a aprobada; con Facebook no toca el estado', () => {
  const ahora = new Date('2026-10-08T15:00:00Z');
  assert.deepEqual(parcheReintentarIG({ destinos: ['instagram'] }, ahora), { ig_estado: null, ig_error: null, programada_at: '2026-10-08T15:02:00.000Z', estado: 'aprobada', error: null });
  assert.deepEqual(parcheReintentarIG({ destinos: ['facebook', 'instagram'] }, ahora), { ig_estado: null, ig_error: null, programada_at: '2026-10-08T15:02:00.000Z' });
});

test('textoParaInstagram: cambia los enlaces por «link en la bio» y respeta el máximo', () => {
  assert.equal(textoParaInstagram('Escríbenos: https://wa.me/5548984553306?text=Hola%20vi'), 'Escríbenos: (link en la bio)');
  assert.equal(textoParaInstagram('x'.repeat(3000)).length, 2200);
});

test('carrusel: editar una lámina borra su imagen vieja; añadir/quitar respetan el máximo', () => {
  const ls = [{ titular: 'A', texto: 'a', idea: 'x', path: 'p/1.png' }, { titular: 'B', texto: 'b', idea: 'y', path: 'p/2.png' }];
  const ed = editarLamina(ls, 1, 'titular', 'C');
  assert.equal(ed[1].titular, 'C');
  assert.equal(ed[1].path, undefined);
  assert.equal(ed[0].path, 'p/1.png');
  assert.equal(editarLamina(ls, 0, 'titular', 'A'), ls); // sin cambios: misma referencia
  assert.equal(editarLamina(ls, 0, 'path', 'otra'), ls); // solo se editan titular/texto/idea
  assert.equal(quitarLamina(ls, 0).length, 2); // queda 1 + la invitación final
  assert.equal(agregarLamina(Array.from({ length: 10 }, laminaVacia)).length, 10);
  assert.equal(agregarLamina(ls).length, 4); // 2 + nueva + invitación final
  assert.equal(olvidarImagenLamina(ls, 0)[0].path, undefined);
});

test('imágenes faltantes y rutas de Instagram (imagen única y carrusel)', () => {
  assert.equal(imagenesFaltantes({ ig_formato: 'imagen' }), 1);
  assert.equal(imagenesFaltantes({ ig_formato: 'imagen', ig_imagen_path: 'x.png' }), 0);
  const c = { ig_formato: 'carrusel', ig_slides: [{ path: 'a' }, {}, { path: 'c' }] };
  assert.equal(imagenesFaltantes(c), 1);
  assert.deepEqual(rutasDeImagenes(c), ['a', 'c']);
  assert.deepEqual(rutasDeImagenes({ ig_formato: 'imagen', ig_imagen_path: 'x.png' }), ['x.png']);
});

test('un carrusel no se aprueba sin 2 láminas, país y grupo', () => {
  assert.deepEqual(problemasCarrusel({ ig_formato: 'imagen' }), []);
  assert.equal(problemasCarrusel({ ig_formato: 'carrusel', ig_slides: [{}], ig_pais: '', ig_grupo: '' }).length, 2);
  assert.deepEqual(problemasCarrusel({ ig_formato: 'carrusel', ig_slides: [{}, {}], ig_pais: 'Cuba', ig_grupo: 'cubanos' }), []);
});

test('la última lámina de todo carrusel es la invitación a seguir: única, al final, fija', () => {
  const a = conInvitacionFinal([{ titular: 'A' }, { titular: 'B' }]);
  assert.equal(a.length, 3);
  assert.equal(a[2].titular, INVITACION_SEGUIR.titular);
  // idempotente y conserva la imagen ya generada de la invitación
  const b = conInvitacionFinal([{ titular: 'A' }, { ...INVITACION_SEGUIR, path: 'x.jpg' }, { titular: 'B' }]);
  assert.deepEqual(b.map((l) => l.titular), ['A', 'B', INVITACION_SEGUIR.titular]);
  assert.equal(b[2].path, 'x.jpg');
  assert.equal(b.filter(esInvitacion).length, 1);
  // máximo 10 láminas, la invitación siempre cabe
  const grande = conInvitacionFinal(Array.from({ length: 12 }, (_, i) => ({ titular: 'L' + i })));
  assert.equal(grande.length, 10);
  assert.equal(grande[9].titular, INVITACION_SEGUIR.titular);
  // no se puede quitar ni editar la invitación; una lámina nueva entra antes de ella
  assert.equal(quitarLamina(a, 2), a);
  assert.equal(editarLamina(a, 2, 'titular', 'otra'), a);
  const c = agregarLamina(a);
  assert.equal(c.length, 4);
  assert.equal(c[3].titular, INVITACION_SEGUIR.titular);
  assert.equal(c[2].titular, '');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { resolverPeriodos, variacion, construirResumen, serieRendimiento, agruparDesglose, etiquetaDesglose } from './resumenMeta.js';

const HOY = new Date(2026, 9, 1, 12); // 2026-10-01 local

test('resolverPeriodos: hoy y período previo de igual duración', () => {
  const h = resolverPeriodos('hoy', HOY);
  assert.deepEqual([h.desde, h.hasta, h.dias], ['2026-10-01', '2026-10-01', 1]);
  assert.deepEqual([h.previo.desde, h.previo.hasta], ['2026-09-30', '2026-09-30']);
  const s = resolverPeriodos('7d', HOY);
  assert.deepEqual([s.desde, s.hasta], ['2026-09-25', '2026-10-01']);
  assert.deepEqual([s.previo.desde, s.previo.hasta], ['2026-09-18', '2026-09-24']);
  const c = resolverPeriodos({ desde: '2026-09-10', hasta: '2026-09-12' }, HOY);
  assert.equal(c.dias, 3);
  assert.equal(c.previo.hasta, '2026-09-09');
});

test('variacion no inventa porcentajes sin base', () => {
  assert.equal(variacion(10, 0), null);
  assert.equal(variacion(0, 0), 0);
  assert.equal(variacion(null, 5), null);
  assert.equal(variacion(150, 100), 50);
});

const datos = {
  insights: [
    { fecha: '2026-09-30', ad_id: 'a1', campaign_id: 'c1', campaign_name: 'Camp 1', gasto: '40', impresiones: 1000, clics: 50, conversaciones: 10 },
    { fecha: '2026-09-28', ad_id: 'a1', campaign_id: 'c1', campaign_name: 'Camp 1', gasto: '10', impresiones: 500, clics: 20, conversaciones: 5 },
    { fecha: '2026-09-27', ad_id: 'a2', campaign_id: 'c2', campaign_name: 'Camp 2', gasto: '10', impresiones: 100, clics: 5, conversaciones: null },
  ],
  leads: [
    { id: 'l1', client_id: 'k1', created_at: '2026-09-30T15:00:00Z', propuesta_enviada: true, meta_ad_id: 'a1' },
    { id: 'l2', client_id: 'k2', created_at: '2026-09-29T15:00:00Z', propuesta_enviada: false, meta_ad_id: null },
  ],
  leadsMeta: [{ client_id: 'k1', meta_ad_id: 'a1' }],
  pagos: [
    { client_id: 'k1', amount: '100', paid_at: '2026-09-30T18:00:00Z' },
    { client_id: 'k2', amount: '50', paid_at: '2026-09-30T19:00:00Z' },
  ],
  entidades: [{ entity_type: 'campaign', entity_id: 'c1', name: 'Camp 1', status: 'ACTIVE', effective_status: 'ACTIVE' }],
};

test('construirResumen: totales, costos y atribución de Meta', () => {
  const r = construirResumen(datos, '7d', HOY);
  assert.equal(r.actual.inversion, 60);
  assert.equal(r.actual.conversaciones, 15);
  assert.equal(r.actual.leads, 2);
  assert.equal(r.actual.leadsDeMeta, 1);
  assert.equal(r.actual.clientesPagados, 2);
  assert.equal(r.actual.facturacion, 150);
  assert.equal(r.actual.costoPorCliente, 30);
  assert.equal(r.actual.roas, 2.5);
  assert.equal(r.actual.facturacionMeta, 100);
  // CTR/CPM/CPC salen de sumas: 75 clics / 1600 impresiones, R$60 de gasto.
  assert.equal(r.actual.ctr, (75 / 1600) * 100);
  assert.equal(r.actual.cpm, (60 / 1600) * 1000);
  assert.equal(r.actual.cpc, 60 / 75);
  const c1 = r.campanas.find((c) => c.id === 'c1');
  assert.equal(c1.pagos, 1);
  assert.equal(c1.costoPorCliente, 50);
  assert.equal(c1.cpl, 50);
  // La campaña sin leads atribuidos no inventa un costo por lead.
  assert.equal(r.campanas.find((c) => c.id === 'c2').cpl, null);
});

test('costos sin denominador son null, no 0', () => {
  const r = construirResumen({ insights: [], leads: [], pagos: [], leadsMeta: [], entidades: [] }, '7d', HOY);
  assert.equal(r.actual.costoPorConversacion, null);
  assert.equal(r.actual.costoPorCliente, null);
  assert.equal(r.actual.roas, null);
  assert.ok(r.alertas.some((a) => a.titulo === 'Sin métricas de Meta'));
});

test('alerta de datos desactualizados y de costo por conversación al alza', () => {
  const r = construirResumen(datos, '7d', HOY);
  assert.ok(!r.alertas.some((a) => a.titulo === 'Sin gasto reciente en Meta')); // 2026-09-30 es reciente
  const viejo = construirResumen(
    { ...datos, insights: datos.insights.map((i) => ({ ...i, fecha: '2026-09-20' })) },
    '7d',
    HOY
  );
  // Sin gasto reciente NO es una falla de sincronización: es informativo.
  assert.ok(viejo.alertas.some((a) => a.titulo === 'Sin gasto reciente en Meta' && a.tipo === 'info'));
  assert.ok(!viejo.alertas.some((a) => a.titulo === 'Sincronización con Meta atrasada'));
  // La sincronización vieja sí es una alerta; una reciente o desconocida (undefined) no.
  const hace2h = new Date(HOY.getTime() - 2 * 3600000).toISOString();
  const hace1m = new Date(HOY.getTime() - 60000).toISOString();
  const atrasada = (d) => construirResumen(d, '7d', HOY).alertas.some((a) => a.titulo === 'Sincronización con Meta atrasada');
  assert.ok(atrasada({ ...datos, ultimaSyncOk: hace2h }));
  assert.ok(atrasada({ ...datos, ultimaSyncOk: null }));
  assert.ok(!atrasada({ ...datos, ultimaSyncOk: hace1m }));
  assert.ok(!atrasada(datos));

  const alza = construirResumen(
    {
      ...datos,
      insights: [
        { fecha: '2026-09-30', ad_id: 'a1', campaign_id: 'c1', gasto: 100, conversaciones: 10 }, // 10/conv
        { fecha: '2026-09-20', ad_id: 'a1', campaign_id: 'c1', gasto: 50, conversaciones: 10 }, // 5/conv (previo)
      ],
    },
    '7d',
    HOY
  );
  assert.ok(alza.alertas.some((a) => a.titulo === 'Atención' && /100%/.test(a.detalle)));
});

test('serie semanal agrupa lunes–domingo y conserva los totales', () => {
  const p = resolverPeriodos('14d', HOY);
  const dia = serieRendimiento(datos, p, 'dia');
  const sem = serieRendimiento(datos, p, 'semana');
  assert.equal(dia.length, 14);
  const sum = (a, k) => a.reduce((x, y) => x + y[k], 0);
  assert.equal(sum(sem, 'inversion'), sum(dia, 'inversion'));
  assert.equal(sum(sem, 'facturacion'), 150);
});

test('agruparDesglose suma por segmento dentro del período y etiqueta legible', () => {
  const p = resolverPeriodos('7d', HOY);
  const filas = [
    { fecha: '2026-09-30', tipo: 'edad_sexo', clave: '25-34|female', gasto: '10', impresiones: 100, clics: 5, conversaciones: 2 },
    { fecha: '2026-09-29', tipo: 'edad_sexo', clave: '25-34|female', gasto: '5', impresiones: 50, clics: 1, conversaciones: null },
    { fecha: '2026-09-01', tipo: 'edad_sexo', clave: '25-34|female', gasto: '99', impresiones: 1, clics: 1, conversaciones: 9 }, // fuera de período
    { fecha: '2026-09-30', tipo: 'ubicacion', clave: 'instagram|instagram_reels', gasto: '3', impresiones: 10, clics: 0, conversaciones: 0 },
  ];
  const g = agruparDesglose(filas, p);
  assert.equal(g.edad_sexo.length, 1);
  assert.equal(g.edad_sexo[0].gasto, 15);
  assert.equal(g.edad_sexo[0].conversaciones, 2);
  assert.equal(g.edad_sexo[0].costoPorConversacion, 7.5);
  assert.equal(g.ubicacion[0].costoPorConversacion, null); // sin conversaciones: no hay costo, no 0
  assert.equal(etiquetaDesglose('edad_sexo', '25-34|female'), '25-34 · Mujeres');
  assert.equal(etiquetaDesglose('ubicacion', 'instagram|instagram_reels'), 'Instagram · instagram reels');
});

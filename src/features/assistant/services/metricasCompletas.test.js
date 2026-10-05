import test from 'node:test';
import assert from 'node:assert/strict';
import { agruparMetricas, agruparAcciones, aCsv, etiquetaRanking } from './metricasCompletas.js';

const P = { desde: '2026-09-20', hasta: '2026-09-30' };
const filas = [
  { fecha: '2026-09-28', campaign_id: 'c1', campaign_name: 'Camp 1', adset_id: 's1', adset_name: 'Set 1', ad_id: 'a1', ad_name: 'Ad 1',
    gasto: '10', impresiones: 1000, alcance: 800, clics: 40, clics_enlace: 30, conversaciones: 4, leads_meta: 1, video_reproducciones: 100,
    ranking_calidad: 'AVERAGE', ranking_engagement: null, ranking_conversion: 'ABOVE_AVERAGE',
    raw: { actions: [{ action_type: 'link_click', value: '30' }, { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '4' }], video_avg_time_watched_actions: [{ action_type: 'video_view', value: '6' }] } },
  { fecha: '2026-09-29', campaign_id: 'c1', campaign_name: 'Camp 1', adset_id: 's1', adset_name: 'Set 1', ad_id: 'a2', ad_name: 'Ad 2',
    gasto: '20', impresiones: 3000, alcance: 2000, clics: 60, clics_enlace: 50, conversaciones: null, leads_meta: null, video_reproducciones: null,
    ranking_calidad: 'BELOW_AVERAGE_20', ranking_engagement: 'AVERAGE', ranking_conversion: null,
    raw: { actions: [{ action_type: 'link_click', value: '50' }], video_avg_time_watched_actions: [{ action_type: 'video_view', value: '10' }] } },
  { fecha: '2026-08-01', campaign_id: 'c1', campaign_name: 'Camp 1', ad_id: 'a1', gasto: '999', impresiones: 1, clics: 1 }, // fuera de período
];

test('agruparMetricas: sumas, derivadas y nulos honestos', () => {
  const [c] = agruparMetricas(filas, 'campana', P);
  assert.equal(c.gasto, 30);
  assert.equal(c.impresiones, 4000);
  assert.equal(c.clics, 100);
  assert.equal(c.ctr, 2.5);
  assert.equal(c.cpm, 7.5);
  assert.equal(c.cpc, 0.3);
  assert.equal(c.conversaciones, 4);
  assert.equal(c.costoPorConversacion, 7.5);
  assert.equal(c.frecuenciaMedia, 4000 / 2800);
  assert.equal(c.dias, 2);
  const anuncios = agruparMetricas(filas, 'anuncio', P);
  assert.equal(anuncios.length, 2);
  assert.equal(anuncios.find((a) => a.id === 'a2').costoPorConversacion, null); // sin conversaciones → null, no 0
});

test('ranking: el del día más reciente que lo tenga', () => {
  const [c] = agruparMetricas(filas, 'campana', P);
  assert.equal(c.rankingCalidad, 'BELOW_AVERAGE_20');
  assert.equal(c.rankingEngagement, 'AVERAGE');
  assert.equal(c.rankingConversion, 'ABOVE_AVERAGE');
  assert.equal(etiquetaRanking(null), '—');
  assert.equal(etiquetaRanking('ABOVE_AVERAGE'), 'Sobre el promedio');
});

test('agruparAcciones: suma por tipo, costo por acción y promedios', () => {
  const a = agruparAcciones(filas, P);
  const clic = a.find((x) => x.tipo === 'link_click');
  assert.equal(clic.valor, 80);
  assert.equal(clic.costo, 30 / 80); // gasto de las filas que tuvieron la acción ÷ cantidad
  const conv = a.find((x) => x.nombre === 'Conversaciones de mensajes iniciadas');
  assert.equal(conv.valor, 4);
  assert.equal(conv.costo, 10 / 4);
  const t = a.find((x) => x.grupo === 'video_avg_time_watched_actions');
  assert.equal(t.valor, 8); // promedio, no suma
  assert.equal(t.costo, null);
});

test('aCsv escapa comas y comillas', () => {
  const csv = aCsv([{ nombre: 'Camp, "A"', gasto: 1.5 }]);
  assert.ok(csv.split('\n')[1].startsWith('"Camp, ""A""",1.5'));
});

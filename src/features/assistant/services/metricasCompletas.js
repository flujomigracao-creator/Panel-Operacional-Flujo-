// Lógica pura de la pestaña "Métricas": TODO lo que Meta devuelve por anuncio y día, agrupado por nivel.
// Sin Supabase ni React (se prueba con node --test).
//
// Regla de honestidad: el alcance es único POR DÍA Y ANUNCIO; sumarlo entre días repite personas.
// Se muestra como "alcance (suma de días)" y la frecuencia es la media diaria (impresiones ÷ esa suma).

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const dividir = (a, b) => (b > 0 ? a / b : null);

export const NIVELES = {
  campana: { id: 'campaign_id', nombre: 'campaign_name', etiqueta: 'Campaña' },
  conjunto: { id: 'adset_id', nombre: 'adset_name', etiqueta: 'Conjunto' },
  anuncio: { id: 'ad_id', nombre: 'ad_name', etiqueta: 'Anuncio' },
};

const RANKINGS = {
  ABOVE_AVERAGE: 'Sobre el promedio',
  AVERAGE: 'Promedio',
  BELOW_AVERAGE_10: 'Bajo (10% inferior)',
  BELOW_AVERAGE_20: 'Bajo (20% inferior)',
  BELOW_AVERAGE_35: 'Bajo (35% inferior)',
  UNKNOWN: 'Sin dato',
};
export const etiquetaRanking = (v) => (v ? RANKINGS[v] || v : '—');

const dentro = (fecha, p) => {
  const d = String(fecha).slice(0, 10);
  return d >= p.desde && d <= p.hasta;
};

/** Filas agrupadas por campaña / conjunto / anuncio con todas las métricas tipadas. */
export function agruparMetricas(insights, nivel, periodo) {
  const cfg = NIVELES[nivel] || NIVELES.campana;
  const mapa = new Map();
  for (const r of insights || []) {
    if (!dentro(r.fecha, periodo)) continue;
    const id = String(r[cfg.id] || 'sin-id');
    const o =
      mapa.get(id) ||
      {
        id,
        nombre: r[cfg.nombre] || id,
        gasto: 0, impresiones: 0, alcance: 0, clics: 0, clicsEnlace: 0, conversaciones: 0, leadsMeta: 0, video: 0,
        dias: new Set(),
        rankingCalidad: null, rankingEngagement: null, rankingConversion: null, ultimoDia: '',
      };
    o.gasto += num(r.gasto);
    o.impresiones += num(r.impresiones);
    o.alcance += num(r.alcance);
    o.clics += num(r.clics);
    o.clicsEnlace += num(r.clics_enlace);
    o.conversaciones += num(r.conversaciones);
    o.leadsMeta += num(r.leads_meta);
    o.video += num(r.video_reproducciones);
    o.dias.add(String(r.fecha).slice(0, 10));
    const dia = String(r.fecha).slice(0, 10);
    // Ranking: el del día más reciente que lo tenga (Meta solo lo calcula con suficientes impresiones).
    if (dia >= o.ultimoDia && (r.ranking_calidad || r.ranking_engagement || r.ranking_conversion)) {
      o.ultimoDia = dia;
      o.rankingCalidad = r.ranking_calidad || o.rankingCalidad;
      o.rankingEngagement = r.ranking_engagement || o.rankingEngagement;
      o.rankingConversion = r.ranking_conversion || o.rankingConversion;
    }
    mapa.set(id, o);
  }
  return [...mapa.values()]
    .map((o) => ({
      ...o,
      dias: o.dias.size,
      ctr: o.impresiones > 0 ? (o.clics / o.impresiones) * 100 : null,
      cpm: o.impresiones > 0 ? (o.gasto / o.impresiones) * 1000 : null,
      cpc: dividir(o.gasto, o.clics),
      costoPorClicEnlace: dividir(o.gasto, o.clicsEnlace),
      costoPorConversacion: dividir(o.gasto, o.conversaciones),
      frecuenciaMedia: dividir(o.impresiones, o.alcance),
    }))
    .sort((a, b) => b.gasto - a.gasto);
}

export const NOMBRES_ACCION = {
  'onsite_conversion.messaging_conversation_started_7d': 'Conversaciones de mensajes iniciadas',
  'onsite_conversion.total_messaging_connection': 'Conexiones de mensajería totales',
  'onsite_conversion.messaging_first_reply': 'Primeras respuestas de mensajes',
  'onsite_conversion.messaging_conversation_replied_7d': 'Conversaciones respondidas',
  link_click: 'Clics en el enlace',
  landing_page_view: 'Vistas de la página de destino',
  post_engagement: 'Interacciones con la publicación',
  page_engagement: 'Interacciones con la página',
  post_reaction: 'Reacciones',
  comment: 'Comentarios',
  post: 'Veces compartida',
  video_view: 'Reproducciones de video (3 s)',
  lead: 'Leads',
  outbound_click: 'Clics salientes',
  photo_view: 'Vistas de foto',
};

const GRUPOS = {
  actions: 'Acciones',
  action_values: 'Valor de las acciones (R$)',
  outbound_clicks: 'Clics salientes',
  video_play_actions: 'Video: reproducciones',
  video_p25_watched_actions: 'Video: 25% visto',
  video_p50_watched_actions: 'Video: 50% visto',
  video_p75_watched_actions: 'Video: 75% visto',
  video_p100_watched_actions: 'Video: 100% visto',
  video_thruplay_watched_actions: 'Video: ThruPlay',
  video_avg_time_watched_actions: 'Video: tiempo medio visto (s, media de filas)',
  purchase_roas: 'ROAS de compras (media de filas)',
};

/**
 * Lista completa de métricas "por acción" que Meta guardó en `raw`: todo array {action_type, value}.
 * Para grupos de promedio (tiempo medio, ROAS) se promedia en lugar de sumar.
 * El costo por acción se calcula como gasto de las filas que registraron esa acción ÷ cantidad.
 */
export function agruparAcciones(insights, periodo) {
  const mapa = new Map();
  for (const r of insights || []) {
    if (!dentro(r.fecha, periodo) || !r.raw || typeof r.raw !== 'object') continue;
    const gasto = num(r.gasto);
    for (const grupo of Object.keys(GRUPOS)) {
      const arr = r.raw[grupo];
      if (!Array.isArray(arr)) continue;
      for (const a of arr) {
        const tipo = a?.action_type;
        if (!tipo) continue;
        const k = `${grupo}|${tipo}`;
        const o = mapa.get(k) || { grupo, tipo, total: 0, gasto: 0, filas: 0 };
        o.total += num(a.value);
        o.gasto += gasto;
        o.filas += 1;
        mapa.set(k, o);
      }
    }
  }
  return [...mapa.values()]
    .map((o) => {
      const promedio = o.grupo === 'video_avg_time_watched_actions' || o.grupo === 'purchase_roas';
      return {
        grupo: o.grupo,
        grupoNombre: GRUPOS[o.grupo],
        tipo: o.tipo,
        nombre: NOMBRES_ACCION[o.tipo] || o.tipo.replace(/^onsite_conversion\./, '').replace(/_/g, ' '),
        valor: promedio ? o.total / o.filas : o.total,
        promedio,
        costo: o.grupo === 'actions' || o.grupo === 'outbound_clicks' ? dividir(o.gasto, o.total) : null,
      };
    })
    .sort((a, b) => (a.grupo === b.grupo ? b.valor - a.valor : Object.keys(GRUPOS).indexOf(a.grupo) - Object.keys(GRUPOS).indexOf(b.grupo)));
}

const csvCelda = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const COLUMNAS_CSV = [
  ['nombre', 'Nombre'], ['gasto', 'Gasto'], ['impresiones', 'Impresiones'], ['alcance', 'Alcance (suma de días)'],
  ['frecuenciaMedia', 'Frecuencia media diaria'], ['clics', 'Clics'], ['clicsEnlace', 'Clics en enlace'], ['ctr', 'CTR %'],
  ['cpm', 'CPM'], ['cpc', 'CPC'], ['costoPorClicEnlace', 'Costo por clic en enlace'], ['conversaciones', 'Conversaciones'],
  ['costoPorConversacion', 'Costo por conversación'], ['leadsMeta', 'Leads (Meta)'], ['video', 'Reproducciones de video'],
  ['rankingCalidad', 'Ranking de calidad'], ['rankingEngagement', 'Ranking de engagement'], ['rankingConversion', 'Ranking de conversión'],
];

export function aCsv(filas) {
  const cab = COLUMNAS_CSV.map(([, t]) => csvCelda(t)).join(',');
  const cuerpo = filas.map((f) => COLUMNAS_CSV.map(([k]) => csvCelda(f[k])).join(','));
  return [cab, ...cuerpo].join('\n');
}

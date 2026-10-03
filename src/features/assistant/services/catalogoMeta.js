// Catálogo de opciones de segmentación de Meta: filtros y agrupación (lógica pura, probada).

export const CLASES_CATALOGO = [
  ['behaviors', 'Comportamientos'],
  ['interests', 'Intereses'],
  ['life_events', 'Eventos de vida'],
  ['industries', 'Industrias'],
  ['family_statuses', 'Familia'],
  ['relationship_statuses', 'Relación'],
  ['education_statuses', 'Educación'],
  ['income', 'Ingresos'],
  ['genero', 'Género'],
  ['edad', 'Edad'],
  ['locale', 'Idiomas'],
  ['country', 'Países'],
  ['region', 'Regiones de Brasil'],
  ['emplazamiento_plataforma', 'Plataformas'],
  ['emplazamiento', 'Emplazamientos'],
];

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Filas de una clase cuyo nombre, ruta o id contienen el texto (sin acentos ni mayúsculas). Ordenadas por nombre. */
export function filtrarCatalogo(filas, clase, texto = '') {
  const q = norm(texto).trim();
  return filas
    .filter((f) => f.clase === clase)
    .filter((f) => !q || norm(f.nombre).includes(q) || norm(f.ruta).includes(q) || norm(f.meta_id).includes(q))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

const PLATAFORMAS = { facebook: 'Facebook', instagram: 'Instagram', audience_network: 'Audience Network', messenger: 'Messenger', whatsapp: 'WhatsApp', threads: 'Threads' };
const POSICIONES = {
  feed: 'Feed', facebook_reels: 'Reels', facebook_stories: 'Stories', instagram_reels: 'Reels', instagram_stories: 'Stories',
  marketplace: 'Marketplace', instream_video: 'Videos in-stream', search: 'Búsqueda', facebook_profile_feed: 'Feed del perfil',
  facebook_notification: 'Notificaciones', an_classic: 'Nativo y banner', instagram_explore_grid_home: 'Inicio de Explorar', status: 'Estados',
};

/** Suma el desglose por «plataforma|posición» y calcula el costo por conversación (null si no hubo conversaciones). */
export function agruparEmplazamientos(filas) {
  const por = new Map();
  for (const f of filas) {
    const g = por.get(f.clave) || { clave: f.clave, gasto: 0, conversaciones: 0 };
    g.gasto += Number(f.gasto || 0);
    g.conversaciones += Number(f.conversaciones || 0);
    por.set(f.clave, g);
  }
  return [...por.values()]
    .map((g) => {
      const [plat, pos] = g.clave.split('|');
      return {
        ...g,
        nombre: `${PLATAFORMAS[plat] || plat} · ${POSICIONES[pos] || pos}`,
        costo: g.conversaciones > 0 ? g.gasto / g.conversaciones : null,
      };
    })
    .sort((a, b) => b.gasto - a.gasto);
}

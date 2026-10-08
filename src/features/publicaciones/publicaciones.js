// Lógica pura de la cola de publicaciones (sin React ni Supabase: se prueba con node --test).
// Las fechas se muestran y se editan en hora de São Paulo (Brasil no tiene horario de verano desde 2019: UTC-3 fijo).

export const ZONA = 'America/Sao_Paulo';
export const OFFSET = '-03:00';

export const ESTADOS = { borrador: 'Borrador', aprobada: 'Aprobada', publicada: 'Publicada', descartada: 'Descartada' };
export const FRANJAS = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche' };

const partes = (iso, opciones) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, hourCycle: 'h23', ...opciones }).formatToParts(new Date(iso))
  .reduce((m, p) => { m[p.type] = p.value; return m; }, {});

/** 'YYYY-MM-DD' del día en São Paulo. */
export function diaSP(iso) {
  const p = partes(iso, { year: 'numeric', month: '2-digit', day: '2-digit' });
  return `${p.year}-${p.month}-${p.day}`;
}

/** 'HH:MM' en São Paulo. */
export function horaSP(iso) {
  const p = partes(iso, { hour: '2-digit', minute: '2-digit' });
  return `${p.hour}:${p.minute}`;
}

/** 'jueves 8 de octubre' a partir de 'YYYY-MM-DD'. */
export function etiquetaDia(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat('es', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Valor para <input type="datetime-local"> en hora de São Paulo. */
export function aInputSP(iso) {
  return `${diaSP(iso)}T${horaSP(iso)}`;
}

/** Inverso de aInputSP: 'YYYY-MM-DDTHH:mm' (São Paulo) → ISO UTC. null si no es una fecha válida. */
export function deInputSP(texto) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(texto || '')) return null;
  const d = new Date(`${texto}:00${OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function franjaDeHora(hhmm) {
  const h = Number(String(hhmm).slice(0, 2));
  return h < 11 ? 'manana' : h < 17 ? 'tarde' : 'noche';
}

export const esPendiente = (p) => p.estado === 'borrador' || p.estado === 'aprobada';

/** Una publicación sin publicar cuya hora ya pasó: hay que publicarla, moverla o descartarla. */
export const esVencida = (p, ahora = new Date()) => esPendiente(p) && new Date(p.programada_at) < ahora;

export function contarPorEstado(lista = [], ahora = new Date()) {
  const c = { total: lista.length, borrador: 0, aprobada: 0, publicada: 0, descartada: 0, vencidas: 0 };
  for (const p of lista) {
    if (p.estado in c) c[p.estado]++;
    if (esVencida(p, ahora)) c.vencidas++;
  }
  return c;
}

export function filtrar(lista = [], filtro = 'pendientes') {
  if (filtro === 'todas') return lista;
  if (filtro === 'pendientes') return lista.filter(esPendiente);
  return lista.filter((p) => p.estado === filtro);
}

/** Agrupa por día de São Paulo, ordenado por hora. */
export function agruparPorDia(lista = []) {
  const orden = [...lista].sort((a, b) => new Date(a.programada_at) - new Date(b.programada_at));
  const grupos = [];
  for (const p of orden) {
    const dia = diaSP(p.programada_at);
    let g = grupos[grupos.length - 1];
    if (!g || g.dia !== dia) { g = { dia, etiqueta: etiquetaDia(dia), items: [] }; grupos.push(g); }
    g.items.push(p);
  }
  return grupos;
}

/**
 * Cambio de estado → campos a guardar. «publicada» registra cuándo y, si se da, el enlace de la publicación;
 * al salir de «publicada» se limpia esa marca.
 */
export function parchePara(accion, ahora = new Date(), enlace = null) {
  switch (accion) {
    case 'aprobar': return { estado: 'aprobada', publicada_at: null, enlace_publicacion: null };
    case 'quitarAprobacion': return { estado: 'borrador', publicada_at: null, enlace_publicacion: null };
    case 'publicar': return { estado: 'publicada', publicada_at: ahora.toISOString(), enlace_publicacion: (enlace || '').trim() || null };
    case 'descartar': return { estado: 'descartada', publicada_at: null, enlace_publicacion: null };
    case 'restaurar': return { estado: 'borrador', publicada_at: null, enlace_publicacion: null };
    default: throw new Error(`Acción desconocida: ${accion}`);
  }
}

/** Acciones disponibles según el estado actual. */
export function accionesDe(estado) {
  switch (estado) {
    case 'borrador': return ['aprobar', 'publicar', 'descartar'];
    case 'aprobada': return ['publicar', 'quitarAprobacion', 'descartar'];
    case 'publicada': return ['quitarAprobacion'];
    case 'descartada': return ['restaurar'];
    default: return [];
  }
}

export const ETIQUETA_ACCION = {
  aprobar: 'Aprobar',
  quitarAprobacion: 'Volver a borrador',
  publicar: 'Marcar como publicada',
  descartar: 'Descartar',
  restaurar: 'Restaurar',
};

/** El enlace opcional de la publicación solo se acepta si es http(s). */
export function enlaceValido(texto) {
  const t = (texto || '').trim();
  if (!t) return true;
  try { const u = new URL(t); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; }
}

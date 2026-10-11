// Lógica pura de la cola de publicaciones (sin React ni Supabase: se prueba con node --test).
// Las fechas se muestran y se editan en hora de São Paulo (Brasil no tiene horario de verano desde 2019: UTC-3 fijo).

export const ZONA = 'America/Sao_Paulo';
export const OFFSET = '-03:00';

export const ESTADOS = { borrador: 'Borrador', aprobada: 'Aprobada', publicando: 'Publicando…', publicada: 'Publicada', error: 'Error al publicar', descartada: 'Descartada' };
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

export const esPendiente = (p) => ['borrador', 'aprobada', 'publicando', 'error'].includes(p.estado);

/** Una publicación sin publicar cuya hora ya pasó: hay que publicarla, moverla o descartarla. */
export const esVencida = (p, ahora = new Date()) => (p.estado === 'borrador' || p.estado === 'aprobada') && new Date(p.programada_at) < ahora;

export function contarPorEstado(lista = [], ahora = new Date()) {
  const c = { total: lista.length, borrador: 0, aprobada: 0, publicando: 0, publicada: 0, error: 0, descartada: 0, vencidas: 0 };
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
    case 'aprobar': return { estado: 'aprobada', publicada_at: null, enlace_publicacion: null, error: null };
    case 'quitarAprobacion': return { estado: 'borrador', publicada_at: null, enlace_publicacion: null };
    case 'publicar': return { estado: 'publicada', publicada_at: ahora.toISOString(), enlace_publicacion: (enlace || '').trim() || null, error: null };
    // Reintento tras un error: vuelve a «aprobada» con hora de aquí a 2 min (el publicador no toma lo que lleva más de 24 h de retraso).
    case 'reintentar': return { estado: 'aprobada', publicada_at: null, enlace_publicacion: null, error: null, programada_at: new Date(ahora.getTime() + 2 * 60 * 1000).toISOString() };
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
    case 'error': return ['reintentar', 'publicar', 'descartar'];
    case 'descartada': return ['restaurar'];
    default: return [];
  }
}

export const ETIQUETA_ACCION = {
  aprobar: 'Aprobar',
  reintentar: 'Reintentar ahora',
  quitarAprobacion: 'Volver a borrador',
  publicar: 'Marcar como publicada (a mano)',
  descartar: 'Descartar',
  restaurar: 'Restaurar',
};

export const REDES = { facebook: 'Facebook', instagram: 'Instagram' };
export const ESTADOS_IG = { publicando: 'Publicando…', publicada: 'Publicada', error: 'Error' };

/** Redes de destino de una publicación (las anteriores a Instagram no traen la columna: solo Facebook). */
export const destinosDe = (p) => (Array.isArray(p?.destinos) && p.destinos.length ? p.destinos : ['facebook']);

/** Alterna una red en la lista de destinos; nunca deja la lista vacía. Devuelve null si no cambia nada. */
export function alternarDestino(destinos, red) {
  if (!(red in REDES)) return null;
  const actual = destinos?.length ? destinos : ['facebook'];
  const nuevo = actual.includes(red) ? actual.filter((d) => d !== red) : [...actual, red];
  if (nuevo.length === 0) return null;
  return Object.keys(REDES).filter((r) => nuevo.includes(r));
}

/**
 * Reintento en Instagram tras un error: limpia el intento y fija la hora a 2 min (el publicador no toma lo que lleva más de 24 h de retraso).
 * Si Instagram es el único destino, la publicación vuelve a «aprobada» (el publicador de Instagram la toma de ahí).
 */
export function parcheReintentarIG(p, ahora = new Date()) {
  const base = { ig_estado: null, ig_error: null, programada_at: new Date(ahora.getTime() + 2 * 60 * 1000).toISOString() };
  return destinosDe(p).includes('facebook') ? base : { ...base, estado: 'aprobada', error: null };
}

export const FORMATOS = { imagen: 'Imagen única', carrusel: 'Carrusel' };
export const MAX_LAMINAS = 10;
export const MIN_LAMINAS = 2;

/** Láminas del carrusel ([{ titular, texto, idea, path? }]); siempre un array. */
export const laminasDe = (p) => (Array.isArray(p?.ig_slides) ? p.ig_slides : []);

export const laminaVacia = () => ({ titular: '', texto: '', idea: '' });

/** Cambia un campo de una lámina. Si cambia lo que se escribe en la imagen, la imagen vieja ya no vale: se borra su ruta para regenerarla. */
export function editarLamina(laminas, i, campo, valor) {
  if (!laminas[i] || esInvitacion(laminas[i]) || !['titular', 'texto', 'idea'].includes(campo)) return laminas;
  if ((laminas[i][campo] || '') === valor) return laminas;
  return laminas.map((l, k) => (k === i ? { ...l, [campo]: valor, path: undefined, at: undefined } : l));
}

/** La ÚLTIMA lámina de todo carrusel invita a seguir la cuenta para no perderse noticias y datos (texto fijo). */
export const INVITACION_SEGUIR = {
  titular: 'SÍGUENOS',
  texto: 'Para no perderte noticias ni datos de migración en Brasil · @flujomigracaobr',
  idea: 'campana de notificación y botón de seguir con un signo más, estilo póster',
};
export const esInvitacion = (l) => l?.titular === INVITACION_SEGUIR.titular;

/** Deja una sola invitación y siempre al final (conserva su imagen si ya la tenía); respeta el máximo de láminas. */
export function conInvitacionFinal(laminas) {
  const previa = laminas.find(esInvitacion);
  const resto = laminas.filter((l) => !esInvitacion(l)).slice(0, MAX_LAMINAS - 1);
  return [...resto, previa ? { ...INVITACION_SEGUIR, path: previa.path, at: previa.at } : { ...INVITACION_SEGUIR }];
}

/** Añade una lámina nueva ANTES de la invitación final. */
export function agregarLamina(laminas) {
  const resto = laminas.filter((l) => !esInvitacion(l));
  if (resto.length >= MAX_LAMINAS - 1) return laminas;
  return conInvitacionFinal([...resto, laminaVacia(), ...laminas.filter(esInvitacion)]);
}

/** Quita una lámina; la invitación final no se puede quitar. */
export function quitarLamina(laminas, i) {
  if (!laminas[i] || esInvitacion(laminas[i])) return laminas;
  return conInvitacionFinal(laminas.filter((_, k) => k !== i));
}

/** Pide regenerar una lámina: borra su ruta (la función de imágenes genera las que no tienen). */
export const olvidarImagenLamina = (laminas, i) => laminas.map((l, k) => (k === i ? { ...l, path: undefined, at: undefined } : l));

/** Cuántas imágenes faltan por generar para esta publicación en Instagram. */
export function imagenesFaltantes(p) {
  if (p?.ig_formato === 'carrusel') return laminasDe(p).filter((l) => !l.path).length;
  return p?.ig_imagen_path ? 0 : 1;
}

/** Rutas de las imágenes de Instagram ya generadas (para pedir sus URLs firmadas). */
export function rutasDeImagenes(p) {
  if (p?.ig_formato === 'carrusel') return laminasDe(p).map((l) => l.path).filter(Boolean);
  return p?.ig_imagen_path ? [p.ig_imagen_path] : [];
}

/** Lo que falta para poder aprobar un carrusel (lista vacía = listo). */
export function problemasCarrusel(p) {
  if (p?.ig_formato !== 'carrusel') return [];
  const ls = laminasDe(p);
  const out = [];
  if (ls.length < MIN_LAMINAS) out.push(`Un carrusel necesita al menos ${MIN_LAMINAS} láminas`);
  if (!(p.ig_pais || '').trim() || !(p.ig_grupo || '').trim()) out.push('Indica el país y el grupo para la portada');
  return out;
}

/** Texto que verá Instagram: allí los enlaces no se pulsan, así que se cambian por «link en la bio». */
export function textoParaInstagram(texto) {
  return String(texto || '').replace(/https?:\/\/\S+/g, '(link en la bio)').slice(0, 2200);
}

/** El enlace opcional de la publicación solo se acepta si es http(s). */
export function enlaceValido(texto) {
  const t = (texto || '').trim();
  if (!t) return true;
  try { const u = new URL(t); return u.protocol === 'https:' || u.protocol === 'http:'; } catch { return false; }
}

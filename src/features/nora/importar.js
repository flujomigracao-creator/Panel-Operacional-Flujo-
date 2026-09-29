import { limpiarDatosPersonales } from './privacy';

// Lee un Markdown de conocimiento (p. ej. flujo_migracao_conocimiento_historico.md) y propone:
// respuestas (pregunta → respuesta), reglas y casos históricos. Nada se activa solo: todo se guarda
// como borrador / pendiente / inactivo y la persona decide en la pantalla de revisión.

const TRAMITES = [
  ['RNM', /\b(rnm|crnm|registro nacional migratorio)\b/i],
  ['CPF', /\bcpf\b/i],
  ['Agendamiento', /\bagend(amiento|ar|amento)\b/i],
  ['Residencia', /\bresid[eê]ncia\b|\bresidencia\b/i],
  ['Refugio', /\bref[uú]gio\b/i],
  ['Naturalización', /\bnaturaliza(ci[oó]n|ção)\b/i],
  ['Pasaporte', /\bpasaporte\b|\bpassaporte\b/i],
  ['Visado', /\bvis(ad)?o\b|\bvisto\b/i],
];

export function sugerirTramite(texto) {
  const hit = TRAMITES.find(([, re]) => re.test(texto || ''));
  return hit ? hit[0] : '';
}

export function sugerirPrioridad(texto) {
  if (/\b(nunca|jam[aá]s|prohibido|no (se debe|debe|prometer|inventar|dar))\b/i.test(texto)) return 'critica';
  if (/\b(siempre|antes de|debe|obligatorio)\b/i.test(texto)) return 'importante';
  return 'normal';
}

const SECCION_REGLAS = /regla|norma|pol[ií]tica|lineamiento|importante|no hacer|prohibid/i;
const SECCION_CASOS = /caso|antecedente|hist[oó]ric|experiencia|ejemplo real/i;
const PARECE_REGLA = /^(regla\s*:|nunca\b|siempre\b|no\s+\w+|evitar\b|prohibido\b|jam[aá]s\b|antes de\b)/i;
const PREGUNTA_ETIQUETA = /^(?:\*\*)?(?:p|pregunta|q|cliente)\s*[:.-]\s*(?:\*\*)?\s*/i;
const RESPUESTA_ETIQUETA = /^(?:\*\*)?(?:r|respuesta|a|nora|equipo)\s*[:.-]\s*(?:\*\*)?\s*/i;
const CAMPOS_CASO = { tramite: /^tr[aá]mite/i, pais: /^pa[ií]s/i, ciudad: /^ciudad|^cidade/i, problema: /^problema|^situaci[oó]n/i, solucion: /^soluci[oó]n|^qu[eé] se hizo/i, resultado: /^resultado/i };

const limpiarMd = (s) => String(s || '').replace(/\*\*|__|`/g, '').replace(/^[-*+]\s+|^\d+[.)]\s+/, '').trim();

export function analizarMarkdown(md) {
  const lineas = String(md || '').replace(/\r/g, '').split('\n');
  const items = [];
  const titulos = [];
  let pregunta = null;
  let respuesta = [];
  let caso = null;

  const tituloActual = () => titulos.filter(Boolean).join(' › ');
  // El tipo de sección lo decide el título más cercano que sea de reglas o de casos.
  const tipoSeccion = () => {
    for (let i = titulos.length - 1; i >= 0; i--) {
      if (!titulos[i]) continue;
      if (SECCION_REGLAS.test(titulos[i])) return 'reglas';
      if (SECCION_CASOS.test(titulos[i])) return 'casos';
    }
    return null;
  };
  const cerrarPregunta = () => {
    if (pregunta && respuesta.join(' ').trim().length >= 10) {
      items.push({ tipo: 'respuesta', pregunta, respuesta: respuesta.join('\n').trim(), seccion: tituloActual() });
    }
    pregunta = null;
    respuesta = [];
  };
  const cerrarCaso = () => {
    if (caso) {
      const resumen = caso.lineas.join('\n').trim();
      if (resumen.length >= 20 || caso.problema || caso.solucion) items.push({ tipo: 'caso', ...caso, resumen: resumen || caso.titulo, lineas: undefined });
    }
    caso = null;
  };

  for (const cruda of lineas) {
    const linea = cruda.trim();
    const h = linea.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      cerrarPregunta();
      cerrarCaso();
      const nivel = h[1].length;
      const texto = limpiarMd(h[2]);
      titulos.length = nivel - 1;
      titulos[nivel - 1] = texto;
      if (texto.endsWith('?')) { pregunta = texto; continue; }
      // Un subtítulo dentro de una sección de casos es un caso (el título de la sección no).
      if (tipoSeccion() === 'casos' && !SECCION_CASOS.test(texto)) caso = { titulo: texto, lineas: [], seccion: tituloActual() };
      continue;
    }
    if (!linea) {
      if (caso && caso.lineas.length) caso.lineas.push('');
      continue;
    }
    const plano = limpiarMd(linea);

    // Pregunta/respuesta con etiqueta (P: / R:) o una línea que es una pregunta.
    if (PREGUNTA_ETIQUETA.test(linea.replace(/^[-*+]\s+/, '')) || (/^[¿].*\?$/.test(plano) && !caso)) {
      cerrarPregunta();
      pregunta = plano.replace(PREGUNTA_ETIQUETA, '').trim();
      continue;
    }
    if (pregunta) {
      respuesta.push(plano.replace(RESPUESTA_ETIQUETA, ''));
      continue;
    }

    // Casos: bloque bajo un título de casos, con campos "Trámite:", "Problema:", etc.
    if (caso || tipoSeccion() === 'casos') {
      if (!caso) caso = { titulo: plano.slice(0, 80), lineas: [], seccion: tituloActual() };
      const kv = plano.match(/^([^:]{3,25}):\s*(.+)$/);
      const campo = kv && Object.keys(CAMPOS_CASO).find((k) => CAMPOS_CASO[k].test(kv[1].trim()));
      if (campo) caso[campo] = kv[2].trim();
      else caso.lineas.push(plano);
      continue;
    }

    // Reglas: viñetas bajo un título de reglas, o frases que son instrucciones ("Nunca…", "Siempre…").
    const esVineta = /^([-*+]|\d+[.)])\s+/.test(linea);
    if ((esVineta && tipoSeccion() === 'reglas') || PARECE_REGLA.test(plano)) {
      const texto = plano.replace(/^regla\s*:\s*/i, '');
      if (texto.length >= 10) items.push({ tipo: 'regla', texto: texto.slice(0, 800), seccion: tituloActual() });
    }
  }
  cerrarPregunta();
  cerrarCaso();

  // Clasificación sugerida y privacidad: los datos personales se quitan antes de guardar nada.
  return items.map((it, i) => {
    const contexto = [it.seccion, it.pregunta, it.respuesta, it.texto, it.resumen, it.tramite].filter(Boolean).join(' ');
    const avisos = new Set();
    const limpio = { ...it, clave: i };
    for (const k of ['pregunta', 'respuesta', 'texto', 'resumen', 'problema', 'solucion', 'resultado', 'ciudad']) {
      if (!limpio[k]) continue;
      const r = limpiarDatosPersonales(limpio[k]);
      limpio[k] = r.texto;
      r.encontrados.forEach((e) => avisos.add(e));
    }
    limpio.tramite = it.tramite || sugerirTramite(contexto);
    if (it.tipo === 'regla') limpio.prioridad = sugerirPrioridad(it.texto);
    limpio.datosQuitados = [...avisos];
    return limpio;
  });
}

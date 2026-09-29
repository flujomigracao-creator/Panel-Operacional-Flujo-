// Datos personales que nunca van al conocimiento general de Nora (pertenecen al cliente, no a la base).
// Se detectan al importar y al editar; al importar se reemplazan por [dato eliminado].
const PATRONES = [
  ['email', /[\w.+-]+@[\w-]+\.[\w.-]+/g],
  ['CPF', /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g],
  ['teléfono', /(?:\+?\d{2}\s?)?\(?\d{2}\)?\s?9?\d{4}[\s.-]?\d{4}\b/g],
  ['número de documento', /\b[A-Z]{1,3}\d{6,9}\b/g],
  ['contraseña', /\b(?:contraseña|senha|password|clave)\s*[:=]\s*\S+/gi],
  ['ID interno', /\b\d{8,}\b/g],
];

export function detectarDatosPersonales(texto) {
  const s = String(texto || '');
  return [...new Set(PATRONES.filter(([, re]) => { re.lastIndex = 0; return re.test(s); }).map(([nombre]) => nombre))];
}

export function limpiarDatosPersonales(texto) {
  let s = String(texto || '');
  const encontrados = new Set();
  for (const [nombre, re] of PATRONES) {
    s = s.replace(re, () => { encontrados.add(nombre); return '[dato eliminado]'; });
  }
  return { texto: s, encontrados: [...encontrados] };
}

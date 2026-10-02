// Reglas puras del catálogo de trámites y precios (sin acceso a la base): validación y margen.

/** Convierte "1.234,50", "1234.5" o "90" a número; devuelve null si no es un monto válido. */
export function parseMonto(valor) {
  if (valor === null || valor === undefined) return null;
  const limpio = String(valor).trim().replace(/\s|R\$/g, '');
  if (!limpio) return null;
  // "1.234,50" (punto de miles + coma decimal) vs "1234.50"
  const normal = /,/.test(limpio) ? limpio.replace(/\./g, '').replace(',', '.') : limpio;
  if (!/^\d+(\.\d+)?$/.test(normal)) return null;
  return Number(normal);
}

/** Valida el formulario de un trámite nuevo. Devuelve { ok, errores, datos }. */
export function validarTramite({ nombre, descripcion, precio, costo }) {
  const errores = {};
  const nombreLimpio = String(nombre || '').trim();
  if (!nombreLimpio) errores.nombre = 'Escribe el nombre del trámite';
  const p = parseMonto(precio);
  if (p === null) errores.precio = 'El precio es obligatorio (solo números)';
  const hayCosto = String(costo ?? '').trim() !== '';
  const c = hayCosto ? parseMonto(costo) : null;
  if (hayCosto && c === null) errores.costo = 'El costo debe ser un número';
  if (p !== null && c !== null && c > p) errores.costo = 'El costo no puede superar al precio';
  return {
    ok: Object.keys(errores).length === 0,
    errores,
    datos: { nombre: nombreLimpio, descripcion: String(descripcion || '').trim(), precio: p, costo: c },
  };
}

/** Margen en reales y en porcentaje; null si falta precio o costo (nunca se inventa). */
export function calcularMargen(precio, costo) {
  const p = precio === null || precio === undefined ? null : Number(precio);
  const c = costo === null || costo === undefined ? null : Number(costo);
  if (p === null || c === null || Number.isNaN(p) || Number.isNaN(c) || p <= 0) return null;
  return { monto: p - c, porcentaje: ((p - c) / p) * 100 };
}

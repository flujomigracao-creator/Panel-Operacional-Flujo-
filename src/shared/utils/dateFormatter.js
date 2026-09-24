/**
 * Formatea una fecha al formato DD/MM/YYYY.
 * Acepta: YYYY-MM-DD, DD/MM/YYYY, ISO timestamps, objetos Date.
 */
export const formatDate = (dateStr) => {
  if (!dateStr) return '—';
  try {
    const s = String(dateStr).trim();

    // Already in DD/MM/YYYY
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;

    // YYYY-MM-DD (plain date, no timezone issues)
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [y, m, d] = s.split('-');
      return `${d}/${m}/${y}`;
    }

    // ISO timestamp or other parseable formats
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch (_e) {
    return dateStr;
  }
};

/**
 * Normaliza cualquier formato de fecha a DD/MM/YYYY.
 * Útil para procesar datos crudos de la IA antes de guardar/mostrar.
 * Soporta: YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, "15 DE OCTUBRE DE 1972", etc.
 */
export const normalizeDateToDDMMYYYY = (value) => {
  if (!value) return value;
  const s = String(value).trim();

  // Already DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;

  // YYYY-MM-DD → DD/MM/YYYY
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  }

  // DD-MM-YYYY → DD/MM/YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
    return s.replace(/-/g, '/');
  }

  // Try parsing as Date object
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    d.setMinutes(d.getMinutes() + d.getTimezoneOffset());
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  return s; // Return as-is if unparseable
};


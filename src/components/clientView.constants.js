/**
 * clientView.constants.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Constantes y helpers puros compartidos por ClientView y sus sub-componentes.
 * Extraídos del monolito ClientView.jsx para mejorar mantenibilidad.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Date helpers ─────────────────────────────────────────────────────────────

/** Convierte DD/MM/YYYY → YYYY-MM-DD (para inputs tipo date) */
export function toIsoDate(val) {
  if (!val) return '';
  if (val.match(/^\d{4}-\d{2}-\d{2}$/)) return val;
  const parts = val.split('/');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return val;
}

/** Convierte YYYY-MM-DD → DD/MM/YYYY (para visualización) */
export function toSlashDate(val) {
  if (!val) return '';
  const parts = val.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return val;
}

// ── Enum options ─────────────────────────────────────────────────────────────

export const ESTADO_CIVIL_OPTIONS = [
  "Casado(a)",
  "Divorciado(a)",
  "Outro",
  "Separado(a) Judicialmente",
  "Solteiro(a)",
  "União Estável",
  "Viúvo(a)"
];

export const SEXO_OPTIONS = [
  "Masculino",
  "Feminino"
];

// ── Tipos de documento (subida de archivos y checklist del "PDF Único") ─────
// Lista ampliada a partir de los documentos reales que componen el "PDF
// Único" de trámites como el de Florianópolis (CPF, recibo de Sisconare,
// comprobante de residencia, fotos 3x4) además de los tipos genéricos ya
// usados en el sistema. No hay CHECK constraint en la BD para tipo_documento,
// así que esto es solo la lista sugerida en los selects.
export const DOCUMENT_TYPE_OPTIONS = [
  { value: 'FOTO', label: 'Foto' },
  { value: 'FOTO 3X4', label: 'Foto 3x4' },
  { value: 'COMPROBANTE', label: 'Comprobante' },
  { value: 'COMPROBANTE DE RESIDENCIA', label: 'Comprobante de Residencia' },
  // RNM y Carnet de Identidad son documentos físicos distintos (RNM = Registro
  // Nacional Migratório de Brasil; Carnet = cédula/DNI del país de origen) —
  // opciones propias en vez de meterlos los dos bajo "Documento Identidad"
  // genérico, así quedan separados en la lista de documentos del cliente.
  { value: 'RNM', label: 'RNM' },
  { value: 'CARNET DE IDENTIDAD', label: 'Carnet de Identidad' },
  { value: 'DOCUMENTO IDENTIDAD', label: 'Otro Documento de Identidad' },
  { value: 'PASAPORTE', label: 'Pasaporte' },
  { value: 'CPF', label: 'CPF' },
  { value: 'RECIBO SISCONARE', label: 'Recibo Sisconare (Solicitud de Refugio)' },
  { value: 'FORMULARIO', label: 'Formulario' },
  { value: 'OTRO', label: 'Otro' },
];

// ── Campos fijos de la tabla `clientes` ──────────────────────────────────────
// Definidos una sola vez fuera del componente para evitar recrearlos en cada render.

export const FIXED_FIELDS_CATALOG = [
  { id: 'id_kommo', nombre_campo: 'ID Kommo (Opcional)', requerido: false, es_fijo: true, category_name: 'Informaciones Personales' },
  { id: 'nombre', nombre_campo: 'Nombre', requerido: true, es_fijo: true, category_name: 'Informaciones Personales' },
  { id: 'cpf', nombre_campo: 'CPF', requerido: true, es_fijo: true, category_name: 'Informaciones Personales' },
  { id: 'email', nombre_campo: 'Email', requerido: false, es_fijo: true, category_name: 'Informaciones Personales' },
  { id: 'telefono', nombre_campo: 'Teléfono', requerido: false, es_fijo: true, category_name: 'Informaciones Personales' },
  { id: 'fecha_nacimiento', nombre_campo: 'Fecha Nacimiento', requerido: true, es_fijo: true, category_name: 'Informaciones Personales' },
  { id: 'estado_civil', nombre_campo: 'Estado Civil', requerido: false, es_fijo: true, category_name: 'Informaciones Personales' },
  { id: 'sexo', nombre_campo: 'Sexo', requerido: false, es_fijo: true, category_name: 'Informaciones Personales' },
  { id: 'nacionalidad', nombre_campo: 'Nacionalidad', requerido: true, es_fijo: true, category_name: 'Informaciones Personales' },
  { id: 'pais', nombre_campo: 'País de Origen', requerido: false, es_fijo: true, category_name: 'Informaciones Personales' },
  { id: 'lugar_nacimiento', nombre_campo: 'Lugar de Nacimiento', requerido: false, es_fijo: true, category_name: 'Informaciones Personales' },
  { id: 'estado_federal', nombre_campo: 'Estado de Origen', requerido: false, es_fijo: true, category_name: 'Informaciones Personales' },
  { id: 'ciudad', nombre_campo: 'Ciudad de Origen', requerido: false, es_fijo: true, category_name: 'Informaciones Personales' },
  { id: 'direccion', nombre_campo: 'Dirección Completa', requerido: false, es_fijo: true, category_name: 'Informaciones Personales' },

  // ── Los 13 campos migratorios (rnm, numero_refugio, fecha_vencimiento_refugio,
  // numero_pasaporte, fecha_emision_pasaporte, fecha_vencimiento_pasaporte,
  // carnet_identidad, policia_federal, fecha_entrada_brasil, lugar_entrada_brasil,
  // nombre_madre, nombre_padre, tramite) ya NO están hardcodeados acá: viven como
  // filas dinámicas en `config_campos_clientes` y se guardan en
  // `clientes.campos_personalizados` (JSONB). Se mergean automáticamente en
  // ClientView.jsx vía `customFieldsConfig` con `is_custom_json: true`.
];

// ── Identificadores de config_campos_clientes que el código lee/escribe
// literalmente en otros lugares del sistema (extracción por IA, generación
// de firma/carta, fusión de duplicados, importación CSV, plantillas de
// documentos, autocompletado de la extensión de Chrome) en vez de pasar
// por el catálogo dinámico. Si se borra uno de estos campos y se recrea
// con un identificador distinto (typo, nombre distinto), esos otros
// lugares quedan mirando una clave huérfana y el campo "nuevo" se ve
// vacío aunque el sistema siga usando el dato viejo por detrás — pasó una
// vez con nombre_padre (ver database/standalone/013_fix_nombre_padre_identificador.sql).
// Se usa solo para avisar más fuerte antes de borrar (ver handleDeleteField
// en useClientViewEdit.js) — no bloquea el borrado.
export const SYSTEM_LINKED_FIELD_IDS = new Set([
  'rnm', 'numero_refugio', 'fecha_vencimiento_refugio', 'numero_pasaporte',
  'fecha_emision_pasaporte', 'fecha_vencimiento_pasaporte', 'carnet_identidad',
  'policia_federal', 'fecha_entrada_brasil', 'lugar_entrada_brasil',
  'nombre_madre', 'nombre_padre', 'tramite',
]);

// ── Categorías por defecto de "Datos del Cliente" ────────────────────────────
// Estructurales: siempre se muestran, no se pueden borrar desde la ficha del
// cliente (ver ClientPersonalData.jsx). Cualquier otra categoría es dinámica,
// vive como texto libre en config_campos_clientes.categoria.

export const DEFAULT_CLIENT_CATEGORIES = ['Informaciones Personales', 'Datos Familiares', 'Documentos de Identidad'];

// ── Colores por estado de trámite ────────────────────────────────────────────

export const TRAMITE_COLORS = {
  completada: { bg: 'rgba(29,158,117,0.18)', color: '#1D9E75' },
  procesando: { bg: 'rgba(55,138,221,0.18)', color: '#378ADD' },
  cancelada:  { bg: 'rgba(216,90,48,0.18)',  color: '#D85A30' },
  pendiente:  { bg: 'rgba(186,117,23,0.18)', color: '#BA7517' },
};

/**
 * importClientesService.js
 * Import masivo de clientes desde CSV/Excel/Google Sheets.
 * Versión standalone (empresa única): no hay organization_id ni catálogo de
 * campos personalizados por organización. Los campos migratorios (RNM,
 * pasaporte, carnet, refugio, etc.) NO son columnas fijas de `clientes` —
 * viven en `clientes.campos_personalizados` (JSONB), ver buildClientRow.
 */
import { supabase } from '../supabaseClient';
import { extractFunctionErrorMessage } from '../utils/errorHandler';

// Campos fijos de `clientes` (fuente de verdad: NewClientWizard / StepPersonalData /
// StepDocumentsAddress, más confiables que las migraciones del repo).
const FIXED_FIELDS = [
  // Distintas agencias cargan el nombre de forma distinta: algunas separan
  // nombres/apellidos, otras traen una sola columna con el nombre completo
  // ("Nombre", "Cliente", etc.). Se ofrecen ambas rutas — ver hasNameMapping.
  { key: 'nombre_completo', label: 'Nombre completo', group: 'fijo', required: false, aliases: ['nombre completo', 'nombre', 'cliente', 'client name', 'full name', 'name', 'razon social', 'nome completo', 'nome'] },
  { key: 'nombres', label: 'Nombres', group: 'fijo', required: false, aliases: ['nombres', 'primer nombre', 'first name'] },
  { key: 'apellidos', label: 'Apellidos', group: 'fijo', required: false, aliases: ['apellidos', 'apellido', 'last name', 'surname'] },
  { key: 'cpf', label: 'CPF', group: 'fijo', required: false, aliases: ['cpf', 'documento', 'numero documento'] },
  { key: 'telefono', label: 'Teléfono', group: 'fijo', required: false, aliases: ['telefono', 'teléfono', 'phone', 'celular', 'whatsapp', 'numero'] },
  { key: 'email', label: 'Email', group: 'fijo', required: false, aliases: ['email', 'correo', 'e-mail', 'correo electronico'] },
  // Campos migratorios: viven en `clientes.campos_personalizados` (JSONB), igual
  // que cualquier campo dinámico creado desde "Campos Base" (config_campos_clientes).
  // group: 'personalizado' le indica a buildClientRow que los anide en ese JSON
  // en vez de escribirlos como columnas sueltas.
  { key: 'carnet_identidad', label: 'Carnet / Identidad', group: 'personalizado', required: false, aliases: ['carnet_identidad', 'carnet', 'identidad', 'carnet de identidad', 'ci'] },
  { key: 'rnm', label: 'RNM', group: 'personalizado', required: false, aliases: ['rnm'] },
  { key: 'numero_refugio', label: 'Protocolo de Refugio', group: 'personalizado', required: false, aliases: ['numero_refugio', 'protocolo de refugio', 'protocolo refugio'] },
  { key: 'fecha_vencimiento_refugio', label: 'Fecha Vencimiento Refugio', group: 'personalizado', required: false, aliases: ['fecha_vencimiento_refugio', 'vencimiento refugio', 'validade refugio'] },
  { key: 'numero_pasaporte', label: 'Pasaporte', group: 'personalizado', required: false, aliases: ['numero_pasaporte', 'pasaporte', 'passport'] },
  { key: 'fecha_emision_pasaporte', label: 'Fecha Emisión Pasaporte', group: 'personalizado', required: false, aliases: ['fecha_emision_pasaporte', 'emision pasaporte', 'fecha emision pasaporte'] },
  { key: 'fecha_vencimiento_pasaporte', label: 'Fecha Vencimiento Pasaporte', group: 'personalizado', required: false, aliases: ['fecha_vencimiento_pasaporte', 'vencimiento pasaporte'] },
  { key: 'policia_federal', label: 'Policía Federal', group: 'personalizado', required: false, aliases: ['policia_federal', 'policia federal'] },
  { key: 'fecha_entrada_brasil', label: 'Entrada a Brasil', group: 'personalizado', required: false, aliases: ['fecha_entrada_brasil', 'entrada a brasil', 'entrada brasil'] },
  { key: 'lugar_entrada_brasil', label: 'Lugar Entrada', group: 'personalizado', required: false, aliases: ['lugar_entrada_brasil', 'lugar entrada', 'lugar de entrada'] },
  { key: 'nombre_madre', label: 'Nombre Madre', group: 'personalizado', required: false, aliases: ['nombre_madre', 'nombre madre', 'madre'] },
  { key: 'nombre_padre', label: 'Nombre Padre', group: 'personalizado', required: false, aliases: ['nombre_padre', 'nombre padre', 'padre'] },
  { key: 'tramite', label: 'Trámite Solicitado', group: 'personalizado', required: false, aliases: ['tramite', 'trámite', 'tramite solicitado'] },
  { key: 'cep', label: 'CEP', group: 'direccion', required: false, aliases: ['cep', 'codigo postal', 'zip'] },
  { key: 'estado', label: 'Estado', group: 'direccion', required: false, aliases: ['estado', 'state', 'provincia'] },
  { key: 'cidade', label: 'Ciudad', group: 'direccion', required: false, aliases: ['cidade', 'ciudad', 'city'] },
  { key: 'bairro', label: 'Bairro', group: 'direccion', required: false, aliases: ['bairro', 'barrio'] },
  { key: 'endereco', label: 'Endereço / Calle', group: 'direccion', required: false, aliases: ['endereco', 'endereço', 'direccion', 'dirección', 'calle', 'street'] },
  { key: 'numero', label: 'Número', group: 'direccion', required: false, aliases: ['numero', 'número', 'number'] },
  { key: 'complemento', label: 'Complemento', group: 'direccion', required: false, aliases: ['complemento'] },
  { key: 'ponto_referencia', label: 'Punto de referencia', group: 'direccion', required: false, aliases: ['ponto_referencia', 'punto de referencia', 'referencia'] },
];

const normalize = (str) => String(str || '')
  .toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

// Versión standalone: no existe un catálogo de campos personalizados por
// organización, así que los campos disponibles para mapear son siempre los
// mismos (columnas fijas de `clientes`).
export const getImportTargetFields = async () => FIXED_FIELDS;

// El único requisito real para importar es tener alguna fuente de nombre:
// o bien "Nombre completo" en una sola columna, o bien "Nombres" (con o sin
// "Apellidos" — algunas agencias tampoco separan eso).
export const hasNameMapping = (mapping) => {
  const mappedKeys = Object.values(mapping);
  return mappedKeys.includes('nombre_completo') || mappedKeys.includes('nombres');
};

export const guessColumnMapping = (headers, targetFields) => {
  // Un header suelto "nombre" es ambiguo: puede ser el nombre completo o
  // solo el primer nombre de un par nombre/apellido. Si el archivo también
  // trae un header de apellido, es más probable que sea lo segundo.
  const normalizedHeaders = headers.map(normalize);
  const apellidosField = targetFields.find((f) => f.key === 'apellidos');
  const hasApellidoHeader = Boolean(
    apellidosField && normalizedHeaders.some((h) => apellidosField.aliases.some((a) => normalize(a) === h))
  );

  const effectiveFields = targetFields.map((f) => {
    if (f.key === 'nombre_completo' && hasApellidoHeader) {
      return { ...f, aliases: f.aliases.filter((a) => normalize(a) !== 'nombre') };
    }
    if (f.key === 'nombres' && hasApellidoHeader) {
      return { ...f, aliases: [...f.aliases, 'nombre'] };
    }
    return f;
  });

  const mapping = {};
  const used = new Set();
  headers.forEach((header) => {
    const normalizedHeader = normalize(header);
    const match = effectiveFields.find((f) => !used.has(f.key) && f.aliases.some((a) => normalize(a) === normalizedHeader));
    if (match) {
      mapping[header] = match.key;
      used.add(match.key);
    } else {
      mapping[header] = null;
    }
  });
  return mapping;
};

export const buildClientRow = (rawRow, headerToFieldMap, targetFields) => {
  const values = {};
  Object.entries(headerToFieldMap).forEach(([header, fieldKey]) => {
    if (fieldKey) values[fieldKey] = rawRow[header] ?? '';
  });

  const nombreCompleto = (values.nombre_completo || '').trim();
  const nombres = (values.nombres || '').trim();
  const apellidos = (values.apellidos || '').trim();
  const nombre = (nombreCompleto || `${nombres} ${apellidos}`.trim()).toUpperCase();

  const direccionFields = targetFields.filter((f) => f.group === 'direccion');
  const direccion = {
    cep: values.cep || '',
    endereco: values.endereco || '',
    numero: values.numero || '',
    complemento: values.complemento || '',
    bairro: values.bairro || '',
    cidade: values.cidade || '',
    estado: values.estado || '',
    ponto_referencia: values.ponto_referencia || '',
  };
  const hasDireccion = direccionFields.some((f) => values[f.key]);

  // Campos migratorios (rnm, numero_pasaporte, nombre_madre, etc.) se anidan en
  // `campos_personalizados` (JSONB), igual que cualquier campo dinámico creado
  // desde "Campos Base" — ya no son columnas sueltas de `clientes`.
  const camposPersonalizados = {};
  targetFields
    .filter((f) => f.group === 'personalizado')
    .forEach((f) => {
      if (values[f.key]) camposPersonalizados[f.key] = values[f.key];
    });

  const row = {
    nombre,
    cpf: values.cpf || null,
    telefono: values.telefono || null,
    email: values.email ? values.email.toLowerCase() : null,
    estado_cliente: 'nuevo',
    ...(hasDireccion ? { direccion: JSON.stringify(direccion) } : {}),
    ...(Object.keys(camposPersonalizados).length ? { campos_personalizados: camposPersonalizados } : {}),
  };

  // Resto de campos fijos mapeados que no sean nombre/cpf/direccion/personalizado
  // (ninguno hoy, pero se deja genérico por si se agrega alguna columna fija más).
  const alreadyHandled = new Set([
    'nombre_completo', 'nombres', 'apellidos', 'cpf', 'telefono', 'email',
    ...direccionFields.map((f) => f.key),
  ]);
  targetFields.forEach((f) => {
    if (f.group === 'personalizado') return;
    if (alreadyHandled.has(f.key)) return;
    if (values[f.key]) row[f.key] = values[f.key];
  });

  return row;
};

// Mismas reglas que validateField en NewClientWizard.jsx, pero acá son
// advertencias no bloqueantes: un dato sucio en 1 fila de 500 no debería
// impedir importar el resto.
export const getRowWarnings = (row) => {
  const warnings = [];
  if (!row.nombre) warnings.push('Falta nombre');
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) warnings.push('Email con formato inválido');
  if (row.cpf && row.cpf.replace(/\D/g, '').length > 0 && row.cpf.replace(/\D/g, '').length < 11) warnings.push('CPF incompleto');
  return warnings;
};

const CHUNK_SIZE = 300;

export const bulkCreateClientes = async (rows) => {
  let insertedCount = 0;
  const failedRows = [];

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { data, error } = await supabase.from('clientes').insert(chunk).select('id');

    if (!error) {
      insertedCount += data.length;
      continue;
    }

    // El chunk completo falló como transacción única — reintentamos fila por
    // fila para poder decirle al usuario exactamente cuáles filas fallaron
    // y por qué, en vez de perder 300 filas buenas por 1 dato mal formado.
    for (let j = 0; j < chunk.length; j++) {
      const { error: rowError } = await supabase.from('clientes').insert([chunk[j]]);
      if (rowError) {
        failedRows.push({ rowIndex: i + j, data: rows[i + j], message: rowError.message });
      } else {
        insertedCount += 1;
      }
    }
  }

  return { insertedCount, failedRows };
};

export const fetchGoogleSheetCsv = async (url) => {
  const { data, error } = await supabase.functions.invoke('sheet-import-proxy', { body: { url } });
  if (error) throw new Error(await extractFunctionErrorMessage(error));
  if (data?.error) throw new Error(data.error);
  return data.csv;
};

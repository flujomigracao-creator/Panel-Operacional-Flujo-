/**
 * clientExtractionService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Lógica pura (sin estado de React) para aplicar los datos que la IA extrajo
 * de un documento (ver aiService.analyzeDocumentImage) a la fila `clientes`
 * correspondiente. Extraída de useClientViewExtraction.handleSaveExtractedData
 * para poder reusarla en dos flujos:
 *   1. El modal de revisión manual (staff ve los datos, corrige si hace falta,
 *      confirma) -- comportamiento sin cambios, sigue pisando cualquier valor.
 *   2. El guardado automático apenas se sube un documento nuevo, ANTES de que
 *      un operacional lo vea (skipIfAlreadyFilled: true) -- para no pisar en
 *      silencio un dato que el staff ya cargó o verificó a mano.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { supabase } from '../supabaseClient';
import { normalizeDateToDDMMYYYY } from '../utils/dateFormatter';
import { toIsoDate, FIXED_FIELDS_CATALOG } from '../components/clientView.constants';
import { createCliente, getCliente, insertRelacion } from './clientesService';
import { getDocuments, reassignDocument } from './storageService';
import { analyzeDocumentImage } from './aiService';

const FIXED_COLUMN_IDS = new Set(FIXED_FIELDS_CATALOG.map(f => f.id));

/** Mapeo de claves IA → columnas de la tabla `clientes` */
export const AI_FIELD_MAP = {
  'NOMBRE_COMPLETO': 'nombre',
  'CPF': 'cpf',
  'RNM': 'rnm',
  'CARNET_IDENTIDAD': 'carnet_identidad',
  'FECHA_NACIMIENTO': 'fecha_nacimiento',
  'LUGAR_NACIMIENTO': 'lugar_nacimiento',
  'NACIONALIDAD': 'nacionalidad',
  'NUMERO_DOCUMENTO': 'numero_pasaporte',
  'NUMERO_REFUGIO': 'numero_refugio',
  'FECHA_EMISION_PASAPORTE': 'fecha_emision_pasaporte',
  'FECHA_VENCIMIENTO_PASAPORTE': 'fecha_vencimiento_pasaporte',
  'FECHA_VENCIMIENTO_REFUGIO': 'fecha_vencimiento_refugio',
  'SEXO': 'sexo',
  'NOMBRE_MADRE': 'nombre_madre',
  'NOMBRE_PADRE': 'nombre_padre',
};

const AI_DATE_KEYS = new Set([
  'FECHA_NACIMIENTO',
  'FECHA_EMISION_PASAPORTE',
  'FECHA_VENCIMIENTO_PASAPORTE',
  'FECHA_VENCIMIENTO_REFUGIO',
]);

const AI_IGNORED_KEYS = new Set(['ILEGIBLE', 'TIPO_DOCUMENTO', 'NOMBRE_ARCHIVO']);

const humanizeAiKey = (key) => key.toLowerCase().split('_').filter(Boolean)
  .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

const toIdentificador = (key) => key.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const ensureCustomFieldDefinition = async (identificador, nombreCampo) => {
  const { error } = await supabase.from('config_campos_clientes').insert([{
    nombre_campo: nombreCampo,
    identificador,
    categoria: 'Documentos de Identidad',
    tipo: 'text',
    requerido: false,
  }]);
  if (error && error.code !== '23505') throw error;
};

/**
 * Aplica `extractedData` (salida cruda de analyzeDocumentImage) a la fila
 * `clientes` de `targetClientId`.
 *
 * @param {object} params
 * @param {number|string} params.targetClientId
 * @param {object} params.extractedData - Objeto crudo de analyzeDocumentImage.
 * @param {object} [params.targetClientData] - Fila actual del cliente destino
 *   (para no pisar otros campos de `campos_personalizados`, y para el chequeo
 *   de skipIfAlreadyFilled). Si no se pasa, se hace un fetch acá.
 * @param {Array} [params.customFieldsConfig] - Catálogo de campos dinámicos.
 * @param {boolean} [params.skipIfAlreadyFilled=false] - Si true, un campo que
 *   ya tiene valor no-vacío en el cliente NUNCA se pisa (modo automático,
 *   sin revisión humana previa). Si false (modo modal manual, comportamiento
 *   histórico), siempre se pisa con lo último extraído/editado.
 * @returns {Promise<{applied: string[]}>} columnas/campos que sí se escribieron.
 */
export async function applyExtractedDataToClient({
  targetClientId,
  extractedData,
  targetClientData = null,
  customFieldsConfig = [],
  skipIfAlreadyFilled = false,
}) {
  if (!targetClientId || !extractedData) return { applied: [] };

  let clientRow = targetClientData;
  if (!clientRow) {
    const { data } = await supabase.from('clientes').select('*').eq('id', targetClientId).single();
    clientRow = data;
  }

  const updates = {};
  const customJsonUpdates = { ...(clientRow?.campos_personalizados || {}) };
  let hasCustomJsonUpdates = false;
  const newCustomFieldDefs = [];
  const existingCustomFieldsById = new Map(
    (customFieldsConfig || []).map(cf => [toIdentificador(cf.identificador), cf.identificador])
  );
  const applied = [];

  const tipoDocumentoEntry = Object.entries(extractedData).find(([k]) => k.toUpperCase() === 'TIPO_DOCUMENTO');
  const tipoDocumento = tipoDocumentoEntry ? String(tipoDocumentoEntry[1]).trim().toUpperCase() : '';

  for (const [key, value] of Object.entries(extractedData)) {
    if (!value) continue;
    const upperKey = key.toUpperCase();

    const mappedCol = AI_FIELD_MAP[upperKey];
    if (mappedCol) {
      let finalValue;
      if (AI_DATE_KEYS.has(upperKey)) {
        const normalized = normalizeDateToDDMMYYYY(value);
        finalValue = normalized ? toIsoDate(normalized) : String(value).toUpperCase();
      } else {
        finalValue = String(value).toUpperCase();
      }

      if (FIXED_COLUMN_IDS.has(mappedCol)) {
        const currentValue = clientRow ? clientRow[mappedCol] : null;
        const isCurrentlyEmpty = currentValue === null || currentValue === undefined || String(currentValue).trim() === '';
        if (skipIfAlreadyFilled && !isCurrentlyEmpty) continue;
        updates[mappedCol] = finalValue;
        applied.push(mappedCol);
      } else {
        const currentValue = clientRow?.campos_personalizados?.[mappedCol];
        const isCurrentlyEmpty = currentValue === null || currentValue === undefined || String(currentValue).trim() === '';
        if (skipIfAlreadyFilled && !isCurrentlyEmpty) continue;
        customJsonUpdates[mappedCol] = finalValue;
        hasCustomJsonUpdates = true;
        applied.push(mappedCol);
      }
    } else if (!AI_IGNORED_KEYS.has(upperKey)) {
      const generatedId = toIdentificador(key);
      if (!generatedId) continue;
      const identificador = existingCustomFieldsById.get(generatedId) || generatedId;
      const currentValue = clientRow?.campos_personalizados?.[identificador];
      const isCurrentlyEmpty = currentValue === null || currentValue === undefined || String(currentValue).trim() === '';
      if (skipIfAlreadyFilled && !isCurrentlyEmpty) continue;
      customJsonUpdates[identificador] = String(value).toUpperCase();
      hasCustomJsonUpdates = true;
      applied.push(identificador);
      if (!existingCustomFieldsById.has(generatedId)) {
        const label = tipoDocumento ? `${humanizeAiKey(key)} (${tipoDocumento})` : humanizeAiKey(key);
        newCustomFieldDefs.push({ identificador, nombreCampo: label });
      }
    }
  }

  for (const { identificador, nombreCampo } of newCustomFieldDefs) {
    await ensureCustomFieldDefinition(identificador, nombreCampo);
  }

  if (hasCustomJsonUpdates) {
    updates.campos_personalizados = customJsonUpdates;
  }

  if (Object.keys(updates).length > 0) {
    await supabase.from('clientes').update(updates).eq('id', targetClientId);
  }

  return { applied };
}

const normalizeName = (name) => (name || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .trim();

/**
 * Heurística de "documento extraviado": ¿el nombre/CPF que la IA extrajo de
 * un documento pertenece claramente a otra persona, distinta del dueño de la
 * cuenta? Portada de ClientViewExtractionModal.isDifferent() para poder
 * correr el mismo chequeo de forma automática (sin esperar a que un
 * operacional abra el modal de revisión).
 */
export function detectPersonMismatch(currentCliente, extractedData) {
  if (!currentCliente || !extractedData) return false;
  const currentName = normalizeName(currentCliente.nombre);
  const extractedName = normalizeName(extractedData.NOMBRE_COMPLETO);
  if (!currentName || !extractedName) return false;

  const w1 = currentName.split(/\s+/).filter(w => w.length > 2);
  const w2 = extractedName.split(/\s+/).filter(w => w.length > 2);
  if (w1.length === 0 || w2.length === 0) return false;

  const firstNamesMatch = w1[0] === w2[0];
  const sharedWords = w1.filter(w => w2.includes(w)).length;
  const nameIsDifferent = sharedWords === 0 || (sharedWords === 1 && !firstNamesMatch);
  const cpfIsDifferent = !!(extractedData.CPF && currentCliente.cpf && extractedData.CPF !== currentCliente.cpf);

  return nameIsDifferent || cpfIsDifferent;
}

/**
 * Cuando detectPersonMismatch da true: busca si la persona del documento ya
 * es cliente (por CPF exacto, si no por nombre) y si no existe la crea --
 * siempre vinculada al cliente dueño de la cuenta vía relaciones_clientes
 * (tipo 'Familiar', misma convención que el flujo manual de
 * ClientViewExtractionModal.handleCreateNewClient). No mueve el documento acá:
 * eso lo hace el caller, porque el mecanismo difiere según el canal
 * (reassignDocument en el dashboard, UPDATE directo en el Edge Function).
 */
export async function resolveOrCreateRelatedClient({ currentCliente, extractedData }) {
  let query = supabase.from('clientes').select('id, nombre, cpf').neq('id', currentCliente.id);
  query = extractedData.CPF
    ? query.eq('cpf', extractedData.CPF)
    : query.ilike('nombre', `%${extractedData.NOMBRE_COMPLETO}%`);
  const { data: matches } = await query.limit(1);

  let targetClient;
  let isNewClient = false;
  if (matches && matches.length > 0) {
    targetClient = matches[0];
  } else {
    const camposPersonalizados = {};
    if (extractedData.RNM) camposPersonalizados.rnm = extractedData.RNM;
    if (extractedData.CARNET_IDENTIDAD) camposPersonalizados.carnet_identidad = extractedData.CARNET_IDENTIDAD;

    targetClient = await createCliente({
      nombre: extractedData.NOMBRE_COMPLETO?.toUpperCase() || 'NUEVO CLIENTE',
      cpf: extractedData.CPF || '',
      nacionalidad: extractedData.NACIONALIDAD?.toUpperCase() || '',
      fecha_nacimiento: extractedData.FECHA_NACIMIENTO ? toIsoDate(normalizeDateToDDMMYYYY(extractedData.FECHA_NACIMIENTO)) : null,
      sexo: extractedData.SEXO?.toUpperCase() || '',
      ...(Object.keys(camposPersonalizados).length > 0 ? { campos_personalizados: camposPersonalizados } : {}),
    });
    isNewClient = true;
  }

  // Evitar relaciones duplicadas si ya llegó antes otro documento de esta
  // misma persona relacionada (en cualquiera de los dos sentidos).
  const { data: existingRelation } = await supabase
    .from('relaciones_clientes')
    .select('id')
    .or(`and(cliente_id.eq.${currentCliente.id},cliente_relacionado_id.eq.${targetClient.id}),and(cliente_id.eq.${targetClient.id},cliente_relacionado_id.eq.${currentCliente.id})`)
    .limit(1);

  if (!existingRelation || existingRelation.length === 0) {
    try {
      await insertRelacion({ cliente_id: currentCliente.id, cliente_relacionado_id: targetClient.id, tipo_relacion: 'Familiar' });
    } catch (err) {
      if (err?.code !== '23505') console.error('[clientExtractionService] Error creando relación automática:', err);
    }
  }

  return { targetClient, isNewClient };
}

/**
 * Dado un documento ya extraído por la IA, decide a quién pertenecen sus
 * datos -- al cliente actual, o a uno relacionado si detectPersonMismatch da
 * true -- y los aplica (skipIfAlreadyFilled: true, nunca pisa un dato ya
 * cargado a mano). Si es de otra persona, además mueve el documento con
 * `moveDocument` (el mecanismo de "mover" difiere según el canal: subida
 * individual usa reassignDocument sobre un solo id, el organizador masivo
 * hace lo mismo por cada documento de la corrida).
 *
 * Comparte la misma lógica entre useClientViewDocuments.handleConfirmUpload
 * (un documento nuevo) y organizeClientDocuments (todos los documentos ya
 * subidos de un cliente) para que ambos flujos se comporten idéntico.
 *
 * @returns {Promise<{ moved: boolean, targetClient: object, isNewClient: boolean }>}
 */
export async function resolvePersonAndApplyData({ currentCliente, extractedData, customFieldsConfig = [], moveDocument }) {
  if (detectPersonMismatch(currentCliente, extractedData)) {
    const { targetClient, isNewClient } = await resolveOrCreateRelatedClient({ currentCliente, extractedData });
    if (moveDocument) await moveDocument(targetClient.id);
    await applyExtractedDataToClient({
      targetClientId: targetClient.id,
      extractedData,
      customFieldsConfig,
      skipIfAlreadyFilled: true,
    });
    return { moved: true, targetClient, isNewClient };
  }

  await applyExtractedDataToClient({
    targetClientId: currentCliente.id,
    extractedData,
    customFieldsConfig,
    skipIfAlreadyFilled: true,
  });
  return { moved: false, targetClient: currentCliente, isNewClient: false };
}

async function downloadDocBlob(doc) {
  const isPendiente = typeof doc.id === 'string' && doc.id.includes('-');
  const bucket = isPendiente ? 'whatsapp_media' : 'documentos_operacionales';
  let path = doc.url_archivo;
  if (path?.startsWith('http')) {
    const parts = path.split(`/${bucket}/`);
    path = parts.length === 2 ? decodeURIComponent(parts[1].split('?')[0]) : null;
  }
  if (!path) throw new Error('No se pudo resolver la ruta del archivo en el storage.');
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) throw error || new Error('No se pudo descargar el archivo.');
  return data;
}

const isAnalyzableDoc = (doc) => {
  if (doc.tipo_contenido?.startsWith('image/')) return true;
  if (doc.tipo_contenido === 'application/pdf') return true;
  const name = (doc.nombre_archivo || '').toLowerCase();
  return name.endsWith('.pdf') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.webp');
};

/**
 * "Organizar documentos" -- botón en la lista de documentos del cliente.
 * Recorre TODOS sus documentos analizables (imágenes/PDFs que no estén ya
 * descartados), corre la extracción IA de cada uno y:
 *   - Si no encuentra ningún dato legible -> lo descarta (estado 'rechazado'
 *     en documentos_operacionales, usando la columna que ya existía en el
 *     schema pero no se usaba desde ningún lado del código; los documentos
 *     de WhatsApp en documentos_pendientes no tienen esa columna, así que
 *     esos se dejan sin tocar -- se cuentan como "omitidos").
 *   - Si detecta que es de otra persona -> crea/vincula el cliente
 *     relacionado y le mueve el documento (resolvePersonAndApplyData).
 *   - Si es del cliente actual -> aplica los datos extraídos (solo campos
 *     todavía vacíos).
 * Corre secuencial (no en paralelo) para no reventar el límite de tokens/min
 * de Groq mandando varias imágenes a la vez.
 *
 * @returns {Promise<{analizados: number, movidos: number, aplicados: number, descartados: number, omitidos: number, errores: Array}>}
 */
export async function organizeClientDocuments({ clienteId, extraCustomFieldsForAi = [] }) {
  const documentos = await getDocuments(clienteId);
  const candidatos = documentos.filter(d => isAnalyzableDoc(d) && d.estado !== 'rechazado');

  const resumen = { analizados: 0, movidos: 0, aplicados: 0, descartados: 0, omitidos: 0, errores: [] };

  for (const doc of candidatos) {
    try {
      const blob = await downloadDocBlob(doc);
      const isPdf = doc.tipo_contenido === 'application/pdf' || (doc.nombre_archivo || '').toLowerCase().endsWith('.pdf');

      let fileOrBase64 = blob;
      if (isPdf) {
        const { convertPdfPageToImageBase64 } = await import('./pdfToImage');
        ({ base64: fileOrBase64 } = await convertPdfPageToImageBase64(blob));
      }

      const aiData = await analyzeDocumentImage(fileOrBase64, extraCustomFieldsForAi);
      resumen.analizados += 1;

      const tieneDatos = Object.keys(aiData).filter(k => aiData[k]).length > 0;
      if (!tieneDatos) {
        const isPendiente = typeof doc.id === 'string' && doc.id.includes('-');
        if (isPendiente) {
          resumen.omitidos += 1;
        } else {
          await supabase.from('documentos_operacionales')
            .update({ estado: 'rechazado', motivo_rechazo: 'Sin datos legibles (organizador IA)' })
            .eq('id', doc.id);
          resumen.descartados += 1;
        }
        continue;
      }

      // Recargar el cliente en cada vuelta: si un documento anterior en esta
      // misma corrida ya llenó un campo suyo, skipIfAlreadyFilled tiene que
      // verlo actualizado, no la copia que teníamos en memoria al empezar.
      const clienteActual = await getCliente(clienteId);
      const { moved } = await resolvePersonAndApplyData({
        currentCliente: clienteActual,
        extractedData: aiData,
        customFieldsConfig: extraCustomFieldsForAi,
        moveDocument: (targetId) => reassignDocument(doc.id, targetId),
      });

      if (moved) resumen.movidos += 1; else resumen.aplicados += 1;
    } catch (err) {
      console.error(`[clientExtractionService] Error organizando documento ${doc.id}:`, err);
      resumen.errores.push({ documentoId: doc.id, nombre: doc.nombre_archivo, error: err.message });
    }
  }

  return resumen;
}

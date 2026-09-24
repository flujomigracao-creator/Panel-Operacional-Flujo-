import { supabase } from '../supabaseClient';

const BUCKET = 'documentos_operacionales';
const MAX_SIZE_MB = 10;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

/**
 * Valida un archivo antes de subirlo.
 * @param {File} file
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateFile(file) {
  if (!file) return { valid: false, error: 'No se seleccionó ningún archivo.' };
  if (file.size > MAX_SIZE_MB * 1024 * 1024) return { valid: false, error: `El archivo supera el límite de ${MAX_SIZE_MB}MB.` };
  if (!ALLOWED_TYPES.includes(file.type)) return { valid: false, error: `Tipo de archivo no permitido: ${file.type}` };
  return { valid: true };
}

/**
 * Genera una URL firmada de corta duración (por defecto 60s) para un documento.
 * @param {string} storagePath - Ruta del archivo en el bucket.
 * @param {number} [expiresSec=60] - Tiempo de expiración en segundos.
 * @returns {Promise<string>}
 */
export async function getSignedUrl(storagePath, _expiresSec = 3600) {
  try {
    if (!storagePath) return null;
    if (storagePath.startsWith('http')) return storagePath;

    // Codificar caracteres especiales en la ruta
    const encodedPath = storagePath.split('/').map(segment => encodeURIComponent(segment)).join('/');

    // URL válida por 1 hora
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(encodedPath, _expiresSec);

    if (error) throw error;
    return data.signedUrl;
  } catch (err) {
    console.error('[storageService] getSignedUrl error:', err);
    throw err;
  }
}

/**
 * Sube un documento al bucket de Supabase y lo registra en la tabla documentos_operacionales.
 */
export async function uploadDocument(file, clientId, customName = null, customType = null) {
  const validation = validateFile(file);
  if (!validation.valid) return { data: null, error: validation.error };

  try {
    const ext = file.name.split('.').pop().toLowerCase();
    const uniqueName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const storagePath = `${clientId}/${uniqueName}`;

    // 1. Subir al Storage
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, file, { upsert: false });

    if (uploadError) throw uploadError;

    // 2. Registrar en la base de datos con la ruta relativa en lugar de URL pública
    const { data: docRecord, error: dbError } = await supabase
      .from('documentos_operacionales')
      .insert({
        id_cliente: clientId,
        tipo_documento: customType || (file.type.startsWith('image/') ? 'FOTO' : 'COMPROBANTE'),
        nombre_archivo: customName || file.name,
        url_archivo: storagePath,
        tamaño_bytes: file.size,
        tipo_contenido: file.type,
        subido_por: 'Admin',
        estado: 'pendiente',
      })
      .select()
      .single();

    if (dbError) throw dbError;

    return { data: docRecord, error: null };
  } catch (err) {
    console.error('[storageService] uploadDocument error:', err);
    return { data: null, error: err.message || 'Error desconocido al subir el archivo.' };
  }
}

/**
 * Elimina un documento del Storage y de la base de datos.
 * Los documentos que llegaron por Kommo/WhatsApp (id uuid, tabla
 * documentos_pendientes) viven en el bucket whatsapp_media, no en el bucket
 * de documentos subidos a mano — hay que borrar del bucket/tabla correctos.
 */
export async function deleteDocument(doc) {
  try {
    const isPendiente = typeof doc.id === 'string' && doc.id.includes('-');
    const bucket = isPendiente ? 'whatsapp_media' : BUCKET;
    const table = isPendiente ? 'documentos_pendientes' : 'documentos_operacionales';

    let storagePath = doc.url_archivo;
    if (storagePath?.startsWith('http')) {
        const urlParts = storagePath.split(`/${bucket}/`);
        storagePath = urlParts?.length === 2 ? urlParts[1].split('?')[0] : null;
    }

    if (storagePath) {
      const { error: storageErr } = await supabase.storage.from(bucket).remove([storagePath]);
      if (storageErr) console.warn('[storageService] Storage remove warning:', storageErr.message);
    }

    // Eliminar el registro de la DB
    const { error: dbError } = await supabase.from(table).delete().eq('id', doc.id);
    if (dbError) throw dbError;

    return { success: true, error: null };
  } catch (err) {
    console.error('[storageService] deleteDocument error:', err);
    return { success: false, error: err.message || 'Error eliminando el documento.' };
  }
}

/**
 * Obtiene todos los documentos de un cliente ordenados por fecha descendente.
 * Combina documentos_operacionales (subidos a mano desde el dashboard) con
 * documentos_pendientes (archivos que un cliente mandó por WhatsApp/Kommo,
 * pendientes de que el equipo los revise/verifique) en una sola lista.
 */
export async function getDocuments(clientId) {
  const [operacionales, pendientes] = await Promise.all([
    supabase
      .from('documentos_operacionales')
      .select('*')
      .eq('id_cliente', clientId)
      .order('creado_en', { ascending: false }),
    supabase
      .from('documentos_pendientes')
      .select('*')
      .eq('cliente_id', clientId)
      .order('fecha_recepcion', { ascending: false }),
  ]);

  if (operacionales.error) throw operacionales.error;
  if (pendientes.error) throw pendientes.error;

  const normalizedPendientes = (pendientes.data || []).map((doc) => ({
    ...doc,
    id_cliente: doc.cliente_id,
    creado_en: doc.fecha_recepcion,
    tipo_documento: 'DOCUMENTO DE WHATSAPP',
    subido_por: 'Kommo',
    estado: doc.verificado ? 'verificado' : 'pendiente',
  }));

  return [...(operacionales.data || []), ...normalizedPendientes].sort(
    (a, b) => new Date(b.creado_en) - new Date(a.creado_en)
  );
}

/**
 * Reasigna un documento a otro cliente.
 * Los documentos que llegaron por Kommo/WhatsApp (id uuid) viven en
 * documentos_pendientes y usan la columna `cliente_id`, no `id_cliente`
 * de documentos_operacionales.
 */
export async function reassignDocument(documentId, newClientId) {
  try {
    const isPendiente = typeof documentId === 'string' && documentId.includes('-');
    const table = isPendiente ? 'documentos_pendientes' : 'documentos_operacionales';
    const column = isPendiente ? 'cliente_id' : 'id_cliente';

    const { error } = await supabase
      .from(table)
      .update({ [column]: newClientId })
      .eq('id', documentId);
    if (error) throw error;
    return { success: true, error: null };
  } catch (err) {
    console.error('[storageService] reassignDocument error:', err);
    return { success: false, error: err.message || 'Error al reasignar el documento.' };
  }
}

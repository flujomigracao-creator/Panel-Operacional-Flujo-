import { supabase } from '../supabaseClient';
import { getSignedUrl } from './storageService';

const BUCKET = 'documentos_operacionales';
const FOLDER = 'biblioteca';
const TABLE = 'biblioteca_multimedia';

/**
 * Sube un archivo de audio o video a Supabase Storage y registra en biblioteca_multimedia.
 */
export async function uploadMedia(file, nombre) {
  try {
    const ext = file.name.split('.').pop().toLowerCase();
    const uniqueName = `${FOLDER}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(uniqueName, file, { upsert: false });

    if (uploadError) throw uploadError;

    // El bucket es privado: guardamos la ruta relativa (igual que
    // documentos_operacionales vía storageService), no una URL pública que
    // nunca serviría el archivo. La URL usable se resuelve al vuelo con
    // resolveMediaUrl() / getSignedUrl().
    const { data: record, error: dbError } = await supabase
      .from(TABLE)
      .insert({
        nombre: nombre || file.name,
        url_archivo: uniqueName,
        tipo_contenido: file.type,
        tamano: file.size,
      })
      .select()
      .single();

    if (dbError) throw dbError;
    return { data: record, error: null };
  } catch (err) {
    console.error('[mediaLibraryService] uploadMedia error:', err);
    return { data: null, error: err.message };
  }
}

/**
 * Resuelve el url_archivo de un item (ruta relativa, o una URL pública vieja
 * de antes de este fix) a una URL firmada usable. Los templates guardan
 * texto plano en url_archivo, no una ruta — se devuelven tal cual.
 */
export async function resolveMediaUrl(item) {
  if (!item?.url_archivo) return null;
  if (item.tipo_contenido === 'template') return item.url_archivo;

  let path = item.url_archivo;
  if (path.startsWith('http')) {
    const marker = `/${BUCKET}/`;
    const idx = path.indexOf(marker);
    if (idx === -1) return path;
    path = decodeURIComponent(path.slice(idx + marker.length));
  }

  try {
    return await getSignedUrl(path);
  } catch (err) {
    console.error('[mediaLibraryService] resolveMediaUrl error:', err);
    return null;
  }
}

/**
 * Obtiene toda la biblioteca multimedia de la base de datos.
 */
export async function getMediaLibrary() {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('creado_en', { ascending: false });

    if (error) throw error;
    return { data: data || [], error: null };
  } catch (err) {
    console.error('[mediaLibraryService] getMediaLibrary error:', err);
    return { data: [], error: err.message };
  }
}

/**
 * Elimina un elemento de la biblioteca y del storage.
 */
export async function deleteMedia(mediaId, url_archivo) {
  try {
    // 1. Borrar de base de datos
    const { error: dbError } = await supabase
      .from(TABLE)
      .delete()
      .eq('id', mediaId);

    if (dbError) throw dbError;

    // 2. Intentar borrar del Storage. url_archivo puede ser una ruta relativa
    // (subidas nuevas) o, en filas viejas, una URL pública completa.
    try {
      if (url_archivo) {
        const filePath = url_archivo.startsWith('http')
          ? url_archivo.split(`${BUCKET}/`)[1]
          : url_archivo;
        if (filePath) {
          await supabase.storage.from(BUCKET).remove([decodeURIComponent(filePath)]);
        }
      }
    } catch (storageErr) {
      console.warn('No se pudo borrar el archivo del storage (puede que ya no exista):', storageErr);
    }

    return { success: true, error: null };
  } catch (err) {
    console.error('[mediaLibraryService] deleteMedia error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Añade una plantilla de mensaje a la base de datos.
 */
export async function addTemplate(nombre, texto) {
  try {
    const { data: record, error: dbError } = await supabase
      .from(TABLE)
      .insert({
        nombre: nombre,
        url_archivo: texto,
        tipo_contenido: 'template',
        tamano: texto.length,
      })
      .select()
      .single();

    if (dbError) throw dbError;
    return { data: record, error: null };
  } catch (err) {
    console.error('[mediaLibraryService] addTemplate error:', err);
    return { data: null, error: err.message };
  }
}

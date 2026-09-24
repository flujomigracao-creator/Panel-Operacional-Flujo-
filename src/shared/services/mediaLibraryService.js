import { supabase } from '../supabaseClient';

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

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(uniqueName);

    const { data: record, error: dbError } = await supabase
      .from(TABLE)
      .insert({
        nombre: nombre || file.name,
        url_archivo: urlData.publicUrl,
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

    // 2. Intentar borrar del Storage
    try {
      if (url_archivo) {
        const filePath = url_archivo.split(`${BUCKET}/`)[1];
        if (filePath) {
          await supabase.storage.from(BUCKET).remove([filePath]);
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

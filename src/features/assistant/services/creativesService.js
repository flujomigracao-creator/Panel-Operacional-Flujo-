import { supabase } from '@shared/config/supabaseClient';
import { invoke } from './assistantService';

// Laboratorio de Creativos V5. Lectura directa de Supabase (vistas con RLS); toda escritura pasa por
// la Edge Function `asistente`, y lo que toca Meta se convierte en una propuesta que el dueño confirma.

export const SERVICIOS = ['CPF', 'Agendamento PF', 'RNM', 'Residência Permanente', 'Refúgio'];
export const FORMATOS = ['1:1', '4:5', '9:16'];
export const FORMATO_LABEL = { '1:1': '1:1 Feed', '4:5': '4:5 Feed', '9:16': '9:16 Stories/Reels' };
export const CONCEPTOS = {
  persona: 'Persona',
  documento: 'Documento',
  problema_solucion: 'Problema → solución',
  institucional: 'Institucional',
  mensaje_directo: 'Mensaje directo',
  variacion_ganadora: 'Variación del ganador',
};
export const ESTADO_LABEL = { draft: 'Borrador', approved: 'Aprobado', published: 'Publicado', archived: 'Archivado' };

export { METRICAS, formatear, mejoresIndices, resumirPorServicio } from './creativesFormat';

export async function listarCreativos() {
  const { data, error } = await supabase.from('creative_resultados').select('*').order('created_at', { ascending: false }).limit(300);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function listarPrompts() {
  const { data, error } = await supabase.from('prompt_resultados').select('*').order('created_at', { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return data || [];
}

/** Anuncios y conjuntos reales sincronizados desde Meta (para vincular o publicar). */
export async function listarEntidadesMeta() {
  const { data, error } = await supabase.from('meta_ads_entities').select('entity_type, entity_id, parent_id, name, status').in('entity_type', ['ad', 'adset']);
  if (error) throw new Error(error.message);
  const filas = data || [];
  return { anuncios: filas.filter(f => f.entity_type === 'ad'), conjuntos: filas.filter(f => f.entity_type === 'adset') };
}

/** URLs firmadas (1 h) de las imágenes del bucket privado. */
export async function urlsDeImagenes(paths) {
  const unicos = [...new Set(paths.filter(Boolean))];
  if (!unicos.length) return {};
  const { data, error } = await supabase.storage.from('creatives').createSignedUrls(unicos, 3600);
  if (error) return {};
  return Object.fromEntries((data || []).filter(d => d.signedUrl).map(d => [d.path, d.signedUrl]));
}

export const proponerConceptos = (body) => invoke({ accion: 'creative_conceptos', ...body });
export const generarCreativo = (body) => invoke({ accion: 'creative_generar', ...body });
export const subirCreativo = (body) => invoke({ accion: 'creative_subir', ...body });
export const actualizarCreativo = (id, patch) => invoke({ accion: 'creative_actualizar', id, ...patch });
export const guardarPrompt = (body) => invoke({ accion: 'creative_prompt_guardar', ...body });
export const proponerPublicacion = (creative_id, adset_id) => invoke({ accion: 'creative_proponer_publicacion', creative_id, adset_id });
export const crearExperimento = (body) => invoke({ accion: 'creative_experimento', ...body });
export const cerrarExperimento = (experiment_id, concluirInconcluso = false) =>
  invoke({ accion: 'creative_cerrar_experimento', experiment_id, concluir_inconcluso: concluirInconcluso });

/** Estado real de la conexión con Meta (token, permisos, cuenta, pagos). Nunca incluye el token. */
export async function estadoMeta() {
  const { data, error } = await supabase.functions.invoke('estado-meta', { body: {} });
  if (error) {
    let detalle = error.message;
    try { detalle = (await error.context?.json?.())?.error || detalle; } catch { /* sin JSON */ }
    throw new Error(detalle);
  }
  return data;
}

/** Archivo de imagen → base64 sin prefijo data:. */
export function archivoABase64(archivo) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('No se pudo leer el archivo'));
    r.readAsDataURL(archivo);
  });
}

import { supabase } from '@shared/config/supabaseClient';

const must = ({ data, error }) => { if (error) throw error; return data; };

/** Últimos comentarios que el bot ha visto (RLS por organización). */
export async function listComentarios(limite = 200) {
  return must(await supabase.from('comentarios_social').select('*').order('creado_at', { ascending: false }).limit(limite));
}

/** Interruptores del bot; si no hay fila, valores por defecto (activo y con borrado). */
export async function getSocialBot() {
  const fila = must(await supabase.from('organization_settings').select('value').eq('key', 'social_bot').maybeSingle());
  return { activo: true, borrar: true, ...((fila && fila.value) || {}) };
}

/** Solo administradores pueden cambiarlos (RLS); si no, el error llega a la pantalla. */
export async function setSocialBot(valor) {
  return must(await supabase.from('organization_settings').update({ value: valor }).eq('key', 'social_bot').select().single());
}

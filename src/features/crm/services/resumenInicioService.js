import { supabase } from '@shared/config/supabaseClient';

/**
 * Resumen ejecutivo del Inicio (RPC `resumen_inicio`, solo lectura, respeta RLS).
 * Todas las cifras y el período anterior salen del servidor con día de São Paulo: no se recalculan aquí.
 */
export async function getResumenInicio(desde, hasta) {
  const { data, error } = await supabase.rpc('resumen_inicio', { p_desde: desde, p_hasta: hasta });
  if (error) throw error;
  return data;
}

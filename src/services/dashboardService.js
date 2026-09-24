import { supabase } from '../supabaseClient';

/**
 * Estadísticas del Panel Operacional, agregadas del lado del servidor por la
 * función `get_dashboard_stats` (ver database/standalone/009_dashboard_stats.sql)
 * en una sola consulta — evita traer todas las filas de `clientes`/`entradas`
 * al navegador para sumarlas/agruparlas acá.
 */
export async function getDashboardStats() {
  const { data, error } = await supabase.rpc('get_dashboard_stats');
  if (error) throw error;
  return data;
}

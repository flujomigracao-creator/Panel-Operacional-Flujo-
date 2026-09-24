import { supabase } from '../supabaseClient';
import { registrarAccionHistorial } from './equipoService';

export const getConfig = async (clave) => {
  const { data, error } = await supabase
    .from('configuraciones_app')
    .select('valor')
    .eq('clave', clave)
    .single();
    
  if (error) {
    if (error.code === 'PGRST116') return null; // No row found
    throw error;
  }
  return data?.valor;
};

export const setConfig = async (clave, valor, userId) => {
  const { error } = await supabase
    .from('configuraciones_app')
    .upsert({ clave, valor, actualizado_en: new Date().toISOString() }, { onConflict: 'clave' });
    
  if (error) throw error;
  
  if (userId) {
    // We register the action using a placeholder client ID (0) since this is a global action
    try {
        await registrarAccionHistorial(0, 'CONFIG_UPDATED', `Actualizó la configuración: ${clave}`);
    } catch (_e) {
        console.warn('Could not register action history for config update');
    }
  }
};

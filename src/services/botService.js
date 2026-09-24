import { supabase } from '../supabaseClient';

/**
 * Configuración del bot de WhatsApp (horarios, plantillas, umbrales de spam,
 * prompt de IA). Fila única en `configuracion_bot` (empresa única, sin
 * multi-tenant). Ver también src/components/settings/WhatsAppSettings.jsx,
 * que es donde el usuario la edita.
 */
export const getConfiguracionBot = async () => {
  const { data, error } = await supabase
    .from('configuracion_bot')
    .select('*')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
};

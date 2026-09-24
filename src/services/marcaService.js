import { supabase } from '../shared/config/supabaseClient';

/**
 * Branding (white-label) de la empresa: logo, color primario, color de fondo y
 * color de letra. Vive en la fila única de `configuracion_empresa` (empresa
 * única, sin multi-tenant). Ver src/components/settings/MarcaSettings.jsx, que
 * es donde el admin la edita.
 */
export const getMarca = async () => {
  const { data, error } = await supabase
    .from('configuracion_empresa')
    .select('logo_url, color_primario, color_fondo, color_texto')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
};

export const updateMarca = async ({ logoUrl, colorPrimario, colorFondo, colorTexto }) => {
  const { data: row, error: findError } = await supabase
    .from('configuracion_empresa')
    .select('id')
    .limit(1)
    .maybeSingle();
  if (findError) throw findError;
  if (!row) {
    throw new Error('No se encontró la fila de configuracion_empresa para actualizar.');
  }

  const { data, error } = await supabase
    .from('configuracion_empresa')
    .update({ logo_url: logoUrl, color_primario: colorPrimario, color_fondo: colorFondo, color_texto: colorTexto })
    .eq('id', row.id)
    .select('logo_url, color_primario, color_fondo, color_texto');

  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('No se encontraron registros para actualizar o no tienes permisos (RLS) en la tabla configuracion_empresa.');
  }
  return data[0];
};

export const uploadLogo = async (file) => {
  const ext = file.name.split('.').pop().toLowerCase();
  const storagePath = `empresa/logo_${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('marca')
    .upload(storagePath, file, { upsert: true });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from('marca').getPublicUrl(storagePath);
  return data.publicUrl;
};

import { supabase } from '../supabaseClient';
import { registrarAccionHistorial } from './equipoService';

export const getFormulariosByClient = async (clientId) => {
  const { data, error } = await supabase
    .from('formularios_clientes')
    .select('*')
    .eq('cliente_id', clientId)
    .order('creado_en', { ascending: false });
    
  if (error) throw error;
  return data || [];
};

export const deleteFormulario = async (id, clientId) => {
  const { error } = await supabase.from('formularios_clientes').delete().eq('id', id);
  if (error) throw error;
  registrarAccionHistorial(clientId, 'ELIMINAR_FORMULARIO', `Eliminó un formulario enviado por el cliente`);
};

export const updateFormularioEstado = async (id, estado) => {
  const { error } = await supabase.from('formularios_clientes').update({ estado }).eq('id', id);
  if (error) throw error;
};

export const updateFormulario = async (id, data, clientId) => {
  const { error } = await supabase.from('formularios_clientes').update(data).eq('id', id);
  if (error) throw error;
  if (clientId) {
    registrarAccionHistorial(clientId, 'EDITAR_FORMULARIO', `Editó las respuestas de un formulario`);
  }
};

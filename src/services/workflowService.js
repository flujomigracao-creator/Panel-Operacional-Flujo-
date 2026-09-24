import { supabase } from '../supabaseClient';

export async function getAiWorkflows() {
  const { data, error } = await supabase
    .from('ia_workflows')
    .select('*')
    .order('creado_en', { ascending: false });

  if (error) throw error;
  return data;
}

export async function getAiWorkflow(id) {
  const { data, error } = await supabase
    .from('ia_workflows')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

export async function createAiWorkflow(workflowData) {
  const { data, error } = await supabase
    .from('ia_workflows')
    .insert({
      nombre: workflowData.nombre || 'Nuevo Workflow',
      descripcion: workflowData.descripcion || '',
      nodes: workflowData.nodes || [],
      edges: workflowData.edges || [],
      activo: workflowData.activo !== undefined ? workflowData.activo : true,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateAiWorkflow(id, workflowData) {
  const { data, error } = await supabase
    .from('ia_workflows')
    .update({
      nombre: workflowData.nombre,
      descripcion: workflowData.descripcion,
      nodes: workflowData.nodes,
      edges: workflowData.edges,
      activo: workflowData.activo,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteAiWorkflow(id) {
  const { error } = await supabase
    .from('ia_workflows')
    .delete()
    .eq('id', id);

  if (error) throw error;
  return true;
}

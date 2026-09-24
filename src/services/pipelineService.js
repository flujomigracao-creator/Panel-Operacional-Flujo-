/**
 * pipelineService.js
 * Centraliza el CRUD de pipelines y sus etapas (columnas del Kanban).
 */
import { supabase } from '../supabaseClient';
import { updateEntradaStage, updateEntradaOperario, updateEntradaEtiquetas } from './tramitesService';
import { getAiWorkflow } from './workflowService';
import toast from 'react-hot-toast';

/**
 * Recorre nodes/edges de un ia_workflow desde el nodo "start" y devuelve los
 * nodos en orden de ejecución. El Bot Builder solo arma cadenas lineales por
 * ahora (cada "addStep" siempre encadena al final), así que alcanza con
 * seguir el primer edge saliente de cada nodo; se corta en el placeholder
 * "addStep" o si no hay siguiente nodo.
 */
const walkAiWorkflowNodes = (nodes, edges) => {
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const nextByTarget = new Map(edges.map((e) => [e.source, e.target]));
  const start = nodes.find((n) => n.type === 'start');

  const ordered = [];
  const visited = new Set();
  let currentId = start ? nextByTarget.get(start.id) : undefined;
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const node = nodeById.get(currentId);
    if (!node || node.type === 'addStep') break;
    ordered.push(node);
    currentId = nextByTarget.get(currentId);
  }
  return ordered;
};

export const getPipelines = async () => {
  const { data, error } = await supabase
    .from('pipelines')
    .select('*')
    .eq('activo', true)
    .order('orden', { ascending: true });
  if (error) throw error;
  return data || [];
};

export const createPipeline = async (nombre) => {
  const { data: existing } = await supabase.from('pipelines').select('orden').order('orden', { ascending: false }).limit(1);
  const orden = (existing?.[0]?.orden ?? -1) + 1;

  const { data, error } = await supabase
    .from('pipelines')
    .insert({ nombre, orden })
    .select()
    .single();
  if (error) throw error;

  const defaultStages = [
    { nombre: 'Nuevo', color: '#7c3aed' },
    { nombre: 'En proceso', color: '#3b82f6' },
    { nombre: 'Completado', color: '#10b981' },
  ];
  await Promise.all(defaultStages.map((s, i) => createStage({ pipeline_id: data.id, nombre: s.nombre, color: s.color, orden: i })));

  return data;
};

export const updatePipeline = async (id, updates) => {
  const { data, error } = await supabase.from('pipelines').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const deletePipeline = async (id) => {
  const { error } = await supabase.from('pipelines').update({ activo: false }).eq('id', id);
  if (error) throw error;
};

export const getPipelineStages = async (pipelineId) => {
  const { data, error } = await supabase
    .from('pipeline_etapas')
    .select('*')
    .eq('pipeline_id', pipelineId)
    .eq('activo', true)
    .order('orden', { ascending: true });
  if (error) throw error;
  return data || [];
};

export const createStage = async ({ pipeline_id, nombre, color = '#7c3aed', orden = 0 }) => {
  const { data, error } = await supabase
    .from('pipeline_etapas')
    .insert({ pipeline_id, nombre, color, orden })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateStage = async (id, updates) => {
  const { data, error } = await supabase.from('pipeline_etapas').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const reorderStages = async (stages) => {
  // stages: [{ id, orden }]
  await Promise.all(stages.map(s => supabase.from('pipeline_etapas').update({ orden: s.orden }).eq('id', s.id)));
};

/**
 * Borra una etapa. Si tiene tarjetas, las reasigna a otra etapa del mismo pipeline
 * (la primera disponible que no sea la que se está borrando) antes de eliminarla.
 */
export const deleteStage = async (id, pipelineId) => {
  const remaining = await getPipelineStages(pipelineId);
  const fallback = remaining.find(s => s.id !== id);

  if (fallback) {
    await supabase.from('entradas').update({ stage_id: fallback.id }).eq('stage_id', id);
  } else {
    await supabase.from('entradas').update({ stage_id: null }).eq('stage_id', id);
  }

  const { error } = await supabase.from('pipeline_etapas').update({ activo: false }).eq('id', id);
  if (error) throw error;
};

// ── Automatizaciones (Kommo-style: "cuando una tarjeta entra a esta etapa...") ────────────────

export const getStageAutomations = async (stageId) => {
  const { data, error } = await supabase
    .from('pipeline_automatizaciones')
    .select('*')
    .eq('stage_id', stageId)
    .order('orden', { ascending: true });
  if (error) throw error;
  return data || [];
};

export async function createAutomation(automationData) {
  const { data, error } = await supabase
    .from('pipeline_automatizaciones')
    .insert({
      pipeline_id: automationData.pipeline_id,
      stage_id: automationData.stage_id,
      tipo_accion: automationData.tipo_accion,
      mensaje_texto: automationData.mensaje_texto,
      etapa_destino_id: automationData.etapa_destino_id,
      webhook_url: automationData.webhook_url,
      operario_nombre: automationData.operario_nombre,
      etiqueta_id: automationData.etiqueta_id,
      ia_workflow_id: automationData.ia_workflow_id,
      condiciones: automationData.condiciones || {},
      activo: true
    })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateAutomation = async (id, updates) => {
  const { data, error } = await supabase.from('pipeline_automatizaciones').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
};

export const deleteAutomation = async (id) => {
  const { error } = await supabase.from('pipeline_automatizaciones').delete().eq('id', id);
  if (error) throw error;
};

/**
 * Ejecuta las automatizaciones activas de una etapa cuando una tarjeta entra a ella.
 * No se ejecutan en cascada: un "mover a otra etapa" no vuelve a disparar las automatizaciones
 * de la etapa destino, para evitar loops entre etapas configuradas para moverse entre sí.
 */
export const runStageAutomations = async (stageId, entrada) => {
  let automations = [];
  try {
    const { data, error } = await supabase
      .from('pipeline_automatizaciones')
      .select('*')
      .eq('stage_id', stageId)
      .eq('activo', true)
      .order('orden', { ascending: true });
    if (error) throw error;
    automations = data || [];
  } catch (err) {
    console.error('Error loading stage automations:', err);
    return;
  }

  for (const auto of automations) {
    try {
      // Evaluar condiciones si existen (ej. filtro por servicio)
      if (auto.condiciones?.servicios?.length > 0) {
        const servicioEntrada = entrada.servicio?.trim().toUpperCase();
        if (!auto.condiciones.servicios.includes(servicioEntrada)) {
          continue; // No cumple la condición, saltamos esta regla
        }
      }

      if (auto.tipo_accion === 'mensaje' && entrada.id_cliente && auto.mensaje_texto) {
        const nombre = entrada.clientes?.nombre || '';
        const texto = auto.mensaje_texto.replaceAll('{nombre}', nombre);
        const { data, error } = await supabase.functions.invoke('enviar-whatsapp', { body: { cliente_id: entrada.id_cliente, texto } });
        if (error) throw new Error(error.message || 'Error de invocación');
        if (data?.error) throw new Error(data.error);
        toast.success(`Mensaje automático enviado a ${nombre}`);
      } else if (auto.tipo_accion === 'ia' && auto.ia_workflow_id && entrada.id_cliente) {
        const workflow = await getAiWorkflow(auto.ia_workflow_id);
        const nombre = entrada.clientes?.nombre || '';
        const ordered = walkAiWorkflowNodes(workflow?.nodes || [], workflow?.edges || []);
        let currentEtiquetas = entrada.etiquetas_ids || [];

        for (const node of ordered) {
          if (node.type === 'message' && node.data?.text) {
            const texto = node.data.text.replaceAll('{nombre}', nombre);
            const { data, error } = await supabase.functions.invoke('enviar-whatsapp', { body: { cliente_id: entrada.id_cliente, texto } });
            if (error) throw new Error(error.message || 'Error de invocación');
            if (data?.error) throw new Error(data.error);
          } else if (
            (node.type === 'tag' && node.data?.etiqueta_id) ||
            (node.type === 'action' && node.data?.actionType === 'add_tag' && node.data?.etiqueta_id)
          ) {
            if (!currentEtiquetas.includes(node.data.etiqueta_id)) {
              currentEtiquetas = [...currentEtiquetas, node.data.etiqueta_id];
              await updateEntradaEtiquetas(entrada.id, currentEtiquetas);
            }
          } else if (node.type === 'action' && node.data?.actionType === 'assign_agent' && node.data?.operario_nombre) {
            await updateEntradaOperario(entrada.id, node.data.operario_nombre);
          } else if (node.type === 'action' && node.data?.actionType === 'move_pipeline' && node.data?.etapa_destino_id && node.data.etapa_destino_id !== stageId) {
            const { data: destStage } = await supabase.from('pipeline_etapas').select('*').eq('id', node.data.etapa_destino_id).single();
            if (destStage) {
              await updateEntradaStage(entrada.id, destStage);
            }
          } else if (node.type === 'action' && node.data?.actionType === 'send_webhook' && node.data?.webhook_url) {
            const response = await fetch(node.data.webhook_url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                evento: 'BOT_WORKFLOW_STEP',
                timestamp: new Date().toISOString(),
                tramite: entrada,
                cliente: entrada.clientes || null
              })
            });
            if (!response.ok) throw new Error('Error al enviar Webhook del bot');
          } else {
            // "condition", "pause" y la acción "create_document" todavía no
            // tienen ejecución real (branching/scheduling/plantilla
            // pendientes) — se omiten silenciosamente en vez de fallar todo
            // el workflow.
            console.warn(`[runStageAutomations] Nodo de bot tipo "${node.type}"${node.data?.actionType ? ` (${node.data.actionType})` : ''} (${node.id}) aún no soportado, se omite.`);
          }
        }
        toast.success(`Bot "${workflow?.nombre || ''}" ejecutado para ${nombre}`);
      } else if (auto.tipo_accion === 'mover_etapa' && auto.etapa_destino_id && auto.etapa_destino_id !== stageId) {
        const { data: destStage } = await supabase.from('pipeline_etapas').select('*').eq('id', auto.etapa_destino_id).single();
        if (destStage) {
          await updateEntradaStage(entrada.id, destStage);
          toast.success(`Movido automáticamente a ${destStage.nombre}`);
        }
      } else if (auto.tipo_accion === 'webhook' && auto.webhook_url) {
        const payload = {
          evento: 'STAGE_CHANGED',
          timestamp: new Date().toISOString(),
          tramite: entrada,
          cliente: entrada.clientes || null
        };
        const response = await fetch(auto.webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error('Error al enviar Webhook');
        toast.success('Webhook disparado automáticamente');
      } else if (auto.tipo_accion === 'operario' && auto.operario_nombre) {
        await updateEntradaOperario(entrada.id, auto.operario_nombre);
        toast.success(`Asignado automáticamente a ${auto.operario_nombre}`);
      } else if (auto.tipo_accion === 'etiqueta' && auto.etiqueta_id) {
        const currentEtiquetas = entrada.etiquetas_ids || [];
        if (!currentEtiquetas.includes(auto.etiqueta_id)) {
          await updateEntradaEtiquetas(entrada.id, [...currentEtiquetas, auto.etiqueta_id]);
          toast.success('Etiqueta añadida automáticamente');
        }
      }
    } catch (err) {
      console.error('Error running stage automation:', auto.id, err);
      toast.error(`La regla automática falló: ${err.message}`);
    }
  }
};

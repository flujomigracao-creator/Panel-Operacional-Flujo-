import { supabase } from '@shared/config/supabaseClient';

// Llama a la Edge Function `asistente` con la sesión del usuario.
// Si responde con error, devuelve el mensaje que explica el problema.
async function invoke(body) {
  const { data, error } = await supabase.functions.invoke('asistente', { body });
  if (error) {
    let msg = error.message;
    try {
      const detail = await error.context?.json?.();
      if (detail?.error) msg = detail.error;
      if (detail?.propuesta) return { ...detail, ok: false, error: msg };
    } catch { /* respuesta sin JSON */ }
    throw new Error(msg);
  }
  return data;
}

export const sendMessage = (mensaje, conversationId, contexto) =>
  invoke({ accion: 'mensaje', mensaje, conversation_id: conversationId || undefined, contexto });

export const executeProposal = (proposalId, filas) =>
  invoke({ accion: 'ejecutar', proposal_id: proposalId, filas });

export const cancelProposal = (proposalId) =>
  invoke({ accion: 'cancelar', proposal_id: proposalId });

// Historial: RLS deja ver solo las conversaciones propias.
export async function listConversations() {
  const { data, error } = await supabase
    .from('ai_conversations')
    .select('id, title, client_id, updated_at')
    .order('updated_at', { ascending: false })
    .limit(30);
  if (error) throw error;
  return data || [];
}

export async function loadConversation(conversationId) {
  const [{ data: msgs, error: e1 }, { data: props, error: e2 }] = await Promise.all([
    supabase.from('ai_messages').select('id, role, content, proposal_ids, created_at').eq('ai_conversation_id', conversationId).order('created_at'),
    supabase.from('ai_proposals').select('id, tipo, payload, resumen, status, result, created_at').eq('ai_conversation_id', conversationId),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const byId = Object.fromEntries((props || []).map(p => [p.id, p]));
  return (msgs || []).map(m => ({
    id: m.id,
    role: m.role,
    content: m.content,
    propuestas: (m.proposal_ids || []).map(id => byId[id]).filter(Boolean),
  }));
}

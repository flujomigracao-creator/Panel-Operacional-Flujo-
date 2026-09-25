import { supabase } from '@shared/config/supabaseClient';

const PRIORITY_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 };

export const KOMMO_LEAD_URL = (leadId) => `https://flujomigracao.kommo.com/leads/detail/${leadId}`;

/**
 * Bandeja del día: tareas abiertas (creadas por n8n/agentes o a mano) + señales
 * que la base detecta sola (documentos por revisar, casos parados, citas).
 * Todo sale de la vista `pendentes_hoje`; RLS limita a la organización del usuario.
 */
export async function getPendentesHoje() {
  const { data, error } = await supabase
    .from('pendentes_hoje')
    .select('origem, ref_id, client_id, client_service_id, tipo, titulo, detalhes, prioridade, vence_em, desde, kommo_lead_id, enlace');
  if (error) throw error;

  return (data || []).sort((a, b) =>
    (PRIORITY_ORDER[a.prioridade] ?? 9) - (PRIORITY_ORDER[b.prioridade] ?? 9)
    || (a.vence_em ? new Date(a.vence_em) : Infinity) - (b.vence_em ? new Date(b.vence_em) : Infinity)
    || new Date(a.desde) - new Date(b.desde)
  );
}

export async function completeTask(taskId) {
  const { error } = await supabase
    .from('tasks')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('id', taskId);
  if (error) throw error;
}

export async function dismissTask(taskId) {
  const { error } = await supabase
    .from('tasks')
    .update({ status: 'cancelled', completed_at: new Date().toISOString() })
    .eq('id', taskId);
  if (error) throw error;
}

export async function snoozeTask(taskId, hours = 24) {
  const until = new Date(Date.now() + hours * 3600 * 1000).toISOString();
  const { error } = await supabase.from('tasks').update({ snoozed_until: until }).eq('id', taskId);
  if (error) throw error;
}

export async function reviewDocument(documentId, approved, userId, notes = null) {
  const { error } = await supabase
    .from('documents')
    .update({ status: approved ? 'approved' : 'rejected', reviewed_by: userId, review_notes: notes })
    .eq('id', documentId);
  if (error) throw error;
}

// Guarda Endereco_Brasil/Cidade del trámite (campos compartidos, no por persona) directo
// desde la señal "falta_direccion" de Hoy, sin tener que abrir la ficha del cliente.
export async function guardarDireccionTramite(organizationId, clientServiceId, endereco, cidade) {
  const { data: campos, error: errCampos } = await supabase
    .from('service_fields')
    .select('id, name')
    .in('name', ['Endereco_Brasil', 'Cidade'])
    .eq('service_id', '00000000-0000-0000-0000-000000000002');
  if (errCampos) throw errCampos;
  const idPorNombre = Object.fromEntries((campos || []).map(c => [c.name, c.id]));
  const filas = [
    endereco?.trim() && idPorNombre.Endereco_Brasil
      ? { organization_id: organizationId, client_service_id: clientServiceId, service_field_id: idPorNombre.Endereco_Brasil, value: endereco.trim(), updated_at: new Date().toISOString() }
      : null,
    cidade?.trim() && idPorNombre.Cidade
      ? { organization_id: organizationId, client_service_id: clientServiceId, service_field_id: idPorNombre.Cidade, value: cidade.trim(), updated_at: new Date().toISOString() }
      : null,
  ].filter(Boolean);
  if (!filas.length) return;
  const { error } = await supabase.from('client_service_field_values').upsert(filas, { onConflict: 'client_service_id,service_field_id' });
  if (error) throw error;
}

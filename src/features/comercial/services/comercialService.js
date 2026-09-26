import { supabase } from '@shared/config/supabaseClient';

const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

// Las 8 etapas reales del pipeline Comercial de Kommo (14489115), en el orden
// del tablero. "Incoming leads" (sin calificar aún) no se muestra como columna
// propia — son pocos y quedan agrupados con "Bienvenida y Confianza" en la vista.
export const ETAPAS_COMERCIAL = [
  { statusId: 111918875, nombre: 'Bienvenida y Confianza', position: 20 },
  { statusId: 111918879, nombre: 'Calificación de Necesidad', position: 30 },
  { statusId: 111918883, nombre: 'Propuesta y Precio', position: 40 },
  { statusId: 111919155, nombre: 'Datos y Pago (PIX)', position: 50 },
  { statusId: 111919159, nombre: 'Pago Confirmado/esperando documentos', position: 60 },
  { statusId: 111919167, nombre: 'Seguimiento (Sin Respuesta)', position: 70 },
  { statusId: 112025771, nombre: 'RECUPERACION INSTANTANEA', position: 80 },
  { statusId: 142, nombre: 'Logrado con éxito', position: 10000 },
  { statusId: 143, nombre: 'Descalificado / Perdido', position: 11000 },
];

export async function getComercialLeads() {
  return must(await supabase
    .from('comercial_leads')
    .select('id, kommo_lead_id, client_id, nombre, telefono, tramite_texto, precio, etapa_status_id, etapa_nombre, etapa_position, updated_at, last_inbound_at, last_atendido_at, bienvenida_enviada, propuesta_enviada, atendente_pausado')
    .order('etapa_position', { ascending: true })
    .order('updated_at', { ascending: false }));
}

export async function setAtendentePausado(leadId, pausado) {
  must(await supabase.from('comercial_leads').update({ atendente_pausado: pausado }).eq('id', leadId));
}

// supabase.functions.invoke esconde el cuerpo de las respuestas no-2xx; se rescata el mensaje real.
async function invocarEnvio(body) {
  const { data, error } = await supabase.functions.invoke('enviar-whatsapp-cliente', { body });
  if (error) {
    const detalle = await error.context?.json?.().catch(() => null);
    throw new Error(detalle?.error || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export function enviarMensajeLead(kommoLeadId, mensaje) {
  return invocarEnvio({ kommo_lead_id: kommoLeadId, mensaje });
}

export async function enviarArchivoLead(organizationId, kommoLeadId, file, caption = '') {
  const ext = file.name.split('.').pop() || 'bin';
  const path = `${organizationId}/panel/lead-${kommoLeadId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const { error: uploadError } = await supabase.storage.from('chat-media').upload(path, file, { contentType: file.type });
  if (uploadError) throw uploadError;
  return invocarEnvio({ kommo_lead_id: kommoLeadId, storage_path: path, file_name: file.name, mime_type: file.type, caption: caption || undefined });
}

export async function getAprendizajesNora() {
  return must(await supabase
    .from('nora_aprendizajes')
    .select('id, leccion, tipo, origen, estado, kommo_lead_id, created_at, revisado_at')
    .neq('estado', 'descartada')
    .order('created_at', { ascending: false })
    .limit(300));
}

export async function actualizarAprendizajeNora(id, cambios, userId) {
  must(await supabase
    .from('nora_aprendizajes')
    .update({ ...cambios, revisado_at: new Date().toISOString(), revisado_por: userId || null })
    .eq('id', id));
}

export async function ensenarANora(texto, tipo, userId) {
  must(await supabase.from('nora_aprendizajes').insert({
    leccion: texto.trim(),
    tipo,
    origen: 'manual',
    estado: 'aprobada',
    revisado_at: new Date().toISOString(),
    revisado_por: userId || null,
  }));
}

export const CONVERSACION_LIMIT = 200;

export async function getConversacionLead(kommoLeadId) {
  const desc = must(await supabase
    .from('messages')
    .select('id, direction, sender_type, message_type, content, author_name, created_at, metadata, message_attachments(id, storage_path, source_url, file_name, mime_type, kind)')
    .eq('kommo_lead_id', kommoLeadId)
    .order('created_at', { ascending: false })
    .limit(CONVERSACION_LIMIT));
  return desc.slice().reverse();
}

export async function moverEtapaLead(kommoLeadId, etapa) {
  const { data, error } = await supabase.functions.invoke('mover-etapa-comercial', {
    body: { kommo_lead_id: kommoLeadId, status_id: etapa.statusId, etapa_nombre: etapa.nombre, etapa_position: etapa.position },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

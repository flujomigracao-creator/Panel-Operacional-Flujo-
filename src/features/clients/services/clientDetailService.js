import { supabase } from '@shared/config/supabaseClient';

const MESSAGES_LIMIT = 500;

// Campos técnicos de los trámites que no se muestran como datos editables
// (los usa n8n); la carpeta de Drive se muestra como link en el trámite.
export const HIDDEN_FIELDS = new Set(['Gmail_Draft_ID', 'Pasta_Drive_ID', 'Pasta_Drive_Link']);

export const DRIVE_PREVIEW_URL = (url) => {
  const id = String(url || '').match(/\/d\/([\w-]+)/)?.[1];
  return id ? `https://drive.google.com/file/d/${id}/preview` : null;
};

const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

/**
 * Todo lo del cliente en una sola carga: datos, trámites (con etapas y campos
 * de cada servicio), documentos, pagos, historial de eventos y la conversación
 * completa de Kommo. RLS limita todo a la organización del usuario.
 */
export async function getClientDetail(clientId) {
  const [client, tramites, documents, payments, messagesDesc] = await Promise.all([
    supabase.from('clients').select('*').eq('id', clientId).maybeSingle().then(must),
    supabase
      .from('client_services')
      .select('id, service_id, stage_id, status, price, currency, started_at, completed_at, notes, kommo_lead_id, created_at, updated_at, services(name), service_stages(name, pipeline_stage_code)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .then(must),
    supabase
      .from('documents')
      .select('id, client_service_id, status, file_name, storage_path, mime_type, legivel, quality_notes, extracted_data, ai_confidence, review_notes, created_at, updated_at, document_types(name, description)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .then(must),
    supabase.from('payments').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).then(must),
    supabase
      .from('messages')
      .select('id, direction, sender_type, message_type, content, author_name, created_at, message_attachments(id, storage_path, source_url, file_name, mime_type, kind)')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(MESSAGES_LIMIT)
      .then(must),
  ]);

  if (!client) return null;

  const tramiteIds = tramites.map(t => t.id);
  const serviceIds = [...new Set(tramites.map(t => t.service_id))];

  const [fieldValues, serviceFields, stages, events] = await Promise.all([
    tramiteIds.length
      ? supabase.from('client_service_field_values').select('client_service_id, service_field_id, value, updated_at').in('client_service_id', tramiteIds).then(must)
      : [],
    serviceIds.length
      ? supabase.from('service_fields').select('id, service_id, name, label, field_type, required, position').in('service_id', serviceIds).order('position').then(must)
      : [],
    serviceIds.length
      ? supabase.from('service_stages').select('id, service_id, name, position, pipeline_stage_code').in('service_id', serviceIds).order('position').then(must)
      : [],
    tramiteIds.length
      ? supabase.from('client_service_events').select('id, client_service_id, event_type, from_stage_id, to_stage_id, metadata, created_at').in('client_service_id', tramiteIds).order('created_at', { ascending: false }).limit(200).then(must)
      : [],
  ]);

  const stageName = Object.fromEntries(stages.map(s => [s.id, s.name]));

  return {
    client,
    tramites: tramites.map(t => {
      const values = Object.fromEntries(fieldValues.filter(v => v.client_service_id === t.id).map(v => [v.service_field_id, v.value]));
      const fields = serviceFields.filter(f => f.service_id === t.service_id);
      return {
        ...t,
        servicio: t.services?.name,
        etapa: t.service_stages?.name,
        stages: stages.filter(s => s.service_id === t.service_id),
        fields: fields.filter(f => !HIDDEN_FIELDS.has(f.name)).map(f => ({ ...f, value: values[f.id] ?? '' })),
        driveLink: values[fields.find(f => f.name === 'Pasta_Drive_Link')?.id] || null,
      };
    }),
    documents,
    payments,
    events: events.map(e => ({ ...e, from: stageName[e.from_stage_id], to: stageName[e.to_stage_id] })),
    messages: messagesDesc.slice().reverse(),
    messagesTruncated: messagesDesc.length === MESSAGES_LIMIT,
  };
}

export async function updateClient(clientId, patch) {
  must(await supabase.from('clients').update(patch).eq('id', clientId));
}

export async function saveFieldValue(organizationId, clientServiceId, serviceFieldId, value) {
  must(await supabase.from('client_service_field_values').upsert(
    { organization_id: organizationId, client_service_id: clientServiceId, service_field_id: serviceFieldId, value, updated_at: new Date().toISOString() },
    { onConflict: 'client_service_id,service_field_id' },
  ));
}

// Cambiar la etapa dispara el trigger que la registra en el historial y la
// encola para reflejarla en Kommo.
export async function updateTramite(clientServiceId, patch) {
  must(await supabase.from('client_services').update(patch).eq('id', clientServiceId));
}

export async function reviewDocument(documentId, approved, userId, notes = null) {
  must(await supabase
    .from('documents')
    .update({ status: approved ? 'approved' : 'rejected', reviewed_by: userId, review_notes: notes })
    .eq('id', documentId));
}

// Adjuntos guardados en Storage (chat-media) necesitan URL firmada; los de
// Kommo/Drive ya traen su link.
export async function getAttachmentUrl(attachment) {
  if (attachment.source_url) return attachment.source_url;
  const path = attachment.storage_path;
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  const { data } = await supabase.storage.from('chat-media').createSignedUrl(path, 3600);
  return data?.signedUrl || null;
}

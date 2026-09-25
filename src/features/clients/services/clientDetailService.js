import { supabase } from '@shared/config/supabaseClient';

const MESSAGES_LIMIT = 500;

// Campos técnicos de los trámites que no se muestran como datos editables
// (los usa n8n); la carpeta de Drive se muestra como link en el trámite.
export const HIDDEN_FIELDS = new Set(['Gmail_Draft_ID', 'Pasta_Drive_ID', 'Pasta_Drive_Link']);

export const DRIVE_PREVIEW_URL = (url) => {
  const id = String(url || '').match(/\/d\/([\w-]+)/)?.[1] || String(url || '').match(/^drive:([\w-]+)/)?.[1];
  return id ? `https://drive.google.com/file/d/${id}/preview` : null;
};

// Para documentos subidos a mano (no vienen de Drive): URL firmada del bucket `documents`.
export async function getDocumentPreviewUrl(storagePath) {
  if (!storagePath || DRIVE_PREVIEW_URL(storagePath) || /^https?:\/\//.test(storagePath)) return storagePath;
  const { data } = await supabase.storage.from('documents').createSignedUrl(storagePath, 3600);
  return data?.signedUrl || null;
}

const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

/**
 * Todo lo del cliente en una sola carga: datos, trámites (con etapas y campos
 * de cada servicio), documentos, pagos, historial de eventos y la conversación
 * completa de Kommo. RLS limita todo a la organización del usuario.
 */
const TRAMITE_COLUMNS = 'id, client_id, service_id, stage_id, status, price, currency, started_at, completed_at, notes, kommo_lead_id, drive_folder_link, created_at, updated_at, services(name), service_stages(name, pipeline_stage_code), clients(full_name, phone)';

export async function getClientDetail(clientId) {
  // Trámites donde el cliente es titular + aquellos donde participa (dependiente, cónyuge…)
  const participaciones = await supabase.from('client_service_participants').select('client_service_id, rol').eq('client_id', clientId).then(must);
  const idsParticipa = participaciones.map(p => p.client_service_id);
  const rolPorTramite = Object.fromEntries(participaciones.map(p => [p.client_service_id, p.rol]));

  const [client, tramites, documents, payments, messagesDesc, relaciones] = await Promise.all([
    supabase.from('clients').select('*').eq('id', clientId).maybeSingle().then(must),
    supabase
      .from('client_services')
      .select(TRAMITE_COLUMNS)
      .or(idsParticipa.length ? `client_id.eq.${clientId},id.in.(${idsParticipa.join(',')})` : `client_id.eq.${clientId}`)
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
    supabase
      .from('client_relations_view')
      .select('id, con_client_id, tipo, notas, created_at')
      .eq('de_client_id', clientId)
      .then(must),
  ]);

  if (!client) return null;

  const tramiteIds = tramites.map(t => t.id);
  const serviceIds = [...new Set(tramites.map(t => t.service_id))];
  const relacionadosIds = [...new Set(relaciones.map(r => r.con_client_id))];

  const [fieldValues, serviceFields, stages, events, participantes, relacionados] = await Promise.all([
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
    tramiteIds.length
      ? supabase.from('client_service_participants').select('id, client_service_id, client_id, rol, clients(full_name, phone)').in('client_service_id', tramiteIds).then(must)
      : [],
    relacionadosIds.length
      ? supabase.from('clients').select('id, full_name, phone').in('id', relacionadosIds).then(must)
      : [],
  ]);

  const stageName = Object.fromEntries(stages.map(s => [s.id, s.name]));
  const relacionadoPorId = Object.fromEntries(relacionados.map(c => [c.id, c]));

  return {
    client,
    relaciones: relaciones.map(r => ({ ...r, cliente: relacionadoPorId[r.con_client_id] || null })),
    tramites: tramites.map(t => {
      const values = Object.fromEntries(fieldValues.filter(v => v.client_service_id === t.id).map(v => [v.service_field_id, v.value]));
      const fields = serviceFields.filter(f => f.service_id === t.service_id);
      return {
        ...t,
        servicio: t.services?.name,
        etapa: t.service_stages?.name,
        stages: stages.filter(s => s.service_id === t.service_id),
        fields: fields.filter(f => !HIDDEN_FIELDS.has(f.name)).map(f => ({ ...f, value: values[f.id] ?? '' })),
        driveLink: t.drive_folder_link || values[fields.find(f => f.name === 'Pasta_Drive_Link')?.id] || null,
        esTitular: t.client_id === clientId,
        titular: t.clients,
        rol: t.client_id === clientId ? 'titular' : rolPorTramite[t.id],
        participantes: participantes.filter(p => p.client_service_id === t.id),
      };
    }),
    documents,
    payments,
    events: events.map(e => ({ ...e, from: stageName[e.from_stage_id], to: stageName[e.to_stage_id] })),
    messages: messagesDesc.slice().reverse(),
    messagesTruncated: messagesDesc.length === MESSAGES_LIMIT,
  };
}

export const RELATION_TYPES = {
  conyuge: 'Cónyuge',
  hijo: 'Hijo/a',
  padre: 'Padre',
  madre: 'Madre',
  padre_o_madre: 'Padre/Madre',
  hermano: 'Hermano/a',
  abuelo: 'Abuelo/a',
  nieto: 'Nieto/a',
  tio: 'Tío/a',
  sobrino: 'Sobrino/a',
  primo: 'Primo/a',
  otro_familiar: 'Otro familiar',
  representante: 'Representante',
  representado: 'Representado/a',
  otro: 'Otro',
};

export const PARTICIPANT_ROLES = {
  titular: 'Titular',
  dependiente: 'Dependiente',
  conyuge: 'Cónyuge',
  hijo: 'Hijo/a',
  chamante: 'Chamante (familiar que trae)',
  representante: 'Representante',
  otro: 'Otro',
};

// La relación se guarda desde este cliente; la vista la muestra también desde el otro lado.
export async function addRelation(organizationId, clientId, relatedClientId, tipo, notas = null) {
  must(await supabase.from('client_relations').insert({ organization_id: organizationId, client_id: clientId, related_client_id: relatedClientId, tipo, notas }));
}

export async function removeRelation(relationId) {
  must(await supabase.from('client_relations').delete().eq('id', relationId));
}

export async function addParticipant(organizationId, clientServiceId, clientId, rol) {
  must(await supabase.from('client_service_participants').insert({ organization_id: organizationId, client_service_id: clientServiceId, client_id: clientId, rol }));
}

export async function removeParticipant(participantId) {
  must(await supabase.from('client_service_participants').delete().eq('id', participantId));
}

export async function searchClients(text, excludeIds = []) {
  const t = String(text || '').trim();
  if (t.length < 2) return [];
  const digits = t.replace(/\D/g, '');
  let q = supabase.from('clients').select('id, full_name, phone').limit(8);
  q = digits.length >= 4 ? q.ilike('phone', `%${digits.slice(-8)}%`) : q.ilike('full_name', `%${t}%`);
  const rows = must(await q);
  return rows.filter(r => !excludeIds.includes(r.id));
}

// Familiares que no escriben por Kommo (ej. hijos menores): se crean solo con nombre.
export async function createQuickClient(organizationId, fullName, phone = null) {
  const digits = String(phone || '').replace(/\D/g, '') || null;
  return must(await supabase.from('clients').insert({
    organization_id: organizationId, full_name: fullName.trim(), phone: digits, whatsapp: digits, status: 'active', lead_source: 'relacion',
  }).select('id, full_name, phone').single());
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

// Busca la carpeta del cliente en Drive (por su nombre o el de otros participantes del
// trámite) y trae automáticamente los documentos nuevos, clasificándolos por el nombre
// del archivo. Ver n8n "Importar Documentos desde Drive (manual)".
export async function importarDesdeDrive(clientServiceId) {
  const res = await fetch('https://yhlqmdlg-n8n.cbr6xz.easypanel.host/webhook/importar-drive-caso', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_service_id: clientServiceId }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error('respuesta_invalida');
  return data;
}

export async function getDocumentTypes() {
  return must(await supabase.from('document_types').select('id, name, description').order('name'));
}

// Sube un documento a mano desde la ficha del cliente (ej. llegó por otro canal,
// no por Kommo) — mismo bucket y convención de ruta que usa la extensión del
// Tramitador: <organization_id>/<client_id>/archivo, exigido por la política RLS.
export async function uploadManualDocument(organizationId, clientId, clientServiceId, documentTypeId, file) {
  const ext = file.name.split('.').pop() || 'bin';
  const path = `${organizationId}/${clientId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const { error: uploadError } = await supabase.storage.from('documents').upload(path, file, { contentType: file.type });
  if (uploadError) throw uploadError;
  return must(await supabase.from('documents').insert({
    organization_id: organizationId,
    client_id: clientId,
    client_service_id: clientServiceId,
    document_type_id: documentTypeId,
    storage_path: path,
    file_name: file.name,
    mime_type: file.type,
    size_bytes: file.size,
    status: 'received',
  }).select().single());
}

export async function reviewDocument(documentId, approved, userId, notes = null) {
  must(await supabase
    .from('documents')
    .update({ status: approved ? 'approved' : 'rejected', reviewed_by: userId, review_notes: notes })
    .eq('id', documentId));
}

// Prioriza la copia propia en Storage (chat-media, URL firmada): el link de
// Kommo puede vencer. Si no hay copia, se usa el link original.
export async function getAttachmentUrl(attachment) {
  const path = attachment.storage_path;
  if (path && !/^https?:\/\//.test(path)) {
    const { data } = await supabase.storage.from('chat-media').createSignedUrl(path, 3600);
    if (data?.signedUrl) return data.signedUrl;
  }
  return attachment.source_url || (/^https?:\/\//.test(path || '') ? path : null);
}

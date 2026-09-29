import { supabase } from '@shared/config/supabaseClient';

const PAGE_SIZE = 1000;

const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

// supabase.functions.invoke esconde el cuerpo de las respuestas no-2xx; se rescata el mensaje real.
async function invoke(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const detalle = await error.context?.json?.().catch(() => null);
    throw new Error(detalle?.error || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

// ── Embudos y etapas ────────────────────────────────────────────────────────────
export async function getPipelines() {
  const [pipelines, stages] = await Promise.all([
    supabase.from('crm_pipelines').select('id, code, name, position, is_default').order('position').then(must),
    supabase.from('crm_stages').select('id, pipeline_id, name, position, kind, color').order('position').then(must),
  ]);
  return pipelines.map((p) => ({ ...p, stages: stages.filter((s) => s.pipeline_id === p.id) }));
}

// ── Leads ───────────────────────────────────────────────────────────────────────
const LEAD_COLUMNS = 'id, client_id, name, phone, service_label, value, stage_id, stage_name, stage_kind, pipeline_id, stage_position, assigned_to, lead_source, created_at, updated_at, last_inbound_at, last_answered_at, needs_reply, ai_paused, temperature, external_id, country, city';

// Supabase corta cada request en 1000 filas: se pagina hasta traerlos todos.
export async function getLeads() {
  let all = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const rows = must(await supabase
      .from('crm_leads')
      .select(LEAD_COLUMNS)
      .order('updated_at', { ascending: false })
      .order('id')
      .range(from, from + PAGE_SIZE - 1));
    all = all.concat(rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
}

export async function getLeadTags() {
  return must(await supabase.from('crm_lead_tags').select('lead_id, tag_id'));
}

export async function getTags() {
  return must(await supabase.from('tags').select('id, name, color').order('name'));
}

export async function createTag(organizationId, name) {
  return must(await supabase.from('tags').insert({ organization_id: organizationId, name: name.trim() }).select('id, name, color').single());
}

export async function addTagToLeads(organizationId, leadIds, tagId) {
  const rows = leadIds.map((lead_id) => ({ organization_id: organizationId, lead_id, tag_id: tagId }));
  must(await supabase.from('crm_lead_tags').upsert(rows, { onConflict: 'lead_id,tag_id', ignoreDuplicates: true }));
}

export async function removeTagFromLead(leadId, tagId) {
  must(await supabase.from('crm_lead_tags').delete().eq('lead_id', leadId).eq('tag_id', tagId));
}

// Miembros de la organización (para responsables). RLS limita a la propia organización.
export async function getTeam() {
  const members = must(await supabase.from('organization_members').select('user_id, role'));
  if (!members.length) return [];
  const profiles = must(await supabase.from('profiles').select('id, full_name, email').in('id', members.map((m) => m.user_id)));
  return profiles.map((p) => ({ id: p.id, name: p.full_name || p.email || 'Sin nombre' }));
}

export async function assignLeads(leadIds, userId) {
  must(await supabase.from('comercial_leads').update({ assigned_to: userId || null }).in('id', leadIds));
}

// Alta manual: reutiliza el contacto si ya existe uno con ese teléfono (no duplica personas)
// y deja el lead en la primera etapa del embudo. Sin lead en Kommo (external_id nulo).
export async function createLead({ organizationId, stage, name, phone, serviceLabel, value, assignedTo }) {
  const cleanPhone = phone?.trim() || null;
  let clientId = null;
  if (cleanPhone) {
    const existing = must(await supabase.from('clients').select('id').eq('phone', cleanPhone).limit(1));
    clientId = existing[0]?.id || null;
  }
  if (!clientId) {
    clientId = must(await supabase
      .from('clients')
      .insert({ organization_id: organizationId, full_name: name.trim(), phone: cleanPhone, status: 'lead', lead_source: 'panel' })
      .select('id')
      .single()).id;
  }
  // etapa_status_id/nombre/position son las columnas que sigue leyendo n8n.
  const stageRow = must(await supabase.from('crm_stages').select('kommo_status_id, name, position').eq('id', stage.id).single());
  const lead = must(await supabase
    .from('comercial_leads')
    .insert({
      organization_id: organizationId,
      client_id: clientId,
      nombre: name.trim(),
      telefono: cleanPhone,
      tramite_texto: serviceLabel?.trim() || null,
      precio: value === '' || value == null ? null : Number(value),
      etapa_status_id: stageRow.kommo_status_id,
      etapa_nombre: stageRow.name,
      etapa_position: stageRow.position,
      assigned_to: assignedTo || null,
      lead_source: 'panel',
    })
    .select('id')
    .single());
  return lead;
}

// ── Mover de etapa: Supabase primero (idempotente), después Kommo ─────────────────
// Devuelve { ok, event_id, sync: 'synced' | 'skipped' | 'failed', syncError? }.
export async function moveLeadStage(leadId, stageId) {
  const res = must(await supabase.rpc('crm_move_lead_stage', {
    p_lead_id: leadId,
    p_stage_id: stageId,
    p_idempotency_key: crypto.randomUUID(),
  }));
  if (!res?.ok) throw new Error(res?.error || 'No se pudo mover el lead');
  if (res.unchanged || res.sync_status !== 'pending') return { ...res, sync: 'skipped' };
  return { ...res, ...(await syncEvent(res.event_id)) };
}

export async function syncEvent(eventId) {
  try {
    await invoke('crm-sync-kommo', { event_id: eventId });
    return { sync: 'synced' };
  } catch (err) {
    return { sync: 'failed', syncError: err.message };
  }
}

// Eventos de etapa que todavía no llegaron a Kommo (falló la llamada o no se hizo).
export async function getUnsyncedEvents() {
  return must(await supabase
    .from('crm_lead_events')
    .select('id, lead_id, sync_status, sync_error, created_at')
    .eq('event_type', 'stage_changed')
    .in('sync_status', ['pending', 'failed'])
    .order('created_at'));
}

export async function retryUnsynced() {
  const events = await getUnsyncedEvents();
  let synced = 0;
  for (const ev of events) {
    if ((await syncEvent(ev.id)).sync === 'synced') synced += 1;
  }
  return { total: events.length, synced };
}

// ── Actividad y notas internas ───────────────────────────────────────────────────
export async function getLeadEvents(leadIds, limit = 100) {
  if (!leadIds.length) return [];
  return must(await supabase
    .from('crm_lead_events')
    .select('id, lead_id, event_type, actor_id, metadata, sync_status, created_at')
    .in('lead_id', leadIds)
    .order('created_at', { ascending: false })
    .limit(limit));
}

export async function addNote(organizationId, leadId, text, actorId) {
  must(await supabase.from('crm_lead_events').insert({
    organization_id: organizationId,
    lead_id: leadId,
    event_type: 'note',
    actor_id: actorId || null,
    metadata: { text: text.trim() },
  }));
}

// ── Tareas (tabla `tasks` compartida con n8n/Hoy) ───────────────────────────────────
export async function createTask({ organizationId, clientId, conversationId, title, dueAt }) {
  must(await supabase.from('tasks').insert({
    organization_id: organizationId,
    client_id: clientId || null,
    conversation_id: conversationId || null,
    kind: 'manual',
    title: title.trim(),
    source: 'panel',
    due_at: dueAt || null,
  }));
}

// ── Chats ────────────────────────────────────────────────────────────────────────
export const CONVERSATIONS_LIMIT = 300;
export const MESSAGES_LIMIT = 200;

export async function getConversations() {
  const convs = must(await supabase
    .from('conversations')
    .select('id, client_id, channel, status, last_message_at, kommo_lead_id, human_takeover_until, clients(full_name, phone, assigned_to)')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(CONVERSATIONS_LIMIT));
  if (!convs.length) return [];
  // Último mensaje de cada conversación (una sola consulta, se queda con el primero por conversación).
  const last = must(await supabase
    .from('messages')
    .select('conversation_id, direction, message_type, content, created_at')
    .in('conversation_id', convs.map((c) => c.id))
    .order('created_at', { ascending: false })
    .limit(convs.length * 3));
  const lastBy = new Map();
  for (const m of last) if (!lastBy.has(m.conversation_id)) lastBy.set(m.conversation_id, m);
  return convs.map((c) => ({ ...c, last: lastBy.get(c.id) || null }));
}

export async function getConversationMessages(conversationId) {
  const desc = must(await supabase
    .from('messages')
    .select('id, direction, sender_type, message_type, content, author_name, created_at, metadata, message_attachments(id, storage_path, source_url, file_name, mime_type, kind)')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(MESSAGES_LIMIT));
  return desc.slice().reverse();
}

export async function sendText(clientId, mensaje) {
  return invoke('enviar-whatsapp-cliente', { client_id: clientId, mensaje });
}

export async function sendFile(organizationId, clientId, file, caption = '') {
  const ext = file.name.split('.').pop() || 'bin';
  const path = `${organizationId}/panel/client-${clientId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from('chat-media').upload(path, file, { contentType: file.type });
  if (error) throw error;
  return invoke('enviar-whatsapp-cliente', { client_id: clientId, storage_path: path, file_name: file.name, mime_type: file.type, caption: caption || undefined });
}

import { supabase } from '@shared/config/supabaseClient';

// Modelo de datos del CRM (ver docs/architecture/0002-crm-core.md):
// - Se LEE de las vistas crm_leads / crm_conversations (nombres neutrales, RLS del usuario).
// - Se ESCRIBE con los RPC crm_* (que operan sobre comercial_leads, la tabla que también escribe n8n)
//   o directo en las tablas propias del CRM (crm_lead_tags, crm_lead_events, crm_stages…).
// - La base vincula cada lead con su contacto y registra la actividad con triggers, así el resultado
//   es el mismo escriba quien escriba (panel, n8n o el webhook de Kommo).

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

// Organización del usuario (RLS de organization_members solo devuelve la propia). Se cachea por sesión.
let orgPromise = null;
let orgUser = null;
export async function getMyOrganizationId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sin sesión');
  if (!orgPromise || orgUser !== user.id) {
    orgUser = user.id;
    orgPromise = supabase.from('organization_members').select('organization_id').eq('user_id', user.id).limit(1)
      .then(must)
      .then((rows) => {
        if (!rows[0]) throw new Error('Tu usuario no pertenece a ninguna organización');
        return rows[0].organization_id;
      })
      .catch((err) => { orgPromise = null; throw err; });
  }
  return orgPromise;
}

// ── Embudos y etapas ────────────────────────────────────────────────────────────
export async function getPipelines() {
  const [pipelines, stages] = await Promise.all([
    supabase.from('crm_pipelines').select('id, code, name, position, is_default, kommo_pipeline_id').order('position').then(must),
    supabase.from('crm_stages').select('id, pipeline_id, name, position, kind, color, is_entry, kommo_status_id').order('position').then(must),
  ]);
  return pipelines.map((p) => ({ ...p, stages: stages.filter((s) => s.pipeline_id === p.id) }));
}

export async function updateStage(stageId, patch) {
  must(await supabase.from('crm_stages').update(patch).eq('id', stageId));
}

export async function createStage(pipelineId, { name, position, kind = 'open' }) {
  const organization_id = await getMyOrganizationId();
  must(await supabase.from('crm_stages').insert({ organization_id, pipeline_id: pipelineId, name: name.trim(), position, kind }));
}

// Solo etapas propias del panel (sin espejo en Kommo) y vacías: las de Kommo las usa n8n.
export async function deleteStage(stageId) {
  must(await supabase.from('crm_stages').delete().eq('id', stageId).is('kommo_status_id', null));
}

// Marca una sola etapa de entrada por embudo.
export async function setEntryStage(pipelineId, stageId) {
  must(await supabase.from('crm_stages').update({ is_entry: false }).eq('pipeline_id', pipelineId).neq('id', stageId));
  must(await supabase.from('crm_stages').update({ is_entry: true }).eq('id', stageId));
}

// ── Leads ───────────────────────────────────────────────────────────────────────
const LEAD_COLUMNS = 'id, client_id, name, phone, service_label, value, stage_id, stage_name, stage_kind, pipeline_id, stage_position, assigned_to, lead_source, created_at, updated_at, last_inbound_at, last_answered_at, needs_reply, ai_paused, temperature, external_id, external_contact_id, country, city';

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

export async function getLeadsByClient(clientId) {
  return must(await supabase.from('crm_leads').select(LEAD_COLUMNS).eq('client_id', clientId).order('updated_at', { ascending: false }));
}

// Alta desde el panel. La base busca/crea el contacto por teléfono (sin duplicar personas),
// lo deja en la etapa de entrada del embudo y registra "Lead creado".
export async function createLead({ name, phone, serviceLabel, value, stageId, assignedTo }) {
  const res = must(await supabase.rpc('crm_create_lead', {
    p_name: name,
    p_phone: phone || null,
    p_service_label: serviceLabel || null,
    p_value: value === '' || value == null ? null : Number(value),
    p_stage_id: stageId || null,
    p_assigned_to: assignedTo || null,
  }));
  if (!res?.ok) throw new Error(res?.error === 'falta_nombre' ? 'Falta el nombre' : res?.error || 'No se pudo crear el lead');
  return res;
}

// Cambia responsable / trámite / valor de uno o varios leads. Solo se tocan las claves presentes.
export async function updateLeads(leadIds, patch) {
  const res = must(await supabase.rpc('crm_update_leads', { p_lead_ids: leadIds, p_patch: patch }));
  if (!res?.ok) throw new Error('No se pudo guardar');
  return res;
}

export const assignLeads = (leadIds, userId) => updateLeads(leadIds, { assigned_to: userId || '' });

// Nora (atendente IA) activa o pausada para este lead. Es la misma columna que usa la vista de Nora.
export async function setAiPaused(leadId, paused) {
  must(await supabase.from('comercial_leads').update({ atendente_pausado: paused }).eq('id', leadId));
}

// ── Etiquetas ────────────────────────────────────────────────────────────────────
export async function getLeadTags() {
  return must(await supabase.from('crm_lead_tags').select('lead_id, tag_id'));
}

export async function getTags() {
  return must(await supabase.from('tags').select('id, name, color').order('name'));
}

export async function createTag(name) {
  const organization_id = await getMyOrganizationId();
  return must(await supabase.from('tags').insert({ organization_id, name: name.trim() }).select('id, name, color').single());
}

export async function renameTag(tagId, name) {
  must(await supabase.from('tags').update({ name: name.trim() }).eq('id', tagId));
}

export async function deleteTag(tagId) {
  must(await supabase.from('tags').delete().eq('id', tagId));
}

export async function addTagToLeads(leadIds, tagId) {
  const organization_id = await getMyOrganizationId();
  const rows = leadIds.map((lead_id) => ({ organization_id, lead_id, tag_id: tagId }));
  must(await supabase.from('crm_lead_tags').upsert(rows, { onConflict: 'lead_id,tag_id', ignoreDuplicates: true }));
}

export async function removeTagFromLead(leadId, tagId) {
  must(await supabase.from('crm_lead_tags').delete().eq('lead_id', leadId).eq('tag_id', tagId));
}

// ── Equipo ───────────────────────────────────────────────────────────────────────
// Miembros de la organización. RLS limita a la propia organización.
export async function getTeam() {
  const members = must(await supabase.from('organization_members').select('user_id, role, created_at'));
  if (!members.length) return [];
  const profiles = must(await supabase.from('profiles').select('id, full_name, email').in('id', members.map((m) => m.user_id)));
  const byId = Object.fromEntries(profiles.map((p) => [p.id, p]));
  return members.map((m) => ({
    id: m.user_id,
    name: byId[m.user_id]?.full_name || byId[m.user_id]?.email || 'Sin nombre',
    email: byId[m.user_id]?.email || '',
    role: m.role,
    since: m.created_at,
  }));
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

// Cambios de etapa que todavía no llegaron a Kommo (falló la llamada o no se hizo).
export async function getUnsyncedEvents() {
  return must(await supabase
    .from('crm_lead_events')
    .select('id, lead_id, sync_status, sync_error, created_at')
    .eq('event_type', 'stage_changed')
    .in('sync_status', ['pending', 'failed'])
    .order('created_at'));
}

export async function retryUnsynced(eventIds = null) {
  const events = eventIds ? eventIds.map((id) => ({ id })) : await getUnsyncedEvents();
  let synced = 0;
  const errors = [];
  for (const ev of events) {
    const r = await syncEvent(ev.id);
    if (r.sync === 'synced') synced += 1;
    else errors.push(r.syncError);
  }
  return { total: events.length, synced, errors };
}

// ── Actividad y notas internas ───────────────────────────────────────────────────
export async function getLeadEvents(leadIds, limit = 100) {
  if (!leadIds.length) return [];
  return must(await supabase
    .from('crm_lead_events')
    .select('id, lead_id, event_type, actor_id, metadata, sync_status, sync_error, created_at')
    .in('lead_id', leadIds)
    .order('created_at', { ascending: false })
    .limit(limit));
}

export async function getRecentEvents(limit = 12) {
  return must(await supabase
    .from('crm_lead_events')
    .select('id, lead_id, event_type, actor_id, metadata, created_at')
    .is('metadata->>backfill', null)
    .order('created_at', { ascending: false })
    .limit(limit));
}

export async function addNote(leadId, text, actorId) {
  const organization_id = await getMyOrganizationId();
  must(await supabase.from('crm_lead_events').insert({
    organization_id,
    lead_id: leadId,
    event_type: 'note',
    actor_id: actorId || null,
    metadata: { text: text.trim() },
  }));
}

// ── Tareas (tabla `tasks`, compartida con n8n y la vista Tareas) ─────────────────────
export async function getOpenTasks({ clientId } = {}) {
  let q = supabase
    .from('tasks')
    .select('id, title, details, kind, priority, status, due_at, client_id, created_at')
    .in('status', ['open', 'in_progress'])
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(50);
  if (clientId) q = q.eq('client_id', clientId);
  return must(await q);
}

export async function createTask({ clientId, clientServiceId, conversationId, title, dueAt }) {
  const organization_id = await getMyOrganizationId();
  must(await supabase.from('tasks').insert({
    organization_id,
    client_id: clientId || null,
    client_service_id: clientServiceId || null,
    conversation_id: conversationId || null,
    kind: 'manual',
    title: title.trim(),
    source: 'panel',
    due_at: dueAt || null,
  }));
}

export async function completeTask(taskId) {
  must(await supabase.from('tasks').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', taskId));
}

// ── Chats ────────────────────────────────────────────────────────────────────────
export const CONVERSATIONS_LIMIT = 300;
export const MESSAGES_LIMIT = 200;

const CONVERSATION_COLUMNS = 'id, client_id, channel, status, last_message_at, kommo_lead_id, kommo_contact_id, display_name, phone, client_assigned_to, last_direction, last_type, last_content, last_sender, last_at, unread_count';

export async function getConversations() {
  return must(await supabase
    .from('crm_conversations')
    .select(CONVERSATION_COLUMNS)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(CONVERSATIONS_LIMIT));
}

export async function getUnreadConversationsCount() {
  const { count, error } = await supabase.from('crm_conversations').select('id', { count: 'exact', head: true }).gt('unread_count', 0);
  if (error) throw error;
  return count || 0;
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

// Destino del envío: el contacto (client_id) o, si la conversación todavía no tiene contacto,
// el lead de Kommo. La edge function enviar-whatsapp-cliente acepta cualquiera de los dos.
const target = ({ clientId, kommoLeadId }) => (clientId ? { client_id: clientId } : { kommo_lead_id: kommoLeadId });

export async function sendText(to, mensaje) {
  return invoke('enviar-whatsapp-cliente', { ...target(to), mensaje });
}

/** Plantillas aprobadas por Meta (nombre, idioma, cuerpo con {{1}}…, nº de variables). */
export async function listWhatsappTemplates() {
  return (await invoke('enviar-whatsapp-cliente', { accion: 'plantillas' })).plantillas || [];
}

/** Envía una plantilla aprobada; `texto` es lo que queda guardado en la conversación. */
export async function sendTemplate(to, { nombre, idioma, parametros, texto }) {
  return invoke('enviar-whatsapp-cliente', { ...target(to), plantilla: { nombre, idioma, parametros, texto } });
}

export async function sendFile(to, file, caption = '') {
  const organizationId = await getMyOrganizationId();
  const ext = file.name.split('.').pop() || 'bin';
  const folder = to.clientId ? `client-${to.clientId}` : `lead-${to.kommoLeadId}`;
  const path = `${organizationId}/panel/${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from('chat-media').upload(path, file, { contentType: file.type });
  if (error) throw error;
  return invoke('enviar-whatsapp-cliente', { ...target(to), storage_path: path, file_name: file.name, mime_type: file.type, caption: caption || undefined });
}

// ── Trámites y documentos ─────────────────────────────────────────────────────────
export async function getTramites() {
  return must(await supabase
    .from('client_services')
    .select('id, client_id, status, price, currency, assigned_to, started_at, completed_at, created_at, updated_at, kommo_lead_id, services(name), service_stages(name), clients(full_name, phone)')
    .order('updated_at', { ascending: false })
    .limit(PAGE_SIZE));
}

export async function getDocumentos() {
  return must(await supabase
    .from('documents')
    .select('id, client_id, client_service_id, status, file_name, mime_type, legivel, created_at, updated_at, document_types(name), clients(full_name)')
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE));
}

// ── Configuración de la organización ───────────────────────────────────────────────
export async function getOrgSetting(key) {
  const rows = must(await supabase.from('organization_settings').select('value').eq('key', key).limit(1));
  return rows[0]?.value ?? null;
}

export async function setOrgSetting(key, value) {
  const organization_id = await getMyOrganizationId();
  const existing = must(await supabase.from('organization_settings').select('id').eq('key', key).limit(1));
  if (existing[0]) must(await supabase.from('organization_settings').update({ value, updated_at: new Date().toISOString() }).eq('id', existing[0].id));
  else must(await supabase.from('organization_settings').insert({ organization_id, key, value }));
}

// ── Checklist de trámites (vista crm_tramite_checklist) ─────────────────────────────
const CHECKLIST_COLUMNS = 'client_service_id, client_id, requirement_id, position, kind, label, required, ask_client, codigo, document_id, document_status, motivo, reuse_document_id, reuse_from, field_value, estado';

export async function getChecklist({ clientId, clientServiceIds } = {}) {
  let q = supabase.from('crm_tramite_checklist').select(CHECKLIST_COLUMNS).order('position');
  if (clientId) q = q.eq('client_id', clientId);
  if (clientServiceIds) q = q.in('client_service_id', clientServiceIds);
  return must(await q.limit(PAGE_SIZE));
}

// ── Un trámite completo (detalle de trámite) ──────────────────────────────────────
export async function getTramite(id) {
  const t = must(await supabase
    .from('client_services')
    .select('id, client_id, service_id, stage_id, status, price, currency, assigned_to, started_at, completed_at, notes, kommo_lead_id, drive_folder_link, created_at, updated_at, services(name), service_stages(name), clients(id, full_name, phone, nationality, country, email)')
    .eq('id', id)
    .maybeSingle());
  if (!t) return null;
  const [stages, checklist, events, tasks, payments, documents] = await Promise.all([
    supabase.from('service_stages').select('id, name, position').eq('service_id', t.service_id).order('position').then(must),
    getChecklist({ clientServiceIds: [id] }),
    supabase.from('client_service_events').select('id, event_type, from_stage_id, to_stage_id, metadata, created_by, created_at').eq('client_service_id', id).order('created_at', { ascending: false }).limit(50).then(must),
    supabase.from('tasks').select('id, title, kind, priority, status, due_at, created_at').eq('client_service_id', id).in('status', ['open', 'in_progress']).order('due_at', { ascending: true, nullsFirst: false }).then(must),
    supabase.from('payments').select('id, amount, currency, status, due_date, paid_at').eq('client_service_id', id).order('created_at').then(must),
    supabase.from('documents').select('id, status, file_name, created_at, document_types(name)').eq('client_service_id', id).order('created_at', { ascending: false }).then(must),
  ]);
  return { ...t, stages, checklist, events, tasks, payments, documents };
}

export async function updateTramite(id, patch) {
  must(await supabase.from('client_services').update(patch).eq('id', id));
}

// ── Sincronización con Kommo (edge function kommo-sync) ────────────────────────────
// Envía a Kommo los cambios de etapa de trámites que esperan en kommo_outbox.
export const syncKommoOutbox = () => invoke('kommo-sync', { action: 'outbox' });
// Trae de Kommo las etapas reales del embudo Comercial (nombre y orden) a crm_stages.
export const syncKommoPipelines = () => invoke('kommo-sync', { action: 'pipelines' });

// Tras cambiar la etapa de un trámite: la base ya lo encoló (trigger); se envía a Kommo al momento.
// Devuelve un texto de aviso si algo no llegó, o null si todo bien.
export async function pushTramiteToKommo() {
  try {
    const r = await syncKommoOutbox();
    return r.failed ? `${r.failed} cambio(s) no llegaron a Kommo; se reintentan solos.` : null;
  } catch (err) {
    return `No se pudo avisar a Kommo: ${err.message}`;
  }
}

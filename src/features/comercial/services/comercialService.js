import { supabase } from '@shared/config/supabaseClient';
// La organización se pasa explícita en cada alta: las columnas organization_id de las tablas de Nora
// todavía tienen como valor por defecto la organización original, y no hay que depender de eso.
import { getMyOrganizationId } from '@features/crm/services/crmService';

const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

// Las 8 etapas reales del pipeline Comercial de Kommo (14489115), en el orden
// del tablero. "Incoming leads" (sin calificar aún) no se muestra como columna
// propia — son pocos y quedan agrupados con "Bienvenida y Confianza" en la vista.
export const ETAPA_SUPERVISOR = 112261572;
export const ETAPA_PRUEBAS = 112263100;

export const ETAPAS_COMERCIAL = [
  { statusId: ETAPA_SUPERVISOR, nombre: 'Espera al Supervisor', position: 15 },
  { statusId: 111918875, nombre: 'Bienvenida y Confianza', position: 20 },
  { statusId: 111918879, nombre: 'Calificación de Necesidad', position: 30 },
  { statusId: 111918883, nombre: 'Propuesta y Precio', position: 40 },
  { statusId: 111919155, nombre: 'Datos y Pago (PIX)', position: 50 },
  { statusId: 111919159, nombre: 'Pago Confirmado/esperando documentos', position: 60 },
  { statusId: 111919167, nombre: 'Seguimiento (Sin Respuesta)', position: 70 },
  { statusId: 112025771, nombre: 'RECUPERACION INSTANTANEA', position: 80 },
  { statusId: 112263100, nombre: 'Pruebas (Nora)', position: 90 },
  { statusId: 142, nombre: 'Logrado con éxito', position: 10000 },
  { statusId: 143, nombre: 'Descalificado / Perdido', position: 11000 },
];

export async function getComercialLeads() {
  return must(await supabase
    .from('comercial_leads')
    .select('id, kommo_lead_id, kommo_contact_id, client_id, nombre, telefono, tramite_texto, precio, etapa_status_id, etapa_nombre, etapa_position, updated_at, last_inbound_at, last_atendido_at, bienvenida_enviada, propuesta_enviada, atendente_pausado, plan_pago, monto_ahora, datos_pago_at, comprobante_at, comprobante_monto, recordatorio_pago_at, enviado_operacional_at, etapa_previa_status_id, etapa_previa_nombre, etapa_previa_position, seguimiento_intentos, seguimiento_ultimo_at, nombre_completo, nacionalidad, ciudad_brasil, personas, temperatura, necesidad, ritmo_cliente_seg')
    .order('etapa_position', { ascending: true })
    .order('updated_at', { ascending: false }));
}

// La consulta más reciente que Nora dejó en Hoy para este lead (por qué se pausó).
export async function getMotivoPausa(kommoLeadId) {
  const rows = must(await supabase
    .from('pendentes_hoje')
    .select('titulo, detalhes, desde')
    .eq('kommo_lead_id', kommoLeadId)
    .order('desde', { ascending: false })
    .limit(1));
  return rows[0] || null;
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

// Argumentos que Nora prueba con los clientes que desconfían, y cuántos terminaron pidiendo el PIX.
export async function getResultadosConfianza() {
  return must(await supabase
    .from('nora_resultados_confianza')
    .select('codigo, nombre, activa, usos, convirtieron, pendientes, pruebas_simuladas')
    .order('codigo'));
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

export async function ensenarANora(texto, tipo, userId, origen = 'manual', kommoLeadId = null) {
  must(await supabase.from('nora_aprendizajes').insert({
    organization_id: await getMyOrganizationId(),
    leccion: texto.trim(),
    tipo,
    origen,
    kommo_lead_id: kommoLeadId,
    estado: 'aprobada',
    revisado_at: new Date().toISOString(),
    revisado_por: userId || null,
  }));
}

// Base de dudas: lo que preguntan los clientes y la mejor respuesta (sale del análisis diario de conversaciones).
// Al aprobar una, pasa sola a la memoria de Nora (trigger en la base).
export async function getDudasNora() {
  return must(await supabase
    .from('nora_dudas')
    .select('id, pregunta, respuesta, tramite, veces, en_ventas, estado, ultima_vez')
    .neq('estado', 'descartada')
    .order('veces', { ascending: false })
    .order('ultima_vez', { ascending: false })
    .limit(200));
}

export async function actualizarDudaNora(id, cambios, userId) {
  must(await supabase
    .from('nora_dudas')
    .update({ ...cambios, revisado_at: new Date().toISOString(), revisado_por: userId || null })
    .eq('id', id));
}

// Reglas fijas del negocio que Nora respeta siempre (documentos, requisitos, políticas).
export async function getReglasNora() {
  return must(await supabase
    .from('nora_reglas')
    .select('id, texto, activa, origen, kommo_lead_id, created_at')
    .eq('activa', true)
    .order('created_at', { ascending: true }));
}

export async function guardarReglaNora(texto, userId, kommoLeadId = null) {
  must(await supabase.from('nora_reglas').insert({ organization_id: await getMyOrganizationId(), texto: texto.trim(), kommo_lead_id: kommoLeadId, creado_por: userId || null }));
}

export async function actualizarReglaNora(id, cambios) {
  must(await supabase.from('nora_reglas').update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', id));
}

const ENTRENADOR_URL = 'https://yhlqmdlg-n8n.cbr6xz.easypanel.host/webhook/nora-entrenador';

// El pedido se guarda con la sesión del usuario (RLS) y n8n solo responde pedidos que existen,
// así el webhook no necesita claves. mensajes: [{ role: 'dueno' | 'nora', content }].
export async function hablarConEntrenador(mensajes, kommoLeadId = null) {
  const { id } = must(await supabase
    .from('nora_entrenador_pedidos')
    .insert({ organization_id: await getMyOrganizationId(), kommo_lead_id: kommoLeadId, mensajes })
    .select('id')
    .single());
  const res = await fetch(ENTRENADOR_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.ok) throw new Error(data?.error || 'Nora no pudo responder, probá de nuevo.');
  return data;
}

export const CONVERSACION_LIMIT = 200;

// Un cliente puede tener un lead por trámite: la charla de WhatsApp es una sola, así que se trae la del contacto entero.
export async function getConversacionLead(kommoLeadId, kommoContactId) {
  const query = supabase
    .from('messages')
    .select('id, direction, sender_type, message_type, content, author_name, created_at, metadata, message_attachments(id, storage_path, source_url, file_name, mime_type, kind)');
  const filtrada = kommoContactId
    ? query.or(`kommo_lead_id.eq.${Number(kommoLeadId)},kommo_contact_id.eq.${Number(kommoContactId)}`)
    : query.eq('kommo_lead_id', kommoLeadId);
  const desc = must(await filtrada
    .order('created_at', { ascending: false })
    .limit(CONVERSACION_LIMIT));
  return desc.slice().reverse();
}

async function invocarMover(body) {
  const { data, error } = await supabase.functions.invoke('mover-etapa-comercial', { body });
  if (error) {
    const detalle = await error.context?.json?.().catch(() => null);
    throw new Error(detalle?.error || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export function moverEtapaLead(kommoLeadId, etapa) {
  return invocarMover({ kommo_lead_id: kommoLeadId, status_id: etapa.statusId, etapa_nombre: etapa.nombre, etapa_position: etapa.position });
}

// Primera etapa del embudo Operacional: al llegar ahí el Receptor de Kommo registra el caso y el pago.
const PIPELINE_OPERACIONAL = 14443755;
const ETAPA_OPERACIONAL_INICIAL = 111568151;

export function enviarAOperacional(kommoLeadId) {
  return invocarMover({ kommo_lead_id: kommoLeadId, pipeline_id: PIPELINE_OPERACIONAL, status_id: ETAPA_OPERACIONAL_INICIAL, etapa_nombre: 'Operacional' });
}

// Salud de lo que necesita Nora (Kommo, n8n, WhatsApp) y clientes esperando respuesta.
export async function getEstadoConexiones() {
  const { data, error } = await supabase.functions.invoke('estado-conexiones', { body: {} });
  if (error) return { ok: true, problemas: [] }; // si falla el chequeo en sí, no se alarma
  return data;
}

export const ETAPA_PERDIDO = { statusId: 143, nombre: 'Descalificado / Perdido', position: 11000 };

import { supabase } from '@shared/config/supabaseClient';

// Tablas que escriben las automatizaciones: cualquier cambio en ellas refresca el Laboratorio.
export const LIVE_TABLES = [
  'client_service_events',
  'messages',
  'documents',
  'tasks',
  'kommo_outbox',
  'inbound_media',
  'automation_runs',
];

// Umbrales para decidir si un motor está sano. Cola = minutos que puede
// esperar el elemento más antiguo; silencio = horas sin señales en motores por evento.
const QUEUE_LIMIT_MIN = { agente_recepcion: 10, sync_kommo: 30, revision_documentos: 24 * 60, tramitador_cpf: 24 * 60 };
const SILENCE_LIMIT_H = 72;

const minutesSince = (iso) => (iso ? (Date.now() - new Date(iso)) / 60000 : null);

/**
 * Estado de un motor: operando | atencion | detenido | inactivo, con el motivo en texto.
 */
export function motorHealth(m) {
  const queueAge = minutesSince(m.cola_desde);
  const limit = QUEUE_LIMIT_MIN[m.motor] ?? 30;

  if (m.modo === 'humano') {
    if (m.en_cola > 0 && queueAge > limit) return { state: 'detenido', reason: `${m.en_cola} esperan tu revisión desde hace más de un día` };
    if (m.en_cola > 0) return { state: 'atencion', reason: `${m.en_cola} esperan tu revisión` };
    return { state: 'operando', reason: 'Nada por revisar' };
  }

  if (m.modo === 'cola') {
    if (m.en_cola > 0 && queueAge > limit) {
      return { state: 'detenido', reason: `Cola atascada: ${m.en_cola} sin procesar hace ${formatAge(m.cola_desde)}` };
    }
    if (m.errores_abiertos > 0) return { state: 'atencion', reason: `${m.errores_abiertos} con error` };
    if (!m.ultima_actividad && !m.en_cola) return { state: 'inactivo', reason: 'Esperando su primer trabajo' };
    return { state: 'operando', reason: m.en_cola > 0 ? `Procesando ${m.en_cola}` : 'Cola vacía' };
  }

  // modo evento
  if (m.errores_abiertos > 0) return { state: 'atencion', reason: `${m.errores_abiertos} casos pidieron ayuda` };
  if (!m.ultima_actividad) return { state: 'inactivo', reason: 'Sin señales todavía' };
  if (minutesSince(m.ultima_actividad) > SILENCE_LIMIT_H * 60) {
    return { state: 'inactivo', reason: `En silencio desde hace ${formatAge(m.ultima_actividad)}` };
  }
  return { state: 'operando', reason: 'Recibiendo eventos' };
}

export function formatAge(iso) {
  const mins = minutesSince(iso);
  if (mins === null) return '—';
  if (mins < 1) return 'segundos';
  if (mins < 60) return `${Math.round(mins)} min`;
  const hours = mins / 60;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} días`;
}

export async function getPulso() {
  const { data, error } = await supabase.from('laboratorio_pulso').select('*');
  if (error) throw error;
  return data || [];
}

export async function getActividad(limit = 120) {
  const { data, error } = await supabase
    .from('laboratorio_actividad')
    .select('ocurrido_en, fuente, tipo, actor, titulo, detalle, ok, client_id, client_service_id, kommo_lead_id')
    .order('ocurrido_en', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

/** Reparto de trabajo de los últimos N días por actor (cliente, agente, automatización, humano). */
export async function getReparto(days = 7) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data, error } = await supabase
    .from('laboratorio_actividad')
    .select('actor')
    .gte('ocurrido_en', since)
    .limit(5000);
  if (error) throw error;
  return (data || []).reduce((acc, r) => ({ ...acc, [r.actor]: (acc[r.actor] || 0) + 1 }), {});
}

/** Línea de producción: etapas del pipeline en orden + trámites activos en cada una. */
export async function getLinea() {
  const [{ data: stages, error: e1 }, { data: tramites, error: e2 }] = await Promise.all([
    supabase.from('pipeline_stages').select('code, name, position').order('position'),
    supabase
      .from('asistente_tramites')
      .select('client_service_id, client_id, cliente, telefono, servicio, etapa, etapa_code, status, kommo_lead_id, dias_sin_cambios, docs_por_revisar, updated_at')
      .in('status', ['pending', 'in_progress', 'on_hold']),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  return { stages: stages || [], tramites: tramites || [] };
}

export async function getKpis() {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [pend, pays] = await Promise.all([
    supabase.from('pendentes_hoje').select('ref_id', { count: 'exact', head: true }),
    supabase.from('payments').select('amount').eq('status', 'paid').gte('paid_at', monthStart.toISOString()),
  ]);
  if (pend.error) throw pend.error;
  if (pays.error) throw pays.error;
  return {
    pendientes: pend.count || 0,
    cobradoMes: (pays.data || []).reduce((s, p) => s + Number(p.amount || 0), 0),
  };
}

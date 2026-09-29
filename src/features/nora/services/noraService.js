import { supabase } from '@shared/config/supabaseClient';
import { getMyOrganizationId } from '@features/crm/services/crmService';

// Conocimiento de Nora. Todo pasa por la sesión del usuario (RLS por organización);
// las altas llevan la organización explícita y nunca una fija.
const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};

// PostgREST usa comas y paréntesis como separadores en los filtros "or": se quitan de la búsqueda.
const limpiarBusqueda = (q) => String(q || '').replace(/[,()%*\\]/g, ' ').trim();

// ── Respuestas ───────────────────────────────────────────────────────────────────
const RESPUESTA_COLS = 'id, pregunta, respuesta, tramite, idioma, tono, etiquetas, estado, fuente, importacion_id, tiene_embedding, created_by, approved_by, updated_by, created_at, updated_at';

export async function getRespuestas() {
  return must(await supabase.from('nora_respuestas_aprobadas').select(RESPUESTA_COLS).order('updated_at', { ascending: false }));
}

export async function crearRespuesta(campos) {
  const { data: { user } } = await supabase.auth.getUser();
  return must(await supabase.from('nora_respuestas_aprobadas').insert({
    organization_id: await getMyOrganizationId(),
    pregunta: campos.pregunta?.trim(),
    respuesta: campos.respuesta?.trim(),
    tramite: campos.tramite || null,
    idioma: campos.idioma || 'es',
    tono: campos.tono || 'humano',
    etiquetas: campos.etiquetas || [],
    // Lo nuevo nunca entra como aprobado: siempre nace como borrador.
    estado: 'borrador',
    fuente: campos.fuente || 'manual',
    importacion_id: campos.importacion_id || null,
    created_by: user?.id || null,
  }).select(RESPUESTA_COLS).single());
}

export async function actualizarRespuesta(id, cambios) {
  return must(await supabase.from('nora_respuestas_aprobadas').update(cambios).eq('id', id).select(RESPUESTA_COLS).single());
}

export async function eliminarRespuesta(id) {
  must(await supabase.from('nora_respuestas_aprobadas').delete().eq('id', id));
}

// ── Reglas ───────────────────────────────────────────────────────────────────────
const REGLA_COLS = 'id, texto, activa, origen, prioridad, importacion_id, kommo_lead_id, creado_por, created_at, updated_at';

export async function getReglas() {
  return must(await supabase.from('nora_reglas').select(REGLA_COLS).order('created_at', { ascending: true }));
}

export async function crearRegla(campos) {
  const { data: { user } } = await supabase.auth.getUser();
  return must(await supabase.from('nora_reglas').insert({
    organization_id: await getMyOrganizationId(),
    texto: campos.texto?.trim(),
    origen: campos.origen || 'manual',
    prioridad: campos.prioridad || 'normal',
    activa: campos.activa ?? true,
    importacion_id: campos.importacion_id || null,
    creado_por: user?.id || null,
  }).select(REGLA_COLS).single());
}

export async function actualizarRegla(id, cambios) {
  return must(await supabase.from('nora_reglas').update(cambios).eq('id', id).select(REGLA_COLS).single());
}

export async function eliminarRegla(id) {
  must(await supabase.from('nora_reglas').delete().eq('id', id));
}

// ── Casos históricos ─────────────────────────────────────────────────────────────
const CASO_COLS = 'id, tramite, pais, ciudad, problema, resumen, solucion, resultado, estado, fuente, importacion_id, tiene_embedding, created_by, approved_by, created_at, updated_at';

export async function getCasos() {
  return must(await supabase.from('nora_casos').select(CASO_COLS).order('updated_at', { ascending: false }));
}

export async function crearCaso(campos) {
  const { data: { user } } = await supabase.auth.getUser();
  return must(await supabase.from('nora_casos').insert({
    organization_id: await getMyOrganizationId(),
    tramite: campos.tramite || null,
    pais: campos.pais || null,
    ciudad: campos.ciudad || null,
    problema: campos.problema || null,
    resumen: campos.resumen?.trim(),
    solucion: campos.solucion || null,
    resultado: campos.resultado || null,
    estado: 'pendiente',
    fuente: campos.fuente || 'manual',
    importacion_id: campos.importacion_id || null,
    created_by: user?.id || null,
  }).select(CASO_COLS).single());
}

export async function actualizarCaso(id, cambios) {
  return must(await supabase.from('nora_casos').update(cambios).eq('id', id).select(CASO_COLS).single());
}

export async function eliminarCaso(id) {
  must(await supabase.from('nora_casos').delete().eq('id', id));
}

// ── Documentos ───────────────────────────────────────────────────────────────────
const DOC_COLS = 'id, title, category, fuente, source_type, status, procesamiento, procesamiento_error, fragmentos, procesado_at, version, created_by, created_at, updated_at';

export async function getDocumentos() {
  return must(await supabase.from('knowledge_documents').select(DOC_COLS).order('updated_at', { ascending: false }));
}

export async function getDocumento(id) {
  return must(await supabase.from('knowledge_documents').select(`${DOC_COLS}, content`).eq('id', id).single());
}

export async function crearDocumento(campos) {
  const { data: { user } } = await supabase.auth.getUser();
  return must(await supabase.from('knowledge_documents').insert({
    organization_id: await getMyOrganizationId(),
    title: campos.title?.trim(),
    content: campos.content || '',
    category: campos.category || null,
    fuente: campos.fuente || null,
    source_type: campos.source_type || 'panel',
    status: 'published',
    procesamiento: 'pendiente',
    created_by: user?.id || null,
  }).select(DOC_COLS).single());
}

export async function actualizarDocumento(id, cambios) {
  return must(await supabase.from('knowledge_documents').update(cambios).eq('id', id).select(DOC_COLS).single());
}

// ── Memorias de clientes ─────────────────────────────────────────────────────────
const MEMORIA_COLS = 'id, client_id, tipo, contenido, importancia, activa, tiene_embedding, created_at, updated_at, clients(full_name)';

export async function getMemorias() {
  return must(await supabase.from('nora_memorias').select(MEMORIA_COLS).order('updated_at', { ascending: false }).limit(500));
}

export async function crearMemoria(campos) {
  if (!campos.client_id) throw new Error('Una memoria siempre pertenece a un cliente');
  return must(await supabase.from('nora_memorias').insert({
    organization_id: await getMyOrganizationId(),
    client_id: campos.client_id,
    tipo: campos.tipo || 'client_fact',
    contenido: campos.contenido?.trim(),
    importancia: Number(campos.importancia) || 3,
    activa: campos.activa ?? true,
  }).select(MEMORIA_COLS).single());
}

export async function actualizarMemoria(id, cambios) {
  return must(await supabase.from('nora_memorias').update(cambios).eq('id', id).select(MEMORIA_COLS).single());
}

export async function eliminarMemoria(id) {
  must(await supabase.from('nora_memorias').delete().eq('id', id));
}

export async function buscarClientes(q) {
  const s = limpiarBusqueda(q);
  if (s.length < 2) return [];
  return must(await supabase.from('clients').select('id, full_name, phone').ilike('full_name', `%${s}%`).order('full_name').limit(10));
}

// ── Aprendizajes y dudas ─────────────────────────────────────────────────────────
const APRENDIZAJE_COLS = 'id, leccion, tipo, origen, estado, pregunta, respuesta, resultado, feedback, respuesta_id, kommo_lead_id, tiene_embedding, created_at, revisado_at, revisado_por';

export async function getAprendizajes() {
  return must(await supabase.from('nora_aprendizajes').select(APRENDIZAJE_COLS).order('created_at', { ascending: false }).limit(500));
}

export async function actualizarAprendizaje(id, cambios) {
  const { data: { user } } = await supabase.auth.getUser();
  return must(await supabase.from('nora_aprendizajes')
    .update({ ...cambios, revisado_at: new Date().toISOString(), revisado_por: user?.id || null })
    .eq('id', id).select(APRENDIZAJE_COLS).single());
}

export async function getDudas() {
  return must(await supabase.from('nora_dudas')
    .select('id, pregunta, respuesta, tramite, veces, en_ventas, estado, respuesta_id, ultima_vez, created_at')
    .order('veces', { ascending: false }).order('ultima_vez', { ascending: false }).limit(300));
}

export async function actualizarDuda(id, cambios) {
  const { data: { user } } = await supabase.auth.getUser();
  must(await supabase.from('nora_dudas')
    .update({ ...cambios, revisado_at: new Date().toISOString(), revisado_por: user?.id || null }).eq('id', id));
}

// Algo que funcionó bien pasa a Respuestas como borrador: después se decide si se aprueba.
export async function convertirEnRespuesta({ origen, id, pregunta, respuesta, tramite }) {
  const nueva = await crearRespuesta({ pregunta, respuesta, tramite, fuente: origen === 'duda' ? 'duda' : 'aprendizaje' });
  if (origen === 'duda') await actualizarDuda(id, { respuesta_id: nueva.id });
  else must(await supabase.from('nora_aprendizajes').update({ respuesta_id: nueva.id }).eq('id', id));
  return nueva;
}

// ── Importación ──────────────────────────────────────────────────────────────────
// Todo lo importado entra apagado: respuestas en borrador, casos pendientes y reglas inactivas.
export async function importarBorradores(items) {
  const organization_id = await getMyOrganizationId();
  const { data: { user } } = await supabase.auth.getUser();
  const importacion_id = crypto.randomUUID();
  const respuestas = items.filter((i) => i.tipo === 'respuesta').map((i) => ({
    organization_id, importacion_id, pregunta: i.pregunta, respuesta: i.respuesta, tramite: i.tramite || null,
    etiquetas: i.tramite ? [i.tramite] : [], estado: 'borrador', fuente: 'importacion', created_by: user?.id || null,
  }));
  const reglas = items.filter((i) => i.tipo === 'regla').map((i) => ({
    organization_id, importacion_id, texto: i.texto, prioridad: i.prioridad || 'normal', origen: 'importacion', activa: false, creado_por: user?.id || null,
  }));
  const casos = items.filter((i) => i.tipo === 'caso').map((i) => ({
    organization_id, importacion_id, tramite: i.tramite || null, pais: i.pais || null, ciudad: i.ciudad || null, problema: i.problema || null,
    resumen: i.resumen, solucion: i.solucion || null, resultado: i.resultado || null, estado: 'pendiente', fuente: 'importacion', created_by: user?.id || null,
  }));
  if (respuestas.length) must(await supabase.from('nora_respuestas_aprobadas').insert(respuestas));
  if (reglas.length) must(await supabase.from('nora_reglas').insert(reglas));
  if (casos.length) must(await supabase.from('nora_casos').insert(casos));
  return { importacion_id, respuestas: respuestas.length, reglas: reglas.length, casos: casos.length };
}

// Lo importado que todavía espera una decisión.
export async function getPorRevisar() {
  const [respuestas, reglas, casos] = await Promise.all([
    supabase.from('nora_respuestas_aprobadas').select('id, pregunta, respuesta, tramite, estado, importacion_id, created_at').not('importacion_id', 'is', null).eq('estado', 'borrador').order('created_at'),
    supabase.from('nora_reglas').select('id, texto, prioridad, activa, importacion_id, created_at').not('importacion_id', 'is', null).eq('activa', false).order('created_at'),
    supabase.from('nora_casos').select('id, tramite, pais, ciudad, problema, resumen, solucion, resultado, estado, importacion_id, created_at').not('importacion_id', 'is', null).eq('estado', 'pendiente').order('created_at'),
  ]);
  return [
    ...must(respuestas).map((r) => ({ ...r, tipo: 'respuesta' })),
    ...must(reglas).map((r) => ({ ...r, tipo: 'regla' })),
    ...must(casos).map((r) => ({ ...r, tipo: 'caso' })),
  ];
}

// ── Panel de control ─────────────────────────────────────────────────────────────
const contar = async (tabla, filtro = (q) => q) => {
  const { count, error } = await filtro(supabase.from(tabla).select('id', { count: 'exact', head: true }));
  if (error) throw error;
  return count || 0;
};

export async function getResumen() {
  const [respuestasAprobadas, respuestasBorrador, respuestasTotal, reglasActivas, reglasTotal, casosAprobados, casosPendientes,
    documentosActivos, documentosPendientes, memoriasActivas, aprendizajesPendientes, aprendizajesAprobados, dudasPendientes] = await Promise.all([
    contar('nora_respuestas_aprobadas', (q) => q.eq('estado', 'aprobada')),
    contar('nora_respuestas_aprobadas', (q) => q.eq('estado', 'borrador')),
    contar('nora_respuestas_aprobadas'),
    contar('nora_reglas', (q) => q.eq('activa', true)),
    contar('nora_reglas'),
    contar('nora_casos', (q) => q.eq('estado', 'aprobado')),
    contar('nora_casos', (q) => q.eq('estado', 'pendiente')),
    contar('knowledge_documents', (q) => q.eq('status', 'published').eq('procesamiento', 'procesado')),
    contar('knowledge_documents', (q) => q.neq('status', 'archived').in('procesamiento', ['pendiente', 'error'])),
    contar('nora_memorias', (q) => q.eq('activa', true)),
    contar('nora_aprendizajes', (q) => q.in('estado', ['pendiente', 'corregir'])),
    contar('nora_aprendizajes', (q) => q.eq('estado', 'aprobada')),
    contar('nora_dudas', (q) => q.eq('estado', 'pendiente')),
  ]);
  return {
    respuestasAprobadas, respuestasBorrador, respuestasTotal, reglasActivas, reglasTotal, casosAprobados, casosPendientes,
    documentosActivos, documentosPendientes, memoriasActivas, aprendizajesPendientes, aprendizajesAprobados, dudasPendientes,
    conocimientoActivo: respuestasAprobadas + reglasActivas + casosAprobados + documentosActivos + aprendizajesAprobados,
  };
}

export async function getActividad(limite = 20) {
  return must(await supabase.from('nora_actividad').select('id, entidad, entidad_id, accion, titulo, actor, created_at')
    .order('created_at', { ascending: false }).limit(limite));
}

// Vectores que faltan: lo editado o nuevo todavía no se puede encontrar por significado.
export async function getEstadoVectores() {
  const [respuestas, casos, memorias, aprendizajes, documentos, documentosError] = await Promise.all([
    contar('nora_respuestas_aprobadas', (q) => q.neq('estado', 'archivada').eq('tiene_embedding', false)),
    contar('nora_casos', (q) => q.neq('estado', 'archivado').eq('tiene_embedding', false)),
    contar('nora_memorias', (q) => q.eq('activa', true).eq('tiene_embedding', false)),
    contar('nora_aprendizajes', (q) => q.neq('estado', 'descartada').eq('tiene_embedding', false)),
    contar('knowledge_documents', (q) => q.neq('status', 'archived').eq('procesamiento', 'pendiente')),
    contar('knowledge_documents', (q) => q.neq('status', 'archived').eq('procesamiento', 'error')),
  ]);
  return { respuestas, casos, memorias, aprendizajes, documentos, documentosError, total: respuestas + casos + memorias + aprendizajes + documentos };
}

// Qué conocimiento usó Nora al responder (lo registra nora-memoria en cada búsqueda).
export async function getFuentesUsadas({ kommoLeadId = null, limite = 30 } = {}) {
  let q = supabase.from('nora_fuentes_usadas').select('id, kommo_lead_id, client_id, consulta, fuentes, created_at').order('created_at', { ascending: false }).limit(limite);
  if (kommoLeadId) q = q.eq('kommo_lead_id', kommoLeadId);
  const rows = must(await q);
  const ids = [...new Set(rows.map((r) => r.kommo_lead_id).filter(Boolean))];
  const leads = ids.length ? must(await supabase.from('comercial_leads').select('kommo_lead_id, nombre').in('kommo_lead_id', ids)) : [];
  const nombre = Object.fromEntries(leads.map((l) => [l.kommo_lead_id, l.nombre]));
  return rows.map((r) => ({ ...r, lead_nombre: nombre[r.kommo_lead_id] || null }));
}

// ── Funciones del servidor ───────────────────────────────────────────────────────
async function invocar(body) {
  const { data, error } = await supabase.functions.invoke('nora-conocimiento', { body });
  if (error) {
    const detalle = await error.context?.json?.().catch(() => null);
    throw new Error(detalle?.error || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export const generarVectores = () => invocar({ accion: 'embeber' });
export const procesarDocumento = (id) => invocar({ accion: 'procesar_documento', id });
export const probarNora = (texto, clientId = null) => invocar({ accion: 'probar', texto, client_id: clientId });

// Después de guardar, se calculan los vectores en segundo plano (si falla, Nora los calcula antes de buscar).
export function refrescarVectores() {
  generarVectores().catch(() => {});
}

// ── Búsqueda global ──────────────────────────────────────────────────────────────
export async function buscarConocimiento(q) {
  const s = limpiarBusqueda(q);
  if (s.length < 2) return null;
  const like = `%${s}%`;
  const [respuestas, reglas, casos, documentos, memorias, aprendizajes] = await Promise.all([
    supabase.from('nora_respuestas_aprobadas').select('id, pregunta, respuesta, estado').or(`pregunta.ilike.${like},respuesta.ilike.${like},tramite.ilike.${like}`).limit(20),
    supabase.from('nora_reglas').select('id, texto, activa, prioridad').ilike('texto', like).limit(20),
    supabase.from('nora_casos').select('id, tramite, resumen, estado').or(`resumen.ilike.${like},problema.ilike.${like},solucion.ilike.${like},tramite.ilike.${like}`).limit(20),
    supabase.from('knowledge_documents').select('id, title, status, procesamiento').or(`title.ilike.${like},content.ilike.${like}`).limit(20),
    supabase.from('nora_memorias').select('id, contenido, activa, clients(full_name)').ilike('contenido', like).limit(20),
    supabase.from('nora_aprendizajes').select('id, leccion, estado').or(`leccion.ilike.${like},pregunta.ilike.${like},respuesta.ilike.${like}`).limit(20),
  ]);
  return {
    respuestas: must(respuestas), reglas: must(reglas), casos: must(casos),
    documentos: must(documentos), memorias: must(memorias), aprendizajes: must(aprendizajes),
  };
}

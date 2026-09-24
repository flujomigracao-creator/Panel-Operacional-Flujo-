/**
 * tramitesService.js
 * Capa de servicio — Agente 2 (Arquitecto)
 * Centraliza TODAS las llamadas a Supabase relacionadas con trámites (entradas).
 */
import { supabase } from '../supabaseClient';
import { registrarAccionHistorial } from './equipoService';

// Un trámite aparece en la ficha del titular (`id_cliente`) y también en la
// de cualquier persona vinculada (`entrada_clientes_vinculados`) — ej. un
// caso de refugio de toda una familia. `es_titular` le indica a la UI si el
// cliente que se está viendo es el dueño real del trámite o solo un
// vinculado (Supabase-js no arma fácil un OR entre dos tablas en una sola
// query, así que se resuelve con dos queries en paralelo y se deduplica).
export const getEntradas = async (clientId) => {
  const [propiasRes, vinculadasRes] = await Promise.all([
    supabase.from('entradas').select('*').eq('id_cliente', clientId),
    supabase
      .from('entrada_clientes_vinculados')
      .select('entradas(*)')
      .eq('cliente_id', clientId),
  ]);
  if (propiasRes.error) throw propiasRes.error;
  if (vinculadasRes.error) throw vinculadasRes.error;

  const propias = (propiasRes.data || []).map(e => ({ ...e, es_titular: true }));
  const vinculadas = (vinculadasRes.data || [])
    .map(r => r.entradas)
    .filter(Boolean)
    .map(e => ({ ...e, es_titular: false }));

  const porId = new Map();
  [...propias, ...vinculadas].forEach(e => porId.set(e.id, e));

  return [...porId.values()].sort((a, b) => new Date(b.creado_en) - new Date(a.creado_en));
};

/** Personas vinculadas a un trámite (además del titular). */
export const getVinculadosEntrada = async (entradaId) => {
  const { data, error } = await supabase
    .from('entrada_clientes_vinculados')
    .select('id, cliente_id, clientes(id, nombre, cpf)')
    .eq('entrada_id', entradaId);
  if (error) throw error;
  return data || [];
};

// Cada persona vinculada suma el mismo precio del trámite (confirmado con el
// usuario: "el mismo precio del trámite" por persona extra) — el costo total
// termina siendo costo_base × cantidad de personas (titular + vinculados).
// Se recalcula y persiste en entradas.valor cada vez que se vincula/desvincula
// a alguien, para que tanto el panel como la app de clientes (que solo LEEN
// entradas.valor, no recalculan nada) muestren el total correcto. El staff
// puede seguir editando el costo a mano después (ej. para un descuento) desde
// el campo "Costo" de Pagos — pero un vincular/desvincular posterior vuelve a
// pisar ese valor con el cálculo automático.
const recalcularValorTramite = async (entradaId) => {
  try {
    const { data: entrada } = await supabase.from('entradas').select('servicio').eq('id', entradaId).single();
    if (!entrada) return;

    const [{ data: catalogoRows }, { count: vinculadosCount }] = await Promise.all([
      supabase.from('tramites_catalogo').select('nombre, costo'),
      supabase.from('entrada_clientes_vinculados').select('id', { count: 'exact', head: true }).eq('entrada_id', entradaId),
    ]);

    const catalogoMatch = (catalogoRows || []).find(c => c.nombre?.toUpperCase() === entrada.servicio?.toUpperCase());
    const costoBase = Number(catalogoMatch?.costo) || 0;
    if (!costoBase) return; // sin costo definido en el catálogo, no hay nada que recalcular

    const totalPersonas = 1 + (vinculadosCount || 0);
    await supabase.from('entradas').update({ valor: costoBase * totalPersonas }).eq('id', entradaId);
  } catch (err) {
    console.error('[tramitesService] Error recalculando valor del trámite:', err);
  }
};

/** Vincula un cliente existente a un trámite (ej. un familiar del titular). */
export const vincularClienteATramite = async (entradaId, clienteId) => {
  const { error } = await supabase
    .from('entrada_clientes_vinculados')
    .insert({ entrada_id: entradaId, cliente_id: clienteId });
  if (error && error.code !== '23505') throw error; // 23505 = ya estaba vinculado, ignorar
  await recalcularValorTramite(entradaId);
};

export const desvincularClienteDeTramite = async (entradaId, clienteId) => {
  const { error } = await supabase
    .from('entrada_clientes_vinculados')
    .delete()
    .eq('entrada_id', entradaId)
    .eq('cliente_id', clienteId);
  if (error) throw error;
  await recalcularValorTramite(entradaId);
};

/** Edita el costo del trámite a mano (ej. para aplicar un descuento). */
export const updateEntradaValor = async (id, valor) => {
  const { error } = await supabase.from('entradas').update({ valor }).eq('id', id);
  if (error) throw error;
};

export const createEntrada = async ({ id_cliente, servicio, operario, pipeline_id, stage_id }) => {
  let finalPipelineId = pipeline_id;
  let finalStageId = stage_id;

  if (!finalPipelineId || !finalStageId) {
    try {
      const { data: pipelines } = await supabase
        .from('pipelines')
        .select('*')
        .eq('activo', true)
        .order('orden', { ascending: true });
        
      if (pipelines && pipelines.length > 0) {
        const target = pipelines.find(p => p.es_predeterminado) || pipelines[0];
        finalPipelineId = target.id;
        
        const { data: stages } = await supabase
          .from('pipeline_etapas')
          .select('id')
          .eq('pipeline_id', target.id)
          .eq('activo', true)
          .order('orden', { ascending: true })
          .limit(1);
          
        if (stages && stages.length > 0) {
          finalStageId = stages[0].id;
        }
      }
    } catch (err) {
      console.error('Error auto-asignando pipeline/stage default:', err);
    }
  }

  const { data, error } = await supabase
    .from('entradas')
    .insert({
      id_cliente,
      servicio: servicio.trim().toUpperCase(),
      operario: operario?.trim().toUpperCase() || null,
      estado_tramite: 'pendiente',
      pipeline_id: finalPipelineId || null,
      stage_id: finalStageId || null,
    })
    .select()
    .single();
  if (error) throw error;
  registrarAccionHistorial(id_cliente, 'NUEVO_TRAMITE', `Creó trámite de ${servicio}`);
  return data;
};

export const updateEntradaEstado = async (id, estado_tramite) => {
  const { error } = await supabase
    .from('entradas')
    .update({ estado_tramite })
    .eq('id', id);
  if (error) throw error;
};

/**
 * Mueve una entrada a otra etapa del pipeline. Si la etapa tiene un `codigo` que coincide
 * con uno de los 5 estados legacy, también sincroniza estado_tramite para que las vistas
 * que todavía lo usan (badge de estado en ClientViewTramites, etc.) se mantengan consistentes.
 */
const LEGACY_CODES = ['entrante', 'esperando_cliente', 'esperando', 'cobranza', 'logrado'];
const LEGACY_MAP = { entrante: 'pendiente', esperando_cliente: 'esperando_docs', esperando: 'procesando', cobranza: 'cancelada', logrado: 'completada' };

export const updateEntradaStage = async (id, stage) => {
  const updates = { stage_id: stage.id, pipeline_id: stage.pipeline_id };
  let nuevoEstadoTramite = null;
  if (stage.codigo && LEGACY_CODES.includes(stage.codigo)) {
    nuevoEstadoTramite = LEGACY_MAP[stage.codigo];
    updates.estado_tramite = nuevoEstadoTramite;
  }
  const { error } = await supabase.from('entradas').update(updates).eq('id', id);
  if (error) throw error;

  // --- Integración Bot de Agendamiento PF ---
  // Cuando se mueve a "procesando" (ej. "esperando"), mandamos la orden al bot.
  if (nuevoEstadoTramite === 'procesando' || stage.codigo === 'esperando') {
    try {
      const { data: entrada } = await supabase
        .from('entradas')
        .select('servicio, id_cliente, datos_personalizados')
        .eq('id', id)
        .single();

      if (entrada && entrada.servicio && entrada.servicio.toUpperCase().includes('AGENDAMIENTO')) {
        const { data: cliente } = await supabase
          .from('clientes')
          .select('fecha_nacimiento, estado_federal, ciudad')
          .eq('id', entrada.id_cliente)
          .single();

        if (cliente) {
          const dp = entrada.datos_personalizados || {};
          const payload = {
            entrada_id: id,
            cliente_id: entrada.id_cliente,
            requerimento: dp.requerimento || dp.Requerimento || '',
            dataNascimento: cliente.fecha_nacimiento || dp.dataNascimento || '',
            uf: cliente.estado_federal || dp.uf || '',
            ciudad: cliente.ciudad || dp.ciudad || '',
            posto: dp.posto || dp.Posto || '',
            estado: 'pendiente'
          };
          
          // Intentar insertar si no existe
          await supabase.from('agendamientos_pendientes').insert(payload);
        }
      }
    } catch (e) {
      console.error('[tramitesService] Error enviando a agendamientos_pendientes:', e);
    }
  }
};

export const deleteEntrada = async (id) => {
  const { error } = await supabase
    .from('entradas')
    .delete()
    .eq('id', id);
  if (error) throw error;
};

export const updateEntradaServicio = async (id, servicio) => {
  const { error } = await supabase
    .from('entradas')
    .update({ servicio: servicio?.trim().toUpperCase() })
    .eq('id', id);
  if (error) throw error;
};

export const updateEntradaOperario = async (id, operario) => {
  const { error } = await supabase
    .from('entradas')
    .update({ operario: operario?.trim().toUpperCase() || null })
    .eq('id', id);
  if (error) throw error;
};

export const updateEntradaDatosPersonalizados = async (id, datos_personalizados) => {
  const { error } = await supabase
    .from('entradas')
    .update({ datos_personalizados })
    .eq('id', id);
  if (error) throw error;

  // --- Integración Bot de Agendamiento PF ---
  // Si actualizan los datos de un agendamiento, actualizamos el pendiente en el bot.
  try {
    const { data: entrada } = await supabase
      .from('entradas')
      .select('servicio, id_cliente, estado_tramite')
      .eq('id', id)
      .single();

    if (entrada && entrada.servicio && entrada.servicio.toUpperCase().includes('AGENDAMIENTO')) {
      // Solo actualizamos si ya estaba enviado al bot (ej. estado_tramite='procesando')
      if (entrada.estado_tramite === 'procesando') {
        const { data: cliente } = await supabase
          .from('clientes')
          .select('fecha_nacimiento, estado_federal, ciudad')
          .eq('id', entrada.id_cliente)
          .single();

        if (cliente) {
          const dp = datos_personalizados || {};
          const payload = {
            requerimento: dp.requerimento || dp.Requerimento || '',
            dataNascimento: cliente.fecha_nacimiento || dp.dataNascimento || '',
            uf: cliente.estado_federal || dp.uf || '',
            ciudad: cliente.ciudad || dp.ciudad || '',
            posto: dp.posto || dp.Posto || '',
            actualizado_em: new Date().toISOString()
          };
          
          await supabase
            .from('agendamientos_pendientes')
            .update(payload)
            .eq('entrada_id', id);
        }
      }
    }
  } catch (e) {
    console.error('[tramitesService] Error actualizando agendamientos_pendientes:', e);
  }
};

export const getCatalogoTramites = async () => {
  const { data, error } = await supabase
    .from('tramites_catalogo')
    .select('id, nombre, codigo, costo, fastop_tipo')
    .eq('activo', true)
    .order('nombre');
  if (error) throw error;
  return data || [];
};

export const getAllCatalogoTramites = async () => {
  const { data, error } = await supabase
    .from('tramites_catalogo')
    .select('*')
    .order('nombre');
  if (error) throw error;
  return data || [];
};

// `codigo` tiene un UNIQUE constraint en la BD -- no podemos mandar '' para
// cada fila nueva (la segunda ya choca contra la primera), así que generamos
// un código determinístico a partir del nombre.
const slugifyCodigo = (nombre) => nombre
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

// ── Acciones FastOp (ej. variantes de "PDF Único") ──────────────────────────
// Reutilizan tramites_catalogo como contenedor -- así enganchan gratis con
// tramites_requisitos (FK a tramite_id) -- pero se distinguen de los trámites
// facturables reales por la columna fastop_tipo (NULL = trámite real).

export const getFastopAcciones = async (tipo) => {
  const { data, error } = await supabase
    .from('tramites_catalogo')
    .select('*')
    .eq('fastop_tipo', tipo)
    .eq('activo', true)
    .order('nombre');
  if (error) throw error;
  return data || [];
};

export const createFastopAccion = async (nombre, tipo) => {
  const nombreNorm = nombre.trim().toUpperCase();
  return createCatalogoTramite({ nombre: nombreNorm, codigo: slugifyCodigo(nombreNorm), fastop_tipo: tipo, costo: 0, activo: true });
};

export const renameFastopAccion = async (id, nombre) => {
  return updateCatalogoTramite(id, { nombre: nombre.trim().toUpperCase() });
};

export const deactivateFastopAccion = async (id) => {
  return updateCatalogoTramite(id, { activo: false });
};

export const createCatalogoTramite = async (tramite) => {
  const { data, error } = await supabase
    .from('tramites_catalogo')
    .insert(tramite)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateCatalogoTramite = async (id, updates) => {
  const { data, error } = await supabase
    .from('tramites_catalogo')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const getNotasTramite = async (entradaId) => {
  const { data, error } = await supabase
    .from('notas_tramite')
    .select('*')
    .eq('entrada_id', entradaId)
    .order('creado_en', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const createNotaTramite = async ({ entrada_id, texto }) => {
  const { data, error } = await supabase
    .from('notas_tramite')
    .insert({
      entrada_id,
      texto: texto.trim(),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateNotaTramite = async (id, texto) => {
  const { data, error } = await supabase
    .from('notas_tramite')
    .update({ texto: texto.trim() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// ── Pagos ─────────────────────────────────────────────────────────────────────

export const getPagos = async (entradaId) => {
  const { data, error } = await supabase
    .from('pagos_tramite')
    .select('*')
    .eq('entrada_id', entradaId)
    .order('fecha', { ascending: false });
  if (error) throw error;
  return data || [];
};

export const createPago = async ({ entrada_id, monto, fecha, nota }) => {
  const { data, error } = await supabase
    .from('pagos_tramite')
    .insert({ entrada_id, monto, fecha: fecha || undefined, nota: nota || null })
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deletePago = async (id) => {
  const { error } = await supabase.from('pagos_tramite').delete().eq('id', id);
  if (error) throw error;
};

export const getOperarios = async () => {
  const { data, error } = await supabase
    .from('operarios')
    .select('id, nombre, iniciales')
    .eq('activo', true)
    .order('nombre');
  if (error) throw error;
  return data || [];
};

export const getAllOperarios = async () => {
  const { data, error } = await supabase
    .from('operarios')
    .select('*')
    .order('nombre');
  if (error) throw error;
  return data || [];
};

export const createOperario = async (operario) => {
  const { data, error } = await supabase
    .from('operarios')
    .insert(operario)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateOperario = async (id, updates) => {
  const { data, error } = await supabase
    .from('operarios')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// ── Etiquetas ─────────────────────────────────────────────────────────────────

export const getEtiquetas = async () => {
  const { data, error } = await supabase
    .from('etiquetas')
    .select('*')
    .order('creado_en', { ascending: true });
  if (error) throw error;
  return data || [];
};

export const createEtiqueta = async (etiqueta) => {
  const { data, error } = await supabase
    .from('etiquetas')
    .insert(etiqueta)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateEtiqueta = async (id, updates) => {
  const { data, error } = await supabase
    .from('etiquetas')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteEtiqueta = async (id) => {
  const { error } = await supabase.from('etiquetas').delete().eq('id', id);
  if (error) throw error;
};

export const updateEntradaEtiquetas = async (id, etiquetas_ids) => {
  const { error } = await supabase
    .from('entradas')
    .update({ etiquetas_ids: etiquetas_ids || [] })
    .eq('id', id);
  if (error) throw error;
};

// ── Requisitos de Documentos (checklist del "PDF Único") ────────────────────

export const getRequisitosTramite = async (tramiteId) => {
  const { data, error } = await supabase
    .from('tramites_requisitos')
    .select('*')
    .eq('tramite_id', tramiteId)
    .eq('activo', true)
    .order('orden', { ascending: true });
  if (error) throw error;
  return data || [];
};

export const createRequisito = async (requisito) => {
  const { data, error } = await supabase
    .from('tramites_requisitos')
    .insert(requisito)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateRequisito = async (id, updates) => {
  const { data, error } = await supabase
    .from('tramites_requisitos')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const deleteRequisito = async (id) => {
  const { error } = await supabase.from('tramites_requisitos').delete().eq('id', id);
  if (error) throw error;
};

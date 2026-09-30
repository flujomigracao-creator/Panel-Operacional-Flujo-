// Herramientas del asistente. Las de lectura consultan con el JWT del usuario (RLS aplica);
// las de acción NO ejecutan nada: crean una propuesta que el usuario confirma en el panel.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { ADS_TOOL_DEFS, runAdsTool } from './ads.ts';

export const ORG_ID = '00000000-0000-0000-0000-000000000001';

// Campos del cliente que el asistente puede proponer editar.
export const CLIENT_FIELDS: Record<string, string> = {
  full_name: 'Nombre completo',
  preferred_name: 'Nombre preferido',
  email: 'Email',
  nationality: 'Nacionalidad',
  country: 'País',
  birth_date: 'Fecha de nacimiento',
};

export interface Ctx {
  user: SupabaseClient;   // cliente con el JWT del usuario
  admin: SupabaseClient;  // service role (solo tras validar membresía)
  userId: string;
  conversationId: string;
  groq: (body: Record<string, unknown>) => Promise<any>;
  proposals: any[];       // propuestas creadas en este turno (se devuelven al panel)
}

const fn = (name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } },
});

const str = (description: string) => ({ type: 'string', description });
const num = (description: string) => ({ type: 'number', description });
const bool = (description: string) => ({ type: 'boolean', description });

export const TOOL_DEFS = [
  // ── Lectura ──
  fn('resumen_hoy', 'Lista lo que necesita atención humana hoy (tareas abiertas, documentos por revisar, casos parados, citas próximas), ordenado por prioridad.'),
  fn('buscar_clientes', 'Busca clientes por nombre, teléfono, email, nacionalidad o trámite. Devuelve sus trámites y etapa.', { texto: str('Texto a buscar') }, ['texto']),
  fn('ver_cliente', 'Ficha completa de un cliente: datos, trámites con etapa y campos, documentos con estado y motivo de rechazo, pagos e historial reciente.', { client_id: str('UUID del cliente') }, ['client_id']),
  fn('conversacion', 'Mensajes de Kommo del cliente (cliente, bot y equipo), del más antiguo al más nuevo.', { client_id: str('UUID del cliente'), ultimos: num('Cantidad de mensajes recientes (por defecto 80, máximo 300)') }, ['client_id']),
  fn('listar_tramites', 'Lista trámites con filtros. Útil para "casos parados", "qué hay en tal etapa", "documentos por revisar".', {
    servicio: str('Nombre (o parte) del trámite, ej. CPF, RNM'),
    etapa: str('Etapa, ej. Documentación Completa, Esperando Resultado'),
    parados_dias: num('Solo trámites sin cambios hace al menos N días'),
    con_docs_por_revisar: bool('Solo trámites con documentos por revisar'),
    solo_activos: bool('Excluir concluidos y cancelados (por defecto true)'),
  }),
  fn('checklist_tramite', 'Lista de documentos y datos que pide un trámite y el estado de cada uno (ok, faltando, rechazado con motivo).', { client_service_id: str('UUID del trámite') }, ['client_service_id']),
  fn('metricas', 'Cobros y cantidad de trámites en un período.', { desde: str('Fecha inicio YYYY-MM-DD'), hasta: str('Fecha fin YYYY-MM-DD') }),
  fn('catalogo_tramites', 'Trámites que ofrece la empresa, con precio, etapas y lista de documentos cargada.'),
  fn('extraer_datos_conversacion', 'Lee toda la conversación de Kommo del cliente y los datos extraídos de sus documentos, encuentra datos personales y del trámite, y crea una propuesta para guardarlos (el usuario elige cuáles).', { client_id: str('UUID del cliente') }, ['client_id']),

  // ── Acción (crean propuestas; el usuario confirma) ──
  fn('proponer_cambiar_etapa', 'Propone mover un trámite a otra etapa (se refleja en Kommo).', { client_service_id: str('UUID del trámite'), etapa: str('Etapa destino (nombre de la etapa del trámite o del pipeline)') }, ['client_service_id', 'etapa']),
  fn('proponer_cambiar_estado_tramite', 'Propone cambiar el estado de un trámite.', { client_service_id: str('UUID del trámite'), estado: { type: 'string', enum: ['pending', 'in_progress', 'on_hold', 'completed', 'cancelled'] } }, ['client_service_id', 'estado']),
  fn('proponer_revisar_documento', 'Propone aprobar o rechazar un documento. Si se rechaza, el motivo se le explica al cliente.', { document_id: str('UUID del documento'), aprobar: bool('true aprueba, false rechaza'), motivo: str('Motivo del rechazo') }, ['document_id', 'aprobar']),
  fn('proponer_crear_tarea', 'Propone crear una tarea/recordatorio en la bandeja Hoy.', { titulo: str('Título'), detalles: str('Detalles'), prioridad: { type: 'string', enum: ['urgent', 'high', 'normal', 'low'] }, vence_en: str('Fecha/hora ISO opcional'), client_id: str('UUID del cliente relacionado (opcional)') }, ['titulo']),
  fn('proponer_cerrar_tarea', 'Propone marcar una tarea como hecha.', { task_id: str('UUID de la tarea') }, ['task_id']),
  fn('proponer_guardar_dato', 'Propone guardar un dato del cliente o de un trámite.', { client_id: str('UUID del cliente'), client_service_id: str('UUID del trámite, si el dato es del trámite'), campo: str('Nombre del campo (del cliente: full_name, email, nationality, country, birth_date, preferred_name; del trámite: nombre del campo, ej. Nome_Mae)'), valor: str('Valor') }, ['campo', 'valor']),
  fn('proponer_crear_servicio', 'Propone crear un trámite nuevo en el catálogo, con etapas estándar.', { nombre: str('Nombre del trámite'), precio: num('Precio en BRL'), descripcion: str('Descripción') }, ['nombre']),
  fn('proponer_lista_documentos', 'Propone cargar la lista de documentos/datos que se pide al cliente para un trámite (la usa el agente de recepción).', {
    servicio: str('Nombre del trámite'),
    reemplazar: bool('true reemplaza la lista actual; false agrega'),
    items: { type: 'array', items: { type: 'object', properties: {
      tipo: { type: 'string', enum: ['foto', 'dato'] },
      codigo: str('Código en MAYÚSCULAS_CON_GUIONES, ej. PASAPORTE, COMPROVANTE_ENDERECO, Nome_Mae'),
      texto_cliente: str('Cómo se le pide al cliente'),
      instrucciones_ia: str('Cómo validar la foto / qué extraer'),
      obligatorio: bool('Obligatorio (por defecto true)'),
    }, required: ['tipo', 'codigo', 'texto_cliente'] } },
  }, ['servicio', 'items']),
  fn('proponer_respuesta_estandar', 'Propone guardar una respuesta estándar para dudas frecuentes.', { titulo: str('Título'), contenido: str('Texto de la respuesta'), categoria: str('Categoría') }, ['titulo', 'contenido']),
  fn('proponer_actualizar_lead_kommo', 'Propone completar campos del lead en Kommo (trámite solicitado, ciudad, país de origen, pasaporte).', { kommo_lead_id: num('ID del lead'), tramite: str('Opción de "Trámite solicitado"'), ciudad_br: str('Ciudad en Brasil'), pais_origen: str('País de origen'), pasaporte: str('Número de pasaporte') }, ['kommo_lead_id']),
  fn('proponer_relacionar_clientes', 'Propone registrar la relación entre dos clientes (familia o representante). Se ve desde ambos lados.', {
    client_id: str('UUID del cliente'), relacionado_id: str('UUID del otro cliente'),
    tipo: { type: 'string', enum: ['conyuge', 'hijo', 'padre', 'madre', 'hermano', 'abuelo', 'nieto', 'tio', 'sobrino', 'primo', 'otro_familiar', 'representante', 'otro'], description: 'Qué es relacionado_id para client_id' },
  }, ['client_id', 'relacionado_id', 'tipo']),
  fn('proponer_agregar_participante', 'Propone incluir a otra persona en un trámite (ej. reunión familiar: cónyuge, hijos). El trámite aparece también en su ficha.', {
    client_service_id: str('UUID del trámite'), client_id: str('UUID de la persona a incluir'),
    rol: { type: 'string', enum: ['dependiente', 'conyuge', 'hijo', 'chamante', 'representante', 'otro'] },
  }, ['client_service_id', 'client_id', 'rol']),
  fn('proponer_generar_documento', 'Propone generar una declaración/PDF del trámite con las plantillas de n8n y guardarla en la carpeta de Drive.', { client_service_id: str('UUID del trámite'), documento: str('Qué documento generar, ej. declaracao_cpf, declaracao_eletronica, declaracao_entrada, declaracao_hipossuficiencia') }, ['client_service_id', 'documento']),
  ...ADS_TOOL_DEFS,
];

const cut = (v: unknown, max = 14000) => {
  const s = JSON.stringify(v);
  return s.length > max ? s.slice(0, max) + '…(recortado)' : s;
};

async function must<T>(p: PromiseLike<{ data: T; error: any }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

async function proposal(ctx: Ctx, tipo: string, payload: Record<string, unknown>, resumen: string) {
  const row = await must(ctx.admin.from('ai_proposals').insert({
    organization_id: ORG_ID, user_id: ctx.userId, ai_conversation_id: ctx.conversationId, tipo, payload, resumen,
  }).select('id, tipo, payload, resumen, status, created_at').single());
  ctx.proposals.push(row);
  return { propuesta_creada: true, proposal_id: (row as any).id, resumen, nota: 'El usuario debe tocar Confirmar en el panel; todavía NO se ejecutó.' };
}

async function tramite(ctx: Ctx, id: string) {
  return await must(ctx.user.from('asistente_tramites').select('*').eq('client_service_id', id).maybeSingle()) as any;
}

export async function runTool(ctx: Ctx, name: string, args: any): Promise<string> {
  switch (name) {
    case 'resumen_hoy': {
      const rows = await must(ctx.user.from('pendentes_hoje').select('origem, tipo, titulo, detalhes, prioridade, vence_em, desde, client_id, kommo_lead_id, ref_id'));
      const order: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
      return cut((rows as any[]).sort((a, b) => (order[a.prioridade] ?? 9) - (order[b.prioridade] ?? 9)));
    }
    case 'buscar_clientes': {
      const t = String(args.texto || '').trim();
      const digits = t.replace(/\D/g, '');
      let q = ctx.user.from('painel_clientes').select('id, full_name, phone, email, nationality, status, tramites, documentos_por_revisar, last_activity_at').limit(15);
      if (digits.length >= 4) q = q.ilike('phone', `%${digits.slice(-8)}%`);
      else q = q.or(`full_name.ilike.%${t}%,email.ilike.%${t}%,nationality.ilike.%${t}%`);
      let rows = await must(q) as any[];
      if (!rows.length && digits.length < 4) {
        // búsqueda por trámite
        const all = await must(ctx.user.from('painel_clientes').select('id, full_name, phone, tramites').limit(500)) as any[];
        const n = t.toLowerCase();
        rows = all.filter(c => (c.tramites || []).some((x: any) => String(x.servicio).toLowerCase().includes(n))).slice(0, 15);
      }
      return cut(rows);
    }
    case 'ver_cliente': {
      const id = args.client_id;
      const [client, tramites, docs, pagos] = await Promise.all([
        must(ctx.user.from('clients').select('id, full_name, preferred_name, phone, email, nationality, country, birth_date, status, lead_source, kommo_contact_id, created_at, last_contact_at').eq('id', id).maybeSingle()),
        must(ctx.user.from('asistente_tramites').select('*').eq('client_id', id)),
        must(ctx.user.from('documents').select('id, client_service_id, status, file_name, legivel, quality_notes, review_notes, extracted_data, created_at, document_types(name, description)').eq('client_id', id).order('created_at', { ascending: false })),
        must(ctx.user.from('payments').select('amount, currency, status, payment_method, paid_at, client_service_id').eq('client_id', id)),
      ]);
      if (!client) return cut({ error: 'Cliente no encontrado' });
      const ids = (tramites as any[]).map(t => t.client_service_id);
      const campos = ids.length
        ? await must(ctx.user.from('client_service_field_values').select('client_service_id, value, service_fields(name, label)').in('client_service_id', ids)) as any[]
        : [];
      const eventos = ids.length
        ? await must(ctx.user.from('client_service_events').select('client_service_id, event_type, metadata, created_at').in('client_service_id', ids).order('created_at', { ascending: false }).limit(25))
        : [];
      const relaciones = await must(ctx.user.from('client_relations_view').select('con_client_id, tipo').eq('de_client_id', id)) as any[];
      const relNombres = relaciones.length
        ? await must(ctx.user.from('clients').select('id, full_name').in('id', relaciones.map(r => r.con_client_id))) as any[]
        : [];
      const participa = await must(ctx.user.from('client_service_participants').select('rol, client_service_id').eq('client_id', id)) as any[];
      const tramitesParticipa = participa.length
        ? await must(ctx.user.from('asistente_tramites').select('*').in('client_service_id', participa.map(p => p.client_service_id))) as any[]
        : [];
      const participantes = ids.length
        ? await must(ctx.user.from('client_service_participants').select('client_service_id, rol, clients(id, full_name)').in('client_service_id', ids)) as any[]
        : [];
      return cut({
        cliente: client,
        relaciones: relaciones.map(r => ({ tipo: r.tipo, client_id: r.con_client_id, nombre: relNombres.find(c => c.id === r.con_client_id)?.full_name })),
        tramites: (tramites as any[]).map(t => ({
          ...t,
          campos: campos.filter(c => c.client_service_id === t.client_service_id).map(c => ({ campo: c.service_fields?.name, etiqueta: c.service_fields?.label, valor: c.value })),
          otras_personas: participantes.filter(p => p.client_service_id === t.client_service_id).map(p => ({ rol: p.rol, client_id: p.clients?.id, nombre: p.clients?.full_name })),
        })),
        tramites_donde_participa: tramitesParticipa.map(t => ({ ...t, rol: participa.find(p => p.client_service_id === t.client_service_id)?.rol, titular: t.cliente })),
        documentos: docs, pagos, eventos_recientes: eventos,
      });
    }
    case 'conversacion': {
      const n = Math.min(Number(args.ultimos) || 80, 300);
      const rows = await must(ctx.user.from('messages').select('direction, sender_type, author_name, message_type, content, created_at').eq('client_id', args.client_id).order('created_at', { ascending: false }).limit(n)) as any[];
      return cut(rows.reverse().map(m => ({ de: m.direction === 'inbound' ? 'cliente' : (m.author_name || m.sender_type), tipo: m.message_type, texto: m.content, fecha: m.created_at })), 20000);
    }
    case 'listar_tramites': {
      let q = ctx.user.from('asistente_tramites').select('client_service_id, client_id, cliente, telefono, servicio, etapa, etapa_detalle, status, kommo_lead_id, dias_sin_cambios, docs_por_revisar, updated_at').order('updated_at', { ascending: true }).limit(60);
      if (args.servicio) q = q.ilike('servicio', `%${args.servicio}%`);
      if (args.etapa) q = q.or(`etapa.ilike.%${args.etapa}%,etapa_detalle.ilike.%${args.etapa}%`);
      if (args.parados_dias) q = q.gte('dias_sin_cambios', Number(args.parados_dias));
      if (args.con_docs_por_revisar) q = q.gt('docs_por_revisar', 0);
      if (args.solo_activos !== false) q = q.in('status', ['pending', 'in_progress', 'on_hold']);
      return cut(await must(q));
    }
    case 'checklist_tramite': {
      const t = await tramite(ctx, args.client_service_id); // valida acceso con RLS
      if (!t) return cut({ error: 'Trámite no encontrado' });
      if (!t.kommo_lead_id) return cut({ error: 'El trámite no tiene lead de Kommo' });
      return cut(await must(ctx.admin.rpc('checklist_caso', { p_kommo_lead_id: t.kommo_lead_id })));
    }
    case 'metricas': {
      const desde = args.desde || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
      const hasta = args.hasta || new Date().toISOString().slice(0, 10);
      const pagos = await must(ctx.user.from('payments').select('amount, status, paid_at, created_at, client_service_id').gte('created_at', desde).lte('created_at', hasta + 'T23:59:59')) as any[];
      const tram = await must(ctx.user.from('asistente_tramites').select('servicio, etapa, status, created_at')) as any[];
      const nuevos = tram.filter(t => t.created_at >= desde && t.created_at <= hasta + 'T23:59:59');
      const agrupar = (arr: any[], k: string) => arr.reduce((a, x) => { a[x[k] || '—'] = (a[x[k] || '—'] || 0) + 1; return a; }, {} as Record<string, number>);
      return cut({
        periodo: { desde, hasta },
        cobrado: pagos.filter(p => p.status === 'paid').reduce((s, p) => s + Number(p.amount || 0), 0),
        pagos: pagos.filter(p => p.status === 'paid').length,
        tramites_nuevos: nuevos.length,
        tramites_nuevos_por_servicio: agrupar(nuevos, 'servicio'),
        activos_por_etapa: agrupar(tram.filter(t => ['pending', 'in_progress', 'on_hold'].includes(t.status)), 'etapa'),
        por_mes: await must(ctx.user.from('asistente_metricas').select('*').order('mes', { ascending: false }).limit(6)),
      });
    }
    case 'catalogo_tramites': {
      const servicios = await must(ctx.user.from('services').select('id, name, description, default_price, active, service_stages(name, position, pipeline_stage_code), service_requirements(kind, label, required, ask_client)').order('position')) as any[];
      return cut(servicios.map(s => ({ ...s, service_stages: (s.service_stages || []).sort((a: any, b: any) => a.position - b.position) })));
    }
    case 'extraer_datos_conversacion':
      return await extraerDatos(ctx, args.client_id);

    // ── Acciones → propuestas ──
    case 'proponer_cambiar_etapa': {
      const t = await tramite(ctx, args.client_service_id);
      if (!t) return cut({ error: 'Trámite no encontrado' });
      const cs = await must(ctx.user.from('client_services').select('service_id').eq('id', t.client_service_id).single()) as any;
      const stages = await must(ctx.user.from('service_stages').select('id, name, pipeline_stage_code, pipeline_stages(name)').eq('service_id', cs.service_id).order('position')) as any[];
      const q = String(args.etapa).toLowerCase().replace(/[_\s]+/g, ' ');
      const norm = (s: string) => String(s || '').toLowerCase().replace(/[_\s]+/g, ' ');
      const st = stages.find(s => norm(s.name) === q) || stages.find(s => norm(s.pipeline_stages?.name) === q)
        || stages.find(s => norm(s.name).includes(q) || norm(s.pipeline_stages?.name).includes(q));
      if (!st) return cut({ error: 'Etapa no encontrada', etapas_posibles: stages.map(s => s.pipeline_stages?.name || s.name) });
      return cut(await proposal(ctx, 'cambiar_etapa', { client_service_id: t.client_service_id, stage_id: st.id },
        `Mover ${t.servicio} de ${t.cliente}: ${t.etapa || t.etapa_detalle || 'sin etapa'} → ${st.pipeline_stages?.name || st.name}`));
    }
    case 'proponer_cambiar_estado_tramite': {
      const t = await tramite(ctx, args.client_service_id);
      if (!t) return cut({ error: 'Trámite no encontrado' });
      const labels: Record<string, string> = { pending: 'Pendiente', in_progress: 'En curso', on_hold: 'En pausa', completed: 'Concluido', cancelled: 'Cancelado' };
      return cut(await proposal(ctx, 'cambiar_estado_tramite', { client_service_id: t.client_service_id, estado: args.estado },
        `Cambiar estado de ${t.servicio} de ${t.cliente} a ${labels[args.estado] || args.estado}`));
    }
    case 'proponer_revisar_documento': {
      const d = await must(ctx.user.from('documents').select('id, file_name, status, client_id, clients(full_name), document_types(name)').eq('id', args.document_id).maybeSingle()) as any;
      if (!d) return cut({ error: 'Documento no encontrado' });
      if (!args.aprobar && !args.motivo) return cut({ error: 'Para rechazar hace falta el motivo (se le explica al cliente).' });
      return cut(await proposal(ctx, 'revisar_documento', { document_id: d.id, aprobar: !!args.aprobar, motivo: args.motivo || null },
        `${args.aprobar ? 'Aprobar' : 'Rechazar'} ${d.document_types?.name || d.file_name} de ${d.clients?.full_name}${args.motivo ? ' — motivo: ' + args.motivo : ''}`));
    }
    case 'proponer_crear_tarea':
      return cut(await proposal(ctx, 'crear_tarea', { titulo: args.titulo, detalles: args.detalles || null, prioridad: args.prioridad || 'normal', vence_en: args.vence_en || null, client_id: args.client_id || null },
        `Crear tarea: ${args.titulo}${args.vence_en ? ' (vence ' + args.vence_en + ')' : ''}`));
    case 'proponer_cerrar_tarea': {
      const t = await must(ctx.user.from('tasks').select('id, title, status').eq('id', args.task_id).maybeSingle()) as any;
      if (!t) return cut({ error: 'Tarea no encontrada' });
      return cut(await proposal(ctx, 'cerrar_tarea', { task_id: t.id }, `Marcar como hecha: ${t.title}`));
    }
    case 'proponer_guardar_dato': {
      if (args.client_service_id) {
        const t = await tramite(ctx, args.client_service_id);
        if (!t) return cut({ error: 'Trámite no encontrado' });
        return cut(await proposal(ctx, 'guardar_datos', { filas: [{ destino: 'tramite', client_service_id: t.client_service_id, campo: args.campo, valor: args.valor, seleccionado: true }] },
          `Guardar en ${t.servicio} de ${t.cliente}: ${args.campo} = ${args.valor}`));
      }
      if (!CLIENT_FIELDS[args.campo]) return cut({ error: 'Campo de cliente no permitido', permitidos: Object.keys(CLIENT_FIELDS) });
      const c = await must(ctx.user.from('clients').select('id, full_name').eq('id', args.client_id).maybeSingle()) as any;
      if (!c) return cut({ error: 'Cliente no encontrado' });
      return cut(await proposal(ctx, 'guardar_datos', { filas: [{ destino: 'cliente', client_id: c.id, campo: args.campo, valor: args.valor, seleccionado: true }] },
        `Guardar en la ficha de ${c.full_name}: ${CLIENT_FIELDS[args.campo]} = ${args.valor}`));
    }
    case 'proponer_crear_servicio':
      return cut(await proposal(ctx, 'crear_servicio', { nombre: args.nombre, precio: args.precio ?? null, descripcion: args.descripcion || null },
        `Crear trámite "${args.nombre}"${args.precio != null ? ' con precio R$ ' + args.precio : ''} y etapas estándar`));
    case 'proponer_lista_documentos': {
      const items = (args.items || []).map((i: any) => ({ ...i, codigo: String(i.codigo || '').trim(), obligatorio: i.obligatorio !== false }));
      if (!items.length) return cut({ error: 'La lista está vacía' });
      return cut(await proposal(ctx, 'lista_documentos', { servicio: args.servicio, reemplazar: !!args.reemplazar, items },
        `${args.reemplazar ? 'Reemplazar' : 'Agregar a'} la lista de "${args.servicio}": ${items.map((i: any) => i.texto_cliente).join('; ')}`));
    }
    case 'proponer_respuesta_estandar':
      return cut(await proposal(ctx, 'respuesta_estandar', { titulo: args.titulo, contenido: args.contenido, categoria: args.categoria || 'respuestas' },
        `Guardar respuesta estándar: ${args.titulo}`));
    case 'proponer_actualizar_lead_kommo': {
      const campos = Object.fromEntries(['tramite', 'ciudad_br', 'pais_origen', 'pasaporte'].filter(k => args[k]).map(k => [k, args[k]]));
      if (!Object.keys(campos).length) return cut({ error: 'No hay campos para actualizar' });
      return cut(await proposal(ctx, 'actualizar_lead_kommo', { kommo_lead_id: args.kommo_lead_id, campos },
        `Completar en Kommo el lead ${args.kommo_lead_id}: ${Object.entries(campos).map(([k, v]) => k + ' = ' + v).join(', ')}`));
    }
    case 'proponer_relacionar_clientes': {
      const cs = await must(ctx.user.from('clients').select('id, full_name').in('id', [args.client_id, args.relacionado_id])) as any[];
      const a = cs.find(c => c.id === args.client_id);
      const b = cs.find(c => c.id === args.relacionado_id);
      if (!a || !b) return cut({ error: 'Cliente no encontrado' });
      return cut(await proposal(ctx, 'relacionar_clientes', { client_id: a.id, relacionado_id: b.id, tipo: args.tipo },
        `Registrar que ${b.full_name} es ${args.tipo.replace('_', ' ')} de ${a.full_name}`));
    }
    case 'proponer_agregar_participante': {
      const t = await tramite(ctx, args.client_service_id);
      const c = await must(ctx.user.from('clients').select('id, full_name').eq('id', args.client_id).maybeSingle()) as any;
      if (!t || !c) return cut({ error: 'Trámite o cliente no encontrado' });
      return cut(await proposal(ctx, 'agregar_participante', { client_service_id: t.client_service_id, client_id: c.id, rol: args.rol },
        `Incluir a ${c.full_name} (${args.rol}) en ${t.servicio} de ${t.cliente}`));
    }
    case 'proponer_generar_documento': {
      const t = await tramite(ctx, args.client_service_id);
      if (!t) return cut({ error: 'Trámite no encontrado' });
      return cut(await proposal(ctx, 'generar_documento', { client_service_id: t.client_service_id, kommo_lead_id: t.kommo_lead_id, documento: args.documento },
        `Generar ${args.documento} para ${t.servicio} de ${t.cliente} y guardarlo en su carpeta de Drive`));
    }
    default: {
      if (
        name.includes('_ads') ||
        name.startsWith('proponer_cambiar_estado_campana') ||
        name.startsWith('proponer_cambiar_presupuesto_campana') ||
        name.startsWith('proponer_crear_campana_ads')
      ) {
        return cut(await runAdsTool(ctx, name, args));
      }
      return cut({ error: 'Herramienta desconocida: ' + name });
    }
  }
}

// ── Extracción de datos desde la conversación ─────────────────────────────
async function extraerDatos(ctx: Ctx, clientId: string): Promise<string> {
  const client = await must(ctx.user.from('clients').select('id, full_name, preferred_name, email, nationality, country, birth_date, phone').eq('id', clientId).maybeSingle()) as any;
  if (!client) return cut({ error: 'Cliente no encontrado' });

  const tram = await must(ctx.user.from('client_services').select('id, service_id, services(name)').eq('client_id', clientId)) as any[];
  const serviceIds = [...new Set(tram.map(t => t.service_id))];
  const fields = serviceIds.length ? await must(ctx.user.from('service_fields').select('service_id, name, label').in('service_id', serviceIds)) as any[] : [];
  const values = tram.length ? await must(ctx.user.from('client_service_field_values').select('client_service_id, value, service_fields(name)').in('client_service_id', tram.map(t => t.id))) as any[] : [];
  const msgs = await must(ctx.user.from('messages').select('direction, content, created_at').eq('client_id', clientId).not('content', 'is', null).order('created_at', { ascending: false }).limit(300)) as any[];
  const docs = await must(ctx.user.from('documents').select('extracted_data, created_at, document_types(name)').eq('client_id', clientId)) as any[];

  const ocultos = new Set(['Gmail_Draft_ID', 'Pasta_Drive_ID', 'Pasta_Drive_Link', 'Declaracao_Recebida']);
  const destinos: any[] = Object.entries(CLIENT_FIELDS).map(([campo, label]) => ({ clave: 'cliente.' + campo, destino: 'cliente', campo, label, actual: client[campo] ?? null }));
  for (const t of tram) {
    for (const f of fields.filter(f => f.service_id === t.service_id && !ocultos.has(f.name))) {
      destinos.push({
        clave: 'tramite.' + t.id + '.' + f.name, destino: 'tramite', client_service_id: t.id, campo: f.name,
        label: `${f.label} (${t.services?.name})`,
        actual: values.find(v => v.client_service_id === t.id && v.service_fields?.name === f.name)?.value ?? null,
      });
    }
  }

  const conversacion = msgs.reverse().map(m => `[${m.created_at.slice(0, 16)}] ${m.direction === 'inbound' ? 'CLIENTE' : 'EQUIPO'}: ${m.content}`).join('\n').slice(-24000);
  const deDocs = docs.filter(d => d.extracted_data && Object.keys(d.extracted_data).length)
    .map(d => `[${d.created_at.slice(0, 10)}] documento ${d.document_types?.name}: ${JSON.stringify(d.extracted_data)}`).join('\n');

  if (!conversacion && !deDocs) return cut({ resultado: 'No hay conversación ni datos de documentos guardados para este cliente todavía.' });

  const res = await ctx.groq({
    model: 'openai/gpt-oss-120b', temperature: 0, response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'Extraes datos de un cliente de una oficina de trámites migratorios a partir de su conversación de WhatsApp y de datos leídos de sus documentos. Devuelve SOLO un objeto JSON con la forma { "datos": [ { "clave": "...", "valor": "...", "fuente": "fecha y fragmento corto del mensaje o documento", "confianza": 0.0 } ] }. Usa únicamente estas claves: ' + JSON.stringify(destinos.map(d => ({ clave: d.clave, dato: d.label }))) + '. Solo datos del propio cliente dichos o mostrados de forma explícita (no del equipo, no de terceros salvo filiación). No inventes. Fechas en dd/mm/aaaa. Si no hay datos devuelve { "datos": [ ] } .' },
      { role: 'user', content: 'CONVERSACIÓN:\n' + conversacion + '\n\nDATOS DE DOCUMENTOS:\n' + (deDocs || '(ninguno)') },
    ],
  });
  let encontrados: any[] = [];
  try { encontrados = JSON.parse(res.choices?.[0]?.message?.content || '{}').datos || []; } catch { encontrados = []; }

  const norm = (v: unknown) => String(v ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const filas = encontrados
    .map((e: any) => {
      const d = destinos.find(x => x.clave === e.clave);
      if (!d || !e.valor || !String(e.valor).trim()) return null;
      const igual = d.actual && norm(d.actual) === norm(e.valor);
      if (igual) return null;
      const conflicto = !!d.actual;
      const confianza = Number(e.confianza) || 0;
      return {
        destino: d.destino, client_id: clientId, client_service_id: d.client_service_id || null, campo: d.campo, label: d.label,
        valor: String(e.valor).trim(), actual: d.actual, conflicto, fuente: e.fuente || null, confianza,
        seleccionado: !conflicto && confianza >= 0.6,
      };
    })
    .filter(Boolean);

  if (!filas.length) return cut({ resultado: 'No encontré datos nuevos: lo que aparece en la conversación ya está guardado o no hay datos personales.' });

  const out = await proposal(ctx, 'guardar_datos', { filas },
    `Guardar ${filas.length} dato(s) encontrados en la conversación de ${client.full_name} (elige cuáles)`);
  return cut({ ...out, filas: filas.map((f: any) => ({ dato: f.label, valor: f.valor, actual: f.actual, conflicto: f.conflicto })) });
}

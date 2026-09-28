import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import { Bot, BotOff, ExternalLink, GraduationCap, MessageSquare, Phone, User, X } from 'lucide-react';
import NoraAprendizajes, { APRENDIZAJES_KEY } from './NoraAprendizajes';
import NoraEntrenador from './NoraEntrenador';
import { getAprendizajesNora } from '../services/comercialService';
import { getComercialLeads, getConversacionLead, getMotivoPausa, moverEtapaLead, setAtendentePausado, enviarMensajeLead, enviarArchivoLead, ETAPAS_COMERCIAL, ETAPA_SUPERVISOR, CONVERSACION_LIMIT } from '../services/comercialService';
import { useAuth } from '@features/auth/context/AuthContext';
import { KOMMO_LEAD_URL } from '@features/clients/services/clientsService';
import { Conversation, ReplyBox } from '@features/clients/components/ClientDetailView';

const QUERY_KEY = ['comercial_leads'];

function money(v) {
  if (v === null || v === undefined || v === '') return null;
  return `R$ ${Number(v).toFixed(2)}`;
}

function tieneMensajeNuevo(lead) {
  if (!lead.last_inbound_at) return false;
  return !lead.last_atendido_at || new Date(lead.last_inbound_at) > new Date(lead.last_atendido_at);
}

const ETAPA_PAGO = 111919155;
const ETAPA_PAGADO = 111919159;
const ETAPAS_CERRADAS = new Set([142, 143]);

// Clientes simulados con los que se entrena a Nora (+55 00 …): no son ventas reales.
const esPrueba = (lead) => (lead.telefono || '').replace(/\D/g, '').startsWith('5500');

// Nora pausada (esperando al dueño) o un mensaje del cliente sin contestar hace más de 10 minutos.
const necesitaAtencion = (lead) => {
  if (ETAPAS_CERRADAS.has(lead.etapa_status_id)) return false;
  if (lead.atendente_pausado) return true;
  return tieneMensajeNuevo(lead) && Date.now() - new Date(lead.last_inbound_at) > 10 * 60 * 1000;
};

function Kpi({ label, value, sub, tone = 'text-chrome-text-active', onClick, active }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick}
      className={`min-w-[8.5rem] rounded-lg border px-3 py-2 text-left ${active ? 'border-brand-primary bg-brand-primary/10' : 'border-chrome-border bg-chrome-bg-raised'} ${onClick ? 'hover:border-brand-primary/60' : ''}`}>
      <p className="text-[11px] uppercase tracking-wide text-chrome-text-muted">{label}</p>
      <p className={`text-lg font-semibold ${tone}`}>{value}</p>
      {sub && <p className="text-[11px] text-chrome-text-muted">{sub}</p>}
    </Tag>
  );
}

// Por qué Nora se pausó con este cliente (la consulta que dejó en Hoy).
function MotivoPausa({ kommoLeadId }) {
  const { data } = useQuery({
    queryKey: ['comercial_motivo_pausa', kommoLeadId],
    queryFn: () => getMotivoPausa(kommoLeadId),
  });
  if (!data) return null;
  return (
    <div className="border-b border-chrome-border bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
      <b>Por qué paró Nora:</b> {data.detalhes || data.titulo}
    </div>
  );
}

function fechaHora(v) {
  if (!v) return '—';
  return new Date(v).toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const PLANES = { mitad: 'Mitad ahora', al_final: 'Paga al final' };

// Cómo va el cobro de un lead que ya recibió los datos de pago.
function EstadoPago({ lead }) {
  const chips = [];
  if (PLANES[lead.plan_pago]) chips.push(['bg-violet-500/15 text-violet-300', PLANES[lead.plan_pago]]);
  if (lead.enviado_operacional_at) chips.push(['bg-green-500/15 text-green-300', 'En Operacional']);
  else if (lead.comprobante_at) chips.push(['bg-green-500/15 text-green-300', `Comprobante${lead.comprobante_monto ? ` R$ ${Number(lead.comprobante_monto).toFixed(0)}` : ''} · verificar`]);
  else if (lead.recordatorio_pago_at) chips.push(['bg-amber-500/15 text-amber-300', 'Se le recordó el comprobante']);
  // Seguimientos que Nora le mandó desde su último mensaje (máximo 2 dentro de la ventana de 24 h de WhatsApp).
  if (lead.seguimiento_intentos > 0 && lead.seguimiento_ultimo_at && (!lead.last_inbound_at || new Date(lead.seguimiento_ultimo_at) > new Date(lead.last_inbound_at))) {
    chips.push(['bg-sky-500/15 text-sky-300', `Seguimiento ${lead.seguimiento_intentos}/2`]);
  }
  if (!chips.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {chips.map(([cls, txt]) => <span key={txt} className={`rounded-full px-1.5 py-0.5 text-[10px] ${cls}`}>{txt}</span>)}
    </div>
  );
}

function LeadCard({ lead, dragging = false, onOpen }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id, data: lead });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => onOpen?.(lead)}
      className={`cursor-grab select-none rounded-lg border border-chrome-border bg-chrome-bg-raised p-3 text-sm shadow-sm transition-colors hover:border-brand-primary/60 active:cursor-grabbing ${isDragging ? 'opacity-30' : ''} ${dragging ? 'rotate-2 shadow-lg' : ''}`}
    >
      <div className="flex items-center gap-1.5 font-medium text-chrome-text-active">
        <User size={13} className="shrink-0 text-chrome-text-muted" />
        <span className="truncate">{lead.nombre || 'Sin nombre'}</span>
        {lead.atendente_pausado && (
          <span title="Atendente IA desactivado para este lead" className="ml-auto shrink-0 text-amber-400"><BotOff size={13} /></span>
        )}
        {tieneMensajeNuevo(lead) && (
          <span title="Mensaje nuevo del cliente" className="ml-auto h-2 w-2 shrink-0 rounded-full bg-green-400" />
        )}
      </div>
      {lead.telefono && (
        <div className="mt-1 flex items-center gap-1.5 text-xs text-chrome-text-muted">
          <Phone size={12} className="shrink-0" />
          <span className="truncate">{lead.telefono}</span>
        </div>
      )}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-chrome-text-muted">{lead.tramite_texto || 'Trámite por definir'}</span>
        {money(lead.precio) && <span className="text-xs font-semibold text-green-400">{money(lead.precio)}</span>}
      </div>
      <EstadoPago lead={lead} />
      <a
        href={KOMMO_LEAD_URL(lead.kommo_lead_id)}
        target="_blank"
        rel="noreferrer"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="mt-2 inline-flex items-center gap-1 text-xs text-sky-400 hover:underline"
      >
        Ver en Kommo <ExternalLink size={11} />
      </a>
    </div>
  );
}

function Column({ etapa, leads, onOpen }) {
  const { setNodeRef, isOver } = useDroppable({ id: String(etapa.statusId) });
  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-xl border ${isOver ? 'border-brand-primary bg-chrome-bg-active/40' : 'border-chrome-border bg-chrome-bg'}`}
    >
      <header className={`flex items-center justify-between border-b border-chrome-border px-3 py-2.5 ${etapa.statusId === ETAPA_SUPERVISOR && leads.length ? 'rounded-t-xl bg-red-500/15' : ''}`}>
        <h3 className={`text-sm font-semibold ${etapa.statusId === ETAPA_SUPERVISOR && leads.length ? 'text-red-300' : 'text-chrome-text-active'}`}>{etapa.nombre}</h3>
        <span className="rounded-full bg-chrome-bg-raised px-2 py-0.5 text-xs text-chrome-text-muted">{leads.length}</span>
      </header>
      <div className="flex min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto p-2.5">
        {leads.map((lead) => <LeadCard key={lead.id} lead={lead} onOpen={onOpen} />)}
        {leads.length === 0 && <p className="p-2 text-center text-xs text-chrome-text-muted">Sin leads</p>}
      </div>
    </div>
  );
}

function Dato({ label, children }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-chrome-text-muted">{label}</p>
      <p className="text-sm text-chrome-text-active">{children}</p>
    </div>
  );
}

function LeadDrawer({ lead, onClose }) {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();
  const [cambiandoIA, setCambiandoIA] = useState(false);
  const [entrenando, setEntrenando] = useState(false);
  const conversacionKey = ['comercial_conversacion', lead.kommo_lead_id];

  const refrescar = () => {
    queryClient.invalidateQueries({ queryKey: conversacionKey });
    queryClient.invalidateQueries({ queryKey: QUERY_KEY });
  };

  const toggleAtendente = async (pausar = !lead.atendente_pausado) => {
    setCambiandoIA(true);
    try {
      await setAtendentePausado(lead.id, pausar);
      // Nora vuelve a atender a un cliente que esperaba al supervisor: el lead regresa a la etapa donde estaba.
      if (!pausar && lead.etapa_status_id === ETAPA_SUPERVISOR && lead.etapa_previa_status_id) {
        await moverEtapaLead(lead.kommo_lead_id, { statusId: lead.etapa_previa_status_id, nombre: lead.etapa_previa_nombre, position: lead.etapa_previa_position });
        queryClient.invalidateQueries({ queryKey: QUERY_KEY });
      }
      queryClient.setQueryData(QUERY_KEY, (old) => (old || []).map((l) => (l.id === lead.id ? { ...l, atendente_pausado: pausar } : l)));
      toast.success(pausar ? 'Atendente IA desactivado para este lead' : 'Atendente IA activado para este lead');
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'No se pudo cambiar el atendente.');
    } finally {
      setCambiandoIA(false);
    }
  };

  const onSend = async (mensaje) => { await enviarMensajeLead(lead.kommo_lead_id, mensaje); refrescar(); };
  const onSendFile = async (file, caption) => { await enviarArchivoLead(userProfile.organization_id, lead.kommo_lead_id, file, caption); refrescar(); };

  const { data: mensajes, isLoading, error } = useQuery({
    queryKey: conversacionKey,
    queryFn: () => getConversacionLead(lead.kommo_lead_id, lead.kommo_contact_id),
    refetchInterval: 15000,
  });

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[200] flex justify-end bg-black/40" onClick={onClose}>
      <div
        className={`flex h-full w-full flex-col md:flex-row ${entrenando ? 'max-w-[66rem]' : 'max-w-[32rem]'}`}
        onClick={(e) => e.stopPropagation()}
      >
      <aside
        className={`flex min-h-0 w-full flex-col border-l border-chrome-border bg-chrome-bg shadow-2xl md:h-full md:max-w-[32rem] ${entrenando ? 'h-1/2' : 'h-full'}`}
      >
        <header className="flex items-start justify-between gap-3 border-b border-chrome-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-chrome-text-active">{lead.nombre || 'Sin nombre'}</h2>
            <p className="text-xs text-chrome-text-muted">{lead.etapa_nombre || 'Sin etapa'}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {!entrenando && (
              <button
                onClick={() => setEntrenando(true)}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-brand-primary hover:bg-chrome-bg-raised"
              >
                <GraduationCap size={13} /> Enseñarle a Nora
              </button>
            )}
            <a
              href={KOMMO_LEAD_URL(lead.kommo_lead_id)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-sky-400 hover:bg-chrome-bg-raised"
            >
              Kommo <ExternalLink size={12} />
            </a>
            <button onClick={onClose} aria-label="Cerrar" className="rounded-md p-1.5 text-chrome-text hover:bg-chrome-bg-raised hover:text-chrome-text-active">
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-3 border-b border-chrome-border px-4 py-3">
          <Dato label="Teléfono">{lead.telefono || '—'}</Dato>
          <Dato label="Trámite">{lead.tramite_texto || 'Por definir'}</Dato>
          <Dato label="Precio">{money(lead.precio) || '—'}</Dato>
          <Dato label="Atendente">
            {lead.propuesta_enviada ? 'Propuesta enviada' : lead.bienvenida_enviada ? 'Bienvenida enviada' : 'Sin contacto aún'}
          </Dato>
          <Dato label="Último mensaje del cliente">{fechaHora(lead.last_inbound_at)}</Dato>
          <Dato label="Última respuesta">{fechaHora(lead.last_atendido_at)}</Dato>
        </div>

        <div className="flex items-center justify-between gap-3 border-b border-chrome-border px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm">
            {lead.atendente_pausado ? <BotOff size={16} className="text-amber-400" /> : <Bot size={16} className="text-green-400" />}
            <span className="text-chrome-text-active">Atendente IA {lead.atendente_pausado ? 'desactivado' : 'activado'}</span>
            <span className="text-xs text-chrome-text-muted">solo para este lead</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={!lead.atendente_pausado}
            aria-label="Activar o desactivar el atendente IA para este lead"
            disabled={cambiandoIA}
            onClick={() => toggleAtendente()}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${lead.atendente_pausado ? 'bg-zinc-600' : 'bg-green-500'}`}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${lead.atendente_pausado ? 'left-0.5' : 'left-[22px]'}`} />
          </button>
        </div>
        {lead.atendente_pausado && <MotivoPausa kommoLeadId={lead.kommo_lead_id} />}

        <div className="flex items-center gap-2 px-4 pt-3 text-sm font-semibold text-chrome-text-active">
          <MessageSquare size={15} /> Conversación
          {mensajes && <span className="text-xs font-normal text-chrome-text-muted">{mensajes.length}</span>}
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {isLoading && <p className="text-sm text-chrome-text-muted">Cargando conversación…</p>}
          {error && <p className="text-sm text-red-400">No se pudo cargar la conversación.</p>}
          {mensajes && (
            <Conversation
              messages={mensajes}
              truncated={mensajes.length === CONVERSACION_LIMIT}
              emptyText="Todavía no hay mensajes guardados de este lead. El historial anterior está en Kommo; los mensajes nuevos van a aparecer acá."
            />
          )}
        </div>
        {lead.telefono ? (
          <ReplyBox onSend={onSend} onSendFile={onSendFile} />
        ) : (
          <div className="border-t border-chrome-border px-4 py-2 text-xs text-chrome-text-muted">Este lead no tiene teléfono registrado, no se le puede escribir desde acá.</div>
        )}
      </aside>
      {entrenando && (
        <section className="flex h-1/2 min-h-0 w-full flex-col border-l border-t border-chrome-border bg-chrome-bg shadow-2xl md:h-full md:border-t-0">
          <NoraEntrenador
            lead={lead}
            onClose={() => setEntrenando(false)}
            onReactivar={() => toggleAtendente(false)}
            onMensajeEnviado={refrescar}
          />
        </section>
      )}
      </div>
    </div>
  );
}

export default function ComercialView({ leadAbiertoKommoId = null, onAbrirLead }) {
  const queryClient = useQueryClient();
  const { data: leads, isLoading, error } = useQuery({ queryKey: QUERY_KEY, queryFn: getComercialLeads, refetchInterval: 30000 });
  const [activeLead, setActiveLead] = useState(null);
  // El lead abierto vive en la URL (#comercial/<kommo_lead_id>) para poder llegar directo desde Hoy.
  const [leadLocal, setLeadLocal] = useState(null);
  const abiertoId = onAbrirLead ? leadAbiertoKommoId : leadLocal;
  const abrirLead = (kommoLeadId) => (onAbrirLead ? onAbrirLead(kommoLeadId) : setLeadLocal(kommoLeadId));
  const leadAbierto = (leads || []).find((l) => l.kommo_lead_id === Number(abiertoId)) || null;
  const [busqueda, setBusqueda] = useState('');
  const [soloAtencion, setSoloAtencion] = useState(false);
  const [verPruebas, setVerPruebas] = useState(false);
  const [verAprendizajes, setVerAprendizajes] = useState(false);
  const { data: aprendizajes } = useQuery({ queryKey: APRENDIZAJES_KEY, queryFn: getAprendizajesNora, refetchInterval: 60000 });
  const porRevisar = (aprendizajes || []).filter((a) => a.estado === 'pendiente').length;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const digitos = q.replace(/\D/g, '');
    return (leads || []).filter((l) => {
      if (!verPruebas && esPrueba(l)) return false;
      if (soloAtencion && !necesitaAtencion(l)) return false;
      if (!q) return true;
      return [l.nombre, l.tramite_texto].some((t) => (t || '').toLowerCase().includes(q))
        || (digitos.length >= 3 && (l.telefono || '').replace(/\D/g, '').includes(digitos));
    });
  }, [leads, busqueda, soloAtencion, verPruebas]);

  const resumen = useMemo(() => {
    const reales = (leads || []).filter((l) => !esPrueba(l));
    const enPago = reales.filter((l) => l.etapa_status_id === ETAPA_PAGO);
    return {
      activos: reales.filter((l) => !ETAPAS_CERRADAS.has(l.etapa_status_id)).length,
      atencion: reales.filter(necesitaAtencion).length,
      enPago: enPago.length,
      montoEnPago: enPago.reduce((s, l) => s + (Number(l.precio) || 0), 0),
      comprobantes: enPago.filter((l) => l.comprobante_at).length,
      ganados: reales.filter((l) => l.etapa_status_id === 142 || l.etapa_status_id === ETAPA_PAGADO).length,
      pruebas: (leads || []).length - reales.length,
    };
  }, [leads]);

  const columnas = useMemo(() => {
    const porEtapa = new Map(ETAPAS_COMERCIAL.map((e) => [e.statusId, []]));
    for (const lead of visibles) {
      const bucket = porEtapa.get(lead.etapa_status_id);
      if (bucket) bucket.push(lead);
    }
    return ETAPAS_COMERCIAL.map((e) => ({ etapa: e, leads: porEtapa.get(e.statusId) || [] }));
  }, [visibles]);

  const onDragStart = (event) => {
    const lead = (leads || []).find((l) => l.id === event.active.id);
    setActiveLead(lead || null);
  };

  const onDragEnd = async (event) => {
    setActiveLead(null);
    const { active, over } = event;
    if (!over) return;
    const lead = (leads || []).find((l) => l.id === active.id);
    if (!lead) return;
    const nuevaEtapa = ETAPAS_COMERCIAL.find((e) => String(e.statusId) === over.id);
    if (!nuevaEtapa || nuevaEtapa.statusId === lead.etapa_status_id) return;

    const anterior = queryClient.getQueryData(QUERY_KEY);
    queryClient.setQueryData(QUERY_KEY, (old) =>
      (old || []).map((l) => (l.id === lead.id ? { ...l, etapa_status_id: nuevaEtapa.statusId, etapa_nombre: nuevaEtapa.nombre, etapa_position: nuevaEtapa.position } : l))
    );

    try {
      await moverEtapaLead(lead.kommo_lead_id, nuevaEtapa);
      toast.success(`Movido a "${nuevaEtapa.nombre}"`);
      queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'No se pudo mover el lead en Kommo.');
      queryClient.setQueryData(QUERY_KEY, anterior);
    }
  };

  if (isLoading) {
    return <div className="flex h-full items-center justify-center text-sm text-chrome-text-muted">Cargando funnel Comercial…</div>;
  }
  if (error) {
    return <div className="flex h-full items-center justify-center text-sm text-red-400">No se pudo cargar el funnel Comercial.</div>;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-chrome-text-active">Comercial</h1>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar nombre, teléfono o trámite…"
          className="ml-auto w-64 max-w-full rounded-lg border border-chrome-border bg-chrome-bg-raised px-3 py-1.5 text-sm text-chrome-text-active outline-none placeholder:text-chrome-text-muted focus:border-brand-primary"
        />
        <button
          onClick={() => setVerAprendizajes(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-chrome-border bg-chrome-bg-raised px-3 py-1.5 text-sm text-chrome-text-active hover:border-brand-primary/60"
        >
          <GraduationCap size={15} /> Lo que aprende Nora
          {porRevisar > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-black">{porRevisar}</span>}
        </button>
      </div>
      <div className="mb-3 flex flex-wrap items-stretch gap-2">
        <Kpi label="Leads activos" value={resumen.activos} />
        <Kpi label="Te necesitan" value={resumen.atencion} tone={resumen.atencion ? 'text-amber-400' : 'text-chrome-text-active'}
          sub={soloAtencion ? 'Mostrando solo estos' : 'Nora pausada o sin respuesta'} onClick={() => setSoloAtencion((v) => !v)} active={soloAtencion} />
        <Kpi label="Esperando pago" value={resumen.enPago} sub={`${money(resumen.montoEnPago) || 'R$ 0.00'}${resumen.comprobantes ? ` · ${resumen.comprobantes} con comprobante` : ''}`} tone="text-sky-400" />
        <Kpi label="Ganados" value={resumen.ganados} sub="Pasaron a Operacional" tone="text-green-400" />
        {resumen.pruebas > 0 && (
          <label className="ml-auto flex cursor-pointer items-center gap-2 self-center text-xs text-chrome-text-muted">
            <input type="checkbox" checked={verPruebas} onChange={(e) => setVerPruebas(e.target.checked)} />
            Mostrar {resumen.pruebas} de prueba
          </label>
        )}
      </div>
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex flex-1 gap-3 overflow-x-auto pb-2">
          {columnas.map(({ etapa, leads: leadsEtapa }) => (
            <Column key={etapa.statusId} etapa={etapa} leads={leadsEtapa} onOpen={(l) => abrirLead(l.kommo_lead_id)} />
          ))}
        </div>
        <DragOverlay>{activeLead ? <LeadCard lead={activeLead} dragging /> : null}</DragOverlay>
      </DndContext>
      {leadAbierto && <LeadDrawer lead={leadAbierto} onClose={() => abrirLead(null)} />}
      {verAprendizajes && <NoraAprendizajes onClose={() => setVerAprendizajes(false)} />}
    </div>
  );
}

import React, { useMemo, useState } from 'react';
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
} from '@dnd-kit/core';
import { useDraggable } from '@dnd-kit/core';
import { ExternalLink, Phone, User } from 'lucide-react';
import { getComercialLeads, moverEtapaLead, ETAPAS_COMERCIAL } from '../services/comercialService';
import { KOMMO_LEAD_URL } from '@features/clients/services/clientsService';

const QUERY_KEY = ['comercial_leads'];

function money(v) {
  if (v === null || v === undefined || v === '') return null;
  return `R$ ${Number(v).toFixed(2)}`;
}

function LeadCard({ lead, dragging = false }) {
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
      className={`cursor-grab select-none rounded-lg border border-chrome-border bg-chrome-bg-raised p-3 text-sm shadow-sm active:cursor-grabbing ${isDragging ? 'opacity-30' : ''} ${dragging ? 'rotate-2 shadow-lg' : ''}`}
    >
      <div className="flex items-center gap-1.5 font-medium text-chrome-text-active">
        <User size={13} className="shrink-0 text-chrome-text-muted" />
        <span className="truncate">{lead.nombre || 'Sin nombre'}</span>
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
      <a
        href={KOMMO_LEAD_URL(lead.kommo_lead_id)}
        target="_blank"
        rel="noreferrer"
        onPointerDown={(e) => e.stopPropagation()}
        className="mt-2 inline-flex items-center gap-1 text-xs text-sky-400 hover:underline"
      >
        Ver en Kommo <ExternalLink size={11} />
      </a>
    </div>
  );
}

function Column({ etapa, leads }) {
  const { setNodeRef, isOver } = useDroppable({ id: String(etapa.statusId) });
  return (
    <div
      ref={setNodeRef}
      className={`flex w-72 shrink-0 flex-col rounded-xl border ${isOver ? 'border-brand-primary bg-chrome-bg-active/40' : 'border-chrome-border bg-chrome-bg'}`}
    >
      <header className="flex items-center justify-between border-b border-chrome-border px-3 py-2.5">
        <h3 className="text-sm font-semibold text-chrome-text-active">{etapa.nombre}</h3>
        <span className="rounded-full bg-chrome-bg-raised px-2 py-0.5 text-xs text-chrome-text-muted">{leads.length}</span>
      </header>
      <div className="flex min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto p-2.5">
        {leads.map((lead) => <LeadCard key={lead.id} lead={lead} />)}
        {leads.length === 0 && <p className="p-2 text-center text-xs text-chrome-text-muted">Sin leads</p>}
      </div>
    </div>
  );
}

export default function ComercialView() {
  const queryClient = useQueryClient();
  const { data: leads, isLoading, error } = useQuery({ queryKey: QUERY_KEY, queryFn: getComercialLeads });
  const [activeLead, setActiveLead] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const columnas = useMemo(() => {
    const porEtapa = new Map(ETAPAS_COMERCIAL.map((e) => [e.statusId, []]));
    for (const lead of leads || []) {
      const bucket = porEtapa.get(lead.etapa_status_id);
      if (bucket) bucket.push(lead);
      // Leads en una etapa que no tiene columna (ej. "Incoming leads" sin calificar) quedan ocultos del tablero a propósito.
    }
    return ETAPAS_COMERCIAL.map((e) => ({ etapa: e, leads: porEtapa.get(e.statusId) || [] }));
  }, [leads]);

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
      <h1 className="mb-3 text-lg font-semibold text-chrome-text-active">Comercial</h1>
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex flex-1 gap-3 overflow-x-auto pb-2">
          {columnas.map(({ etapa, leads: leadsEtapa }) => (
            <Column key={etapa.statusId} etapa={etapa} leads={leadsEtapa} />
          ))}
        </div>
        <DragOverlay>{activeLead ? <LeadCard lead={activeLead} dragging /> : null}</DragOverlay>
      </DndContext>
    </div>
  );
}

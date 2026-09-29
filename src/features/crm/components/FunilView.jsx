import React, { useMemo, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors, useDroppable, useDraggable } from '@dnd-kit/core';
import { RefreshCw, Search, CloudOff } from 'lucide-react';
import { useCrmData, useMoveLead, useUnsynced, useRetryUnsynced } from '../useCrm';
import LeadPanel from './LeadPanel';
import { money, relTime, normalize, inputCls, btnCls } from '../format';

function Card({ lead, teamById, tagNames, dragging = false, onOpen }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id, data: lead });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onOpen?.(lead)}
      className={`cursor-grab select-none rounded-md border border-border bg-bg-surface px-2.5 py-2 text-[13px] hover:border-border-hover active:cursor-grabbing ${isDragging ? 'opacity-30' : ''} ${dragging ? 'shadow-md' : ''}`}
    >
      <div className="flex items-center gap-1.5">
        <span className="truncate font-medium text-text-primary">{lead.name || 'Sin nombre'}</span>
        {lead.needs_reply && <span title="Mensaje sin responder" className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-success" />}
      </div>
      <div className="mt-0.5 flex items-center justify-between text-xs text-text-muted">
        <span className="truncate">{lead.service_label || 'Trámite por definir'}</span>
        {money(lead.value) && <span className="ml-2 shrink-0 font-medium text-text-secondary">{money(lead.value)}</span>}
      </div>
      <div className="mt-1 flex items-center gap-1 text-[11px] text-text-muted">
        <span className="truncate">{[lead.country, teamById[lead.assigned_to]].filter(Boolean).join(' · ')}</span>
        <span className="ml-auto shrink-0">{relTime(lead.updated_at)}</span>
      </div>
      {tagNames.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {tagNames.slice(0, 3).map((t) => <span key={t} className="rounded bg-bg-elevated px-1 py-px text-[10px] text-text-secondary">{t}</span>)}
        </div>
      )}
    </div>
  );
}

function Column({ stage, leads, ...rest }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = leads.reduce((s, l) => s + (Number(l.value) || 0), 0);
  return (
    <section ref={setNodeRef} className={`flex w-64 shrink-0 flex-col rounded-lg border ${isOver ? 'border-brand-primary bg-brand-primary-light' : 'border-border bg-bg-base'}`}>
      <header className="flex items-baseline gap-2 border-b border-border px-2.5 py-2">
        <h3 className="truncate text-[13px] font-semibold text-text-primary" style={stage.color ? { color: stage.color } : undefined}>{stage.name}</h3>
        <span className="text-xs text-text-muted">{leads.length}</span>
        {total > 0 && <span className="ml-auto text-xs text-text-muted">{money(total)}</span>}
      </header>
      <div className="flex min-h-[80px] flex-1 flex-col gap-1.5 overflow-y-auto p-1.5">
        {leads.map((l) => <Card key={l.id} lead={l} {...rest} tagNames={rest.tagsByLead[l.id] || []} />)}
        {leads.length === 0 && <p className="p-2 text-center text-xs text-text-muted">Sin leads</p>}
      </div>
    </section>
  );
}

export default function FunilView({ onNavigateToClient, onOpenChat }) {
  const { pipelines, leads, tags, leadTags, stages, teamById } = useCrmData();
  const unsynced = useUnsynced();
  const retry = useRetryUnsynced();
  const move = useMoveLead(stages);
  const [pipelineId, setPipelineId] = useState(null);
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  const pipeline = (pipelines.data || []).find((p) => p.id === pipelineId) || (pipelines.data || []).find((p) => p.is_default) || pipelines.data?.[0];
  const tagsByLead = useMemo(() => {
    const byId = Object.fromEntries((tags.data || []).map((t) => [t.id, t.name]));
    const out = {};
    for (const lt of leadTags.data || []) (out[lt.lead_id] ||= []).push(byId[lt.tag_id]);
    return out;
  }, [tags.data, leadTags.data]);

  const visible = useMemo(() => {
    const q = normalize(search).trim();
    return (leads.data || []).filter((l) => l.pipeline_id === pipeline?.id && (!q || normalize(`${l.name} ${l.phone} ${l.service_label}`).includes(q)));
  }, [leads.data, pipeline, search]);

  const byStage = useMemo(() => {
    const m = {};
    for (const l of visible) (m[l.stage_id] ||= []).push(l);
    return m;
  }, [visible]);

  const active = visible.find((l) => l.id === activeId);
  const open = (leads.data || []).find((l) => l.id === openId);

  const onDragEnd = ({ active: a, over }) => {
    setActiveId(null);
    const lead = (leads.data || []).find((l) => l.id === a.id);
    if (lead && over) move(lead, over.id);
  };

  if (pipelines.isLoading || leads.isLoading) return <p className="p-6 text-sm text-text-muted">Cargando…</p>;
  if (leads.error) return <p className="p-6 text-sm text-danger">No se pudieron cargar los leads: {leads.error.message}</p>;
  if (!pipeline) return <p className="p-6 text-sm text-text-muted">Todavía no hay un embudo configurado.</p>;

  return (
    <div className="flex h-full min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
          <h1 className="text-[15px] font-semibold text-text-primary">Funis</h1>
          {(pipelines.data || []).length > 1 && (
            <select className={`${inputCls} !w-auto`} value={pipeline.id} onChange={(e) => setPipelineId(e.target.value)}>
              {pipelines.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <span className="text-xs text-text-muted">{visible.length} leads</span>
          <div className="relative ml-auto w-56">
            <Search size={13} className="absolute left-2 top-2 text-text-muted" />
            <input className={`${inputCls} !pl-7`} placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          {unsynced.data?.length > 0 && (
            <button className={btnCls} onClick={retry} title="Cambios guardados que todavía no llegaron a Kommo">
              <CloudOff size={13} /> {unsynced.data.length} sin sincronizar <RefreshCw size={12} />
            </button>
          )}
        </div>
        <DndContext sensors={sensors} onDragStart={(e) => setActiveId(e.active.id)} onDragCancel={() => setActiveId(null)} onDragEnd={onDragEnd}>
          <div className="flex min-h-0 flex-1 gap-2 overflow-x-auto p-3">
            {pipeline.stages.map((s) => <Column key={s.id} stage={s} leads={byStage[s.id] || []} teamById={teamById} tagsByLead={tagsByLead} onOpen={(l) => setOpenId(l.id)} />)}
          </div>
          <DragOverlay>{active ? <Card lead={active} teamById={teamById} tagNames={tagsByLead[active.id] || []} dragging /> : null}</DragOverlay>
        </DndContext>
      </div>
      {open && <LeadPanel key={open.id} lead={open} onClose={() => setOpenId(null)} onOpenClient={onNavigateToClient} onOpenChat={onOpenChat} />}
    </div>
  );
}

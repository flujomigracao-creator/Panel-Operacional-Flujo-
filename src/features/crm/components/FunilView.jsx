import React, { useMemo, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors, useDroppable, useDraggable } from '@dnd-kit/core';
import { Search, CloudOff, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '@features/auth/context/AuthContext';
import { useCrmData, useMoveLead, useUnsynced, useRetryUnsynced } from '../useCrm';
import LeadPanel from './LeadPanel';
import { Loading, ErrorText, Empty } from '../ui';
import { money, relTime, normalize, stageColor, inputCls, btnCls } from '../format';

// Tarjeta mínima (como en Kommo): nombre, trámite, valor y fecha. El resto está en el panel del lead.
function Card({ lead, tagNames, dragging = false, selected = false, onOpen }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id, data: lead });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onOpen?.(lead)}
      className={`cursor-grab select-none rounded-md bg-bg-surface px-3 py-2.5 text-[13px] shadow-[0_1px_2px_rgba(15,23,42,0.08)] ring-1 transition active:cursor-grabbing ${selected ? 'ring-brand-primary' : 'ring-transparent hover:ring-border-hover'} ${isDragging ? 'opacity-30' : ''} ${dragging ? 'rotate-1 shadow-lg' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="truncate font-medium text-text-primary">{lead.name || 'Sin nombre'}</span>
        <span className="shrink-0 text-[11px] text-text-muted">{relTime(lead.updated_at)}</span>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-text-secondary">
        <span className="truncate">{lead.service_label || 'Trámite por definir'}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {money(lead.value) && <span className="tabular-nums text-text-primary">{money(lead.value)}</span>}
          {lead.needs_reply && <span title="Mensaje sin responder" className="h-2 w-2 rounded-full bg-success" />}
        </span>
      </div>
      {tagNames.length > 0 && <p className="mt-1 truncate text-[11px] text-brand-primary">{tagNames.map((t) => `#${t}`).join('  ')}</p>}
    </div>
  );
}

function Column({ stage, leads, tagsByLead, openId, onOpen }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = leads.reduce((s, l) => s + (Number(l.value) || 0), 0);
  const color = stageColor(stage);
  return (
    <section ref={setNodeRef} className={`flex w-[270px] shrink-0 flex-col rounded-md transition-colors ${isOver ? 'bg-brand-primary-light' : ''}`}>
      <header className="px-1 pb-2 pt-1 text-center">
        <h3 className="truncate text-[12px] font-semibold uppercase tracking-wide text-text-secondary">{stage.name}</h3>
        <p className="mt-0.5 text-[11px] text-text-muted">{leads.length} leads{total > 0 ? `: ${money(total)}` : ''}</p>
        <div className="mt-2 h-[3px] rounded-full" style={{ background: color }} />
      </header>
      <div className="flex min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto px-0.5 pb-3 pt-1">
        {leads.map((l) => <Card key={l.id} lead={l} tagNames={tagsByLead[l.id] || []} selected={openId === l.id} onOpen={onOpen} />)}
      </div>
    </section>
  );
}

export default function FunilView({ onNavigateToClient, onOpenChat }) {
  const { userId } = useAuth();
  const { pipelines, leads, tags, leadTags, stages } = useCrmData();
  const unsynced = useUnsynced();
  const retry = useRetryUnsynced();
  const move = useMoveLead(stages);
  const [pipelineId, setPipelineId] = useState(null);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [onlyReply, setOnlyReply] = useState(false);
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
    return (leads.data || []).filter((l) => l.pipeline_id === pipeline?.id
      && (!onlyMine || l.assigned_to === userId)
      && (!onlyReply || l.needs_reply)
      && (!q || normalize(`${l.name} ${l.phone} ${l.service_label} ${l.country}`).includes(q)));
  }, [leads.data, pipeline, search, onlyMine, onlyReply, userId]);

  const byStage = useMemo(() => {
    const m = {};
    for (const l of visible) (m[l.stage_id] ||= []).push(l);
    return m;
  }, [visible]);

  const active = visible.find((l) => l.id === activeId);
  const open = (leads.data || []).find((l) => l.id === openId);
  const total = visible.filter((l) => l.stage_kind === 'open').reduce((s, l) => s + (Number(l.value) || 0), 0);
  const activeFilters = (onlyMine ? 1 : 0) + (onlyReply ? 1 : 0);

  const onDragEnd = ({ active: a, over }) => {
    setActiveId(null);
    const lead = (leads.data || []).find((l) => l.id === a.id);
    if (lead && over) move(lead, over.id);
  };

  if (pipelines.isLoading || leads.isLoading) return <Loading />;
  if (leads.error) return <ErrorText error={leads.error} what="los leads" />;
  if (pipelines.error) return <ErrorText error={pipelines.error} what="los embudos" />;
  if (!pipeline) return <Empty>Todavía no hay un embudo configurado. Créalo en Configuración.</Empty>;

  return (
    <div className="flex h-full min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col bg-bg-base">
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-bg-surface px-5">
          {(pipelines.data || []).length > 1 ? (
            <select className="h-9 rounded-md border-0 bg-transparent pr-6 text-[15px] font-semibold text-text-primary outline-none hover:bg-bg-elevated"
              value={pipeline.id} onChange={(e) => setPipelineId(e.target.value)} aria-label="Embudo">
              {pipelines.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          ) : (
            <h1 className="text-[15px] font-semibold text-text-primary">{pipeline.name}</h1>
          )}
          <span className="text-xs text-text-muted">{visible.length} leads{total > 0 ? ` · ${money(total)}` : ''}</span>
          <div className="relative ml-3 w-72 shrink-0">
            <Search size={14} className="absolute left-2.5 top-2.5 text-text-muted" />
            <input className={`${inputCls} h-9 !pl-8`} placeholder="Buscar" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="relative">
            <button className={`${btnCls} h-9 ${activeFilters ? '!border-brand-primary !text-brand-primary' : ''}`} onClick={() => setShowFilters((v) => !v)}>
              <SlidersHorizontal size={14} /> Filtros{activeFilters ? ` · ${activeFilters}` : ''}
            </button>
            {showFilters && (
              <div className="absolute left-0 top-10 z-20 flex w-48 flex-col gap-2 rounded-md border border-border bg-bg-surface p-3 text-[13px] text-text-primary shadow-lg">
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> Solo míos</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" checked={onlyReply} onChange={(e) => setOnlyReply(e.target.checked)} /> Sin responder</label>
              </div>
            )}
          </div>
          {unsynced.data?.length > 0 && (
            <button className="ml-auto inline-flex items-center gap-1.5 text-xs text-warning hover:underline" onClick={() => retry()} title="Cambios guardados que todavía no llegaron a Kommo. Clic para reintentar.">
              <CloudOff size={13} /> {unsynced.data.length} sin sincronizar
            </button>
          )}
        </div>
        <DndContext sensors={sensors} onDragStart={(e) => setActiveId(e.active.id)} onDragCancel={() => setActiveId(null)} onDragEnd={onDragEnd}>
          <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto px-5 pt-4" onClick={() => showFilters && setShowFilters(false)}>
            {pipeline.stages.map((s) => (
              <Column key={s.id} stage={s} leads={byStage[s.id] || []} tagsByLead={tagsByLead} openId={openId} onOpen={(l) => setOpenId(l.id)} />
            ))}
          </div>
          <DragOverlay>{active ? <Card lead={active} tagNames={tagsByLead[active.id] || []} dragging /> : null}</DragOverlay>
        </DndContext>
      </div>
      {open && <LeadPanel key={open.id} lead={open} onClose={() => setOpenId(null)} onOpenClient={onNavigateToClient} onOpenChat={onOpenChat} />}
    </div>
  );
}

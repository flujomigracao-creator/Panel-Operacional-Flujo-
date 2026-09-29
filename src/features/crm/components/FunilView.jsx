import React, { useMemo, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors, useDroppable, useDraggable } from '@dnd-kit/core';
import { RefreshCw, Search, CloudOff } from 'lucide-react';
import { useAuth } from '@features/auth/context/AuthContext';
import { useCrmData, useMoveLead, useUnsynced, useRetryUnsynced } from '../useCrm';
import LeadPanel from './LeadPanel';
import { PageHeader, Loading, ErrorText, Empty } from '../ui';
import { money, relTime, normalize, flag, initials, inputCls, btnCls, chipCls } from '../format';

function Card({ lead, ownerName, tagNames, dragging = false, selected = false, onOpen }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id, data: lead });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onOpen?.(lead)}
      className={`cursor-grab select-none rounded-md border bg-bg-surface px-2.5 py-2 text-[13px] shadow-sm transition-colors active:cursor-grabbing ${selected ? 'border-brand-primary' : 'border-border hover:border-border-hover'} ${isDragging ? 'opacity-30' : ''} ${dragging ? 'rotate-1 shadow-lg' : ''}`}
    >
      <div className="flex items-center gap-1.5">
        <span className="truncate font-medium text-text-primary">{lead.name || 'Sin nombre'}</span>
        {lead.needs_reply && <span title="Mensaje sin responder" className="ml-auto h-2 w-2 shrink-0 rounded-full bg-success" />}
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2 text-xs">
        <span className="truncate text-text-secondary">{lead.service_label || 'Trámite por definir'}</span>
        {money(lead.value) && <span className="shrink-0 font-medium tabular-nums text-text-primary">{money(lead.value)}</span>}
      </div>
      {tagNames.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {tagNames.slice(0, 3).map((t) => <span key={t} className="rounded bg-brand-primary-light px-1 py-px text-[10px] font-medium text-brand-primary">{t}</span>)}
        </div>
      )}
      <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-text-muted">
        {flag(lead.country) && <span title={lead.country}>{flag(lead.country)}</span>}
        {ownerName && (
          <span title={ownerName} className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-bg-elevated text-[8px] font-semibold text-text-secondary">{initials(ownerName)}</span>
        )}
        <span className="ml-auto shrink-0">{relTime(lead.updated_at)}</span>
      </div>
    </div>
  );
}

function Column({ stage, leads, teamById, tagsByLead, openId, onOpen }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const total = leads.reduce((s, l) => s + (Number(l.value) || 0), 0);
  const alert = stage.color === '#dc2626' && leads.length > 0;
  return (
    <section ref={setNodeRef} className={`flex w-[260px] shrink-0 flex-col rounded-lg border transition-colors ${isOver ? 'border-brand-primary bg-brand-primary-light' : 'border-border bg-bg-base'}`}>
      <header className={`border-b px-3 py-2 ${alert ? 'border-danger-border bg-danger-bg' : 'border-border'}`}>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: stage.color || (stage.kind === 'won' ? 'var(--color-success)' : 'var(--brand-primary)') }} />
          <h3 className={`truncate text-[12px] font-semibold uppercase tracking-wide ${alert ? 'text-danger' : 'text-text-primary'}`}>{stage.name}</h3>
        </div>
        <div className="mt-0.5 flex items-baseline justify-between text-xs text-text-muted">
          <span><b className="font-semibold text-text-primary">{leads.length}</b> leads</span>
          {total > 0 && <span className="tabular-nums">{money(total)}</span>}
        </div>
      </header>
      <div className="flex min-h-[80px] flex-1 flex-col gap-1.5 overflow-y-auto p-1.5">
        {leads.map((l) => (
          <Card key={l.id} lead={l} ownerName={teamById[l.assigned_to]} tagNames={tagsByLead[l.id] || []} selected={openId === l.id} onOpen={onOpen} />
        ))}
        {leads.length === 0 && <p className="p-3 text-center text-xs text-text-muted">Arrastra un lead aquí</p>}
      </div>
    </section>
  );
}

export default function FunilView({ onNavigateToClient, onOpenChat }) {
  const { userId } = useAuth();
  const { pipelines, leads, tags, leadTags, stages, teamById } = useCrmData();
  const unsynced = useUnsynced();
  const retry = useRetryUnsynced();
  const move = useMoveLead(stages);
  const [pipelineId, setPipelineId] = useState(null);
  const [search, setSearch] = useState('');
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
      <div className="flex min-w-0 flex-1 flex-col">
        <PageHeader title="Funis" count={`${visible.length} leads`}>
          {unsynced.data?.length > 0 && (
            <button className={`${btnCls} !border-warning-border !bg-warning-bg !text-warning`} onClick={() => retry()} title="Cambios guardados en el panel que todavía no llegaron a Kommo">
              <CloudOff size={13} /> {unsynced.data.length} sin sincronizar con Kommo <RefreshCw size={12} />
            </button>
          )}
        </PageHeader>
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-bg-surface px-4 py-2">
          <div className="flex items-center gap-1 rounded-md bg-bg-elevated p-0.5">
            {(pipelines.data || []).map((p) => (
              <button key={p.id} onClick={() => setPipelineId(p.id)}
                className={`rounded px-3 py-1 text-xs font-medium ${p.id === pipeline.id ? 'bg-bg-surface text-brand-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}>
                {p.name}
              </button>
            ))}
          </div>
          <button className={chipCls(onlyMine)} onClick={() => setOnlyMine((v) => !v)}>Míos</button>
          <button className={chipCls(onlyReply)} onClick={() => setOnlyReply((v) => !v)}>Sin responder</button>
          <div className="relative ml-auto w-60">
            <Search size={13} className="absolute left-2.5 top-2 text-text-muted" />
            <input className={`${inputCls} h-7 !pl-7 !py-1`} placeholder="Buscar en el embudo…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
        <DndContext sensors={sensors} onDragStart={(e) => setActiveId(e.active.id)} onDragCancel={() => setActiveId(null)} onDragEnd={onDragEnd}>
          <div className="flex min-h-0 flex-1 gap-2 overflow-x-auto p-3">
            {pipeline.stages.map((s) => (
              <Column key={s.id} stage={s} leads={byStage[s.id] || []} teamById={teamById} tagsByLead={tagsByLead} openId={openId} onOpen={(l) => setOpenId(l.id)} />
            ))}
          </div>
          <DragOverlay>{active ? <Card lead={active} ownerName={teamById[active.assigned_to]} tagNames={tagsByLead[active.id] || []} dragging /> : null}</DragOverlay>
        </DndContext>
      </div>
      {open && <LeadPanel key={open.id} lead={open} onClose={() => setOpenId(null)} onOpenClient={onNavigateToClient} onOpenChat={onOpenChat} />}
    </div>
  );
}

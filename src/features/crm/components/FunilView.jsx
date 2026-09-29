import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { DndContext, DragOverlay, PointerSensor, KeyboardSensor, useSensor, useSensors, useDroppable, useDraggable } from '@dnd-kit/core';
import { Search, CloudOff, SlidersHorizontal } from 'lucide-react';
import { useAuth } from '@features/auth/context/AuthContext';
import { useCrmData, useMoveLead, useUnsynced, useRetryUnsynced, KEYS } from '../useCrm';
import { createLead } from '../services/crmService';
import LeadCard from './LeadCard';
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
      className={`cursor-grab select-none rounded-md border bg-bg-surface px-3 py-2.5 text-[13px] transition-colors active:cursor-grabbing ${selected ? 'border-brand-primary' : 'border-border hover:border-border-hover'} ${isDragging ? 'opacity-30' : ''} ${dragging ? 'shadow-md' : ''}`}
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
      {tagNames.length > 0 && <p className="mt-1 truncate text-[11px] text-text-muted">{tagNames.map((t) => `#${t}`).join('  ')}</p>}
    </div>
  );
}

// "Agregar rápido" de Kommo: alta de un lead directo en la primera columna.
function QuickAdd({ stage }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: '', phone: '', value: '' });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!f.name.trim()) return;
    setBusy(true);
    try {
      await createLead({ ...f, stageId: stage.id });
      toast.success('Lead creado');
      setF({ name: '', phone: '', value: '' });
      setOpen(false);
      qc.invalidateQueries({ queryKey: KEYS.leads });
    } catch (err) {
      toast.error(err.message || 'No se pudo crear el lead');
    } finally {
      setBusy(false);
    }
  };
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-md border border-dashed border-border-hover py-2 text-xs text-text-muted hover:border-brand-primary hover:text-brand-primary">
        + Agregar rápido
      </button>
    );
  }
  const input = 'w-full rounded border border-border bg-bg-surface px-2 py-1 text-[13px] text-text-primary outline-none focus:border-brand-primary';
  const key = (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setOpen(false); };
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-bg-surface p-2">
      <input autoFocus className={input} placeholder="Nombre" value={f.name} onChange={(e) => setF((s) => ({ ...s, name: e.target.value }))} onKeyDown={key} />
      <input className={input} placeholder="Teléfono" value={f.phone} onChange={(e) => setF((s) => ({ ...s, phone: e.target.value }))} onKeyDown={key} />
      <input className={input} type="number" placeholder="Valor (R$)" value={f.value} onChange={(e) => setF((s) => ({ ...s, value: e.target.value }))} onKeyDown={key} />
      <div className="flex gap-1.5">
        <button className="flex-1 rounded bg-brand-primary py-1 text-xs font-medium text-white disabled:opacity-50" onClick={save} disabled={busy || !f.name.trim()}>Agregar</button>
        <button className="rounded px-2 text-xs text-text-muted hover:text-text-primary" onClick={() => setOpen(false)}>Cancelar</button>
      </div>
    </div>
  );
}

function Column({ stage, leads, tagsByLead, openId, onOpen, quickAdd }) {
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
        {quickAdd && <QuickAdd stage={stage} />}
        {leads.map((l) => <Card key={l.id} lead={l} tagNames={tagsByLead[l.id] || []} selected={openId === l.id} onOpen={onOpen} />)}
      </div>
    </section>
  );
}

export default function FunilView({ onNavigateToClient }) {
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

  const entryStage = pipeline?.stages.find((st) => st.is_entry) || pipeline?.stages.find((st) => st.kind === 'open');
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
              <Column key={s.id} stage={s} leads={byStage[s.id] || []} tagsByLead={tagsByLead} openId={openId} onOpen={(l) => setOpenId(l.id)} quickAdd={s.id === entryStage?.id} />
            ))}
          </div>
          <DragOverlay>{active ? <Card lead={active} tagNames={tagsByLead[active.id] || []} dragging /> : null}</DragOverlay>
        </DndContext>
      </div>
      {open && <LeadCard key={open.id} lead={open} onClose={() => setOpenId(null)} onOpenClient={onNavigateToClient} />}
    </div>
  );
}

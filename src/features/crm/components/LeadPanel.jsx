import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X, User, MessageSquare, ExternalLink, Plus, StickyNote, RefreshCw, Bot, BotOff, Check, MapPin, Phone } from 'lucide-react';
import { useAuth } from '@features/auth/context/AuthContext';
import { getServices } from '@features/clients/services/clientsService';
import { useCrmData, useMoveLead, useRefreshLead, useRetryUnsynced, useKommoLeadUrl, KEYS } from '../useCrm';
import { updateLeads, addNote, createTask, completeTask, createTag, addTagToLeads, removeTagFromLead, getLeadEvents, getOpenTasks, setAiPaused } from '../services/crmService';
import { Avatar, Field } from '../ui';
import { money, relTime, flag, selectCls, inputCls, btnCls, btnPrimaryCls } from '../format';

// Tareas que el sistema cierra solo cuando detecta que se hicieron: cerrarlas a mano las haría volver.
const AUTO_CLOSE = new Set(['inscricao_receita']);

const SYNC_LABEL = { pending: 'pendiente de enviar a Kommo', failed: 'no llegó a Kommo' };

function eventText(e, teamById) {
  const m = e.metadata || {};
  switch (e.event_type) {
    case 'created': return m.backfill ? 'Lead registrado' : `Lead creado${m.source === 'panel' ? ' en el panel' : m.source === 'kommo' ? ' desde Kommo' : ''}`;
    case 'stage_changed': return `Etapa: ${m.from || '—'} → ${m.to || '—'}`;
    case 'assigned': return m.to ? `Responsable: ${m.to_name || teamById[m.to] || 'asignado'}` : 'Quedó sin responsable';
    case 'updated': return [m.service_label !== undefined && `Trámite: ${m.service_label}`, m.value !== undefined && `Valor: ${money(m.value)}`].filter(Boolean).join(' · ') || 'Datos actualizados';
    case 'tag_added': return `Etiqueta agregada: ${m.tag || ''}`;
    case 'tag_removed': return `Etiqueta quitada: ${m.tag || ''}`;
    case 'note': return m.text;
    case 'message_in': return 'Mensaje recibido';
    default: return e.event_type;
  }
}

function Section({ title, action, children }) {
  return (
    <section className="border-t border-border px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{title}</h4>
        {action}
      </div>
      {children}
    </section>
  );
}

// Panel lateral del lead: todo lo que el operador cambia sin salir de la pantalla en la que está.
export default function LeadPanel({ lead, onClose, onOpenClient, onOpenChat, width = 'w-[340px]' }) {
  const qc = useQueryClient();
  const { userId } = useAuth();
  const { pipelines, stages, team, tags, leadTags, teamById } = useCrmData();
  const move = useMoveLead(stages);
  const refresh = useRefreshLead();
  const retry = useRetryUnsynced();
  const kommoUrl = useKommoLeadUrl();
  const [service, setService] = useState(lead.service_label || '');
  const [value, setValue] = useState(lead.value ?? '');
  const [newTag, setNewTag] = useState(null);
  const [task, setTask] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const services = useQuery({ queryKey: ['services'], queryFn: getServices, staleTime: 10 * 60_000 });
  const events = useQuery({ queryKey: [...KEYS.events, lead.id], queryFn: () => getLeadEvents([lead.id], 60) });
  const tasks = useQuery({ queryKey: [...KEYS.tasks, lead.client_id], queryFn: () => getOpenTasks({ clientId: lead.client_id }), enabled: !!lead.client_id });

  const pipelineStages = (pipelines.data || []).find((p) => p.id === lead.pipeline_id)?.stages || stages;
  const myTagIds = new Set((leadTags.data || []).filter((t) => t.lead_id === lead.id).map((t) => t.tag_id));
  const myTags = (tags.data || []).filter((t) => myTagIds.has(t.id));
  const otherTags = (tags.data || []).filter((t) => !myTagIds.has(t.id));
  const lastMove = (events.data || []).find((e) => e.event_type === 'stage_changed');
  const unsyncedMove = lastMove && SYNC_LABEL[lastMove.sync_status] ? lastMove : null;

  const activity = [
    ...(events.data || []).filter((e) => e.event_type !== 'note'),
    ...(lead.last_inbound_at ? [{ id: 'in', event_type: 'message_in', created_at: lead.last_inbound_at }] : []),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const notes = (events.data || []).filter((e) => e.event_type === 'note');

  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      await fn();
      if (okMsg) toast.success(okMsg);
      refresh();
    } catch (err) {
      toast.error(err.message || 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  };

  const saveField = (patch) => run(() => updateLeads([lead.id], patch));
  const saveService = () => service.trim() !== (lead.service_label || '') && saveField({ service_label: service });
  const saveValue = () => String(value) !== String(lead.value ?? '') && saveField({ value: value === '' ? '' : Number(value) });

  const addExistingTag = (tagId) => run(() => addTagToLeads([lead.id], tagId));
  const addNewTag = () => {
    const name = (newTag || '').trim();
    if (!name) { setNewTag(null); return; }
    run(async () => {
      const existing = (tags.data || []).find((t) => t.name.toLowerCase() === name.toLowerCase());
      const t = existing || await createTag(name);
      await addTagToLeads([lead.id], t.id);
      qc.invalidateQueries({ queryKey: KEYS.tags });
      setNewTag(null);
    });
  };

  const saveTask = () => task.trim() && run(async () => {
    await createTask({ clientId: lead.client_id, title: task });
    setTask('');
    qc.invalidateQueries({ queryKey: KEYS.tasks });
  }, 'Tarea creada');
  const doneTask = (id) => run(async () => {
    await completeTask(id);
    qc.invalidateQueries({ queryKey: KEYS.tasks });
  }, 'Tarea completada');
  const saveNote = () => note.trim() && run(async () => {
    await addNote(lead.id, note, userId);
    setNote('');
  }, 'Nota guardada');

  const kommoLink = kommoUrl(lead.external_id);

  return (
    <aside className={`flex h-full ${width} shrink-0 flex-col overflow-y-auto border-l border-border bg-bg-surface`}>
      <header className="flex items-start gap-2.5 px-4 pb-3 pt-3.5">
        <Avatar name={lead.name} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-text-primary">{lead.name || 'Sin nombre'}</p>
          {(lead.country || lead.city) && (
            <p className="flex items-center gap-1 truncate text-xs text-text-secondary">
              {flag(lead.country) && <span>{flag(lead.country)}</span>}
              {lead.country}
              {lead.city && <><MapPin size={11} className="ml-1 text-text-muted" />{lead.city}</>}
            </p>
          )}
          {lead.phone && <p className="flex items-center gap-1 text-xs text-text-muted"><Phone size={11} />{lead.phone}</p>}
        </div>
        {onClose && <button onClick={onClose} aria-label="Cerrar" className="rounded p-1 text-text-muted hover:bg-bg-elevated hover:text-text-primary"><X size={16} /></button>}
      </header>

      <div className="flex flex-wrap gap-1.5 px-4 pb-3">
        {lead.client_id && onOpenClient && <button className={btnCls} onClick={() => onOpenClient(lead.client_id, lead.name)}><User size={13} /> Contacto</button>}
        {onOpenChat && (lead.client_id || lead.external_contact_id) && <button className={btnCls} onClick={() => onOpenChat(lead)}><MessageSquare size={13} /> Abrir chat</button>}
        {kommoLink && <a className={btnCls} href={kommoLink} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Kommo</a>}
      </div>

      <div className="flex flex-col gap-3 border-t border-border px-4 py-3">
        <Field label="Etapa">
          <select className={selectCls} value={lead.stage_id || ''} onChange={(e) => move(lead, e.target.value)} disabled={busy}>
            {!lead.stage_id && <option value="">{lead.stage_name || 'Sin etapa'}</option>}
            {pipelineStages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {unsyncedMove && (
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-warning">
              Último cambio {SYNC_LABEL[unsyncedMove.sync_status]}
              <button className="inline-flex items-center gap-0.5 font-medium underline" onClick={() => retry([unsyncedMove.id])}><RefreshCw size={10} /> Reintentar</button>
            </p>
          )}
        </Field>

        <Field label="Responsable">
          <select className={selectCls} value={lead.assigned_to || ''} onChange={(e) => saveField({ assigned_to: e.target.value })} disabled={busy}>
            <option value="">Sin asignar</option>
            {(team.data || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>

        <div className="grid grid-cols-[1fr_96px] gap-2">
          <Field label="Trámite">
            <input className={inputCls} list={`services-${lead.id}`} value={service} onChange={(e) => setService(e.target.value)}
              onBlur={saveService} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} placeholder="RNM, CPF…" />
            <datalist id={`services-${lead.id}`}>{(services.data || []).map((s) => <option key={s.id} value={s.name} />)}</datalist>
          </Field>
          <Field label="Valor (R$)">
            <input className={inputCls} type="number" min="0" value={value} onChange={(e) => setValue(e.target.value)}
              onBlur={saveValue} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          </Field>
        </div>

        <Field label="Etiquetas">
          <div className="flex flex-wrap items-center gap-1">
            {myTags.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1 rounded bg-brand-primary-light px-1.5 py-0.5 text-[11px] font-medium text-brand-primary">
                {t.name}
                <button aria-label={`Quitar ${t.name}`} onClick={() => run(() => removeTagFromLead(lead.id, t.id))}><X size={10} /></button>
              </span>
            ))}
            {newTag === null ? (
              <>
                {otherTags.length > 0 && (
                  <select className="h-6 rounded border border-dashed border-border bg-bg-surface px-1 text-[11px] text-text-secondary" value="" onChange={(e) => e.target.value && addExistingTag(e.target.value)}>
                    <option value="">+ etiqueta</option>
                    {otherTags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
                <button className="inline-flex h-6 items-center gap-0.5 rounded px-1 text-[11px] text-brand-primary hover:bg-brand-primary-light" onClick={() => setNewTag('')}><Plus size={11} /> nueva</button>
              </>
            ) : (
              <input autoFocus className="h-6 w-28 rounded border border-brand-primary bg-bg-surface px-1.5 text-[11px] text-text-primary outline-none"
                placeholder="Nombre y Enter" value={newTag} onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addNewTag(); if (e.key === 'Escape') setNewTag(null); }} onBlur={addNewTag} />
            )}
          </div>
        </Field>

        {lead.external_id && (
          <div className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5">
            <span className="flex items-center gap-1.5 text-xs text-text-secondary">
              {lead.ai_paused ? <BotOff size={13} className="text-warning" /> : <Bot size={13} className="text-success" />}
              {lead.ai_paused ? 'Nora pausada: responde el equipo' : 'Nora está respondiendo'}
            </span>
            <button className="text-xs font-medium text-brand-primary hover:underline" disabled={busy}
              onClick={() => run(() => setAiPaused(lead.id, !lead.ai_paused), lead.ai_paused ? 'Nora vuelve a responder' : 'Nora pausada')}>
              {lead.ai_paused ? 'Reactivar' : 'Pausar'}
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-[11px] text-text-muted">
          <span>Creado {relTime(lead.created_at)}</span>
          <span className="text-right">Origen: {lead.lead_source || (lead.external_id ? 'kommo' : '—')}</span>
        </div>
      </div>

      <Section title="Tareas">
        {!lead.client_id ? (
          <p className="text-xs text-text-muted">Este lead todavía no tiene contacto vinculado.</p>
        ) : (
          <>
            <ul className="mb-2 flex flex-col gap-1">
              {(tasks.data || []).map((t) => (
                <li key={t.id} className="flex items-start gap-2 text-[13px] text-text-primary">
                  <button disabled={busy || AUTO_CLOSE.has(t.kind)} onClick={() => doneTask(t.id)} title={AUTO_CLOSE.has(t.kind) ? 'Se cierra sola cuando el sistema detecta que se hizo' : 'Marcar como hecha'}
                    className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border-hover text-transparent hover:border-success hover:text-success disabled:opacity-40">
                    <Check size={11} />
                  </button>
                  <span className="min-w-0 flex-1">{t.title}{t.due_at && <span className="ml-1 text-[11px] text-text-muted">· {relTime(t.due_at)}</span>}</span>
                </li>
              ))}
              {tasks.data?.length === 0 && <li className="text-xs text-text-muted">Sin tareas abiertas.</li>}
            </ul>
            <div className="flex gap-1.5">
              <input className={inputCls} placeholder="Nueva tarea (ej.: pedir pasaporte)" value={task} onChange={(e) => setTask(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveTask()} />
              <button className={btnCls} onClick={saveTask} disabled={busy || !task.trim()} aria-label="Crear tarea"><Plus size={14} /></button>
            </div>
          </>
        )}
      </Section>

      <Section title="Notas internas">
        <textarea className={`${inputCls} resize-none`} rows={2} placeholder="Solo la ve el equipo" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="mt-1.5 flex justify-end">
          <button className={btnPrimaryCls} onClick={saveNote} disabled={busy || !note.trim()}><StickyNote size={13} /> Guardar nota</button>
        </div>
        <ul className="mt-2 flex flex-col gap-1.5">
          {notes.map((n) => (
            <li key={n.id} className="rounded-md border border-warning-border bg-warning-bg px-2.5 py-1.5 text-[13px] text-text-primary">
              <p className="whitespace-pre-wrap break-words">{n.metadata?.text}</p>
              <p className="mt-0.5 text-[10px] text-text-muted">{teamById[n.actor_id] || 'Equipo'} · {relTime(n.created_at)}</p>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Actividad">
        <ol className="relative flex flex-col gap-2.5 border-l border-border pl-3">
          {activity.map((e) => (
            <li key={e.id} className="relative text-xs">
              <span className={`absolute -left-[16.5px] top-1 h-2 w-2 rounded-full border-2 border-bg-surface ${e.event_type === 'stage_changed' ? 'bg-brand-primary' : e.event_type === 'message_in' ? 'bg-success' : 'bg-border-hover'}`} />
              <p className="text-text-primary">{eventText(e, teamById)}</p>
              <p className="text-[10px] text-text-muted">
                {relTime(e.created_at)}
                {e.actor_id && teamById[e.actor_id] ? ` · ${teamById[e.actor_id]}` : e.metadata?.origin === 'automatizacion' ? ' · automático' : ''}
                {SYNC_LABEL[e.sync_status] ? ` · ${SYNC_LABEL[e.sync_status]}` : ''}
              </p>
            </li>
          ))}
          {!events.isLoading && activity.length === 0 && <li className="text-xs text-text-muted">Sin actividad todavía.</li>}
        </ol>
      </Section>
    </aside>
  );
}

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X, User, MessageSquare, ExternalLink, Check } from 'lucide-react';
import { useAuth } from '@features/auth/context/AuthContext';
import { getServices } from '@features/clients/services/clientsService';
import { useCrmData, useMoveLead, useRefreshLead, useRetryUnsynced, useKommoLeadUrl, KEYS } from '../useCrm';
import { updateLeads, addNote, createTask, completeTask, createTag, addTagToLeads, removeTagFromLead, getLeadEvents, getOpenTasks, setAiPaused } from '../services/crmService';
import { money, relTime, flag, stageColor, inputCls, btnPrimaryCls } from '../format';

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
  const [tab, setTab] = useState('notes');

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
  const stage = stages.find((st) => st.id === lead.stage_id);
  const color = stageColor(stage);
  const bare = 'w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-[13px] text-text-primary outline-none hover:border-border focus:border-brand-primary focus:bg-bg-surface';

  return (
    <aside className={`flex h-full ${width} shrink-0 flex-col border-l border-border bg-bg-surface`}>
      {/* Cabecera */}
      <header className="px-4 pb-3 pt-4">
        <div className="flex items-start gap-2">
          <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-text-primary">{lead.name || 'Sin nombre'}</h2>
          {onClose && <button onClick={onClose} aria-label="Cerrar" className="-mr-1 rounded p-1 text-text-muted hover:bg-bg-elevated hover:text-text-primary"><X size={16} /></button>}
        </div>
        <p className="mt-0.5 truncate text-xs text-text-muted">
          {[lead.phone, [flag(lead.country), lead.country].filter(Boolean).join(' '), lead.city].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
        </p>
        <select className="mt-3 h-9 w-full rounded-md border-0 px-2.5 text-[13px] font-medium text-text-primary outline-none"
          style={{ background: `color-mix(in srgb, ${color} 22%, transparent)` }}
          value={lead.stage_id || ''} onChange={(e) => move(lead, e.target.value)} disabled={busy} aria-label="Etapa">
          {!lead.stage_id && <option value="">{lead.stage_name || 'Sin etapa'}</option>}
          {pipelineStages.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
        </select>
        {unsyncedMove && (
          <p className="mt-1.5 text-[11px] text-warning">
            Cambio {SYNC_LABEL[unsyncedMove.sync_status]} · <button className="underline" onClick={() => retry([unsyncedMove.id])}>reintentar</button>
          </p>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* Campos */}
        <dl className="grid grid-cols-[96px_1fr] items-center gap-x-2 gap-y-0.5 border-t border-border px-4 py-3 text-[13px]">
          <dt className="text-text-muted">Responsable</dt>
          <dd>
            <select className={bare} value={lead.assigned_to || ''} onChange={(e) => saveField({ assigned_to: e.target.value })} disabled={busy}>
              <option value="">Sin asignar</option>
              {(team.data || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </dd>
          <dt className="text-text-muted">Trámite</dt>
          <dd>
            <input className={bare} list={`services-${lead.id}`} value={service} placeholder="…" onChange={(e) => setService(e.target.value)}
              onBlur={saveService} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
            <datalist id={`services-${lead.id}`}>{(services.data || []).map((sv) => <option key={sv.id} value={sv.name} />)}</datalist>
          </dd>
          <dt className="text-text-muted">Valor</dt>
          <dd>
            <input className={bare} type="number" min="0" value={value} placeholder="R$" onChange={(e) => setValue(e.target.value)}
              onBlur={saveValue} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
          </dd>
          <dt className="self-start pt-1.5 text-text-muted">Etiquetas</dt>
          <dd className="flex flex-wrap items-center gap-1 px-1.5 py-1">
            {myTags.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-0.5 rounded bg-bg-elevated px-1.5 py-0.5 text-xs text-text-secondary">
                {t.name}
                <button aria-label={`Quitar ${t.name}`} className="text-text-muted hover:text-text-primary" onClick={() => run(() => removeTagFromLead(lead.id, t.id))}><X size={10} /></button>
              </span>
            ))}
            {newTag === null ? (
              <select className="h-6 rounded bg-transparent text-xs text-brand-primary outline-none" value=""
                onChange={(e) => (e.target.value === '__new' ? setNewTag('') : e.target.value && addExistingTag(e.target.value))}>
                <option value="">+ Agregar</option>
                {otherTags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                <option value="__new">Nueva etiqueta…</option>
              </select>
            ) : (
              <input autoFocus className="h-6 w-28 rounded border border-brand-primary bg-bg-surface px-1.5 text-xs text-text-primary outline-none"
                placeholder="Nombre y Enter" value={newTag} onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addNewTag(); if (e.key === 'Escape') setNewTag(null); }} onBlur={addNewTag} />
            )}
          </dd>
          {lead.external_id && (
            <>
              <dt className="text-text-muted">Nora</dt>
              <dd className="flex items-center justify-between px-1.5 py-1">
                <span className={lead.ai_paused ? 'text-warning' : 'text-text-primary'}>{lead.ai_paused ? 'Pausada' : 'Respondiendo'}</span>
                <button className="text-xs text-brand-primary hover:underline" disabled={busy}
                  onClick={() => run(() => setAiPaused(lead.id, !lead.ai_paused), lead.ai_paused ? 'Nora vuelve a responder' : 'Nora pausada')}>
                  {lead.ai_paused ? 'Reactivar' : 'Pausar'}
                </button>
              </dd>
            </>
          )}
        </dl>

        {/* Accesos */}
        <div className="flex gap-4 border-t border-border px-4 py-2.5 text-xs">
          {lead.client_id && onOpenClient && <button className="inline-flex items-center gap-1 text-brand-primary hover:underline" onClick={() => onOpenClient(lead.client_id, lead.name)}><User size={12} /> Contacto</button>}
          {onOpenChat && (lead.client_id || lead.external_contact_id) && <button className="inline-flex items-center gap-1 text-brand-primary hover:underline" onClick={() => onOpenChat(lead)}><MessageSquare size={12} /> Chat</button>}
          {kommoLink && <a className="inline-flex items-center gap-1 text-brand-primary hover:underline" href={kommoLink} target="_blank" rel="noreferrer"><ExternalLink size={12} /> Kommo</a>}
        </div>

        {/* Pestañas */}
        <div className="flex gap-5 border-y border-border px-4 text-[13px]">
          {[['notes', 'Notas', notes.length], ['tasks', 'Tareas', tasks.data?.length || 0], ['activity', 'Actividad', null]].map(([k, label, n]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`-mb-px border-b-2 py-2 ${tab === k ? 'border-brand-primary font-medium text-text-primary' : 'border-transparent text-text-muted hover:text-text-primary'}`}>
              {label}{n ? <span className="ml-1 text-text-muted">{n}</span> : null}
            </button>
          ))}
        </div>

        <div className="px-4 py-3">
          {tab === 'notes' && (
            <>
              <textarea className={`${inputCls} resize-none`} rows={2} placeholder="Escribe una nota interna…" value={note} onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveNote(); }} />
              {note.trim() && <div className="mt-1.5 flex justify-end"><button className={btnPrimaryCls} onClick={saveNote} disabled={busy}>Guardar</button></div>}
              <ul className="mt-3 flex flex-col gap-3">
                {notes.map((n) => (
                  <li key={n.id} className="text-[13px]">
                    <p className="whitespace-pre-wrap break-words text-text-primary">{n.metadata?.text}</p>
                    <p className="mt-0.5 text-[11px] text-text-muted">{teamById[n.actor_id] || 'Equipo'} · {relTime(n.created_at)}</p>
                  </li>
                ))}
              </ul>
            </>
          )}

          {tab === 'tasks' && (!lead.client_id ? (
            <p className="text-xs text-text-muted">Este lead todavía no tiene contacto vinculado.</p>
          ) : (
            <>
              <input className={inputCls} placeholder="Nueva tarea y Enter" value={task} onChange={(e) => setTask(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveTask()} />
              <ul className="mt-3 flex flex-col gap-2">
                {(tasks.data || []).map((t) => (
                  <li key={t.id} className="flex items-start gap-2 text-[13px] text-text-primary">
                    <button disabled={busy || AUTO_CLOSE.has(t.kind)} onClick={() => doneTask(t.id)} title={AUTO_CLOSE.has(t.kind) ? 'Se cierra sola' : 'Marcar como hecha'}
                      className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border-hover text-transparent hover:border-success hover:text-success disabled:opacity-40">
                      <Check size={11} />
                    </button>
                    <span className="min-w-0 flex-1">{t.title}</span>
                  </li>
                ))}
                {tasks.data?.length === 0 && <li className="text-xs text-text-muted">Sin tareas abiertas.</li>}
              </ul>
            </>
          ))}

          {tab === 'activity' && (
            <ul className="flex flex-col gap-2.5">
              {activity.map((e) => (
                <li key={e.id} className="text-xs">
                  <p className="text-text-primary">{eventText(e, teamById)}</p>
                  <p className="text-[11px] text-text-muted">
                    {relTime(e.created_at)}
                    {e.actor_id && teamById[e.actor_id] ? ` · ${teamById[e.actor_id]}` : e.metadata?.origin === 'automatizacion' ? ' · automático' : ''}
                    {SYNC_LABEL[e.sync_status] ? ` · ${SYNC_LABEL[e.sync_status]}` : ''}
                  </p>
                </li>
              ))}
              {!events.isLoading && activity.length === 0 && <li className="text-xs text-text-muted">Sin actividad todavía.</li>}
              <li className="text-[11px] text-text-muted">Creado {relTime(lead.created_at)} · origen {lead.lead_source || (lead.external_id ? 'kommo' : '—')}</li>
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}

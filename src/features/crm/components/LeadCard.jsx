import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, ExternalLink, X, Check, User, Phone, MapPin } from 'lucide-react';
import { useAuth } from '@features/auth/context/AuthContext';
import { getServices } from '@features/clients/services/clientsService';
import { ReplyBox } from '@features/clients/components/ClientDetailView';
import { useCrmData, useMoveLead, useRefreshLead, useRetryUnsynced, useKommoLeadUrl, KEYS } from '../useCrm';
import {
  updateLeads, addNote, createTask, completeTask, createTag, addTagToLeads, removeTagFromLead,
  getLeadEvents, getOpenTasks, setAiPaused, getConversations, getConversationMessages, sendText, sendFile,
} from '../services/crmService';
import MessageBubble from './MessageBubble';
import { money, relTime, flag, stageColor, inputCls, btnPrimaryCls } from '../format';

// Tareas que el sistema cierra solo cuando detecta que se hicieron: cerrarlas a mano las haría volver.
const AUTO_CLOSE = new Set(['inscricao_receita']);
const SYNC_LABEL = { pending: 'pendiente en Kommo', failed: 'no llegó a Kommo' };

function eventText(e, teamById) {
  const m = e.metadata || {};
  switch (e.event_type) {
    case 'created': return m.backfill ? 'Lead registrado' : `Lead creado${m.source === 'panel' ? ' en el panel' : m.source === 'kommo' ? ' desde Kommo' : ''}`;
    case 'stage_changed': return `Etapa cambiada: ${m.from || '—'} → ${m.to || '—'}`;
    case 'assigned': return m.to ? `Responsable: ${m.to_name || teamById[m.to] || 'asignado'}` : 'Quedó sin responsable';
    case 'updated': return [m.service_label !== undefined && `Trámite: ${m.service_label}`, m.value !== undefined && `Valor: ${money(m.value)}`].filter(Boolean).join(' · ') || 'Datos actualizados';
    case 'tag_added': return `Etiqueta agregada: ${m.tag || ''}`;
    case 'tag_removed': return `Etiqueta quitada: ${m.tag || ''}`;
    default: return e.event_type;
  }
}

const dayLabel = (iso) => new Date(iso).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });

// Tarjeta del lead a pantalla completa, como en Kommo: a la izquierda los datos (con la barra de etapas del
// embudo), a la derecha la línea de tiempo (chat de WhatsApp, notas y eventos) y abajo el compositor.
export default function LeadCard({ lead, onClose, onOpenClient }) {
  const qc = useQueryClient();
  const { userId } = useAuth();
  const { pipelines, stages, team, tags, leadTags, teamById } = useCrmData();
  const move = useMoveLead(stages);
  const refresh = useRefreshLead();
  const retry = useRetryUnsynced();
  const kommoUrl = useKommoLeadUrl();
  const [tab, setTab] = useState('main');
  const [mode, setMode] = useState('chat');
  const [service, setService] = useState(lead.service_label || '');
  const [value, setValue] = useState(lead.value ?? '');
  const [newTag, setNewTag] = useState(null);
  const [note, setNote] = useState('');
  const [task, setTask] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  const services = useQuery({ queryKey: ['services'], queryFn: getServices, staleTime: 10 * 60_000 });
  const events = useQuery({ queryKey: [...KEYS.events, lead.id], queryFn: () => getLeadEvents([lead.id], 100) });
  const tasks = useQuery({ queryKey: [...KEYS.tasks, lead.client_id], queryFn: () => getOpenTasks({ clientId: lead.client_id }), enabled: !!lead.client_id });
  const convs = useQuery({ queryKey: KEYS.conversations, queryFn: getConversations });
  const conv = (convs.data || []).find((c) => (lead.client_id && c.client_id === lead.client_id)
    || (lead.external_contact_id && c.kommo_contact_id === lead.external_contact_id));
  const messages = useQuery({ queryKey: ['crm', 'messages', conv?.id], queryFn: () => getConversationMessages(conv.id), enabled: !!conv, refetchInterval: 10_000 });

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pipeline = (pipelines.data || []).find((p) => p.id === lead.pipeline_id);
  const pipelineStages = pipeline?.stages || stages;
  const openStages = pipelineStages.filter((s) => s.kind === 'open');
  const current = pipelineStages.find((s) => s.id === lead.stage_id);
  const currentIdx = openStages.findIndex((s) => s.id === lead.stage_id);
  const color = stageColor(current);
  const myTagIds = new Set((leadTags.data || []).filter((t) => t.lead_id === lead.id).map((t) => t.tag_id));
  const myTags = (tags.data || []).filter((t) => myTagIds.has(t.id));
  const otherTags = (tags.data || []).filter((t) => !myTagIds.has(t.id));
  const lastMove = (events.data || []).find((e) => e.event_type === 'stage_changed');
  const unsyncedMove = lastMove && SYNC_LABEL[lastMove.sync_status] ? lastMove : null;

  // Línea de tiempo: mensajes + notas + eventos, en orden cronológico.
  const feed = useMemo(() => {
    const items = [
      ...(messages.data || []).map((m) => ({ ...m, __kind: 'msg' })),
      ...(events.data || []).map((e) => (e.event_type === 'note'
        ? { id: `n-${e.id}`, __kind: 'msg', __note: true, content: e.metadata?.text, created_at: e.created_at, author: teamById[e.actor_id] || 'Equipo' }
        : { ...e, id: `e-${e.id}`, __kind: 'event' })),
    ];
    return items.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }, [messages.data, events.data, teamById]);
  const days = feed.map((i) => new Date(i.created_at).toDateString());

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [feed.length]);

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
  const saveNote = () => note.trim() && run(async () => { await addNote(lead.id, note, userId); setNote(''); }, 'Nota guardada');
  const saveTask = () => task.trim() && run(async () => {
    await createTask({ clientId: lead.client_id, conversationId: conv?.id, title: task, dueAt: taskDue ? new Date(taskDue).toISOString() : null });
    setTask('');
    setTaskDue('');
    qc.invalidateQueries({ queryKey: KEYS.tasks });
  }, 'Tarea creada');

  // Se responde "por el lead" si existe en Kommo (queda atendido y Nora no contesta lo mismo); si no, por el contacto.
  const to = lead.external_id ? { kommoLeadId: lead.external_id } : lead.client_id ? { clientId: lead.client_id } : null;
  const afterSend = () => {
    qc.invalidateQueries({ queryKey: ['crm', 'messages', conv?.id] });
    qc.invalidateQueries({ queryKey: KEYS.conversations });
    qc.invalidateQueries({ queryKey: KEYS.leads });
  };

  const bare = 'w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-[13px] text-text-primary outline-none hover:border-border focus:border-brand-primary focus:bg-bg-surface';
  const kommoLink = kommoUrl(lead.external_id);

  return (
    <div className="fixed inset-0 z-[250] flex bg-bg-base">
      {/* Columna izquierda: datos del lead */}
      <aside className="flex w-[380px] shrink-0 flex-col border-r border-border bg-bg-surface">
        <div className="border-b border-border px-5 pb-4 pt-3">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <button onClick={onClose} className="-ml-1 rounded p-1 hover:bg-bg-elevated hover:text-text-primary" aria-label="Volver"><ArrowLeft size={16} /></button>
            <span>{pipeline?.name || 'Lead'}{lead.external_id ? ` · #${lead.external_id}` : ''}</span>
            {kommoLink && <a href={kommoLink} target="_blank" rel="noreferrer" className="ml-auto rounded p-1 hover:bg-bg-elevated hover:text-text-primary" title="Ver en Kommo"><ExternalLink size={14} /></a>}
          </div>
          <h2 className="mt-2 truncate text-lg font-semibold text-text-primary">{lead.name || 'Sin nombre'}</h2>

          <div className="mt-2 flex flex-wrap items-center gap-1">
            {myTags.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-0.5 rounded bg-bg-elevated px-1.5 py-0.5 text-[11px] text-text-secondary">
                #{t.name}
                <button aria-label={`Quitar ${t.name}`} className="text-text-muted hover:text-text-primary" onClick={() => run(() => removeTagFromLead(lead.id, t.id))}><X size={10} /></button>
              </span>
            ))}
            {newTag === null ? (
              <select className="h-5 rounded bg-transparent text-[11px] text-brand-primary outline-none" value=""
                onChange={(e) => (e.target.value === '__new' ? setNewTag('') : e.target.value && run(() => addTagToLeads([lead.id], e.target.value)))}>
                <option value="">+ etiqueta</option>
                {otherTags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                <option value="__new">Nueva…</option>
              </select>
            ) : (
              <input autoFocus className="h-5 w-24 rounded bg-bg-elevated px-1.5 text-[11px] text-text-primary outline-none placeholder:text-text-muted" placeholder="Nombre y Enter"
                value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addNewTag(); if (e.key === 'Escape') setNewTag(null); }} onBlur={addNewTag} />
            )}
          </div>

          {/* Barra de etapas del embudo (clic en un tramo = mover a esa etapa) */}
          <div className="mt-4 flex gap-0.5">
            {openStages.map((s, i) => (
              <button key={s.id} title={s.name} onClick={() => move(lead, s.id)} disabled={busy}
                className="h-1.5 flex-1 rounded-sm transition-opacity hover:opacity-80"
                style={{ background: currentIdx >= 0 && i <= currentIdx ? color : 'var(--color-bg-elevated)' }} />
            ))}
          </div>
          <select className="mt-2 -ml-1 max-w-full rounded bg-transparent px-1 py-0.5 text-[13px] font-medium text-text-primary outline-none hover:bg-bg-elevated"
            value={lead.stage_id || ''} onChange={(e) => move(lead, e.target.value)} disabled={busy} aria-label="Etapa">
            {!lead.stage_id && <option value="">{lead.stage_name || 'Sin etapa'}</option>}
            {pipelineStages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {unsyncedMove && (
            <p className="mt-1 text-[11px] text-warning">
              Cambio {SYNC_LABEL[unsyncedMove.sync_status]} · <button className="underline" onClick={() => retry([unsyncedMove.id])}>reintentar</button>
            </p>
          )}
        </div>

        <div className="flex gap-5 border-b border-border px-5 text-[13px]">
          {[['main', 'Principal'], ['contact', 'Contacto']].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`-mb-px border-b-2 py-2.5 ${tab === k ? 'border-brand-primary font-medium text-text-primary' : 'border-transparent text-text-muted hover:text-text-primary'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {tab === 'main' ? (
            <dl className="grid grid-cols-[110px_1fr] items-center gap-x-2 gap-y-1 text-[13px]">
              <dt className="text-text-muted">Responsable</dt>
              <dd>
                <select className={bare} value={lead.assigned_to || ''} onChange={(e) => saveField({ assigned_to: e.target.value })} disabled={busy}>
                  <option value="">Sin asignar</option>
                  {(team.data || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </dd>
              <dt className="text-text-muted">Presupuesto</dt>
              <dd>
                <input className={bare} type="number" min="0" value={value} placeholder="R$ 0" onChange={(e) => setValue(e.target.value)}
                  onBlur={saveValue} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
              </dd>
              <dt className="text-text-muted">Trámite</dt>
              <dd>
                <input className={bare} list={`svc-${lead.id}`} value={service} placeholder="…" onChange={(e) => setService(e.target.value)}
                  onBlur={saveService} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
                <datalist id={`svc-${lead.id}`}>{(services.data || []).map((s) => <option key={s.id} value={s.name} />)}</datalist>
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
              <dt className="text-text-muted">Origen</dt>
              <dd className="px-1.5 py-1 text-text-primary">{lead.lead_source || (lead.external_id ? 'kommo' : '—')}</dd>
              <dt className="text-text-muted">Creado</dt>
              <dd className="px-1.5 py-1 text-text-primary">{new Date(lead.created_at).toLocaleDateString('es')} · {relTime(lead.created_at)}</dd>
            </dl>
          ) : (
            <div className="flex flex-col gap-2.5 text-[13px]">
              <p className="text-[15px] font-medium text-text-primary">{lead.name || 'Sin nombre'}</p>
              {lead.phone && <p className="flex items-center gap-2 text-text-secondary"><Phone size={13} className="text-text-muted" /> {lead.phone}</p>}
              {lead.country && <p className="flex items-center gap-2 text-text-secondary"><span className="w-[13px] text-center">{flag(lead.country) || '·'}</span> {lead.country}</p>}
              {lead.city && <p className="flex items-center gap-2 text-text-secondary"><MapPin size={13} className="text-text-muted" /> {lead.city}</p>}
              {lead.client_id && onOpenClient && (
                <button className="mt-1 inline-flex items-center gap-1.5 self-start text-brand-primary hover:underline" onClick={() => { onClose(); onOpenClient(lead.client_id, lead.name); }}>
                  <User size={13} /> Abrir ficha del contacto
                </button>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* Columna derecha: línea de tiempo + compositor */}
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border bg-bg-surface px-5 text-[13px]">
          <span className="font-medium text-text-primary">Historial</span>
          <span className="text-text-muted">{conv ? 'WhatsApp' : 'Sin conversación de WhatsApp'}</span>
          <button onClick={onClose} className="ml-auto rounded p-1 text-text-muted hover:bg-bg-elevated hover:text-text-primary" aria-label="Cerrar"><X size={18} /></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-8 py-4">
          <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
            {feed.map((it, i) => (
              <React.Fragment key={it.id}>
                {(i === 0 || days[i] !== days[i - 1]) && (
                  <p className="my-3 self-center text-[11px] uppercase tracking-wide text-text-muted">{dayLabel(it.created_at)}</p>
                )}
                {it.__kind === 'event' ? (
                  <p className="self-center text-[12px] text-text-muted">
                    {eventText(it, teamById)}
                    <span className="ml-1.5 text-[11px]">
                      · {new Date(it.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                      {it.actor_id && teamById[it.actor_id] ? ` · ${teamById[it.actor_id]}` : ''}
                    </span>
                  </p>
                ) : (
                  <MessageBubble m={it} />
                )}
              </React.Fragment>
            ))}
            {!events.isLoading && feed.length === 0 && <p className="self-center py-10 text-sm text-text-muted">Todavía no hay actividad.</p>}

            {(tasks.data || []).length > 0 && (
              <div className="mt-3 flex flex-col gap-1.5">
                {tasks.data.map((t) => (
                  <div key={t.id} className="flex items-center gap-2.5 rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-[13px]">
                    <button disabled={busy || AUTO_CLOSE.has(t.kind)} onClick={() => run(async () => { await completeTask(t.id); qc.invalidateQueries({ queryKey: KEYS.tasks }); }, 'Tarea completada')}
                      title={AUTO_CLOSE.has(t.kind) ? 'Se cierra sola' : 'Marcar como hecha'}
                      className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-warning bg-bg-surface text-transparent hover:text-success disabled:opacity-40">
                      <Check size={11} />
                    </button>
                    <span className="font-medium text-warning">Tarea</span>
                    <span className="min-w-0 flex-1 truncate text-text-primary">{t.title}</span>
                    {t.due_at && <span className="text-[11px] text-text-muted">{new Date(t.due_at).toLocaleDateString('es')}</span>}
                  </div>
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        {/* Compositor: Chat / Nota / Tarea */}
        <div className="shrink-0 border-t border-border bg-bg-surface">
          <div className="flex gap-1 px-4 pt-2 text-[13px]">
            {[['chat', 'Chat'], ['note', 'Nota'], ['task', 'Tarea']].map(([k, label]) => (
              <button key={k} onClick={() => setMode(k)}
                className={`rounded px-2.5 py-1 ${mode === k ? 'bg-brand-primary-light font-medium text-brand-primary' : 'text-text-muted hover:text-text-primary'}`}>
                {label}
              </button>
            ))}
          </div>
          {mode === 'chat' && (to ? (
            <ReplyBox placeholder="Escribe un mensaje de WhatsApp…"
              onSend={async (text) => { await sendText(to, text); afterSend(); }}
              onSendFile={async (file, caption) => { await sendFile(to, file, caption); afterSend(); }} />
          ) : (
            <p className="px-4 py-3 text-xs text-text-muted">Este lead no tiene teléfono ni contacto para enviar WhatsApp.</p>
          ))}
          {mode === 'note' && (
            <div className="flex gap-2 p-3">
              <textarea className={`${inputCls} resize-none`} rows={2} placeholder="Nota interna (solo la ve el equipo)" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className={`${btnPrimaryCls} self-end`} onClick={saveNote} disabled={busy || !note.trim()}>Guardar</button>
            </div>
          )}
          {mode === 'task' && (lead.client_id ? (
            <div className="flex gap-2 p-3">
              <input className={inputCls} placeholder="¿Qué hay que hacer?" value={task} onChange={(e) => setTask(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveTask()} />
              <input type="date" className={`${inputCls} !w-40`} value={taskDue} onChange={(e) => setTaskDue(e.target.value)} aria-label="Vence" />
              <button className={btnPrimaryCls} onClick={saveTask} disabled={busy || !task.trim()}>Crear</button>
            </div>
          ) : (
            <p className="px-4 py-3 text-xs text-text-muted">Este lead todavía no tiene contacto vinculado.</p>
          ))}
        </div>
      </main>
    </div>
  );
}

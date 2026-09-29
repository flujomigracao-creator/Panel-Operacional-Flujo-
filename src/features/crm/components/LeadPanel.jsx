import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X, User, MessageSquare, ListPlus, StickyNote, Tag as TagIcon } from 'lucide-react';
import { useAuth } from '@features/auth/context/AuthContext';
import { useOrganization } from '@/context/OrganizationContext';
import { useCrmData, useMoveLead, KEYS } from '../useCrm';
import { assignLeads, addNote, createTask, createTag, addTagToLeads, removeTagFromLead, getLeadEvents } from '../services/crmService';
import { Avatar, Field, StagePill } from '../ui';
import { money, relTime, selectCls, inputCls, btnCls, btnPrimaryCls } from '../format';

const EVENT_TEXT = {
  stage_changed: (e) => `Etapa: ${e.metadata?.from || '—'} → ${e.metadata?.to || '—'}`,
  note: (e) => `Nota: ${e.metadata?.text || ''}`,
};

const SYNC_LABEL = { pending: 'pendiente en Kommo', failed: 'no llegó a Kommo' };

// Panel lateral con todo lo que el operador cambia de un lead sin salir de la pantalla en la que está.
export default function LeadPanel({ lead, onClose, onOpenClient, onOpenChat }) {
  const qc = useQueryClient();
  const { userId } = useAuth();
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const { stages, team, tags, leadTags } = useCrmData();
  const move = useMoveLead(stages);
  const [task, setTask] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const events = useQuery({ queryKey: ['crm', 'events', lead.id], queryFn: () => getLeadEvents([lead.id], 50) });
  const myTagIds = (leadTags.data || []).filter((t) => t.lead_id === lead.id).map((t) => t.tag_id);
  const myTags = (tags.data || []).filter((t) => myTagIds.includes(t.id));
  const availableTags = (tags.data || []).filter((t) => !myTagIds.includes(t.id));

  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      await fn();
      if (okMsg) toast.success(okMsg);
    } catch (err) {
      toast.error(err.message || 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  };
  const refreshLeads = () => qc.invalidateQueries({ queryKey: KEYS.leads });
  const refreshEvents = () => qc.invalidateQueries({ queryKey: ['crm', 'events', lead.id] });

  const changeStage = async (stageId) => {
    await move(lead, stageId);
    refreshEvents();
  };
  const changeOwner = (userIdValue) => run(async () => { await assignLeads([lead.id], userIdValue || null); refreshLeads(); refreshEvents(); }, 'Responsable actualizado');
  const addTag = (tagId) => run(async () => { await addTagToLeads(orgId, [lead.id], tagId); qc.invalidateQueries({ queryKey: KEYS.leadTags }); });
  const newTag = () => {
    const name = window.prompt('Nombre de la etiqueta');
    if (!name?.trim()) return;
    run(async () => {
      const t = await createTag(orgId, name);
      await addTagToLeads(orgId, [lead.id], t.id);
      qc.invalidateQueries({ queryKey: KEYS.tags });
      qc.invalidateQueries({ queryKey: KEYS.leadTags });
    });
  };
  const saveTask = () => task.trim() && run(async () => {
    await createTask({ organizationId: orgId, clientId: lead.client_id, title: task });
    setTask('');
  }, 'Tarea creada');
  const saveNote = () => note.trim() && run(async () => {
    await addNote(orgId, lead.id, note, userId);
    setNote('');
    refreshEvents();
  }, 'Nota guardada');

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col overflow-y-auto border-l border-border bg-bg-surface">
      <header className="flex items-start gap-2 border-b border-border p-3">
        <Avatar name={lead.name} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-text-primary">{lead.name || 'Sin nombre'}</p>
          <p className="truncate text-xs text-text-muted">{[lead.phone, lead.country, lead.city].filter(Boolean).join(' · ') || '—'}</p>
        </div>
        {onClose && <button onClick={onClose} aria-label="Cerrar" className="rounded p-1 text-text-muted hover:bg-bg-elevated"><X size={16} /></button>}
      </header>

      <div className="flex flex-col gap-4 p-3">
        <div className="flex gap-2">
          {lead.client_id && onOpenClient && <button className={btnCls} onClick={() => onOpenClient(lead.client_id, lead.name)}><User size={13} /> Contacto</button>}
          {lead.client_id && onOpenChat && <button className={btnCls} onClick={() => onOpenChat(lead)}><MessageSquare size={13} /> Chat</button>}
        </div>

        <Field label="Etapa">
          <select className={selectCls} value={lead.stage_id || ''} onChange={(e) => changeStage(e.target.value)} disabled={busy}>
            {!lead.stage_id && <option value="">{lead.stage_name || 'Sin etapa'}</option>}
            {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>

        <Field label="Responsable">
          <select className={selectCls} value={lead.assigned_to || ''} onChange={(e) => changeOwner(e.target.value)} disabled={busy}>
            <option value="">Sin asignar</option>
            {(team.data || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Trámite"><p className="text-[13px] text-text-primary">{lead.service_label || '—'}</p></Field>
          <Field label="Valor"><p className="text-[13px] text-text-primary">{money(lead.value) || '—'}</p></Field>
        </div>

        <Field label="Etiquetas">
          <div className="flex flex-wrap items-center gap-1">
            {myTags.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1 rounded bg-bg-elevated px-1.5 py-0.5 text-[11px] text-text-secondary">
                {t.name}
                <button aria-label={`Quitar ${t.name}`} onClick={() => run(async () => { await removeTagFromLead(lead.id, t.id); qc.invalidateQueries({ queryKey: KEYS.leadTags }); })}><X size={10} /></button>
              </span>
            ))}
            {availableTags.length > 0 && (
              <select className="rounded border border-border bg-bg-surface px-1 py-0.5 text-[11px] text-text-secondary" value="" onChange={(e) => e.target.value && addTag(e.target.value)}>
                <option value="">+ etiqueta</option>
                {availableTags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
            <button className="inline-flex items-center gap-1 text-[11px] text-brand-primary" onClick={newTag}><TagIcon size={10} /> nueva</button>
          </div>
        </Field>

        <Field label="Crear tarea">
          <div className="flex gap-1.5">
            <input className={inputCls} placeholder="Ej.: pedir foto del pasaporte" value={task} onChange={(e) => setTask(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveTask()} />
            <button className={btnCls} onClick={saveTask} disabled={busy || !task.trim()} aria-label="Crear tarea"><ListPlus size={14} /></button>
          </div>
        </Field>

        <Field label="Nota interna">
          <textarea className={inputCls} rows={2} placeholder="Solo la ve el equipo" value={note} onChange={(e) => setNote(e.target.value)} />
          <button className={`${btnPrimaryCls} mt-1.5`} onClick={saveNote} disabled={busy || !note.trim()}><StickyNote size={13} /> Guardar nota</button>
        </Field>

        <Field label="Actividad">
          <ul className="flex flex-col gap-2">
            {(events.data || []).map((e) => (
              <li key={e.id} className="text-xs text-text-secondary">
                <span className="text-text-primary">{(EVENT_TEXT[e.event_type] || (() => e.event_type))(e)}</span>
                <span className="ml-1 text-text-muted">· {relTime(e.created_at)}{SYNC_LABEL[e.sync_status] ? ` · ${SYNC_LABEL[e.sync_status]}` : ''}</span>
              </li>
            ))}
            {events.data?.length === 0 && <li className="text-xs text-text-muted">Sin actividad registrada desde el panel.</li>}
          </ul>
        </Field>

        <div className="text-[11px] text-text-muted">
          Etapa actual: <StagePill name={lead.stage_name} kind={lead.stage_kind} />
        </div>
      </div>
    </aside>
  );
}

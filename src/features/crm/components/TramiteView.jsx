import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Check, Send, MessageSquare, User } from 'lucide-react';
import { sendReply } from '@features/clients/services/clientDetailService';
import { useCrmData, KEYS } from '../useCrm';
import { getTramite, updateTramite, createTask, completeTask } from '../services/crmService';
import { Checklist } from './Contact360';
import { Loading, ErrorText } from '../ui';
import { money, relTime, flag, inputCls, selectCls, btnPrimaryCls } from '../format';
import { TRAMITE_STATUS, tramiteIssue, ISSUE_TONE } from '../tramites';

const PAY_STATUS = { paid: ['Pagado', 'text-success'], pending: ['Pendiente', 'text-warning'], partial: ['Parcial', 'text-warning'], overdue: ['Vencido', 'text-danger'] };
const DOC_STATUS = { pending: 'pendiente', received: 'por revisar', approved: 'aprobado', rejected: 'rechazado', expired: 'vencido' };

function Block({ title, action, children }) {
  return (
    <section className="border-b border-border px-6 py-4 last:border-0">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Side({ label, children }) {
  return (
    <div className="border-b border-border px-5 py-3.5 last:border-0">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">{label}</p>
      {children}
    </div>
  );
}

// Detalle de un trámite: a la izquierda qué es y qué falta; a la derecha estado, responsable y qué sigue.
export default function TramiteView({ tramiteId, onBack, onNavigateToClient, onOpenChat }) {
  const qc = useQueryClient();
  const { team, teamById, leads } = useCrmData();
  const [task, setTask] = useState('');
  const [busy, setBusy] = useState(false);
  const key = ['crm', 'tramite', tramiteId];
  const q = useQuery({ queryKey: key, queryFn: () => getTramite(tramiteId), enabled: !!tramiteId });

  if (q.isLoading) return <Loading />;
  if (q.error || !q.data) return <ErrorText error={q.error || 'Trámite no encontrado'} what="el trámite" />;
  const t = q.data;
  const client = t.clients || {};
  const stageName = Object.fromEntries(t.stages.map((s) => [s.id, s.name]));
  const idx = t.stages.findIndex((s) => s.id === t.stage_id);
  const issue = tramiteIssue(t, t.checklist);
  const required = t.checklist.filter((i) => i.required);
  const done = required.filter((i) => i.estado === 'ok').length;
  const missing = t.checklist.filter((i) => i.ask_client && ['falta', 'rechazado', 'vencido'].includes(i.estado));
  const city = (t.checklist.find((i) => /cidade|ciudad/i.test(i.codigo || ''))?.field_value)
    || (leads.data || []).find((l) => l.client_id === t.client_id && l.city)?.city;
  const country = client.nationality || client.country;
  const nextTask = t.tasks[0];

  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ['crm', 'tramites'] });
    qc.invalidateQueries({ queryKey: ['client_detail', t.client_id] });
  };
  const run = async (fn, ok) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
      refresh();
    } catch (err) {
      toast.error(err.message || 'No se pudo guardar');
    } finally {
      setBusy(false);
    }
  };
  const save = (patch, ok) => run(() => updateTramite(t.id, patch), ok);

  const askMissing = () => {
    const nombre = (client.full_name || '').split(' ')[0];
    const texto = `Hola ${nombre}, para avanzar con tu ${t.services?.name || 'trámite'} todavía necesitamos:\n\n${missing.map((i) => `• ${i.label}${i.estado === 'rechazado' && i.motivo ? ` (la anterior no sirvió: ${i.motivo})` : ''}`).join('\n')}\n\nPuedes enviarlo por aquí mismo. ¡Gracias!`;
    if (!window.confirm(`Se enviará este mensaje por WhatsApp:\n\n${texto}`)) return;
    run(() => sendReply(t.client_id, texto), 'Mensaje enviado');
  };

  const history = [
    ...t.events.map((e) => ({
      id: `e-${e.id}`, at: e.created_at, who: teamById[e.created_by],
      text: e.to_stage_id ? `Etapa: ${stageName[e.from_stage_id] || '—'} → ${stageName[e.to_stage_id] || '—'}` : e.event_type.replace(/_/g, ' '),
    })),
    ...t.documents.map((d) => ({ id: `d-${d.id}`, at: d.created_at, text: `Documento ${DOC_STATUS[d.status] || d.status}: ${d.document_types?.name || d.file_name}` })),
    ...t.payments.filter((p) => p.paid_at).map((p) => ({ id: `p-${p.id}`, at: p.paid_at, text: `Pago recibido: ${money(p.amount)}` })),
    ...(t.created_at ? [{ id: 'created', at: t.created_at, text: 'Trámite creado' }] : []),
  ].filter((h) => h.at).sort((a, b) => new Date(b.at) - new Date(a.at));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-bg-surface px-5">
        <button onClick={onBack} className="-ml-1 rounded p-1 text-text-muted hover:bg-bg-elevated hover:text-text-primary" aria-label="Volver"><ArrowLeft size={17} /></button>
        <h1 className="text-[15px] font-semibold text-text-primary">{t.services?.name || 'Trámite'}</h1>
        <span className="text-[13px] text-text-muted">·</span>
        <button className="text-[13px] text-brand-primary hover:underline" onClick={() => onNavigateToClient(t.client_id, client.full_name)}>{client.full_name || 'Sin nombre'}</button>
        {issue && <span className={`ml-2 text-[13px] ${ISSUE_TONE[issue.level]}`}>{issue.text}</span>}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Columna principal */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-bg-surface">
          <Block title="Información del trámite">
            <dl className="grid grid-cols-[140px_1fr] gap-y-1.5 text-[13px]">
              <dt className="text-text-muted">Cliente</dt><dd className="text-text-primary">{client.full_name || '—'}</dd>
              <dt className="text-text-muted">Tipo</dt><dd className="text-text-primary">{t.services?.name || '—'}</dd>
              <dt className="text-text-muted">Nacionalidad</dt><dd className="text-text-primary">{country ? `${flag(country)} ${country}`.trim() : '—'}</dd>
              <dt className="text-text-muted">Ciudad</dt><dd className="text-text-primary">{city || '—'}</dd>
              <dt className="text-text-muted">Teléfono</dt><dd className="text-text-primary">{client.phone || '—'}</dd>
              <dt className="text-text-muted">Fecha de inicio</dt><dd className="text-text-primary">{t.started_at || t.created_at ? new Date(t.started_at || t.created_at).toLocaleDateString('es') : '—'}</dd>
              {t.price != null && <><dt className="text-text-muted">Valor</dt><dd className="text-text-primary">{money(t.price)}</dd></>}
            </dl>
          </Block>

          <Block
            title={required.length ? `Documentos y datos · ${done}/${required.length}` : 'Documentos y datos'}
            action={missing.length > 0 && (
              <button className="inline-flex items-center gap-1 text-xs font-medium text-brand-primary hover:underline disabled:opacity-50" disabled={busy} onClick={askMissing}>
                <Send size={12} /> Pedir lo que falta por WhatsApp
              </button>
            )}
          >
            <div className="-mx-4 -my-3"><Checklist items={t.checklist} /></div>
          </Block>

          <Block title="Historial">
            <ul className="flex flex-col gap-2">
              {history.map((h) => (
                <li key={h.id} className="flex items-baseline gap-3 text-[13px]">
                  <span className="w-24 shrink-0 text-xs text-text-muted">{new Date(h.at).toLocaleDateString('es', { day: '2-digit', month: 'short' })}</span>
                  <span className="min-w-0 flex-1 text-text-primary">{h.text}</span>
                  {h.who && <span className="text-xs text-text-muted">{h.who}</span>}
                </li>
              ))}
            </ul>
          </Block>
        </div>

        {/* Columna lateral: estado y qué sigue */}
        <aside className="w-80 shrink-0 overflow-y-auto border-l border-border bg-bg-surface">
          <Side label="Estado">
            <select className={selectCls} value={t.status} disabled={busy} onChange={(e) => save({ status: e.target.value }, 'Estado actualizado')}>
              {Object.entries(TRAMITE_STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </select>
          </Side>
          <Side label="Etapa">
            {t.stages.length > 0 && (
              <div className="mb-2 flex gap-0.5">
                {t.stages.map((s, i) => <span key={s.id} title={s.name} className={`h-1 flex-1 rounded-sm ${idx >= 0 && i <= idx ? 'bg-brand-primary' : 'bg-bg-elevated'}`} />)}
              </div>
            )}
            <select className={selectCls} value={t.stage_id || ''} disabled={busy} onChange={(e) => save({ stage_id: e.target.value }, 'Etapa actualizada')}>
              {!t.stage_id && <option value="">Sin etapa</option>}
              {t.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Side>
          <Side label="Responsable">
            <select className={selectCls} value={t.assigned_to || ''} disabled={busy} onChange={(e) => save({ assigned_to: e.target.value || null }, 'Responsable actualizado')}>
              <option value="">Sin asignar</option>
              {(team.data || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Side>
          <Side label="Próxima tarea">
            {nextTask ? (
              <div className="flex items-start gap-2 text-[13px]">
                <button disabled={busy || nextTask.kind === 'inscricao_receita'} onClick={() => run(async () => { await completeTask(nextTask.id); qc.invalidateQueries({ queryKey: KEYS.tasks }); }, 'Tarea completada')}
                  title="Marcar como hecha" className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border-hover text-transparent hover:border-success hover:text-success disabled:opacity-40">
                  <Check size={11} />
                </button>
                <div className="min-w-0">
                  <p className="text-text-primary">{nextTask.title}</p>
                  {nextTask.due_at && <p className="text-xs text-text-muted">vence {relTime(nextTask.due_at)}</p>}
                  {t.tasks.length > 1 && <p className="text-xs text-text-muted">+{t.tasks.length - 1} más</p>}
                </div>
              </div>
            ) : (
              <p className="text-xs text-text-muted">Sin tareas.</p>
            )}
            <input className={`${inputCls} mt-2`} placeholder="Nueva tarea y Enter" value={task} onChange={(e) => setTask(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && task.trim() && run(async () => {
                await createTask({ clientId: t.client_id, clientServiceId: t.id, title: task });
                setTask('');
              }, 'Tarea creada')} />
          </Side>
          <Side label="Pagos">
            {t.payments.length ? (
              <ul className="flex flex-col gap-1 text-[13px]">
                {t.payments.map((p) => {
                  const [lbl, cls] = PAY_STATUS[p.status] || [p.status, 'text-text-muted'];
                  return <li key={p.id} className="flex justify-between"><span className="tabular-nums text-text-primary">{money(p.amount)}</span><span className={`text-xs ${cls}`}>{lbl}</span></li>;
                })}
              </ul>
            ) : <p className="text-xs text-text-muted">Sin pagos registrados.</p>}
          </Side>
          <div className="flex flex-col gap-1.5 px-5 py-4">
            {onOpenChat && <button className={`${btnPrimaryCls} justify-center`} onClick={() => onOpenChat(t.client_id)}><MessageSquare size={14} /> Conversación</button>}
            <button className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border text-[13px] text-text-primary hover:bg-bg-elevated" onClick={() => onNavigateToClient(t.client_id, client.full_name)}>
              <User size={14} /> Ficha del cliente
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

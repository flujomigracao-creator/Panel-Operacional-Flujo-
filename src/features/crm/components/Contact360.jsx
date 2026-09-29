import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, MessageSquare, LayoutList, Phone, Mail, Check, X, Clock, RotateCcw, Circle, Send, ExternalLink } from 'lucide-react';
import { getClientDetail, updateTramite, sendReply } from '@features/clients/services/clientDetailService';
import { CLIENT_STATUS } from '@features/clients/services/clientsService';
import { useCrmData, KEYS } from '../useCrm';
import { getChecklist, getOpenTasks, completeTask, getLeadEvents, pushTramiteToKommo } from '../services/crmService';
import ContactLeads from './ContactLeads';
import { Loading, ErrorText } from '../ui';
import { money, relTime, flag, stageColor } from '../format';

const TRAMITE_STATUS = {
  pending: ['Pendiente', 'bg-warning-bg text-warning'],
  in_progress: ['En curso', 'bg-info-bg text-info'],
  on_hold: ['En pausa', 'bg-warning-bg text-warning'],
  completed: ['Concluido', 'bg-success-bg text-success'],
  cancelled: ['Cancelado', 'bg-bg-elevated text-text-muted'],
};
const isActive = (t) => ['pending', 'in_progress', 'on_hold'].includes(t.status);

// Cómo se ve cada estado del checklist.
const ITEM = {
  ok: { icon: Check, cls: 'text-success', label: 'OK' },
  revisar: { icon: Clock, cls: 'text-info', label: 'Por revisar' },
  rechazado: { icon: X, cls: 'text-danger', label: 'Rechazado' },
  vencido: { icon: X, cls: 'text-danger', label: 'Vencido' },
  reutilizable: { icon: RotateCcw, cls: 'text-warning', label: 'Aprobado en otro trámite' },
  falta: { icon: Circle, cls: 'text-text-disabled', label: 'Falta' },
};

const DOC_STATUS = {
  pending: ['Pendiente', 'text-warning'],
  received: ['Por revisar', 'text-info'],
  approved: ['Aprobado', 'text-success'],
  rejected: ['Rechazado', 'text-danger'],
  expired: ['Vencido', 'text-danger'],
};
const PAY_STATUS = { paid: ['Pagado', 'text-success'], pending: ['Pendiente', 'text-warning'], partial: ['Parcial', 'text-warning'], overdue: ['Vencido', 'text-danger'] };

function Box({ title, count, action, children }) {
  return (
    <section className="rounded-lg border border-border bg-bg-surface">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <h3 className="text-[13px] font-semibold text-text-primary">{title}</h3>
        {count != null && <span className="text-xs text-text-muted">{count}</span>}
        <div className="ml-auto">{action}</div>
      </header>
      <div>{children}</div>
    </section>
  );
}

export function Checklist({ items }) {
  if (!items.length) return <p className="px-4 py-3 text-xs text-text-muted">Este servicio todavía no tiene checklist configurado.</p>;
  const groups = [['foto', 'Documentos'], ['dado', 'Datos']];
  return (
    <div className="grid gap-x-6 px-4 py-3 md:grid-cols-2">
      {groups.map(([kind, title]) => {
        const list = items.filter((i) => i.kind === kind);
        if (!list.length) return null;
        return (
          <div key={kind}>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-text-muted">{title}</p>
            <ul className="flex flex-col gap-1">
              {list.map((i) => {
                const meta = ITEM[i.estado] || ITEM.falta;
                const Icon = meta.icon;
                return (
                  <li key={i.requirement_id} className="flex items-start gap-2 text-[13px]" title={meta.label}>
                    <Icon size={14} className={`mt-0.5 shrink-0 ${meta.cls}`} strokeWidth={2.5} />
                    <span className={`min-w-0 flex-1 ${i.estado === 'ok' ? 'text-text-secondary' : 'text-text-primary'}`}>
                      {i.label}{!i.required && <span className="text-text-muted"> (opcional)</span>}
                      {i.estado === 'reutilizable' && <span className="block text-[11px] text-warning">Aprobado en {i.reuse_from}: se puede reutilizar</span>}
                      {(i.estado === 'rechazado' || i.estado === 'vencido') && i.motivo && <span className="block text-[11px] text-danger">{i.motivo}</span>}
                      {i.kind === 'dado' && i.estado === 'ok' && i.field_value && <span className="block truncate text-[11px] text-text-muted">{i.field_value}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function TramiteCard({ t, items, payments, onAskMissing, onStage, onOpen, busy }) {
  const [label, cls] = TRAMITE_STATUS[t.status] || [t.status, 'bg-bg-elevated text-text-muted'];
  const stages = t.stages || [];
  const idx = stages.findIndex((s) => s.id === t.stage_id);
  const required = items.filter((i) => i.required);
  const done = required.filter((i) => i.estado === 'ok').length;
  const missing = items.filter((i) => i.ask_client && ['falta', 'rechazado', 'vencido'].includes(i.estado));
  const paid = payments.filter((p) => p.status === 'paid').reduce((s, p) => s + Number(p.amount || 0), 0);
  const due = payments.filter((p) => p.status !== 'paid').reduce((s, p) => s + Number(p.amount || 0), 0);
  const color = stageColor({ position: (idx + 1) * 10 });

  return (
    <section className="rounded-lg border border-border bg-bg-surface">
      <header className="flex flex-wrap items-center gap-2 px-4 pt-3">
        <button className="text-sm font-semibold text-text-primary hover:text-brand-primary hover:underline" onClick={() => onOpen?.(t.id)}>{t.servicio || 'Trámite'}</button>
        <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>{label}</span>
        {!t.esTitular && <span className="text-[11px] text-text-muted">· {t.rol || 'participante'} de {t.titular?.full_name}</span>}
        <span className="ml-auto text-xs text-text-muted">
          {paid > 0 && <span className="text-success">{money(paid)} pagado</span>}
          {due > 0 && <span className="ml-2 text-warning">{money(due)} pendiente</span>}
          {!paid && !due && t.price ? money(t.price) : ''}
        </span>
      </header>

      {stages.length > 0 && (
        <div className="px-4 pt-3">
          <div className="flex gap-0.5">
            {stages.map((s, i) => (
              <span key={s.id} title={s.name} className="h-1.5 flex-1 rounded-sm" style={{ background: idx >= 0 && i <= idx ? color : 'var(--color-bg-elevated)' }} />
            ))}
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-xs">
            <select className="-ml-1 rounded bg-transparent px-1 py-0.5 font-medium text-text-primary outline-none hover:bg-bg-elevated"
              value={t.stage_id || ''} disabled={busy || !t.esTitular} onChange={(e) => onStage(t, e.target.value)} aria-label="Etapa del trámite">
              {!t.stage_id && <option value="">Sin etapa</option>}
              {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <span className="text-text-muted">· actualizado {relTime(t.updated_at)}</span>
            {required.length > 0 && <span className="ml-auto text-text-muted"><b className="text-text-primary">{done}/{required.length}</b> requisitos</span>}
          </div>
        </div>
      )}

      <Checklist items={items} />

      {missing.length > 0 && isActive(t) && (
        <div className="flex items-center gap-2 border-t border-border px-4 py-2 text-xs">
          <span className="text-text-muted">Faltan {missing.length} cosas que debe enviar el cliente.</span>
          <button className="ml-auto inline-flex items-center gap-1 font-medium text-brand-primary hover:underline disabled:opacity-50" disabled={busy} onClick={() => onAskMissing(t, missing)}>
            <Send size={12} /> Pedir por WhatsApp
          </button>
        </div>
      )}
    </section>
  );
}

// Ficha 360° del contacto: todo lo de la persona en una pantalla (leads, trámites con su checklist,
// documentos y en qué trámite se usan, pagos, tareas y actividad). La vista detallada anterior sigue
// disponible para editar campos, subir y revisar documentos.
export default function Contact360({ clientId, onBack, onOpenChat, onDetailed, onOpenTramite }) {
  const qc = useQueryClient();
  const { leads, teamById } = useCrmData();
  const [busy, setBusy] = useState(false);
  const detail = useQuery({ queryKey: ['client_detail', clientId], queryFn: () => getClientDetail(clientId), enabled: !!clientId });
  const tramiteIds = (detail.data?.tramites || []).map((t) => t.id);
  const checklist = useQuery({
    queryKey: ['crm', 'checklist', clientId, tramiteIds.join(',')],
    queryFn: () => getChecklist({ clientServiceIds: tramiteIds }),
    enabled: tramiteIds.length > 0,
  });
  const tasks = useQuery({ queryKey: [...KEYS.tasks, clientId], queryFn: () => getOpenTasks({ clientId }) });
  const myLeads = (leads.data || []).filter((l) => l.client_id === clientId);
  const leadEvents = useQuery({
    queryKey: [...KEYS.events, 'contact', clientId, myLeads.length],
    queryFn: () => getLeadEvents(myLeads.map((l) => l.id), 30),
    enabled: myLeads.length > 0,
  });

  const itemsBy = useMemo(() => {
    const m = {};
    for (const i of checklist.data || []) (m[i.client_service_id] ||= []).push(i);
    return m;
  }, [checklist.data]);

  if (detail.isLoading) return <Loading />;
  if (detail.error || !detail.data) return <ErrorText error={detail.error || 'Contacto no encontrado'} what="el contacto" />;

  const { client, tramites, documents, payments, events, messages } = detail.data;
  const status = CLIENT_STATUS[client.status] || CLIENT_STATUS.lead;
  const leadCountry = myLeads.find((l) => l.country)?.country;
  const city = myLeads.find((l) => l.city)?.city;
  const country = client.nationality || client.country || leadCountry;
  const serviceOf = Object.fromEntries(tramites.map((t) => [t.id, t.servicio]));
  const lastMsg = messages[messages.length - 1];
  const pendingDocs = (checklist.data || []).filter((i) => i.kind === 'foto' && i.required && i.estado !== 'ok').length;
  const paid = payments.filter((p) => p.status === 'paid').reduce((s, p) => s + Number(p.amount || 0), 0);
  const due = payments.filter((p) => p.status !== 'paid').reduce((s, p) => s + Number(p.amount || 0), 0);

  // "Usado en": el trámite al que se subió el documento + los trámites donde se puede reutilizar.
  const usedIn = (doc) => {
    const set = new Set([serviceOf[doc.client_service_id]].filter(Boolean));
    for (const i of checklist.data || []) if (i.reuse_document_id === doc.id || i.document_id === doc.id) set.add(serviceOf[i.client_service_id]);
    return [...set].filter(Boolean);
  };

  const activity = [
    ...events.map((e) => ({ id: `s-${e.id}`, at: e.created_at, text: e.to ? `${serviceOf[e.client_service_id] || 'Trámite'}: ${e.from || '—'} → ${e.to}` : `${serviceOf[e.client_service_id] || 'Trámite'}: ${e.event_type}` })),
    ...(leadEvents.data || []).filter((e) => e.event_type !== 'note').map((e) => ({
      id: `l-${e.id}`, at: e.created_at,
      text: e.event_type === 'stage_changed' ? `Lead: ${e.metadata?.from || '—'} → ${e.metadata?.to || '—'}` : e.event_type === 'created' ? 'Lead creado' : `Lead: ${e.event_type.replace('_', ' ')}`,
      who: teamById[e.actor_id],
    })),
    ...documents.map((d) => ({ id: `d-${d.id}`, at: d.created_at, text: `Documento recibido: ${d.document_types?.name || d.file_name}` })),
    ...payments.filter((p) => p.paid_at).map((p) => ({ id: `p-${p.id}`, at: p.paid_at, text: `Pago confirmado: ${money(p.amount)}` })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 25);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['client_detail', clientId] });
    qc.invalidateQueries({ queryKey: ['crm', 'checklist'] });
  };

  const onStage = async (t, stageId) => {
    setBusy(true);
    try {
      await updateTramite(t.id, { stage_id: stageId });
      toast.success('Etapa del trámite actualizada');
      if (t.kommo_lead_id) {
        const aviso = await pushTramiteToKommo();
        if (aviso) toast.error(aviso);
      }
      refresh();
    } catch (err) {
      toast.error(err.message || 'No se pudo cambiar la etapa');
    } finally {
      setBusy(false);
    }
  };

  const onAskMissing = async (t, missing) => {
    const nombre = (client.preferred_name || client.full_name || '').split(' ')[0];
    const texto = `Hola ${nombre}, para avanzar con tu ${t.servicio} todavía necesitamos:\n\n${missing.map((i) => `• ${i.label}${i.estado === 'rechazado' && i.motivo ? ` (la anterior no sirvió: ${i.motivo})` : ''}`).join('\n')}\n\nPuedes enviarlo por aquí mismo. ¡Gracias!`;
    if (!window.confirm(`Se enviará este mensaje por WhatsApp:\n\n${texto}`)) return;
    setBusy(true);
    try {
      await sendReply(client.id, texto);
      toast.success('Mensaje enviado');
      refresh();
    } catch (err) {
      toast.error(err.message || 'No se pudo enviar');
    } finally {
      setBusy(false);
    }
  };

  const doneTask = async (id) => {
    try {
      await completeTask(id);
      qc.invalidateQueries({ queryKey: KEYS.tasks });
    } catch (err) {
      toast.error(err.message || 'No se pudo completar');
    }
  };

  const activeTramites = tramites.filter(isActive);
  const otherTramites = tramites.filter((t) => !isActive(t));

  return (
    <div className="flex h-full min-h-0 flex-1">
      {/* Columna izquierda: la persona */}
      <aside className="flex w-[300px] shrink-0 flex-col border-r border-border bg-bg-surface">
        <div className="border-b border-border px-5 pb-4 pt-3">
          <button onClick={onBack} className="-ml-1 rounded p-1 text-text-muted hover:bg-bg-elevated hover:text-text-primary" aria-label="Volver"><ArrowLeft size={16} /></button>
          <h1 className="mt-2 text-lg font-semibold leading-tight text-text-primary">{client.full_name && client.full_name !== client.phone ? client.full_name : 'Sin nombre'}</h1>
          <span className="mt-2 inline-block rounded bg-bg-elevated px-1.5 py-0.5 text-[11px] text-text-secondary">{status.label}</span>
        </div>
        <div className="flex flex-col gap-2.5 px-5 py-4 text-[13px] text-text-secondary">
          {country && <p className="flex items-center gap-2"><span className="w-4 text-center">{flag(country) || '🌎'}</span>{country}</p>}
          {client.phone && <p className="flex items-center gap-2"><Phone size={14} className="text-text-muted" />{client.phone}</p>}
          {client.email && <p className="flex items-center gap-2 truncate"><Mail size={14} className="shrink-0 text-text-muted" />{client.email}</p>}
          {city && <p className="flex items-center gap-2"><span className="w-4 text-center">📍</span>{city}</p>}
          <p className="text-xs text-text-muted">Contacto desde {new Date(client.created_at).toLocaleDateString('es')}</p>
        </div>
        <div className="flex flex-col gap-1.5 border-t border-border px-5 py-4">
          {onOpenChat && (
            <button onClick={() => onOpenChat(client.id)} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-brand-primary text-[13px] font-medium text-white hover:bg-brand-primary-dark">
              <MessageSquare size={14} /> Abrir chat
            </button>
          )}
          <button onClick={onDetailed} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-border text-[13px] text-text-primary hover:bg-bg-elevated">
            <LayoutList size={14} /> Vista detallada
          </button>
          {lastMsg && <p className="mt-1 text-center text-[11px] text-text-muted">Último mensaje {relTime(lastMsg.created_at)}</p>}
        </div>
      </aside>

      {/* Columna derecha: todo lo demás */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-bg-base">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {[
              ['Leads', myLeads.length],
              ['Trámites activos', activeTramites.length],
              ['Documentos pendientes', checklist.data ? pendingDocs : '—', pendingDocs ? 'text-warning' : ''],
              ['Pagado', money(paid) || 'R$ 0', 'text-success'],
              ['Pendiente de pago', money(due) || 'R$ 0', due ? 'text-warning' : ''],
            ].map(([label, value, tone]) => (
              <div key={label} className="rounded-lg border border-border bg-bg-surface px-4 py-2.5">
                <p className="text-[11px] uppercase tracking-wide text-text-muted">{label}</p>
                <p className={`mt-0.5 text-lg font-semibold tabular-nums text-text-primary ${tone || ''}`}>{value}</p>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-text-muted">Trámites</h2>
            {activeTramites.map((t) => (
              <TramiteCard key={t.id} t={t} items={itemsBy[t.id] || []} payments={payments.filter((p) => p.client_service_id === t.id)} onAskMissing={onAskMissing} onStage={onStage} onOpen={onOpenTramite} busy={busy} />
            ))}
            {otherTramites.map((t) => (
              <TramiteCard key={t.id} t={t} items={itemsBy[t.id] || []} payments={payments.filter((p) => p.client_service_id === t.id)} onAskMissing={onAskMissing} onStage={onStage} onOpen={onOpenTramite} busy={busy} />
            ))}
            {tramites.length === 0 && <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-text-muted">Este contacto todavía no tiene trámites. Se crean cuando un lead pasa a Operacional (o desde la vista detallada).</p>}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Box title="Documentos" count={documents.length}>
              <table className="w-full text-[13px]">
                <tbody>
                  {documents.map((d) => {
                    const [lbl, cls] = DOC_STATUS[d.status] || [d.status, 'text-text-muted'];
                    return (
                      <tr key={d.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-2 text-text-primary">{d.document_types?.name || d.file_name || 'Documento'}</td>
                        <td className={`px-2 text-xs ${cls}`}>{lbl}</td>
                        <td className="px-4 text-right text-xs text-text-muted">{usedIn(d).join(', ') || '—'}</td>
                      </tr>
                    );
                  })}
                  {documents.length === 0 && <tr><td className="px-4 py-3 text-xs text-text-muted">Sin documentos.</td></tr>}
                </tbody>
              </table>
            </Box>

            <div className="flex flex-col gap-4">
              <Box title="Pagos" count={payments.length}>
                <ul>
                  {payments.map((p) => {
                    const [lbl, cls] = PAY_STATUS[p.status] || [p.status, 'text-text-muted'];
                    return (
                      <li key={p.id} className="flex items-center gap-2 border-b border-border px-4 py-2 text-[13px] last:border-0">
                        <span className="text-text-primary">{serviceOf[p.client_service_id] || 'Pago'}</span>
                        <span className="ml-auto tabular-nums text-text-primary">{money(p.amount)}</span>
                        <span className={`w-16 text-right text-xs ${cls}`}>{lbl}</span>
                      </li>
                    );
                  })}
                  {payments.length === 0 && <li className="px-4 py-3 text-xs text-text-muted">Sin pagos registrados.</li>}
                </ul>
              </Box>
              <Box title="Tareas" count={tasks.data?.length ?? null}>
                <ul>
                  {(tasks.data || []).map((t) => (
                    <li key={t.id} className="flex items-center gap-2.5 border-b border-border px-4 py-2 text-[13px] last:border-0">
                      <button onClick={() => doneTask(t.id)} title="Marcar como hecha" disabled={t.kind === 'inscricao_receita'}
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border-hover text-transparent hover:border-success hover:text-success disabled:opacity-40">
                        <Check size={11} />
                      </button>
                      <span className="min-w-0 flex-1 truncate text-text-primary">{t.title}</span>
                      {t.due_at && <span className="text-[11px] text-text-muted">{new Date(t.due_at).toLocaleDateString('es')}</span>}
                    </li>
                  ))}
                  {tasks.data?.length === 0 && <li className="px-4 py-3 text-xs text-text-muted">Sin tareas abiertas.</li>}
                </ul>
              </Box>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Box title="Leads" count={myLeads.length}>
              <div className="px-4 py-3"><ContactLeads client={client} onOpenChat={onOpenChat} /></div>
            </Box>
            <Box title="Actividad">
              <ul>
                {activity.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 border-b border-border px-4 py-2 text-[13px] last:border-0">
                    <span className="min-w-0 flex-1 truncate text-text-primary">{a.text}</span>
                    <span className="shrink-0 text-[11px] text-text-muted">{a.who ? `${a.who} · ` : ''}{relTime(a.at)}</span>
                  </li>
                ))}
                {activity.length === 0 && <li className="px-4 py-3 text-xs text-text-muted">Sin actividad.</li>}
              </ul>
            </Box>
          </div>
          {client.kommo_contact_id && (
            <p className="text-center text-[11px] text-text-muted">
              Contacto vinculado a Kommo (#{client.kommo_contact_id}) <ExternalLink size={10} className="inline" />
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

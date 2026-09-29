import React, { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowRight, Check, FlaskConical, MessageCircle } from 'lucide-react';
import { useAuth } from '@features/auth/context/AuthContext';
import { getPendentesHoje, completeTask } from '@features/today/services/todayService';
import { useCrmData, KEYS } from '../useCrm';
import { getConversations, getRecentEvents, getTramites } from '../services/crmService';
import { Avatar, StagePill } from '../ui';
import { money, relTime, clock, flag } from '../format';

// Tareas que el sistema cierra solo cuando detecta que se hicieron: cerrarlas a mano las haría volver.
const AUTO_CLOSE = new Set(['inscricao_receita']);
const PRIORITY_DOT = { urgent: 'bg-danger', high: 'bg-warning', normal: 'bg-info', low: 'bg-border-hover' };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

function Kpi({ label, value, hint, tone = 'text-text-primary', onClick }) {
  return (
    <button onClick={onClick} className="flex flex-col items-start rounded-lg border border-border bg-bg-surface px-4 py-3 text-left transition-colors hover:border-border-hover">
      <span className="text-[11px] font-medium uppercase tracking-wide text-text-muted">{label}</span>
      <span className={`mt-0.5 text-2xl font-semibold tabular-nums ${tone}`}>{value}</span>
      {hint && <span className="text-[11px] text-text-muted">{hint}</span>}
    </button>
  );
}

function Panel({ title, action, onAction, children, count }) {
  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-border bg-bg-surface">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <h2 className="text-[13px] font-semibold text-text-primary">{title}</h2>
        {count != null && <span className="text-xs text-text-muted">{count}</span>}
        {action && (
          <button onClick={onAction} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand-primary hover:underline">
            {action} <ArrowRight size={12} />
          </button>
        )}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

const Row = ({ children, onClick }) => (
  <button onClick={onClick} className="flex w-full items-center gap-2.5 border-b border-border px-4 py-2 text-left last:border-b-0 hover:bg-bg-base">{children}</button>
);

const EVENT_TEXT = {
  created: () => 'Lead creado',
  stage_changed: (m) => `${m.from || '—'} → ${m.to || '—'}`,
  assigned: (m) => (m.to_name ? `Asignado a ${m.to_name}` : 'Sin responsable'),
  updated: () => 'Datos actualizados',
  tag_added: (m) => `Etiqueta ${m.tag || ''}`,
  tag_removed: (m) => `Quitó etiqueta ${m.tag || ''}`,
  note: () => 'Nota interna',
};

export default function HomeView({ onNavigate, onOpenChat, onNavigateToClient }) {
  const qc = useQueryClient();
  const { userProfile } = useAuth();
  const { leads, teamById, stageById } = useCrmData();
  const convs = useQuery({ queryKey: KEYS.conversations, queryFn: getConversations, refetchInterval: 30_000 });
  const tasks = useQuery({ queryKey: ['pendentes_hoje'], queryFn: getPendentesHoje, refetchInterval: 60_000 });
  const events = useQuery({ queryKey: [...KEYS.events, 'recent'], queryFn: () => getRecentEvents(12), refetchInterval: 60_000 });
  const tramites = useQuery({ queryKey: ['crm', 'tramites'], queryFn: getTramites, staleTime: 60_000 });

  const rows = useMemo(() => leads.data || [], [leads.data]);
  const leadById = useMemo(() => Object.fromEntries(rows.map((l) => [l.id, l])), [rows]);
  const kpis = useMemo(() => {
    const today = new Date().toDateString();
    const monthAgo = Date.now() - 30 * 86400000;
    return {
      open: rows.filter((l) => l.stage_kind === 'open').length,
      newToday: rows.filter((l) => new Date(l.created_at).toDateString() === today).length,
      reply: rows.filter((l) => l.needs_reply && l.stage_kind === 'open').length,
      won: rows.filter((l) => l.stage_kind === 'won' && new Date(l.updated_at) > monthAgo).length,
      pipeline: rows.filter((l) => l.stage_kind === 'open').reduce((s, l) => s + (Number(l.value) || 0), 0),
    };
  }, [rows]);
  const recent = useMemo(() => rows.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 7), [rows]);
  const pendingChats = (convs.data || []).filter((c) => c.unread_count > 0).slice(0, 7);
  const openTramites = (tramites.data || []).filter((t) => ['pending', 'in_progress', 'on_hold'].includes(t.status));
  const todayTasks = (tasks.data || []).slice(0, 8);

  const done = async (task) => {
    try {
      await completeTask(task.ref_id);
      toast.success('Tarea completada');
      qc.invalidateQueries({ queryKey: ['pendentes_hoje'] });
    } catch (err) {
      toast.error(err.message || 'No se pudo completar');
    }
  };

  const firstName = (userProfile?.nombre || '').split(' ')[0];

  return (
    <div className="flex-1 overflow-y-auto bg-bg-base">
      <div className="mx-auto flex max-w-[1280px] flex-col gap-4 px-6 py-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <h1 className="text-lg font-semibold text-text-primary">{greeting()}{firstName ? `, ${firstName}` : ''}</h1>
            <p className="text-[13px] text-text-muted">
              Resumen de hoy · {new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
          </div>
          <button onClick={() => onNavigate('lab')} className="ml-auto inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-brand-primary">
            <FlaskConical size={13} /> Automatizaciones de Nora
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Kpi label="Leads abiertos" value={kpis.open} hint={money(kpis.pipeline) ? `${money(kpis.pipeline)} en el embudo` : null} onClick={() => onNavigate('leads')} />
          <Kpi label="Nuevos hoy" value={kpis.newToday} onClick={() => onNavigate('leads')} />
          <Kpi label="Sin responder" value={kpis.reply} tone={kpis.reply ? 'text-success' : 'text-text-primary'} onClick={() => onNavigate('chats')} />
          <Kpi label="Ganados" value={kpis.won} hint="últimos 30 días" tone="text-success" onClick={() => onNavigate('funil')} />
          <Kpi label="Trámites en curso" value={tramites.data ? openTramites.length : '—'} onClick={() => onNavigate('tramites')} />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Panel title="Conversaciones pendientes" count={pendingChats.length || null} action="Abrir chats" onAction={() => onNavigate('chats')}>
            {pendingChats.map((c) => (
              <Row key={c.id} onClick={() => onOpenChat(c.client_id || (c.kommo_contact_id ? `k${c.kommo_contact_id}` : null))}>
                <Avatar name={c.display_name} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-text-primary">{c.display_name || 'Sin nombre'}</p>
                  <p className="truncate text-xs text-text-muted">{c.last_content || 'Archivo'}</p>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-[10px] text-text-muted">{clock(c.last_at)}</span>
                  <span className="rounded-full bg-success px-1.5 text-[10px] font-semibold leading-4 text-white">{c.unread_count}</span>
                </div>
              </Row>
            ))}
            {convs.data && pendingChats.length === 0 && (
              <p className="flex items-center gap-2 px-4 py-6 text-[13px] text-text-muted"><MessageCircle size={14} /> Nadie esperando respuesta.</p>
            )}
          </Panel>

          <Panel title="Tareas de hoy" count={tasks.data?.length ?? null} action="Ver todas" onAction={() => onNavigate('today')}>
            {todayTasks.map((t) => {
              // Solo las tareas se cierran a mano; las señales (documento por revisar, caso parado…) se resuelven solas.
              const closable = t.origem === 'tarefa' && !AUTO_CLOSE.has(t.tipo);
              return (
                <div key={`${t.origem}-${t.tipo}-${t.ref_id}`} className="flex items-start gap-2.5 border-b border-border px-4 py-2 last:border-b-0">
                  {closable ? (
                    <button onClick={() => done(t)} title="Marcar como hecha"
                      className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-border-hover text-transparent hover:border-success hover:text-success">
                      <Check size={11} />
                    </button>
                  ) : (
                    <span className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <button className="min-w-0 flex-1 text-left" onClick={() => (t.client_id ? onNavigateToClient(t.client_id) : onNavigate('today'))}>
                    <p className="truncate text-[13px] text-text-primary">{t.titulo}</p>
                    {t.detalhes && <p className="truncate text-[11px] text-text-muted">{t.detalhes}</p>}
                  </button>
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[t.prioridade] || PRIORITY_DOT.normal}`} title={t.prioridade} />
                </div>
              );
            })}
            {tasks.data && todayTasks.length === 0 && <p className="px-4 py-6 text-[13px] text-text-muted">Sin tareas pendientes. 🎉</p>}
            {tasks.error && <p className="px-4 py-3 text-xs text-danger">{tasks.error.message}</p>}
          </Panel>

          <Panel title="Leads recientes" action="Ver leads" onAction={() => onNavigate('leads')}>
            {recent.map((l) => (
              <Row key={l.id} onClick={() => (l.client_id ? onNavigateToClient(l.client_id, l.name) : onNavigate('leads'))}>
                <Avatar name={l.name} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-text-primary">{l.name || 'Sin nombre'} {flag(l.country)}</p>
                  <p className="truncate text-xs text-text-muted">{l.service_label || 'Trámite por definir'} · {relTime(l.created_at)}</p>
                </div>
                <StagePill name={l.stage_name} kind={l.stage_kind} color={stageById[l.stage_id]?.color} />
              </Row>
            ))}
          </Panel>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Panel title="Actividad reciente">
              {(events.data || []).map((e) => {
                const l = leadById[e.lead_id];
                return (
                  <div key={e.id} className="flex items-center gap-2.5 border-b border-border px-4 py-2 text-[13px] last:border-b-0">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${e.event_type === 'stage_changed' ? 'bg-brand-primary' : e.event_type === 'note' ? 'bg-warning' : 'bg-border-hover'}`} />
                    <span className="min-w-0 flex-1 truncate">
                      <b className="font-medium text-text-primary">{l?.name || 'Lead'}</b>
                      <span className="text-text-secondary"> · {(EVENT_TEXT[e.event_type] || (() => e.event_type))(e.metadata || {})}</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-text-muted">{teamById[e.actor_id] || (e.actor_id ? '' : 'automático')} · {relTime(e.created_at)}</span>
                  </div>
                );
              })}
              {events.data?.length === 0 && <p className="px-4 py-6 text-[13px] text-text-muted">Todavía no hay actividad registrada.</p>}
            </Panel>
          </div>
          <Panel title="Trámites pendientes" count={openTramites.length || null} action="Ver trámites" onAction={() => onNavigate('tramites')}>
            {openTramites.slice(0, 7).map((t) => (
              <Row key={t.id} onClick={() => onNavigateToClient(t.client_id, t.clients?.full_name)}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-text-primary">{t.clients?.full_name || 'Sin nombre'}</p>
                  <p className="truncate text-xs text-text-muted">{t.services?.name || 'Trámite'} · {t.service_stages?.name || 'sin etapa'}</p>
                </div>
                <span className="shrink-0 text-[11px] text-text-muted">{relTime(t.updated_at)}</span>
              </Row>
            ))}
            {tramites.data && openTramites.length === 0 && <p className="px-4 py-6 text-[13px] text-text-muted">No hay trámites en curso.</p>}
          </Panel>
        </div>
      </div>
    </div>
  );
}

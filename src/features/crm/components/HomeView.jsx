import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Check, RefreshCw, AlertTriangle } from 'lucide-react';
import { useAuth } from '@features/auth/context/AuthContext';
import { getPendentesHoje, completeTask } from '@features/today/services/todayService';
import { useCrmData, KEYS } from '../useCrm';
import { getConversations, getTramites, getChecklist } from '../services/crmService';
import { relTime } from '../format';
import { getResumenInicio } from '../services/resumenInicioService';
import { FILTROS, MIN_PAGOS_ATRIBUIDOS, periodoDeFiltro, derivarResumen, fmtBRL, fmtPct, fmtVar } from '../resumenInicio';
import { isActiveTramite, tramiteIssue, groupChecklist, ISSUE_TONE, ISSUE_DOT } from '../tramites';

// Tareas que el sistema cierra solo cuando detecta que se hicieron: cerrarlas a mano las haría volver.
const AUTO_CLOSE = new Set(['inscricao_receita']);

function Table({ title, count, action, onAction, head, children, empty }) {
  return (
    <section className="rounded-md border border-border bg-bg-surface">
      <header className="flex items-center gap-2 px-4 py-3">
        <h2 className="text-[13px] font-semibold text-text-primary">{title}</h2>
        {count > 0 && <span className="text-xs text-text-muted">{count}</span>}
        {action && <button onClick={onAction} className="ml-auto text-xs text-brand-primary hover:underline">{action}</button>}
      </header>
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="border-y border-border bg-bg-base text-left text-[11px] uppercase tracking-wide text-text-muted">
            {head.map((h, i) => <th key={h} className={`h-8 px-4 font-medium ${i === head.length - 1 ? 'text-right' : ''}`}>{h}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty && <p className="px-4 py-4 text-[13px] text-text-muted">{empty}</p>}
    </section>
  );
}

// Aviso de error con reintento: un fallo de carga nunca debe verse como "no hay nada".
function ErrorNote({ what, onRetry }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-danger/40 bg-danger/5 px-4 py-2.5 text-[13px] text-danger">
      <AlertTriangle size={14} />
      <span>No se pudo cargar {what}. Las cifras de este bloque no son fiables.</span>
      <button onClick={onRetry} className="ml-auto underline">Reintentar</button>
    </div>
  );
}

function Kpi({ label, value, sub, delta, deltaGood = true, onClick, tone = '' }) {
  const d = fmtVar(delta);
  const up = delta != null && delta > 0;
  const deltaTone = delta == null || delta === 0 ? 'text-text-muted' : (up === deltaGood ? 'text-success' : 'text-danger');
  return (
    <button onClick={onClick} className="rounded-md border border-border bg-bg-surface px-4 py-3 text-left transition-colors hover:border-border-hover">
      <p className="text-[11px] uppercase tracking-wide text-text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${tone || 'text-text-primary'}`}>{value}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-text-muted">
        {d && <span className={deltaTone}>{d} vs. período anterior</span>}
        {!d && delta === null && <span>sin base de comparación</span>}
        {sub && <span>{sub}</span>}
      </p>
    </button>
  );
}

const endOfToday =() => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; };

// Inicio: responde "¿qué tengo que hacer hoy?". Una línea con los números del día y listas cortas.
export default function HomeView({ onNavigate, onOpenChat, onNavigateToClient, onOpenTramite }) {
  const qc = useQueryClient();
  const { userProfile } = useAuth();
  const { leads, teamById } = useCrmData();
  const tramites = useQuery({ queryKey: ['crm', 'tramites'], queryFn: getTramites, refetchInterval: 60_000 });
  const convs = useQuery({ queryKey: KEYS.conversations, queryFn: getConversations, refetchInterval: 30_000 });
  const tasks = useQuery({ queryKey: ['pendentes_hoje'], queryFn: getPendentesHoje, refetchInterval: 60_000 });

  // Resumen ejecutivo: filtro de período + RPC del servidor (día de São Paulo).
  const [filtro, setFiltro] = useState('7d');
  const [custom, setCustom] = useState({ desde: '', hasta: '' });
  const periodo = useMemo(() => periodoDeFiltro(filtro, custom), [filtro, custom]);
  const periodoOk = periodo && !periodo.error ? periodo : null;
  const resumenQ = useQuery({
    queryKey: ['inicio', 'resumen', periodoOk?.desde, periodoOk?.hasta],
    queryFn: () => getResumenInicio(periodoOk.desde, periodoOk.hasta),
    enabled: !!periodoOk,
    refetchInterval: 120_000,
  });
  const r = useMemo(() => derivarResumen(resumenQ.data), [resumenQ.data]);
  const refrescarTodo = () => { qc.invalidateQueries({ queryKey: ['inicio'] }); tramites.refetch(); convs.refetch(); tasks.refetch(); };
  const actualizado = resumenQ.dataUpdatedAt ? new Date(resumenQ.dataUpdatedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : null;

  const active = useMemo(() => (tramites.data || []).filter(isActiveTramite), [tramites.data]);
  const checklist = useQuery({
    queryKey: ['crm', 'checklist', 'activos', active.map((t) => t.id).join(',')],
    queryFn: () => getChecklist({ clientServiceIds: active.map((t) => t.id) }),
    enabled: active.length > 0,
  });
  const itemsBy = useMemo(() => groupChecklist(checklist.data), [checklist.data]);

  const pending = useMemo(() => active
    .map((t) => ({ t, issue: tramiteIssue(t, itemsBy[t.id]) }))
    .filter((r) => r.issue)
    .sort((a, b) => a.issue.level - b.issue.level || new Date(a.t.updated_at) - new Date(b.t.updated_at)), [active, itemsBy]);

  // Trámite de cada cliente (para mostrarlo al lado de la conversación).
  const serviceByClient = useMemo(() => {
    const m = {};
    for (const t of active) m[t.client_id] ||= t.services?.name;
    for (const l of leads.data || []) if (l.client_id) m[l.client_id] ||= l.service_label;
    return m;
  }, [active, leads.data]);

  const waiting = (convs.data || []).filter((c) => c.unread_count > 0);
  const docsPending = (checklist.data || []).filter((i) => i.kind === 'foto' && i.required && i.estado !== 'ok').length;
  const todayTasks = tasks.data || [];
  const due = todayTasks.filter((t) => t.vence_em && new Date(t.vence_em) <= endOfToday()).length;

  const done = async (task) => {
    try {
      await completeTask(task.ref_id);
      toast.success('Tarea completada');
      qc.invalidateQueries({ queryKey: ['pendentes_hoje'] });
    } catch (err) {
      toast.error(err.message || 'No se pudo completar');
    }
  };

  const summary = [
    [`${tramites.isError ? '—' : active.length} trámites en curso`, () => onNavigate('tramites'), ''],
    [`${checklist.isError ? '—' : docsPending} documentos pendientes`, () => onNavigate('documentos'), docsPending ? 'text-warning' : ''],
    [`${tasks.isError ? '—' : todayTasks.length} tareas para hoy`, () => onNavigate('today'), ''],
    [`${tasks.isError ? '—' : due} con vencimiento`, () => onNavigate('today'), due ? 'text-danger' : ''],
    [`${convs.isError ? '—' : waiting.length} conversaciones sin responder`, () => onNavigate('chats'), waiting.length ? 'text-warning' : ''],
  ];
  const firstName = (userProfile?.nombre || '').split(' ')[0];

  return (
    <div className="flex-1 overflow-y-auto bg-bg-base">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 px-6 py-6">
        <div>
          <p className="text-xs text-text-muted">
            {firstName ? `Hola, ${firstName} · ` : ''}{new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="mt-0.5 text-lg font-semibold text-text-primary">Resumen de la empresa</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-text-secondary">
            {summary.map(([text, go, tone], i) => (
              <React.Fragment key={text}>
                {i > 0 && <span className="text-text-disabled">·</span>}
                <button onClick={go} className={`hover:underline ${tone}`}>{text}</button>
              </React.Fragment>
            ))}
          </p>
        </div>

        {/* ── Resumen ejecutivo ── */}
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-md border border-border text-xs">
              {FILTROS.map((f) => (
                <button key={f.id} onClick={() => setFiltro(f.id)}
                  className={`px-3 py-1.5 ${filtro === f.id ? 'bg-brand-primary text-white' : 'bg-bg-surface text-text-secondary hover:bg-bg-base'}`}>{f.label}</button>
              ))}
            </div>
            {filtro === 'custom' && (
              <span className="flex items-center gap-1 text-xs text-text-secondary">
                <input type="date" value={custom.desde} onChange={(e) => setCustom((c) => ({ ...c, desde: e.target.value }))} className="rounded border border-border bg-bg-surface px-2 py-1" />
                <span>→</span>
                <input type="date" value={custom.hasta} onChange={(e) => setCustom((c) => ({ ...c, hasta: e.target.value }))} className="rounded border border-border bg-bg-surface px-2 py-1" />
              </span>
            )}
            <span className="ml-auto flex items-center gap-2 text-xs text-text-muted">
              {periodoOk && <span>{periodoOk.desde} → {periodoOk.hasta} · hora de São Paulo</span>}
              {actualizado && !resumenQ.isError && <span>· actualizado {actualizado}</span>}
              <button onClick={refrescarTodo} title="Actualizar" className="rounded p-1 hover:bg-bg-surface"><RefreshCw size={13} className={resumenQ.isFetching ? 'animate-spin' : ''} /></button>
            </span>
          </div>

          {!periodo && <p className="text-[13px] text-text-muted">Elige las dos fechas del período personalizado.</p>}
          {periodo?.error && <p className="text-[13px] text-danger">{periodo.error}</p>}
          {periodoOk && resumenQ.isError && <ErrorNote what="el resumen comercial" onRetry={() => resumenQ.refetch()} />}
          {periodoOk && resumenQ.isLoading && <p className="text-[13px] text-text-muted">Cargando resumen…</p>}

          {r && (
            <>
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Resultados del período seleccionado</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi label="Oportunidades (una por servicio)" value={r.oportunidades.total} delta={r.oportunidades.var}
                  sub={`${r.oportunidades.personas} personas distintas · ${r.oportunidades.sinServicio} sin servicio elegido`} onClick={() => onNavigate('comercial')} />
                <Kpi label="Cobrado" value={fmtBRL(r.cobrado.total, 2)} delta={r.cobrado.var}
                  sub={`${r.cobrado.pagos} pagos confirmados${r.cobrado.sinOportunidad ? ` · ${r.cobrado.sinOportunidad} sin oportunidad asociable` : ''}`} onClick={() => onNavigate('finance')} />
                <Kpi label="Conversión por oportunidad" value={fmtPct(r.conversion.acumulada)}
                  sub={r.conversion.acumulada == null ? 'sin oportunidades en el período'
                    : `${r.conversion.pagadas} de ${r.conversion.oportunidades} pagaron · a 7 días: ${r.conversion.maduras7 ? `${fmtPct(r.conversion.d7)} de ${r.conversion.maduras7}` : 'aún sin plazo cumplido'} · a 30 días: ${r.conversion.maduras30 ? `${fmtPct(r.conversion.d30)} de ${r.conversion.maduras30}` : 'aún sin plazo cumplido'}`}
                  onClick={() => onNavigate('comercial')} />
                <Kpi label="Gasto en Meta Ads" value={fmtBRL(r.gasto.total)} delta={r.gasto.var} deltaGood={false}
                  sub={r.gasto.total == null ? 'sin datos de Meta en el período' : `${r.gasto.conversaciones ?? 0} conversaciones${r.gasto.costoConversacion != null ? ` · ${fmtBRL(r.gasto.costoConversacion, 2)} c/u` : ''}`}
                  onClick={() => onNavigate('intelligence')} />
              </div>

              <div className="rounded-md border border-border bg-bg-surface px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-text-muted">Anuncios de origen (identificados, no demostrados)</p>
                <div className="mt-2 grid gap-x-8 gap-y-1 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
                  <p><span className="text-text-primary">{r.atribucion.conAnuncio}</span> <span className="text-text-muted">con anuncio identificado ({fmtPct(r.atribucion.conAnuncioPct, 0)})</span></p>
                  <p><span className="text-text-primary">{r.atribucion.sinAtribucion}</span> <span className="text-text-muted">sin atribución confirmada</span></p>
                  <p><span className="text-text-primary">{r.atribucion.pagadasConAnuncio}</span> <span className="text-text-muted">pagadas con anuncio · {fmtBRL(r.atribucion.ingresosConAnuncio, 2)}</span></p>
                  <p><span className="text-text-primary">{fmtBRL(r.atribucion.costoPorOportunidad, 2)}</span> <span className="text-text-muted">por oportunidad con anuncio</span></p>
                </div>
                <p className="mt-2 text-xs text-text-muted">
                  {r.atribucion.muestraSuficiente
                    ? `Costo por cliente atribuido: ${fmtBRL(r.atribucion.costoPorCliente, 2)}`
                    : `Costo por cliente atribuido: no disponible (se necesitan al menos ${MIN_PAGOS_ATRIBUIDOS} pagos con anuncio; hay ${r.atribucion.pagadasConAnuncio}).`}
                  {' '}Tener un anuncio registrado no prueba que Meta originara el contacto.
                </p>
              </div>

              {r.porServicio.length > 0 && (
                <div className="rounded-md border border-border bg-bg-surface px-4 py-3">
                  <p className="text-[11px] uppercase tracking-wide text-text-muted">Ingresos cobrados por servicio (período)</p>
                  <ul className="mt-2 grid gap-x-8 gap-y-1 text-[13px] sm:grid-cols-2">
                    {r.porServicio.map((s) => (
                      <li key={s.servicio} className="flex justify-between gap-3">
                        <span className="truncate text-text-secondary">{s.servicio}</span>
                        <span className="whitespace-nowrap text-text-primary">{fmtBRL(s.total, 2)} <span className="text-text-muted">· {s.n}</span></span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <h2 className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Situación actual (no depende del período)</h2>
              {r.actual.meta.estado !== 'ok' && (
                <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/5 px-4 py-2 text-[13px] text-warning">
                  <AlertTriangle size={14} /> {r.actual.meta.texto}. El gasto y las conversaciones de Meta pueden estar desactualizados.
                  <button onClick={() => onNavigate('intelligence')} className="ml-auto underline">Ver Meta Ads</button>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Kpi label="Propuestas abiertas" value={fmtBRL(r.actual.potencial.total)}
                  sub={`${r.actual.potencial.n} sin pago · potencial, no dinero cobrado${r.actual.potencial.sinMovimiento14d ? ` · ${r.actual.potencial.sinMovimiento14d} sin movimiento 14+ días` : ''}`}
                  onClick={() => onNavigate('comercial')} />
                <Kpi label="Conversaciones pendientes" value={r.actual.conversacionesPendientes ?? '—'}
                  sub="sin respuesta ahora mismo" tone={r.actual.conversacionesPendientes ? 'text-warning' : ''} onClick={() => onNavigate('chats')} />
                <Kpi label="Trámites con incidencia" value={tramites.isError ? '—' : pending.length}
                  sub={tramites.isError ? 'error de carga' : `${active.length} en curso`} tone={pending.length ? 'text-warning' : ''} onClick={() => onNavigate('tramites')} />
                <Kpi label="Sincronización de Meta" value={r.actual.meta.estado === 'ok' ? 'Al día' : r.actual.meta.estado === 'atrasado' ? 'Atrasada' : r.actual.meta.estado === 'error' ? 'Con error' : 'Sin datos'}
                  sub={r.actual.meta.texto} tone={r.actual.meta.estado === 'ok' ? 'text-success' : 'text-warning'} onClick={() => onNavigate('intelligence')} />
              </div>
            </>
          )}
        </section>

        {(tramites.isError || checklist.isError) && <ErrorNote what="los trámites" onRetry={() => { tramites.refetch(); checklist.refetch(); }} />}
        {convs.isError && <ErrorNote what="las conversaciones" onRetry={() => convs.refetch()} />}
        {tasks.isError && <ErrorNote what="las tareas" onRetry={() => tasks.refetch()} />}

        <Table title="Pendientes de atención" count={pending.length} action="Ver trámites" onAction={() => onNavigate('tramites')}
          head={['Cliente', 'Trámite', 'Estado', 'Responsable', 'Actualizado']}
          empty={tramites.data && pending.length === 0 && (active.length === 0 || checklist.data) ? 'Ningún trámite trabado.' : null}>
          {pending.slice(0, 12).map(({ t, issue }) => (
            <tr key={t.id} onClick={() => onOpenTramite(t.id)} className="h-10 cursor-pointer border-b border-border last:border-0 hover:bg-bg-base">
              <td className="whitespace-nowrap px-4 font-medium text-text-primary">{t.clients?.full_name || 'Sin nombre'}</td>
              <td className="px-4 text-text-secondary">{t.services?.name || '—'}</td>
              <td className="px-4"><span className="inline-flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${ISSUE_DOT[issue.level]}`} /><span className={ISSUE_TONE[issue.level]}>{issue.text}</span></span></td>
              <td className="px-4 text-text-secondary">{teamById[t.assigned_to] || <span className="text-text-muted">Sin asignar</span>}</td>
              <td className="px-4 text-right text-text-muted">{relTime(t.updated_at)}</td>
            </tr>
          ))}
        </Table>

        <div className="grid gap-5 lg:grid-cols-2">
          <Table title="Conversaciones sin responder" count={waiting.length} action="Abrir" onAction={() => onNavigate('chats')}
            head={['Cliente', 'Trámite', 'Último mensaje', '']} empty={convs.data && waiting.length === 0 ? 'Nadie esperando respuesta.' : null}>
            {waiting.slice(0, 8).map((c) => (
              <tr key={c.id} onClick={() => onOpenChat(c.client_id || (c.kommo_contact_id ? `k${c.kommo_contact_id}` : null))} className="h-10 cursor-pointer border-b border-border last:border-0 hover:bg-bg-base">
                <td className="whitespace-nowrap px-4 font-medium text-text-primary">{c.display_name || 'Sin nombre'}</td>
                <td className="px-4 text-text-secondary">{serviceByClient[c.client_id] || '—'}</td>
                <td className="max-w-[180px] truncate px-4 text-text-secondary">{c.last_content || 'Archivo'}</td>
                <td className="whitespace-nowrap px-4 text-right text-warning">{relTime(c.last_at)}</td>
              </tr>
            ))}
          </Table>

          <Table title="Tareas" count={todayTasks.length} action="Ver todas" onAction={() => onNavigate('today')}
            head={['', 'Tarea', 'Detalle', 'Vence']} empty={tasks.data && todayTasks.length === 0 ? 'Sin tareas pendientes.' : null}>
            {todayTasks.slice(0, 8).map((t) => {
              const closable = t.origem === 'tarefa' && !AUTO_CLOSE.has(t.tipo);
              const overdue = t.vence_em && new Date(t.vence_em) <= endOfToday();
              return (
                <tr key={`${t.origem}-${t.tipo}-${t.ref_id}`} className="h-10 border-b border-border last:border-0">
                  <td className="w-10 pl-4">
                    {closable && (
                      <button onClick={() => done(t)} title="Marcar como hecha"
                        className="flex h-4 w-4 items-center justify-center rounded border border-border-hover text-transparent hover:border-success hover:text-success">
                        <Check size={11} />
                      </button>
                    )}
                  </td>
                  <td className="cursor-pointer px-4 text-text-primary hover:underline" onClick={() => (t.client_id ? onNavigateToClient(t.client_id) : onNavigate('today'))}>{t.titulo}</td>
                  <td className="max-w-[180px] truncate px-4 text-text-muted">{t.detalhes || ''}</td>
                  <td className={`whitespace-nowrap px-4 text-right ${overdue ? 'text-danger' : 'text-text-muted'}`}>{t.vence_em ? new Date(t.vence_em).toLocaleDateString('es', { day: '2-digit', month: 'short' }) : '—'}</td>
                </tr>
              );
            })}
          </Table>
        </div>
      </div>
    </div>
  );
}

import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Check, RefreshCw, AlertTriangle } from 'lucide-react';
import { useAuth } from '@features/auth/context/AuthContext';
import { getPendentesHoje, completeTask } from '@features/today/services/todayService';
import { useCrmData, KEYS } from '../useCrm';
import { getConversations, getTramites, getChecklist } from '../services/crmService';
import { relTime } from '../format';
import { getResumenInicio, getResumenEmbudo } from '../services/resumenInicioService';
import { FILTROS, MIN_PAGOS_ATRIBUIDOS, periodoDeFiltro, derivarResumen, derivarEmbudo, derivarEconomia, fmtBRL, fmtPct, fmtVar } from '../resumenInicio';
import { isActiveTramite, tramiteIssue, groupChecklist, ISSUE_TONE, ISSUE_DOT } from '../tramites';

// Tareas que el sistema cierra solo cuando detecta que se hicieron: cerrarlas a mano las haría volver.
const AUTO_CLOSE = new Set(['inscricao_receita']);

function Table({ title, count, action, onAction, head, children, empty }) {
  return (
    <section className="rounded-md border border-border bg-bg-surface">
      <header className="flex items-center gap-2 px-4 py-3">
        <h2 className="text-sm lg:text-[15px] font-semibold text-text-primary">{title}</h2>
        {count > 0 && <span className="text-[13px] lg:text-sm text-text-muted">{count}</span>}
        {action && <button onClick={onAction} className="ml-auto text-[13px] lg:text-sm text-brand-primary hover:underline">{action}</button>}
      </header>
      <table className="w-full border-collapse text-sm lg:text-[15px]">
        <thead>
          <tr className="border-y border-border bg-bg-base text-left text-xs uppercase tracking-wide text-text-muted">
            {head.map((h, i) => <th key={h} className={`h-9 px-4 font-medium ${i === head.length - 1 ? 'text-right' : ''}`}>{h}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty && <p className="px-4 py-4 text-sm lg:text-[15px] text-text-muted">{empty}</p>}
    </section>
  );
}

// Aviso de error con reintento: un fallo de carga nunca debe verse como "no hay nada".
function ErrorNote({ what, onRetry }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-danger/40 bg-danger/5 px-4 py-2.5 text-sm lg:text-[15px] text-danger">
      <AlertTriangle size={14} />
      <span>No se pudo cargar {what}. Las cifras de este bloque no son fiables.</span>
      <button onClick={onRetry} className="ml-auto underline">Reintentar</button>
    </div>
  );
}

// Cada tarjeta tiene su propio estado según su fuente: 'loading' | 'error' | 'ok'.
// "Sin datos" no es un estado de fallo: es un valor real (0 o "—") con su explicación en `sub`.
function Kpi({ label, value, sub, delta, deltaGood = true, onClick, tone = '', status = 'ok', onRetry }) {
  const d = fmtVar(delta);
  const up = delta != null && delta > 0;
  const deltaTone = delta == null || delta === 0 ? 'text-text-muted' : (up === deltaGood ? 'text-success' : 'text-danger');
  const clickable = status === 'ok' && onClick;
  return (
    <div role={clickable ? 'button' : undefined} tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onClick : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      className={`rounded-md border bg-bg-surface px-5 py-4 text-left transition-colors ${status === 'error' ? 'border-danger/40' : 'border-border'} ${clickable ? 'cursor-pointer hover:border-border-hover' : ''}`}>
      <p className="text-xs uppercase tracking-wide text-text-muted">{label}</p>
      {status === 'loading' && (
        <>
          <div className="mt-2 h-7 w-20 animate-pulse rounded bg-bg-base" />
          <p className="mt-2 text-[13px] lg:text-sm text-text-muted">Cargando…</p>
        </>
      )}
      {status === 'error' && (
        <>
          <p className="mt-1 text-3xl lg:text-4xl font-semibold text-danger">Error</p>
          <p className="mt-1 flex items-center gap-2 text-[13px] lg:text-sm text-danger">
            No se pudo cargar.
            {onRetry && <button onClick={(e) => { e.stopPropagation(); onRetry(); }} className="underline">Reintentar</button>}
          </p>
        </>
      )}
      {status === 'ok' && (
        <>
          <p className={`mt-1 text-3xl lg:text-4xl font-semibold ${tone || 'text-text-primary'}`}>{value}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] lg:text-sm text-text-muted">
            {d && <span className={deltaTone}>{d} vs. período anterior</span>}
            {!d && delta === null && <span>sin base de comparación</span>}
            {sub && <span>{sub}</span>}
          </p>
        </>
      )}
    </div>
  );
}

// Tarjeta ancha (embudo, economía, servicios) con el mismo contrato de estados.
function Panel({ title, status = 'ok', onRetry, children }) {
  return (
    <div className={`rounded-md border bg-bg-surface px-5 py-4 ${status === 'error' ? 'border-danger/40' : 'border-border'}`}>
      <p className="text-xs uppercase tracking-wide text-text-muted">{title}</p>
      {status === 'loading' && <div className="mt-3 space-y-2"><div className="h-4 w-2/3 animate-pulse rounded bg-bg-base" /><div className="h-4 w-1/2 animate-pulse rounded bg-bg-base" /></div>}
      {status === 'error' && (
        <p className="mt-2 flex items-center gap-2 text-sm lg:text-[15px] text-danger">
          <AlertTriangle size={14} /> No se pudo cargar. Estas cifras no son fiables.
          {onRetry && <button onClick={onRetry} className="ml-auto underline">Reintentar</button>}
        </p>
      )}
      {status === 'ok' && children}
    </div>
  );
}

// Estado de una consulta: un formato inesperado de respuesta también cuenta como error (no como "sin datos").
const estadoDe = (q, derivado) => (q.isError || (q.data && !derivado) ? 'error' : q.isLoading ? 'loading' : 'ok');

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
  const embudoQ = useQuery({
    queryKey: ['inicio', 'embudo', periodoOk?.desde, periodoOk?.hasta],
    queryFn: () => getResumenEmbudo(periodoOk.desde, periodoOk.hasta),
    enabled: !!periodoOk,
    refetchInterval: 120_000,
  });
  const r = useMemo(() => derivarResumen(resumenQ.data), [resumenQ.data]);
  const emb = useMemo(() => derivarEmbudo(embudoQ.data), [embudoQ.data]);
  const eco = useMemo(() => derivarEconomia(r, emb), [r, emb]);
  // Estado propio de cada fuente: una tarjeta falla (o carga) sin arrastrar a las demás.
  const stResumen = estadoDe(resumenQ, r);
  const stEmbudo = estadoDe(embudoQ, emb);
  const refrescarTodo = () => { qc.invalidateQueries({ queryKey: ['inicio'] }); tramites.refetch(); convs.refetch(); tasks.refetch(); };
  const actualizado = resumenQ.dataUpdatedAt ? new Date(resumenQ.dataUpdatedAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) : null;

  const active = useMemo(() => (tramites.data || []).filter(isActiveTramite), [tramites.data]);
  const checklist = useQuery({
    queryKey: ['crm', 'checklist', 'activos', active.map((t) => t.id).join(',')],
    queryFn: () => getChecklist({ clientServiceIds: active.map((t) => t.id) }),
    enabled: active.length > 0,
  });
  const itemsBy = useMemo(() => groupChecklist(checklist.data), [checklist.data]);
  const stTramites = tramites.isError || checklist.isError ? 'error' : tramites.isLoading || checklist.isLoading ? 'loading' : 'ok';

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
      <div className="flex w-full flex-col gap-6 px-6 py-6 lg:px-10 2xl:px-14">
        <div>
          <p className="text-[13px] lg:text-sm text-text-muted">
            {firstName ? `Hola, ${firstName} · ` : ''}{new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          <h1 className="mt-0.5 text-2xl font-semibold text-text-primary">Resumen de la empresa</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm lg:text-[15px] text-text-secondary">
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
            <div className="flex overflow-hidden rounded-md border border-border text-[13px] lg:text-sm">
              {FILTROS.map((f) => (
                <button key={f.id} onClick={() => setFiltro(f.id)}
                  className={`px-3 py-1.5 ${filtro === f.id ? 'bg-brand-primary text-white' : 'bg-bg-surface text-text-secondary hover:bg-bg-base'}`}>{f.label}</button>
              ))}
            </div>
            {filtro === 'custom' && (
              <span className="flex items-center gap-1 text-[13px] lg:text-sm text-text-secondary">
                <input type="date" value={custom.desde} onChange={(e) => setCustom((c) => ({ ...c, desde: e.target.value }))} className="rounded border border-border bg-bg-surface px-2 py-1" />
                <span>→</span>
                <input type="date" value={custom.hasta} onChange={(e) => setCustom((c) => ({ ...c, hasta: e.target.value }))} className="rounded border border-border bg-bg-surface px-2 py-1" />
              </span>
            )}
            <span className="ml-auto flex items-center gap-2 text-[13px] lg:text-sm text-text-muted">
              {periodoOk && <span>{periodoOk.desde} → {periodoOk.hasta} · hora de São Paulo</span>}
              {actualizado && !resumenQ.isError && <span>· actualizado {actualizado}</span>}
              <button onClick={refrescarTodo} title="Actualizar" className="rounded p-1 hover:bg-bg-surface"><RefreshCw size={13} className={resumenQ.isFetching ? 'animate-spin' : ''} /></button>
            </span>
          </div>

          {!periodo && <p className="text-sm lg:text-[15px] text-text-muted">Elige las dos fechas del período personalizado.</p>}
          {periodo?.error && <p className="text-sm lg:text-[15px] text-danger">{periodo.error}</p>}

          {periodoOk && (
            <>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">Resultados del período seleccionado</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Kpi label="Oportunidades (una por servicio)" status={stResumen} onRetry={() => resumenQ.refetch()}
                  value={r?.oportunidades.total} delta={r?.oportunidades.var}
                  sub={r && `${r.oportunidades.personas} personas distintas · ${r.oportunidades.sinServicioActivas} activas sin servicio elegido (${r.oportunidades.sinServicioPerdidas} sin servicio ya perdidas)`} onClick={() => onNavigate('comercial')} />
                <Kpi label="Cobrado" status={stResumen} onRetry={() => resumenQ.refetch()}
                  value={r && fmtBRL(r.cobrado.total, 2)} delta={r?.cobrado.var}
                  sub={r && `${r.cobrado.pagos} pagos · ${r.cobrado.atribuidos} ligados a una oportunidad${r.cobrado.sinAtribucionConfirmada ? ` · ${r.cobrado.sinAtribucionConfirmada} sin atribución confirmada (${r.cobrado.sinOportunidad} de clientes sin oportunidad, ${r.cobrado.sinCoincidencia} sin servicio coincidente${r.cobrado.ambiguos ? `, ${r.cobrado.ambiguos} ambiguos` : ''})` : ''}`} onClick={() => onNavigate('finance')} />
                <Kpi label="Conversión por oportunidad" status={stResumen} onRetry={() => resumenQ.refetch()}
                  value={r && fmtPct(r.conversion.acumulada)}
                  sub={r && (r.conversion.acumulada == null ? 'sin oportunidades en el período'
                    : `${r.conversion.pagadas} de ${r.conversion.oportunidades} pagaron · a 7 días: ${r.conversion.maduras7 ? `${fmtPct(r.conversion.d7)} de ${r.conversion.maduras7}` : 'aún sin plazo cumplido'} · a 30 días: ${r.conversion.maduras30 ? `${fmtPct(r.conversion.d30)} de ${r.conversion.maduras30}` : 'aún sin plazo cumplido'}`)}
                  onClick={() => onNavigate('comercial')} />
                <Kpi label="Gasto en Meta Ads" status={stResumen} onRetry={() => resumenQ.refetch()}
                  value={r && fmtBRL(r.gasto.total)} delta={r?.gasto.var} deltaGood={false}
                  sub={r && (r.gasto.total == null ? 'sin datos de Meta en el período' : `${r.gasto.conversaciones ?? 0} conversaciones${r.gasto.costoConversacion != null ? ` · ${fmtBRL(r.gasto.costoConversacion, 2)} c/u` : ''}`)}
                  onClick={() => onNavigate('intelligence')} />
              </div>

              <Panel title="Embudo comercial · oportunidades creadas en el período" status={stEmbudo} onRetry={() => embudoQ.refetch()}>
                {emb && (
                  <>
                    <ul className="mt-2 space-y-1.5">
                      {emb.pasos.map((p) => (
                        <li key={p.id} className="grid grid-cols-[11rem_1fr_auto] items-center gap-3 text-sm lg:text-[15px]">
                          <span className="text-text-secondary">{p.label}</span>
                          <span className="h-2 rounded bg-bg-base">
                            <span className="block h-2 rounded bg-brand-primary" style={{ width: `${Math.min(100, p.deOportunidades ?? 0)}%` }} />
                          </span>
                          <span className="whitespace-nowrap text-text-primary">{p.n}
                            <span className="text-text-muted">{p.tasa != null ? ` · ${fmtPct(p.tasa)} del paso anterior` : p.id !== 'oportunidades' ? ` · ${fmtPct(p.deOportunidades)} de las oportunidades` : ''}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[13px] lg:text-sm text-text-muted">
                      {emb.perdidas} oportunidades perdidas ({fmtPct(emb.perdidasPct, 0)}) · {emb.sinServicio} sin servicio elegido
                      {emb.iniciadoSinPago ? ` · ${emb.iniciadoSinPago} trámites iniciados sin pago confirmado en el CRM` : ''}.
                      Las oportunidades recientes aún pueden avanzar.
                    </p>
                  </>
                )}
              </Panel>

              <div className="grid gap-4 xl:grid-cols-2">
                <Panel title="Economía del período · resultado tras publicidad" status={stResumen} onRetry={() => resumenQ.refetch()}>
                  {eco && (
                    <>
                      <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm lg:text-[15px]">
                        <span className="text-text-muted">Cobrado</span><span className="text-right text-text-primary">{fmtBRL(eco.cobrado, 2)}</span>
                        <span className="text-text-muted">Gasto en Meta</span><span className="text-right text-text-primary">{eco.gasto == null ? '—' : fmtBRL(eco.gasto, 2)}</span>
                        <span className="font-medium text-text-secondary">Resultado tras publicidad</span>
                        <span className={`text-right font-semibold ${eco.resultadoTrasPublicidad == null ? 'text-text-muted' : eco.resultadoTrasPublicidad < 0 ? 'text-danger' : 'text-success'}`}>{eco.resultadoTrasPublicidad == null ? '—' : fmtBRL(eco.resultadoTrasPublicidad, 2)}</span>
                        <span className="text-text-muted">Cobrado por cada R$ 1 de Meta</span><span className="text-right text-text-primary">{eco.roas == null ? '—' : eco.roas.toFixed(2)}</span>
                        <span className="text-text-muted">…solo de pagos con anuncio identificado</span><span className="text-right text-text-primary">{eco.roasAtribuido == null ? '—' : eco.roasAtribuido.toFixed(2)}</span>
                      </div>
                      <p className="mt-2 text-[13px] lg:text-sm text-text-muted">
                        No es margen neto{stEmbudo === 'ok' && eco.faltan.length ? `: faltan ${eco.faltan.join(' y ')}.` : stEmbudo === 'ok' ? '.' : ': no se pudo comprobar qué costos hay registrados.'}
                        {' '}Cobrado y gasto son del mismo período, pero el gasto de hoy puede dar pagos más adelante.
                      </p>
                    </>
                  )}
                </Panel>

                <Panel title="Anuncios de origen · identificados, no demostrados" status={stResumen} onRetry={() => resumenQ.refetch()}>
                  {r && (
                    <>
                      <div className="mt-2 grid gap-y-1 text-sm lg:text-[15px]">
                        <p><span className="text-text-primary">{r.atribucion.conAnuncio}</span> <span className="text-text-muted">con anuncio identificado ({fmtPct(r.atribucion.conAnuncioPct, 0)})</span></p>
                        <p><span className="text-text-primary">{r.atribucion.sinAtribucion}</span> <span className="text-text-muted">sin atribución confirmada</span></p>
                        <p><span className="text-text-primary">{r.atribucion.pagadasConAnuncio}</span> <span className="text-text-muted">pagadas con anuncio · {fmtBRL(r.atribucion.ingresosConAnuncio, 2)}</span></p>
                        <p><span className="text-text-primary">{fmtBRL(r.atribucion.costoPorOportunidad, 2)}</span> <span className="text-text-muted">por oportunidad con anuncio</span></p>
                      </div>
                      <p className="mt-2 text-[13px] lg:text-sm text-text-muted">
                        {r.atribucion.muestraSuficiente
                          ? `Costo por cliente atribuido: ${fmtBRL(r.atribucion.costoPorCliente, 2)}.`
                          : `Costo por cliente atribuido: no disponible (se necesitan al menos ${MIN_PAGOS_ATRIBUIDOS} pagos con anuncio; hay ${r.atribucion.pagadasConAnuncio}).`}
                        {' '}Tener un anuncio registrado no prueba que Meta originara el contacto.
                      </p>
                    </>
                  )}
                </Panel>
              </div>

              <Panel title="Ingresos cobrados por servicio (período)" status={stResumen} onRetry={() => resumenQ.refetch()}>
                {r && (r.porServicio.length === 0
                  ? <p className="mt-2 text-sm lg:text-[15px] text-text-muted">Sin pagos confirmados en el período.</p>
                  : (
                    <ul className="mt-2 grid gap-x-8 gap-y-1 text-sm lg:text-[15px] sm:grid-cols-2">
                      {r.porServicio.map((s) => (
                        <li key={s.servicio} className="flex justify-between gap-3">
                          <span className="truncate text-text-secondary">{s.servicio}</span>
                          <span className="whitespace-nowrap text-text-primary">{fmtBRL(s.total, 2)} <span className="text-text-muted">· {s.n}</span></span>
                        </li>
                      ))}
                    </ul>
                  ))}
              </Panel>

              <h2 className="mt-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Situación actual (no depende del período)</h2>
              {r && r.actual.meta.estado !== 'ok' && (
                <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/5 px-4 py-2 text-sm lg:text-[15px] text-warning">
                  <AlertTriangle size={14} /> {r.actual.meta.texto}. El gasto y las conversaciones de Meta pueden estar desactualizados.
                  <button onClick={() => onNavigate('intelligence')} className="ml-auto underline">Ver Meta Ads</button>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <Kpi label="Propuestas abiertas" status={stResumen} onRetry={() => resumenQ.refetch()}
                  value={r && fmtBRL(r.actual.potencial.total)}
                  sub={r && `${r.actual.potencial.n} sin pago · potencial, no dinero cobrado${r.actual.potencial.sinActividad7d ? ` · ${r.actual.potencial.sinActividad7d} sin actividad real en 7+ días (${r.actual.potencial.sinActividad14d} en 14+)` : ''}`}
                  onClick={() => onNavigate('comercial')} />
                <Kpi label="Conversaciones pendientes" status={stResumen} onRetry={() => resumenQ.refetch()}
                  value={r && (r.actual.conversacionesPendientes ?? '—')} sub="sin respuesta ahora mismo"
                  tone={r?.actual.conversacionesPendientes ? 'text-warning' : ''} onClick={() => onNavigate('chats')} />
                <Kpi label="Trámites con incidencia" status={stTramites} onRetry={() => { tramites.refetch(); checklist.refetch(); }}
                  value={pending.length} sub={`${active.length} en curso`} tone={pending.length ? 'text-warning' : ''} onClick={() => onNavigate('tramites')} />
                <Kpi label="Sincronización de Meta" status={stResumen} onRetry={() => resumenQ.refetch()}
                  value={r && (r.actual.meta.estado === 'ok' ? 'Al día' : r.actual.meta.estado === 'atrasado' ? 'Atrasada' : r.actual.meta.estado === 'error' ? 'Con error' : 'Sin datos')}
                  sub={r?.actual.meta.texto} tone={r?.actual.meta.estado === 'ok' ? 'text-success' : 'text-warning'} onClick={() => onNavigate('intelligence')} />
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
            <tr key={t.id} onClick={() => onOpenTramite(t.id)} className="h-12 cursor-pointer border-b border-border last:border-0 hover:bg-bg-base">
              <td className="whitespace-nowrap px-4 font-medium text-text-primary">{t.clients?.full_name || 'Sin nombre'}</td>
              <td className="px-4 text-text-secondary">{t.services?.name || '—'}</td>
              <td className="px-4"><span className="inline-flex items-center gap-1.5"><span className={`h-1.5 w-1.5 rounded-full ${ISSUE_DOT[issue.level]}`} /><span className={ISSUE_TONE[issue.level]}>{issue.text}</span></span></td>
              <td className="px-4 text-text-secondary">{teamById[t.assigned_to] || <span className="text-text-muted">Sin asignar</span>}</td>
              <td className="px-4 text-right text-text-muted">{relTime(t.updated_at)}</td>
            </tr>
          ))}
        </Table>

        <div className="grid gap-6 xl:grid-cols-2">
          <Table title="Conversaciones sin responder" count={waiting.length} action="Abrir" onAction={() => onNavigate('chats')}
            head={['Cliente', 'Trámite', 'Último mensaje', '']} empty={convs.data && waiting.length === 0 ? 'Nadie esperando respuesta.' : null}>
            {waiting.slice(0, 8).map((c) => (
              <tr key={c.id} onClick={() => onOpenChat(c.client_id || (c.kommo_contact_id ? `k${c.kommo_contact_id}` : null))} className="h-12 cursor-pointer border-b border-border last:border-0 hover:bg-bg-base">
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
                <tr key={`${t.origem}-${t.tipo}-${t.ref_id}`} className="h-12 border-b border-border last:border-0">
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

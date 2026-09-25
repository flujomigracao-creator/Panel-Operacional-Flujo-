import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Bot,
  Cpu,
  ExternalLink,
  FileText,
  FlaskConical,
  Inbox,
  MessageCircle,
  RefreshCw,
  User,
  UserCog,
  Workflow,
  Zap,
} from 'lucide-react';
import { supabase } from '@shared/config/supabaseClient';
import { formatCurrency } from '@/utils/currencyFormatter';
import { KOMMO_LEAD_URL } from '@features/today/services/todayService';
import {
  LIVE_TABLES,
  formatAge,
  getActividad,
  getKpis,
  getLinea,
  getPulso,
  getReparto,
  motorHealth,
} from '../services/labService';

const REFRESH_MS = 60_000;
// Varios eventos seguidos (un lote de n8n) disparan una sola recarga.
const LIVE_DEBOUNCE_MS = 1500;

const HEALTH_META = {
  operando: { label: 'Operando', dot: 'bg-success', text: 'text-success', ring: 'border-success-border' },
  atencion: { label: 'Atención', dot: 'bg-warning', text: 'text-warning', ring: 'border-warning-border' },
  detenido: { label: 'Detenido', dot: 'bg-danger', text: 'text-danger', ring: 'border-danger-border' },
  inactivo: { label: 'En espera', dot: 'bg-zinc-500', text: 'text-chrome-text', ring: 'border-chrome-border' },
};

const MOTOR_ICON = {
  receptor_kommo: Inbox,
  agente_recepcion: FileText,
  sync_kommo: RefreshCw,
  agente_ia: Bot,
  revision_documentos: UserCog,
  tramitador_cpf: FlaskConical,
};

const ACTOR_META = {
  agente: { label: 'Agente IA', icon: Bot, color: 'text-violet-400', bar: 'bg-violet-500' },
  automatizacion: { label: 'Automatización', icon: Zap, color: 'text-sky-400', bar: 'bg-sky-500' },
  cliente: { label: 'Cliente', icon: MessageCircle, color: 'text-emerald-400', bar: 'bg-emerald-500' },
  humano: { label: 'Tú / equipo', icon: User, color: 'text-amber-400', bar: 'bg-amber-500' },
};

const FEED_FILTERS = [
  { key: 'all', label: 'Todo' },
  { key: 'agente', label: 'Agentes' },
  { key: 'automatizacion', label: 'Automatizaciones' },
  { key: 'cliente', label: 'Clientes' },
  { key: 'humano', label: 'Humano' },
  { key: 'error', label: 'Errores' },
];

const STALE_DAYS = 3;

function Panel({ title, icon: Icon, right, children, className = '' }) {
  return (
    <section className={`rounded-xl border border-chrome-border bg-chrome-bg p-5 ${className}`}>
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-chrome-text-active">
          {Icon && <Icon size={15} className="text-brand-primary" />} {title}
        </h2>
        {right}
      </header>
      {children}
    </section>
  );
}

function Kpi({ label, value, hint, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`flex flex-col gap-1 rounded-xl border border-chrome-border bg-chrome-bg p-5 text-left ${onClick ? 'transition-colors hover:border-brand-primary' : ''}`}
    >
      <span className="text-xs font-medium text-chrome-text">{label}</span>
      <span className="text-3xl font-bold text-chrome-text-active tabular-nums">{value}</span>
      {hint && <span className="text-xs text-chrome-text">{hint}</span>}
    </Tag>
  );
}

function MotorCard({ motor }) {
  const health = motorHealth(motor);
  const meta = HEALTH_META[health.state];
  const Icon = MOTOR_ICON[motor.motor] || Cpu;

  return (
    <div className={`flex flex-col gap-3 rounded-lg border bg-chrome-bg-raised p-4 ${meta.ring}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <Icon size={17} className="shrink-0 text-chrome-text-active" />
          <span className="font-semibold leading-tight text-chrome-text-active">{motor.nombre}</span>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold ${meta.text}`}>
          <span className="relative flex h-2.5 w-2.5">
            {health.state === 'operando' && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${meta.dot}`} />}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${meta.dot}`} />
          </span>
          {meta.label}
        </span>
      </div>
      <p className="text-xs leading-snug text-chrome-text">{motor.descripcion}</p>
      <p className={`text-sm font-medium ${meta.text}`}>{health.reason}</p>
      <dl className="grid grid-cols-3 gap-2 border-t border-chrome-border pt-3 text-xs">
        <div>
          <dt className="text-chrome-text">Última señal</dt>
          <dd className="font-medium text-chrome-text-active">{motor.ultima_actividad ? `hace ${formatAge(motor.ultima_actividad)}` : '—'}</dd>
        </div>
        <div>
          <dt className="text-chrome-text">En cola</dt>
          <dd className="font-medium text-chrome-text-active tabular-nums">{motor.en_cola}</dd>
        </div>
        <div>
          <dt className="text-chrome-text">Hoy (24 h)</dt>
          <dd className="font-medium text-chrome-text-active tabular-nums">{motor.eventos_24h}</dd>
        </div>
      </dl>
    </div>
  );
}

function RepartoBar({ reparto }) {
  const total = Object.values(reparto).reduce((s, n) => s + n, 0);
  if (!total) return <p className="text-sm text-chrome-text">Sin actividad en los últimos 7 días.</p>;
  const order = ['agente', 'automatizacion', 'cliente', 'humano'];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
        {order.filter(k => reparto[k]).map(k => (
          <div key={k} className={ACTOR_META[k].bar} style={{ width: `${(reparto[k] / total) * 100}%` }} title={`${ACTOR_META[k].label}: ${reparto[k]}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
        {order.map(k => (
          <span key={k} className="inline-flex items-center gap-1.5 text-chrome-text">
            <span className={`h-2 w-2 rounded-full ${ACTOR_META[k].bar}`} />
            {ACTOR_META[k].label} <b className="text-chrome-text-active tabular-nums">{reparto[k] || 0}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

function TramiteChip({ t, onNavigateToClient }) {
  const stale = t.dias_sin_cambios >= STALE_DAYS;
  const content = (
    <>
      <span className="block truncate text-xs font-medium text-chrome-text-active">{t.cliente || t.telefono || 'Sin nombre'}</span>
      <span className="block truncate text-[11px] text-chrome-text">{t.servicio}</span>
      <span className="mt-1 flex items-center gap-2 text-[10px]">
        <span className={stale ? 'font-semibold text-warning' : 'text-chrome-text'}>
          {t.dias_sin_cambios === 0 ? 'movido hoy' : `${t.dias_sin_cambios} d sin cambios`}
        </span>
        {t.docs_por_revisar > 0 && <span className="text-info">{t.docs_por_revisar} doc</span>}
      </span>
    </>
  );
  const cls = `block w-full rounded-md border bg-chrome-bg-raised px-2.5 py-2 text-left transition-colors hover:border-brand-primary ${stale ? 'border-warning-border' : 'border-chrome-border'}`;

  if (onNavigateToClient && t.client_id) {
    return <button className={cls} onClick={() => onNavigateToClient(t.client_id)}>{content}</button>;
  }
  if (t.kommo_lead_id) {
    return <a className={cls} href={KOMMO_LEAD_URL(t.kommo_lead_id)} target="_blank" rel="noreferrer" title="Abrir en Kommo">{content}</a>;
  }
  return <div className={cls}>{content}</div>;
}

function LineaProduccion({ linea, onNavigateToClient }) {
  const columns = useMemo(() => {
    const byCode = linea.tramites.reduce((acc, t) => {
      const key = t.etapa_code || '__sin_etapa';
      (acc[key] ||= []).push(t);
      return acc;
    }, {});
    const cols = linea.stages.map(s => ({ code: s.code, name: s.name, items: byCode[s.code] || [] }));
    if (byCode.__sin_etapa) cols.unshift({ code: '__sin_etapa', name: 'Sin etapa', items: byCode.__sin_etapa });
    // Las etapas de Kommo comparten nombre (p. ej. dos "Documentación Completa"): se fusionan.
    return cols.reduce((acc, c) => {
      const prev = acc.find(a => a.name === c.name);
      if (prev) prev.items.push(...c.items);
      else acc.push({ ...c, items: [...c.items] });
      return acc;
    }, []).filter(c => c.code !== 'CONCLUIDO' || c.items.length);
  }, [linea]);

  const max = Math.max(1, ...columns.map(c => c.items.length));

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {columns.map(col => {
        const isProblem = col.code === 'PROBLEMA';
        return (
          <div key={col.code} className="flex w-44 shrink-0 flex-col gap-2">
            <div className={`rounded-md px-2.5 py-2 ${isProblem ? 'bg-danger-bg' : 'bg-chrome-bg-raised'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={`truncate text-xs font-semibold ${isProblem ? 'text-danger' : 'text-chrome-text-active'}`} title={col.name}>{col.name}</span>
                <span className="text-sm font-bold text-chrome-text-active tabular-nums">{col.items.length}</span>
              </div>
              <div className="mt-1.5 h-1 rounded-full bg-chrome-bg">
                <div className={`h-1 rounded-full ${isProblem ? 'bg-danger' : 'bg-brand-primary'}`} style={{ width: `${(col.items.length / max) * 100}%` }} />
              </div>
            </div>
            <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
              {col.items
                .sort((a, b) => b.dias_sin_cambios - a.dias_sin_cambios)
                .map(t => <TramiteChip key={t.client_service_id} t={t} onNavigateToClient={onNavigateToClient} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FeedItem({ a, isNew }) {
  const meta = ACTOR_META[a.actor] || ACTOR_META.automatizacion;
  const Icon = meta.icon;
  const time = new Date(a.ocurrido_en);
  return (
    <li className={`flex gap-3 rounded-md px-2 py-2 transition-colors ${isNew ? 'bg-brand-primary-light' : ''} ${!a.ok ? 'bg-danger-bg' : ''}`}>
      <Icon size={15} className={`mt-0.5 shrink-0 ${a.ok ? meta.color : 'text-danger'}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug text-chrome-text-active">{a.titulo}</p>
        {a.detalle && <p className="truncate text-xs text-chrome-text">{a.detalle}</p>}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <time className="text-[11px] text-chrome-text tabular-nums" title={time.toLocaleString('es')}>
          {time.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
        </time>
        <span className="text-[10px] text-chrome-text">{time.toLocaleDateString('es', { day: '2-digit', month: '2-digit' })}</span>
        {a.kommo_lead_id && (
          <a href={KOMMO_LEAD_URL(a.kommo_lead_id)} target="_blank" rel="noreferrer" title="Abrir en Kommo" className="text-chrome-text hover:text-brand-primary">
            <ExternalLink size={11} />
          </a>
        )}
      </div>
    </li>
  );
}

function LabSkeleton() {
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6 lg:p-8 animate-pulse">
      <div className="h-8 w-56 rounded-md bg-chrome-bg-raised" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 rounded-xl bg-chrome-bg" />)}
      </div>
      <div className="h-56 rounded-xl bg-chrome-bg" />
      <div className="h-72 rounded-xl bg-chrome-bg" />
    </div>
  );
}

/**
 * Laboratorio — la operación vista como una máquina: el estado de cada motor
 * automático, la línea de producción de trámites y todo lo que va pasando en vivo.
 */
export default function LabView({ onNavigateToClient, onOpenToday }) {
  const [pulso, setPulso] = useState([]);
  const [actividad, setActividad] = useState([]);
  const [reparto, setReparto] = useState({});
  const [linea, setLinea] = useState({ stages: [], tramites: [] });
  const [kpis, setKpis] = useState({ pendientes: 0, cobradoMes: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [live, setLive] = useState(false);
  const [filter, setFilter] = useState('all');
  const [refreshedAt, setRefreshedAt] = useState(null);
  const [newKeys, setNewKeys] = useState(() => new Set());
  const seenRef = useRef(null);
  const debounceRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [p, a, r, l, k] = await Promise.all([getPulso(), getActividad(), getReparto(), getLinea(), getKpis()]);
      const keyOf = x => `${x.ocurrido_en}|${x.titulo}`;
      if (seenRef.current) {
        setNewKeys(new Set(a.map(keyOf).filter(key => !seenRef.current.has(key))));
      }
      seenRef.current = new Set(a.map(keyOf));
      setPulso(p);
      setActividad(a);
      setReparto(r);
      setLinea(l);
      setKpis(k);
      setError(null);
      setRefreshedAt(new Date());
    } catch (err) {
      console.error(err);
      setError('No se pudo leer el estado del laboratorio.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, REFRESH_MS);

    const scheduleLoad = () => {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(load, LIVE_DEBOUNCE_MS);
    };
    const channel = LIVE_TABLES.reduce(
      (ch, table) => ch.on('postgres_changes', { event: '*', schema: 'public', table }, scheduleLoad),
      supabase.channel('laboratorio'),
    ).subscribe(status => setLive(status === 'SUBSCRIBED'));

    return () => {
      clearInterval(interval);
      clearTimeout(debounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [load]);

  const autonomia = useMemo(() => {
    const trabajo = (reparto.agente || 0) + (reparto.automatizacion || 0) + (reparto.humano || 0);
    return trabajo ? Math.round((((reparto.agente || 0) + (reparto.automatizacion || 0)) / trabajo) * 100) : null;
  }, [reparto]);

  const alertas = useMemo(
    () => pulso.map(m => ({ m, h: motorHealth(m) })).filter(x => x.h.state === 'detenido' || x.h.state === 'atencion'),
    [pulso],
  );

  const feed = useMemo(() => actividad.filter(a =>
    filter === 'all' ? true : filter === 'error' ? !a.ok : a.actor === filter
  ), [actividad, filter]);

  if (loading) return <LabSkeleton />;

  const tramitesActivos = linea.tramites.filter(t => t.status !== 'on_hold').length;
  const estancados = linea.tramites.filter(t => t.dias_sin_cambios >= STALE_DAYS).length;

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-chrome-text-active">
            <FlaskConical size={24} className="text-brand-primary" /> Laboratorio
          </h1>
          <p className="mt-1 text-chrome-text">
            {alertas.length === 0
              ? 'Todos los motores funcionan. La operación corre sola.'
              : `${alertas.length} ${alertas.length === 1 ? 'motor necesita' : 'motores necesitan'} atención.`}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-chrome-text">
          <span className="inline-flex items-center gap-1.5" title={live ? 'Conectado en tiempo real' : 'Actualización cada minuto'}>
            <span className={`h-2 w-2 rounded-full ${live ? 'bg-success animate-pulse' : 'bg-zinc-500'}`} />
            {live ? 'En vivo' : 'Cada minuto'}
          </span>
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 hover:bg-chrome-bg-raised hover:text-chrome-text-active" title="Actualizar ahora">
            <RefreshCw size={13} />
            {refreshedAt?.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </button>
        </div>
      </header>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Trámites en marcha" value={tramitesActivos} hint={estancados ? `${estancados} sin moverse hace ${STALE_DAYS}+ días` : 'Todos avanzando'} />
        <Kpi label="Autonomía (7 días)" value={autonomia === null ? '—' : `${autonomia}%`} hint="Trabajo hecho por agentes y automatizaciones" />
        <Kpi label="Esperándote" value={kpis.pendientes} hint="Abrir la bandeja de Hoy →" onClick={onOpenToday} />
        <Kpi label="Cobrado este mes" value={formatCurrency(kpis.cobradoMes)} hint="Pagos confirmados" />
      </div>

      <Panel title="Motores" icon={Cpu}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          {pulso.map(m => <MotorCard key={m.motor} motor={m} />)}
        </div>
      </Panel>

      <Panel title="Línea de producción" icon={Workflow} right={<span className="text-xs text-chrome-text">Cada tarjeta es un trámite · naranja = parado</span>}>
        {linea.tramites.length === 0
          ? <p className="text-sm text-chrome-text">No hay trámites activos.</p>
          : <LineaProduccion linea={linea} onNavigateToClient={onNavigateToClient} />}
      </Panel>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Panel title="Actividad en vivo" icon={Activity} className="xl:col-span-2">
          <div className="mb-3 flex flex-wrap gap-1.5">
            {FEED_FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  filter === f.key ? 'border-transparent bg-brand-primary text-white' : 'border-chrome-border text-chrome-text hover:bg-chrome-bg-raised'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {feed.length === 0
            ? <p className="py-8 text-center text-sm text-chrome-text">Nada por aquí.</p>
            : <ul className="flex max-h-[28rem] flex-col overflow-y-auto">{feed.map((a, i) => (
                <FeedItem key={`${a.ocurrido_en}-${i}`} a={a} isNew={newKeys.has(`${a.ocurrido_en}|${a.titulo}`)} />
              ))}</ul>}
        </Panel>

        <div className="flex flex-col gap-6">
          <Panel title="Quién hizo el trabajo" icon={Bot} right={<span className="text-xs text-chrome-text">7 días</span>}>
            <RepartoBar reparto={reparto} />
          </Panel>
          <Panel title="Alertas" icon={AlertCircle}>
            {alertas.length === 0 ? (
              <p className="text-sm text-success">Sin alertas.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {alertas.map(({ m, h }) => (
                  <li key={m.motor} className={`rounded-md border px-3 py-2 text-sm ${HEALTH_META[h.state].ring}`}>
                    <span className={`font-semibold ${HEALTH_META[h.state].text}`}>{m.nombre}</span>
                    <p className="text-xs text-chrome-text">{h.reason}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

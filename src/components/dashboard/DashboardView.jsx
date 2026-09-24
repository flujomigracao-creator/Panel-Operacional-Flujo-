import React, { useEffect, useState } from 'react';
import { getDashboardStats } from '../../services/dashboardService';
import StatCard from './StatCard';
import {
  Users,
  FileText,
  DollarSign,
  CheckCircle2,
  AlertCircle,
  CalendarClock
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  LabelList,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';

// ── Paleta de gráficos ───────────────────────────────────────────────────────
// Validada con el skill de dataviz (node scripts/validate_palette.js) contra
// la superficie real de las tarjetas del panel (--chrome-bg #0f1420, siempre
// oscura sin importar el tema — ver src/styles/tokens.css).
//
// Trámites por Estado reutiliza los 4 colores de estado que ya usa el resto
// de la app (pendiente/procesando/completada/cancelada, ver TRAMITE_COLORS en
// clientView.constants.js), EXCEPTO "esperando_docs": el morado original
// (--status-esperando, #a855f7) colisiona con el azul de "procesando" bajo
// deuteranopia (ΔE 0.9, prácticamente el mismo color) — se reemplaza acá por
// amarillo (#eab308), que despeja el chequeo CVD frente a los otros 4 sin
// tocar el token global (no afecta los badges que usan --status-esperando en
// otras pantallas).
const TRAMITE_STATUS_ORDER = ['pendiente', 'procesando', 'esperando_docs', 'completada', 'cancelada'];
const TRAMITE_STATUS_META = {
  pendiente: { label: 'Pendiente', color: '#f59e0b' },
  procesando: { label: 'Procesando', color: '#3b82f6' },
  esperando_docs: { label: 'Esperando Documentos', color: '#eab308' },
  completada: { label: 'Completada', color: '#10b981' },
  cancelada: { label: 'Cancelada', color: '#ef4444' }
};

// Clientes por Estado: 4 tonos categóricos (paleta de referencia del skill de
// dataviz, primeros 4 slots), validados en ESTE orden exacto — reordenarlos
// rompe la separación CVD entre "verificado" y "inactivo" (ver palette.md:
// el 4to slot pone amarillo y naranja juntos si no queda el aqua en el medio).
const CLIENTE_STATUS_ORDER = ['nuevo', 'verificado', 'inactivo', 'vip'];
const CLIENTE_STATUS_META = {
  nuevo: { label: 'Nuevo', color: '#3987e5' },
  verificado: { label: 'Verificado', color: '#d95926' },
  inactivo: { label: 'Inactivo', color: '#199e70' },
  vip: { label: 'VIP', color: '#c98500' }
};

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const tooltipStyle = {
  contentStyle: {
    background: 'var(--chrome-bg-raised)',
    border: '1px solid var(--chrome-border)',
    borderRadius: 8,
    fontSize: 12,
    padding: '8px 10px'
  },
  labelStyle: { color: 'var(--chrome-text-active)', fontWeight: 600, marginBottom: 4 },
  itemStyle: { color: 'var(--chrome-text-active)', padding: 0 }
};

/** % de cambio entre dos períodos, o null si no hay base para compararlo (evita +Infinity%). */
function trendPct(curr, prev) {
  if (!prev) return null;
  return Math.round(((curr - prev) / prev) * 100);
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function DashboardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-chrome-bg-subtle p-6 lg:p-8 animate-pulse">
      <div className="mb-8">
        <div className="h-7 w-56 rounded-md bg-chrome-bg-raised" />
        <div className="h-4 w-72 rounded-md bg-chrome-bg-raised mt-2" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-xl border border-chrome-border bg-chrome-bg" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-64 rounded-xl border border-chrome-border bg-chrome-bg" />
        ))}
      </div>
    </div>
  );
}

export default function DashboardView({ navigateToClientsList }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadStats() {
      try {
        const data = await getDashboardStats();
        setStats(data);
      } catch (err) {
        setError('Error al cargar las estadísticas.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    loadStats();
  }, []);

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-chrome-text-muted">
        <AlertCircle size={48} className="text-red-500" />
        <p>{error}</p>
      </div>
    );
  }

  const tramitesPorEstado = stats.tramitesPorEstado || {};
  const clientesPorEstado = stats.clientesPorEstado || {};

  // "Trámites Activos" mostraba antes el total histórico (incluía completados
  // y cancelados) bajo una etiqueta que sugiere "en curso ahora" — se corrige
  // a la suma real de los estados no terminales, sin consulta nueva (ya viene
  // en tramitesPorEstado).
  const tramitesActivos = (tramitesPorEstado.pendiente || 0) + (tramitesPorEstado.esperando_docs || 0) + (tramitesPorEstado.procesando || 0);

  const clientesTrend = trendPct(stats.clientesNuevosMes, stats.clientesNuevosMesAnterior);
  const ingresosTrend = trendPct(stats.ingresosMesActual, stats.ingresosMesAnterior);

  const ingresosPorMesData = (stats.ingresosPorMes || []).map(m => {
    const [, monthNum] = m.mes.split('-');
    return { mes: MES_CORTO[Number(monthNum) - 1] || m.mes, total: m.total };
  });

  const tramitesChartData = TRAMITE_STATUS_ORDER.map(key => ({
    key,
    label: TRAMITE_STATUS_META[key].label,
    value: tramitesPorEstado[key] || 0,
    color: TRAMITE_STATUS_META[key].color
  }));

  const clientesChartData = CLIENTE_STATUS_ORDER.map(key => ({
    key,
    label: CLIENTE_STATUS_META[key].label,
    value: clientesPorEstado[key] || 0,
    color: CLIENTE_STATUS_META[key].color
  }));

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-chrome-bg-subtle p-6 lg:p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-chrome-text">Panel Operacional</h1>
        <p className="text-chrome-text-muted mt-1">Resumen general del estado de la plataforma.</p>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Total de Clientes"
          value={stats.totalClientes}
          icon={Users}
          trend={clientesTrend}
          trendLabel={clientesTrend !== null ? 'vs. mes anterior' : undefined}
          description="Registrados en la plataforma"
        />
        <StatCard
          title="Trámites Activos"
          value={tramitesActivos}
          icon={FileText}
          description="Pendientes, procesando o esperando docs"
        />
        <StatCard
          title="Valor de Operaciones"
          value={formatCurrency(stats.ingresosTotales)}
          icon={DollarSign}
          trend={ingresosTrend}
          trendLabel={ingresosTrend !== null ? 'vs. mes anterior' : undefined}
          description="Ingresos totales brutos"
        />
        <StatCard
          title="Completados Este Mes"
          value={stats.tramitesCompletadosMes}
          icon={CheckCircle2}
          description="Trámites cerrados este mes"
        />
        <StatCard
          title="Agendamientos Este Mes"
          value={stats.agendamientosMes}
          icon={CalendarClock}
          description="Turnos agendados este mes"
        />
      </div>

      {/* Tendencia de ingresos */}
      <div className="rounded-xl border border-chrome-border bg-chrome-bg p-6 shadow-sm mb-8">
        <h2 className="text-lg font-semibold text-chrome-text mb-4">Ingresos — Últimos 6 Meses</h2>
        {ingresosPorMesData.every(d => d.total === 0) ? (
          <p className="text-chrome-text-muted text-sm italic">No hay ingresos registrados en este período.</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={ingresosPorMesData} margin={{ top: 8, right: 12, left: 12, bottom: 0 }}>
              <CartesianGrid stroke="var(--chrome-border)" vertical={false} />
              <XAxis
                dataKey="mes"
                tick={{ fill: 'var(--chrome-text)', fontSize: 12 }}
                axisLine={{ stroke: 'var(--chrome-border)' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'var(--chrome-text)', fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                width={48}
                tickFormatter={v => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
              />
              <Tooltip
                {...tooltipStyle}
                formatter={value => [formatCurrency(value), 'Ingresos']}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="var(--brand-primary)"
                strokeWidth={2}
                fill="var(--brand-primary)"
                fillOpacity={0.1}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Clientes por Estado */}
        <div className="rounded-xl border border-chrome-border bg-chrome-bg p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-chrome-text mb-4">Clientes por Estado</h2>
          {clientesChartData.every(d => d.value === 0) ? (
            <p className="text-chrome-text-muted text-sm italic">No hay datos de clientes.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={clientesChartData}
                layout="vertical"
                margin={{ top: 0, right: 28, left: 0, bottom: 0 }}
                barCategoryGap={10}
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fill: 'var(--chrome-text)', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  width={90}
                />
                <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} formatter={value => [value, 'Clientes']} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22}>
                  {clientesChartData.map(d => <Cell key={d.key} fill={d.color} />)}
                  <LabelList dataKey="value" position="right" fill="var(--chrome-text-active)" fontSize={12} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Trámites por Estado */}
        <div className="rounded-xl border border-chrome-border bg-chrome-bg p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-chrome-text mb-4">Trámites por Estado</h2>
          {tramitesChartData.every(d => d.value === 0) ? (
            <p className="text-chrome-text-muted text-sm italic">No hay datos de trámites.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={tramitesChartData}
                layout="vertical"
                margin={{ top: 0, right: 28, left: 0, bottom: 0 }}
                barCategoryGap={8}
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fill: 'var(--chrome-text)', fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  width={130}
                />
                <Tooltip {...tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.04)' }} formatter={value => [value, 'Trámites']} />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18}>
                  {tramitesChartData.map(d => <Cell key={d.key} fill={d.color} />)}
                  <LabelList dataKey="value" position="right" fill="var(--chrome-text-active)" fontSize={12} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="mt-8 flex justify-center">
        <button
          onClick={navigateToClientsList}
          className="rounded-md bg-chrome-accent px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-chrome-accent-hover transition-colors"
        >
          Ir al listado de Clientes
        </button>
      </div>

    </div>
  );
}

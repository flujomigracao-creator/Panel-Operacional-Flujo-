import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  TrendingUp,
  MessageSquare,
  DollarSign,
  Users,
  RefreshCw,
  ShieldCheck,
  Table as TableIcon,
  LayoutGrid,
} from 'lucide-react';
import { useAssistant } from '../context/AssistantContext';
import * as api from '../services/assistantService';
import MetricCard from './MetricCard';
import AlertCard from './AlertCard';
import CampaignCard from './CampaignCard';
import CampaignTable from './CampaignTable';
import PerformanceChart from './PerformanceChart';
import { LoadingSpinner } from '@/shared/components/ui/LoadingSpinner';

export default function IntelligenceCenterView() {
  const { send, setOpen } = useAssistant();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'table'
  const [dateRange, setDateRange] = useState('7d'); // '7d' | '14d' | '30d' | 'all'

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAdsData({ periodo: dateRange });
      setData(res);
    } catch (err) {
      console.error('Error cargando datos de inteligencia:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const preguntar = (mensaje) => {
    setOpen(true);
    send(mensaje);
  };

  const analizarCampana = (campana) => {
    preguntar(`Analiza la campaña "${campana.name}" (ID: ${campana.id}): cómo está su costo por conversación, CTR y qué optimizaciones recomiendas.`);
  };

  const proponerAjustePresupuesto = (campana) => {
    const actual = campana.daily_budget || campana.metrics?.spend || 50;
    preguntar(`Quiero ajustar el presupuesto de la campaña "${campana.name}". Su presupuesto o gasto actual es de aprox R$ ${actual}/día. Analízala y genera una propuesta.`);
  };

  const proponerToggleEstado = (campana) => {
    const nuevo = campana.status === 'ACTIVE' ? 'pausar' : 'activar';
    preguntar(`Quiero ${nuevo} la campaña "${campana.name}" (ID: ${campana.id}). Analiza el impacto y crea la propuesta.`);
  };

  const globales = data?.analisis?.metricas_globales || {};
  const campanas = data?.campanas || [];
  const hallazgos = data?.analisis?.hallazgos || [];
  const atribucion = data?.atribucion || {};
  const limites = data?.limites || {};

  return (
    <div className="flex-1 space-y-6 overflow-y-auto p-6">
      {/* Header del Centro de Inteligencia */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-chrome-border/60 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-primary text-white shadow-sm">
              <Sparkles size={18} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-chrome-text-active">
                Centro de Inteligencia
              </h1>
              <p className="text-xs text-chrome-text-muted">
                Auditoría en tiempo real de Meta Ads, conversión de leads, trámites y cobros
              </p>
            </div>
          </div>
        </div>

        {/* Controles de Período y Refresco */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-chrome-border bg-chrome-bg-raised p-0.5 text-xs">
            <button
              onClick={() => setDateRange('7d')}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                dateRange === '7d' ? 'bg-brand-primary text-white' : 'text-chrome-text hover:text-chrome-text-active'
              }`}
            >
              7 días
            </button>
            <button
              onClick={() => setDateRange('14d')}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                dateRange === '14d' ? 'bg-brand-primary text-white' : 'text-chrome-text hover:text-chrome-text-active'
              }`}
            >
              14 días
            </button>
            <button
              onClick={() => setDateRange('30d')}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                dateRange === '30d' ? 'bg-brand-primary text-white' : 'text-chrome-text hover:text-chrome-text-active'
              }`}
            >
              Este mes
            </button>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-chrome-border bg-chrome-bg-raised px-3 py-1.5 text-xs font-medium text-chrome-text hover:bg-chrome-bg-active hover:text-chrome-text-active disabled:opacity-50"
            title="Refrescar datos"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* Barra de Acciones Rápidas con el Asistente */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-primary/20 bg-brand-primary/5 p-3">
        <span className="text-xs font-semibold text-brand-primary flex items-center gap-1">
          <Sparkles size={13} /> Consultas Rápidas:
        </span>
        <button
          onClick={() => preguntar('¿Cómo están funcionando mis campañas esta semana? Resume gasto, conversaciones y costo por conversación.')}
          className="rounded-lg border border-chrome-border bg-chrome-bg px-3 py-1 text-xs font-medium text-chrome-text hover:border-brand-primary hover:text-brand-primary transition-colors"
        >
          📊 Analizar campañas
        </button>
        <button
          onClick={() => preguntar('Compara el rendimiento de esta semana con la anterior y dime qué varió en CPC, gasto y resultados.')}
          className="rounded-lg border border-chrome-border bg-chrome-bg px-3 py-1 text-xs font-medium text-chrome-text hover:border-brand-primary hover:text-brand-primary transition-colors"
        >
          🔄 Comparar períodos
        </button>
        <button
          onClick={() => preguntar('¿Cuántos leads atendió Nora recientemente, cuántos llegaron a propuesta y cuántos pagaron?')}
          className="rounded-lg border border-chrome-border bg-chrome-bg px-3 py-1 text-xs font-medium text-chrome-text hover:border-brand-primary hover:text-brand-primary transition-colors"
        >
          🤖 Analizar Nora y ventas
        </button>
        <button
          onClick={() => preguntar('Dime si hay algún anuncio o campaña gastando presupuesto sin generar conversaciones suficientes.')}
          className="rounded-lg border border-chrome-border bg-chrome-bg px-3 py-1 text-xs font-medium text-chrome-text hover:border-brand-primary hover:text-brand-primary transition-colors"
        >
          ⚠️ Detectar fugas de gasto
        </button>
      </div>

      {loading && !data && (
        <div className="flex h-64 items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
          <p className="font-semibold">No se pudieron cargar todos los datos de Meta Ads:</p>
          <p className="mt-1 text-xs">{error}</p>
        </div>
      )}

      {data && (
        <>
          {/* Métricas Principales (KPI Cards) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Inversión Meta Ads"
              value={globales.gasto_total !== undefined ? `R$ ${globales.gasto_total.toFixed(2)}` : null}
              subtitle={`${globales.campanas_activas || 0} campañas activas`}
              icon={DollarSign}
              tone="accent"
            />
            <MetricCard
              title="Conversaciones"
              value={globales.conversaciones_totales}
              subtitle={
                globales.costo_promedio_conversacion !== null
                  ? `R$ ${globales.costo_promedio_conversacion.toFixed(2)} por conv.`
                  : 'Sin costo calculado'
              }
              icon={MessageSquare}
              tone="default"
            />
            <MetricCard
              title="Leads Comerciales"
              value={atribucion.leads_analizados || globales.leads_totales || 0}
              subtitle={`${atribucion.leads_en_propuesta_o_pago || 0} en propuesta / pago`}
              icon={Users}
              tone="default"
            />
            <MetricCard
              title="Cobrado Registrado"
              value={atribucion.ingresos_totales_registrados !== undefined ? `R$ ${atribucion.ingresos_totales_registrados.toFixed(2)}` : null}
              subtitle="Atribución calculada"
              badge={atribucion.atribucion_estado}
              icon={TrendingUp}
              tone="emerald"
            />
          </div>

          {/* Hallazgos y Alertas Automáticas */}
          {hallazgos.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-chrome-text-muted">
                Hallazgos y Oportunidades Detectadas
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {hallazgos.map((h, i) => (
                  <AlertCard
                    key={i}
                    type={h.tipo}
                    title={h.titulo}
                    detail={h.detalle}
                    actionLabel="Analizar con Asistente"
                    onAction={() =>
                      preguntar(`Profundiza en este hallazgo: "${h.titulo}" (${h.detalle}) y dime qué acciones debemos tomar.`)
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* Gráfica de Rendimiento Comparativo */}
          <PerformanceChart campaigns={campanas} />

          {/* Listado de Campañas */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-chrome-text-muted">
                  Campañas en Meta Ads
                </p>
                <p className="text-sm font-semibold text-chrome-text-active">
                  {campanas.length} campaña{campanas.length !== 1 ? 's' : ''} encontrada{campanas.length !== 1 ? 's' : ''}
                </p>
              </div>

              <div className="flex items-center gap-1 rounded-lg border border-chrome-border bg-chrome-bg-raised p-0.5">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`rounded p-1 text-xs ${
                    viewMode === 'grid' ? 'bg-chrome-bg-active text-chrome-text-active' : 'text-chrome-text-muted hover:text-chrome-text'
                  }`}
                  title="Vista en tarjetas"
                >
                  <LayoutGrid size={14} />
                </button>
                <button
                  onClick={() => setViewMode('table')}
                  className={`rounded p-1 text-xs ${
                    viewMode === 'table' ? 'bg-chrome-bg-active text-chrome-text-active' : 'text-chrome-text-muted hover:text-chrome-text'
                  }`}
                  title="Vista en tabla"
                >
                  <TableIcon size={14} />
                </button>
              </div>
            </div>

            {viewMode === 'grid' ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {campanas.map((c) => (
                  <CampaignCard
                    key={c.id}
                    campaign={c}
                    onAnalyze={analizarCampana}
                    onAdjustBudget={proponerAjustePresupuesto}
                    onToggleStatus={proponerToggleEstado}
                  />
                ))}
              </div>
            ) : (
              <CampaignTable
                campaigns={campanas}
                onAnalyze={analizarCampana}
                onAdjustBudget={proponerAjustePresupuesto}
                onToggleStatus={proponerToggleEstado}
              />
            )}
          </div>

          {/* Límites de Seguridad Activos */}
          <div className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-chrome-text-active">
              <ShieldCheck size={16} className="text-emerald-400" />
              <span>Protección y Límites de Seguridad Activos</span>
            </div>
            <p className="mt-1 text-xs text-chrome-text-muted leading-relaxed">
              El asistente opera bajo reglas de seguridad estrictas: Máximo cambio diario de <strong>R$ {limites.maxDailyBudgetChange || 150}</strong> por operación, incremento máximo de <strong>+{limites.maxBudgetIncreasePercent || 50}%</strong>, y presupuesto de creación limitado a <strong>R$ {limites.maxCampaignCreationBudget || 250}/día</strong>. Cualquier acción requiere confirmación manual previa.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

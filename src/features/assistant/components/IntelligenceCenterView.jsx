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
  const [dateRange, setDateRange] = useState('7d'); // '7d' | '14d' | '30d' | 'custom'
  // Período personalizado: se pasan fechas explícitas (YYYY-MM-DD) al servicio.
  const [rangoCustom, setRangoCustom] = useState({ desde: '', hasta: '' });
  const [sincronizando, setSincronizando] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);

  // Sincronización real con Meta Graph API (la hace la Edge Function con credenciales de servidor).
  const sincronizar = async () => {
    setSincronizando(true);
    setSyncMsg(null);
    try {
      const res = await api.sincronizarMetaAds();
      setSyncMsg({
        ok: true,
        texto: `Sincronizado con Meta Ads: ${res.sync?.campanas ?? 0} campañas, ${res.sync?.conjuntos ?? 0} conjuntos y ${res.sync?.anuncios ?? 0} anuncios.`,
      });
      await loadData();
    } catch (err) {
      setSyncMsg({ ok: false, texto: `No se pudo sincronizar Meta Ads: ${err.message}` });
    } finally {
      setSincronizando(false);
    }
  };

  const pedirRango = () =>
    dateRange === 'custom'
      ? { desde: rangoCustom.desde || undefined, hasta: rangoCustom.hasta || undefined }
      : { periodo: dateRange };

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getAdsData(pedirRango());
      setData(res);
    } catch (err) {
      // El detalle técnico va a la consola; al usuario se le muestra un mensaje entendible.
      console.error('[Centro de Inteligencia] Error cargando métricas de Meta Ads:', err?.detalle || err);
      setError(err?.message || 'Error desconocido al consultar las métricas.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [dateRange, rangoCustom.desde, rangoCustom.hasta]);

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
    // Sin estado conocido (fuente local) no se asume "activar": primero que el asistente
    // revise el estado real en Meta Ads.
    if (!campana.status) {
      preguntar(`Revisa en Meta Ads el estado actual de la campaña "${campana.name}" (ID: ${campana.id}) y, si conviene, propón pausarla o reactivarla.`);
      return;
    }
    const nuevo = campana.status === 'ACTIVE' ? 'pausar' : 'activar';
    preguntar(`Quiero ${nuevo} la campaña "${campana.name}" (ID: ${campana.id}). Analiza el impacto y crea la propuesta.`);
  };

  const globales = data?.analisis?.metricas_globales || {};
  const campanas = data?.campanas || [];
  const hallazgos = data?.analisis?.hallazgos || [];
  const atribucion = data?.atribucion || {};
  const limites = data?.limites || {};
  const sincronizacion = data?.sincronizacion || null;

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
                {data?.periodo?.etiqueta ? ` · Período: ${data.periodo.etiqueta}` : ''}
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
            <button
              onClick={() => setDateRange('custom')}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                dateRange === 'custom' ? 'bg-brand-primary text-white' : 'text-chrome-text hover:text-chrome-text-active'
              }`}
            >
              Personalizado
            </button>
          </div>

          {dateRange === 'custom' && (
            <div className="flex items-center gap-2 text-xs text-chrome-text-muted">
              <input
                type="date"
                value={rangoCustom.desde}
                max={rangoCustom.hasta || undefined}
                onChange={(e) => setRangoCustom(r => ({ ...r, desde: e.target.value }))}
                className="rounded-lg border border-chrome-border bg-chrome-bg-raised px-2 py-1.5 text-chrome-text"
                aria-label="Desde"
              />
              <span>→</span>
              <input
                type="date"
                value={rangoCustom.hasta}
                min={rangoCustom.desde || undefined}
                onChange={(e) => setRangoCustom(r => ({ ...r, hasta: e.target.value }))}
                className="rounded-lg border border-chrome-border bg-chrome-bg-raised px-2 py-1.5 text-chrome-text"
                aria-label="Hasta"
              />
            </div>
          )}

          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-chrome-border bg-chrome-bg-raised px-3 py-1.5 text-xs font-medium text-chrome-text hover:bg-chrome-bg-active hover:text-chrome-text-active disabled:opacity-50"
            title="Refrescar datos"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            <span>Actualizar</span>
          </button>

          <button
            onClick={sincronizar}
            disabled={sincronizando}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-primary/30 bg-brand-primary/10 px-3 py-1.5 text-xs font-medium text-brand-primary hover:bg-brand-primary/20 disabled:opacity-50"
            title="Traer estado, presupuestos, conjuntos y anuncios desde Meta Ads"
          >
            <RefreshCw size={13} className={sincronizando ? 'animate-spin' : ''} />
            <span>{sincronizando ? 'Sincronizando…' : 'Sincronizar con Meta'}</span>
          </button>

          <span className="text-[11px] text-chrome-text-muted">
            Última sincronización:{' '}
            {sincronizacion?.ultima_ok ? new Date(sincronizacion.ultima_ok).toLocaleString('es') : 'nunca'}
            {sincronizacion?.campanas != null ? ` · ${sincronizacion.campanas} campañas` : ''}
          </span>
        </div>

        {syncMsg && (
          <div
            className={`rounded-lg border px-3 py-2 text-xs ${
              syncMsg.ok
                ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400'
                : 'border-amber-500/30 bg-amber-500/5 text-amber-400'
            }`}
          >
            {syncMsg.texto}
          </div>
        )}
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
        <div className="flex h-64 flex-col items-center justify-center gap-3">
          <LoadingSpinner size="lg" />
          <p className="text-xs text-chrome-text-muted">Cargando métricas de Meta Ads...</p>
        </div>
      )}

      {error && !loading && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <p className="text-sm font-semibold text-red-400">No pudimos cargar las métricas de Meta Ads.</p>
          <p className="mt-1 text-xs text-chrome-text-muted">
            Intenta nuevamente en unos segundos. El detalle técnico quedó registrado en la consola.
          </p>
          <button
            onClick={loadData}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-chrome-border bg-chrome-bg px-3 py-1.5 text-xs font-medium text-chrome-text hover:border-brand-primary hover:text-brand-primary"
          >
            <RefreshCw size={13} /> Reintentar
          </button>
        </div>
      )}

      {/* Sin datos: la consulta funcionó pero no hay filas para el período */}
      {!error && !loading && data && (data.campanas || []).length === 0 && (
        <div className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-4 text-sm text-chrome-text-muted">
          No hay datos de Meta Ads para el período seleccionado
          {data.periodo?.etiqueta ? ` (${data.periodo.etiqueta})` : ''}.
        </div>
      )}

      {/* Fuentes auxiliares que no respondieron: se informa, no se esconde */}
      {!error && (data?.advertencias || []).length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-400">
          <p className="font-semibold">Avisos sobre las fuentes de datos:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {data.advertencias.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {data && (
        <>
          {/* Fuentes de datos: el usuario ve de dónde sale cada número (requisito de la FASE 2) */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-chrome-border/60 bg-chrome-bg-raised/40 px-3 py-2 text-[11px] text-chrome-text-muted">
            <span className="font-semibold uppercase tracking-wider">Fuentes</span>
            {[
              ['Métricas', data.fuentes?.metricas_historicas],
              ['Estado y presupuesto', data.fuentes?.estado_presupuesto],
              ['Leads atribuidos', data.fuentes?.leads_atribuidos],
              ['Leads comerciales', data.fuentes?.leads_comerciales],
              ['Cobros', data.fuentes?.pagos],
            ]
              .filter(([, v]) => Boolean(v))
              .map(([k, v]) => (
                <span key={k}>
                  {k}: <span className="text-chrome-text">{v}</span>
                </span>
              ))}
          </div>
          {/* Métricas Principales (KPI Cards) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Inversión Meta Ads"
              value={globales.gasto_total !== undefined ? `R$ ${globales.gasto_total.toFixed(2)}` : null}
              subtitle={
                typeof globales.campanas_activas === 'number'
                  ? `${globales.campanas_activas} campañas activas`
                  : 'Estado de campañas no disponible en esta fuente'
              }
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
              title="Leads comerciales"
              value={atribucion.leads?.comerciales ?? atribucion.leads_analizados ?? null}
              subtitle={`${atribucion.leads?.atribuidos_meta ?? 0} atribuidos a Meta Ads · ${atribucion.leads?.no_atribuidos ?? 0} sin atribución`}
              icon={Users}
              tone="default"
            />
            <MetricCard
              title="Cobrado Registrado"
              value={atribucion.ingresos_totales_registrados != null ? `R$ ${atribucion.ingresos_totales_registrados.toFixed(2)}` : null}
              subtitle={
                atribucion.atribucion_estado === 'confirmada'
                  ? 'Atribución con evidencia'
                  : atribucion.atribucion_estado === 'estimada'
                  ? 'Correlación del período (no confirmada)'
                  : 'Datos no disponibles'
              }
              badge={atribucion.atribucion_estado}
              icon={TrendingUp}
              tone="emerald"
            />
          </div>

          {/* Estado de la atribución: se declara explícitamente para no dar por confirmado un cruce */}
          {atribucion.atribucion_estado !== 'confirmada' && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-400">
              <ShieldCheck size={14} className="mt-0.5 shrink-0" />
              <span>
                {atribucion.atribucion_estado === 'no_disponible'
                  ? 'No hay suficiente información de atribución para relacionar Meta Ads con clientes y pagos.'
                  : atribucion.nota || 'Los cruces con leads y cobros son correlación del período, no atribución confirmada.'}
              </span>
            </div>
          )}

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
              {limites.origen === 'local_por_defecto' && (
                <span className="mt-1 block italic">
                  Valores por defecto del código: no se pudo leer la configuración de límites de la organización.
                </span>
              )}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

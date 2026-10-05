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
  FlaskConical,
  Lightbulb,
  Layers,
  Activity,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowRight,
  Filter,
  Palette,
  BookOpen,
} from 'lucide-react';
import { useAssistant } from '../context/AssistantContext';
import * as api from '../services/assistantService';
import MetricCard from './MetricCard';
import AlertCard from './AlertCard';
import CampaignCard from './CampaignCard';
import CampaignTable from './CampaignTable';
import PerformanceChart from './PerformanceChart';
import CreativesHubView from './CreativesHubView';
import PromptLibraryView from './PromptLibraryView';
import { LoadingSpinner } from '@/shared/components/ui/LoadingSpinner';

export default function IntelligenceCenterView() {
  const { send, setOpen } = useAssistant();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [experiments, setExperiments] = useState([]);
  const [learnings, setLearnings] = useState([]);
  const [creatives, setCreatives] = useState([]);
  const [creativePrompts, setCreativePrompts] = useState([]);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('resumen'); // 'resumen' | 'meta_ads' | 'experimentos' | 'aprendizajes' | 'campanas' | 'creativos' | 'prompts'
  const [campaignStatusFilter, setCampaignStatusFilter] = useState('all'); // 'all' | 'ACTIVE' | 'PAUSED' | 'testing' | 'completed'
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
      const [adsRes, expsRes, learningsRes, creativesRes, promptsRes] = await Promise.all([
        api.getAdsData(pedirRango()),
        api.getCampaignExperiments(30),
        api.getCampaignLearnings(),
        api.getCampaignCreatives(),
        api.getCreativePrompts(),
      ]);
      setData(adsRes);
      setExperiments(expsRes || []);
      setLearnings(learningsRes || []);
      setCreatives(creativesRes || []);
      setCreativePrompts(promptsRes || []);
    } catch (err) {
      // El detalle técnico va a la consola; al usuario se le muestra un mensaje entendible.
      console.error('[Centro de Inteligencia] Error cargando métricas:', err?.detalle || err);
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

  // Filtrado de campañas para la pestaña de campañas
  const campanasFiltradas = campanas.filter((c) => {
    if (campaignStatusFilter === 'all') return true;
    if (campaignStatusFilter === 'ACTIVE') return c.status === 'ACTIVE';
    if (campaignStatusFilter === 'PAUSED') return c.status === 'PAUSED';
    if (campaignStatusFilter === 'testing') return /test|v4|exp/i.test(c.name || '');
    if (campaignStatusFilter === 'completed') return c.status === 'ARCHIVED' || c.status === 'COMPLETED';
    return true;
  });

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
              <h1 className="text-xl font-bold tracking-tight text-chrome-text-active flex items-center gap-2">
                Centro de Inteligencia
                <span className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-xs font-semibold text-indigo-400 border border-indigo-500/20">
                  Motor V4
                </span>
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

      {/* Selector de Pestañas Principales (Sección 25) */}
      <div className="flex border-b border-chrome-border/60 gap-1">
        <button
          onClick={() => setActiveTab('resumen')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'resumen'
              ? 'border-brand-primary text-brand-primary'
              : 'border-transparent text-chrome-text-muted hover:text-chrome-text'
          }`}
        >
          <Activity size={14} />
          <span>Resumen Ejecutivo</span>
        </button>
        <button
          onClick={() => setActiveTab('meta_ads')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'meta_ads'
              ? 'border-brand-primary text-brand-primary'
              : 'border-transparent text-chrome-text-muted hover:text-chrome-text'
          }`}
        >
          <TrendingUp size={14} />
          <span>Meta Ads ({campanas.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('experimentos')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'experimentos'
              ? 'border-brand-primary text-brand-primary'
              : 'border-transparent text-chrome-text-muted hover:text-chrome-text'
          }`}
        >
          <FlaskConical size={14} />
          <span>Experimentos V4 ({experiments.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('aprendizajes')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'aprendizajes'
              ? 'border-brand-primary text-brand-primary'
              : 'border-transparent text-chrome-text-muted hover:text-chrome-text'
          }`}
        >
          <Lightbulb size={14} />
          <span>Aprendizajes ({learnings.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('campanas')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'campanas'
              ? 'border-brand-primary text-brand-primary'
              : 'border-transparent text-chrome-text-muted hover:text-chrome-text'
          }`}
        >
          <Layers size={14} />
          <span>Campañas</span>
        </button>
        <button
          onClick={() => setActiveTab('creativos')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'creativos'
              ? 'border-brand-primary text-brand-primary'
              : 'border-transparent text-chrome-text-muted hover:text-chrome-text'
          }`}
        >
          <Palette size={14} />
          <span>Creativos V5 ({creatives.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('prompts')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2 text-xs font-semibold transition-colors ${
            activeTab === 'prompts'
              ? 'border-brand-primary text-brand-primary'
              : 'border-transparent text-chrome-text-muted hover:text-chrome-text'
          }`}
        >
          <BookOpen size={14} />
          <span>Prompts ({creativePrompts.length})</span>
        </button>
      </div>

      {/* Barra de Acciones Rápidas con el Asistente Científico */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-primary/20 bg-brand-primary/5 p-3">
        <span className="text-xs font-semibold text-brand-primary flex items-center gap-1">
          <Sparkles size={13} /> Flujos Científicos V4 / V5:
        </span>
        <button
          onClick={() => preguntar('Diseña una campaña V4 para CPF analizando histórico y aprendizajes previos.')}
          className="rounded-lg border border-brand-primary/40 bg-brand-primary/10 px-3 py-1 text-xs font-medium text-brand-primary hover:bg-brand-primary/20 transition-colors flex items-center gap-1"
        >
          <FlaskConical size={12} /> 🧪 Diseñar Campaña V4
        </button>
        <button
          onClick={() => preguntar('¿Dónde estoy perdiendo dinero? Analiza todo el funnel desde clics hasta pagos.')}
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-400 hover:bg-amber-500/20 transition-colors"
        >
          💸 ¿Dónde pierdo dinero?
        </button>
        <button
          onClick={() => preguntar('Analiza mis campañas de los últimos 7 días con datos reales de inversión, costo por cliente y Nora.')}
          className="rounded-lg border border-chrome-border bg-chrome-bg px-3 py-1 text-xs font-medium text-chrome-text hover:border-brand-primary hover:text-brand-primary transition-colors"
        >
          📊 Analizar campañas
        </button>
        <button
          onClick={() => preguntar('¿Cuáles son los principales aprendizajes de campañas acumulados hasta ahora?')}
          className="rounded-lg border border-chrome-border bg-chrome-bg px-3 py-1 text-xs font-medium text-chrome-text hover:border-brand-primary hover:text-brand-primary transition-colors"
        >
          💡 Ver aprendizajes
        </button>
        <button
          onClick={() => { setActiveTab('creativos'); preguntar('Genera el ranking de creativos ordenado por menor costo por cliente pagador para CPF.'); }}
          className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-400 hover:bg-indigo-500/20 transition-colors flex items-center gap-1"
        >
          <Palette size={12} /> 🎨 Ranking de Creativos V5
        </button>
        <button
          onClick={() => preguntar('Consulta la biblioteca de prompts de CPF y sugiere qué instrucción visual podemos iterar para mejorar la tasa de conversación a clientes.')}
          className="rounded-lg border border-chrome-border bg-chrome-bg px-3 py-1 text-xs font-medium text-chrome-text hover:border-brand-primary hover:text-brand-primary transition-colors flex items-center gap-1"
        >
          <BookOpen size={12} /> 📚 Consultar Biblioteca Prompts
        </button>
      </div>

      {loading && !data && (
        <div className="flex h-64 flex-col items-center justify-center gap-3">
          <LoadingSpinner size="lg" />
          <p className="text-xs text-chrome-text-muted">Cargando métricas de Meta Ads y Motor Científico...</p>
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

      {/* Sin datos de campañas */}
      {!error && !loading && data && (data.campanas || []).length === 0 && (
        <div className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-4 text-sm text-chrome-text-muted">
          No hay datos de Meta Ads para el período seleccionado
          {data.periodo?.etiqueta ? ` (${data.periodo.etiqueta})` : ''}.
        </div>
      )}

      {/* Fuentes auxiliares que no respondieron */}
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
          {/* Fuentes de datos */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-chrome-border/60 bg-chrome-bg-raised/40 px-3 py-2 text-[11px] text-chrome-text-muted">
            <span className="font-semibold uppercase tracking-wider">Fuentes</span>
            {[
              ['Métricas', data.fuentes?.metricas_historicas],
              ['Estado y presupuesto', data.fuentes?.estado_presupuesto],
              ['Leads atribuidos', data.fuentes?.leads_atribuidos],
              ['Leads comerciales', data.fuentes?.leads_comerciales],
              ['Cobros', data.fuentes?.pagos],
              ['Experimentos V4', 'campaign_experiments'],
              ['Aprendizajes', 'campaign_learnings'],
            ]
              .filter(([, v]) => Boolean(v))
              .map(([k, v]) => (
                <span key={k}>
                  {k}: <span className="text-chrome-text">{v}</span>
                </span>
              ))}
          </div>

          {/* ── PESTAÑA 1: RESUMEN EJECUTIVO (FUNNEL COMPLETO) ── */}
          {activeTab === 'resumen' && (
            <div className="space-y-6">
              {/* KPIs Principales del Negocio */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                  title="Inversión Publicitaria"
                  value={globales.gasto_total !== undefined ? `R$ ${globales.gasto_total.toFixed(2)}` : null}
                  subtitle={
                    typeof globales.campanas_activas === 'number'
                      ? `${globales.campanas_activas} campañas activas`
                      : 'Estado sincronizado desde Meta'
                  }
                  icon={DollarSign}
                  tone="accent"
                />
                <MetricCard
                  title="Conversaciones WhatsApp"
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
                  value={atribucion.leads?.comerciales ?? atribucion.leads_analizados ?? null}
                  subtitle={`${atribucion.leads?.atribuidos_meta ?? 0} atribuidos a Meta · ${atribucion.leads_en_propuesta_o_pago ?? 0} en propuesta`}
                  icon={Users}
                  tone="default"
                />
                <MetricCard
                  title="Ingresos Cobrados"
                  value={atribucion.ingresos_totales_registrados != null ? `R$ ${atribucion.ingresos_totales_registrados.toFixed(2)}` : null}
                  subtitle={
                    atribucion.clientes_que_pagaron != null
                      ? `${atribucion.clientes_que_pagaron} clientes pagadores`
                      : 'Cobros confirmados'
                  }
                  badge={atribucion.atribucion_estado}
                  icon={TrendingUp}
                  tone="emerald"
                />
              </div>

              {/* Diagrama del Funnel Científico: Impresión → Clic → WhatsApp → Lead → Propuesta → Pago → Cliente */}
              <div className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-chrome-text-active">
                      Funnel Integral de Conversión (Impresión → Cliente Pagador)
                    </h3>
                    <p className="text-[11px] text-chrome-text-muted">
                      Conexión real entre inversión en anuncios, atención de Nora, leads y cobros
                    </p>
                  </div>
                  {atribucion.roas_global_estimado != null && (
                    <span className="rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-400 border border-emerald-500/20">
                      ROAS Global: {atribucion.roas_global_estimado}x
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 text-center text-xs">
                  <div className="rounded-lg border border-chrome-border/60 bg-chrome-bg/50 p-2.5">
                    <p className="text-[10px] uppercase text-chrome-text-muted">1. Impresiones</p>
                    <p className="text-base font-bold text-chrome-text-active mt-1">{(globales.impresiones_totales || 0).toLocaleString()}</p>
                    <p className="text-[10px] text-chrome-text-muted mt-0.5">CPM: R$ {(globales.cpm_promedio || 0).toFixed(2)}</p>
                  </div>
                  <div className="rounded-lg border border-chrome-border/60 bg-chrome-bg/50 p-2.5">
                    <p className="text-[10px] uppercase text-chrome-text-muted">2. Clics</p>
                    <p className="text-base font-bold text-chrome-text-active mt-1">{(globales.clics_totales || 0).toLocaleString()}</p>
                    <p className="text-[10px] text-sky-400 mt-0.5">CTR: {(globales.ctr_promedio || 0).toFixed(2)}%</p>
                  </div>
                  <div className="rounded-lg border border-chrome-border/60 bg-chrome-bg/50 p-2.5">
                    <p className="text-[10px] uppercase text-chrome-text-muted">3. WhatsApp</p>
                    <p className="text-base font-bold text-chrome-text-active mt-1">{(globales.conversaciones_totales || 0).toLocaleString()}</p>
                    <p className="text-[10px] text-indigo-400 mt-0.5">CPC: R$ {(globales.cpc_promedio || 0).toFixed(2)}</p>
                  </div>
                  <div className="rounded-lg border border-chrome-border/60 bg-chrome-bg/50 p-2.5">
                    <p className="text-[10px] uppercase text-chrome-text-muted">4. Leads CRM</p>
                    <p className="text-base font-bold text-chrome-text-active mt-1">{atribucion.leads?.comerciales || 0}</p>
                    <p className="text-[10px] text-amber-400 mt-0.5">
                      {atribucion.costo_por_lead_global ? `CPL: R$ ${atribucion.costo_por_lead_global.toFixed(2)}` : 'Sin CPL'}
                    </p>
                  </div>
                  <div className="rounded-lg border border-chrome-border/60 bg-chrome-bg/50 p-2.5">
                    <p className="text-[10px] uppercase text-chrome-text-muted">5. Propuestas</p>
                    <p className="text-base font-bold text-chrome-text-active mt-1">{atribucion.leads_en_propuesta_o_pago || 0}</p>
                    <p className="text-[10px] text-purple-400 mt-0.5">En negociación</p>
                  </div>
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-2.5">
                    <p className="text-[10px] uppercase text-emerald-400 font-semibold">6. Clientes Pagadores</p>
                    <p className="text-base font-bold text-emerald-400 mt-1">{atribucion.clientes_que_pagaron || 0}</p>
                    <p className="text-[10px] text-emerald-300 mt-0.5">
                      {atribucion.costo_por_cliente_global ? `CAC: R$ ${atribucion.costo_por_cliente_global.toFixed(2)}` : 'CAC n/d'}
                    </p>
                  </div>
                </div>
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
            </div>
          )}

          {/* ── PESTAÑA 2: META ADS & RENDIMIENTO ── */}
          {activeTab === 'meta_ads' && (
            <div className="space-y-6">
              <PerformanceChart campaigns={campanas} />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-chrome-text-muted">
                    Todas las Campañas ({campanas.length})
                  </p>
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
            </div>
          )}

          {/* ── PESTAÑA 3: EXPERIMENTOS CIENTÍFICOS V4 ── */}
          {activeTab === 'experimentos' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-chrome-text-active flex items-center gap-2">
                    <FlaskConical size={15} className="text-indigo-400" />
                    Experimentos de Campañas V4 ({experiments.length})
                  </h3>
                  <p className="text-[11px] text-chrome-text-muted">
                    Diseños controlados con hipótesis formal, métrica primaria y variantes A/B
                  </p>
                </div>
                <button
                  onClick={() => preguntar('Diseña una campaña V4 para CPF analizando histórico y aprendizajes previos.')}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 shadow-sm"
                >
                  <FlaskConical size={13} />
                  <span>Nuevo Experimento</span>
                </button>
              </div>

              {experiments.length === 0 ? (
                <div className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-8 text-center space-y-3">
                  <FlaskConical size={32} className="mx-auto text-chrome-text-muted" />
                  <p className="text-sm font-semibold text-chrome-text-active">No hay experimentos registrados aún</p>
                  <p className="text-xs text-chrome-text-muted max-w-md mx-auto">
                    El Motor Científico formula hipótesis respaldadas en datos para comparar creativos, hooks y públicos antes de escalar presupuesto.
                  </p>
                  <button
                    onClick={() => preguntar('Diseña una campaña V4 para CPF.')}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-xs font-medium text-indigo-400 hover:bg-indigo-500/20"
                  >
                    Crear el primer experimento con el Asistente
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {experiments.map((exp) => {
                    const hyp = exp.campaign_hypotheses?.[0] || {};
                    const vars = exp.campaign_variants || [];
                    const isRunning = exp.status === 'running' || exp.status === 'approved';
                    const isCompleted = exp.status === 'completed';

                    return (
                      <div
                        key={exp.id}
                        className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-4 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="rounded bg-brand-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand-primary">
                              {exp.service}
                            </span>
                            <h4 className="mt-1 text-sm font-bold text-chrome-text-active">{exp.name}</h4>
                          </div>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                              isRunning
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : isCompleted
                                ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                : 'bg-chrome-bg text-chrome-text-muted border border-chrome-border'
                            }`}
                          >
                            {exp.status}
                          </span>
                        </div>

                        {/* Hipótesis */}
                        <div className="rounded-lg border border-chrome-border/60 bg-chrome-bg/40 p-2.5 text-xs">
                          <p className="text-[10px] uppercase font-bold text-chrome-text-muted">Hipótesis</p>
                          <p className="mt-0.5 text-chrome-text">{exp.hypothesis}</p>
                        </div>

                        {/* Variantes y Métricas */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-[10px] text-chrome-text-muted">Métrica Primaria:</span>
                            <p className="font-semibold text-amber-400">{exp.primary_metric}</p>
                          </div>
                          <div>
                            <span className="text-[10px] text-chrome-text-muted">Presupuesto Diario:</span>
                            <p className="font-semibold text-emerald-400">R$ {Number(exp.budget || 0).toFixed(2)}/día</p>
                          </div>
                        </div>

                        {/* Variantes Resumen */}
                        {vars.length > 0 && (
                          <div className="text-[11px] space-y-1">
                            <span className="text-[10px] uppercase font-semibold text-chrome-text-muted">Variantes ({vars.length}):</span>
                            <div className="flex flex-wrap gap-1.5">
                              {vars.map((v) => (
                                <span key={v.id} className="rounded border border-chrome-border bg-chrome-bg px-2 py-0.5 text-chrome-text">
                                  {v.variant_name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Resultado de la Hipótesis */}
                        {hyp.result && hyp.result !== 'inconclusive' && (
                          <div className={`rounded-lg p-2 text-xs flex items-center gap-1.5 ${
                            hyp.result === 'supported' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                          }`}>
                            {hyp.result === 'supported' ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                            <span>Resultado: {hyp.result === 'supported' ? 'Hipótesis Confirmada' : 'Hipótesis Rechazada'}</span>
                          </div>
                        )}

                        {/* Botón para analizar con el asistente */}
                        <button
                          onClick={() => preguntar(`Analiza y mide los resultados del experimento V4 "${exp.name}" (ID: ${exp.id}).`)}
                          className="w-full inline-flex items-center justify-center gap-1 rounded-lg border border-chrome-border bg-chrome-bg px-3 py-1.5 text-xs font-medium text-chrome-text hover:border-brand-primary hover:text-brand-primary"
                        >
                          <Activity size={12} />
                          <span>Medir y Analizar Resultados</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── PESTAÑA 4: LEARNING ENGINE (APRENDIZAJES ACUMULADOS) ── */}
          {activeTab === 'aprendizajes' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-chrome-text-active flex items-center gap-2">
                    <Lightbulb size={15} className="text-amber-400" />
                    Base de Conocimiento y Aprendizajes de Marketing ({learnings.length})
                  </h3>
                  <p className="text-[11px] text-chrome-text-muted">
                    Conclusiones empíricas acumuladas que alimentan el diseño de las siguientes campañas
                  </p>
                </div>
              </div>

              {learnings.length === 0 ? (
                <div className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-8 text-center space-y-3">
                  <Lightbulb size={32} className="mx-auto text-chrome-text-muted" />
                  <p className="text-sm font-semibold text-chrome-text-active">Aún no se han consolidado aprendizajes</p>
                  <p className="text-xs text-chrome-text-muted max-w-md mx-auto">
                    A medida que los experimentos V4 concluyan y se midan las tasas de conversión a pago, el sistema guardará automáticamente las lecciones validadas.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {learnings.map((lrn) => (
                    <div
                      key={lrn.id}
                      className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-4 space-y-2.5 flex flex-col justify-between"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-1">
                          <span className="rounded bg-brand-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand-primary">
                            {lrn.service}
                          </span>
                          {lrn.confidence && (
                            <span className="text-[10px] text-chrome-text-muted font-medium">
                              Confianza: {(Number(lrn.confidence) * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>

                        <p className="text-xs font-medium text-chrome-text-active leading-relaxed">
                          {lrn.learning}
                        </p>

                        {lrn.hook && (
                          <div className="rounded bg-chrome-bg/50 p-2 text-[11px]">
                            <span className="text-[10px] text-chrome-text-muted block">Gancho Validado:</span>
                            <span className="italic text-chrome-text">“{lrn.hook}”</span>
                          </div>
                        )}

                        {lrn.evidence && (
                          <p className="text-[10px] text-chrome-text-muted">
                            <strong className="text-chrome-text">Evidencia:</strong> {lrn.evidence}
                          </p>
                        )}
                      </div>

                      <button
                        onClick={() =>
                          preguntar(`Diseña una campaña V4 para ${lrn.service} utilizando el aprendizaje: "${lrn.learning}".`)
                        }
                        className="mt-2 inline-flex items-center justify-center gap-1 rounded-lg border border-brand-primary/30 bg-brand-primary/5 px-2.5 py-1 text-[11px] font-medium text-brand-primary hover:bg-brand-primary/15 transition-colors"
                      >
                        <ArrowRight size={11} />
                        <span>Usar en nuevo experimento</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── PESTAÑA 5: CAMPAÑAS FILTRADAS POR ESTADO ── */}
          {activeTab === 'campanas' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <Filter size={14} className="text-chrome-text-muted" />
                  <span className="text-xs font-semibold text-chrome-text-muted">Filtrar Estado:</span>
                  <div className="inline-flex rounded-lg border border-chrome-border bg-chrome-bg-raised p-0.5 text-xs">
                    {[
                      ['all', 'Todas'],
                      ['ACTIVE', 'Activas'],
                      ['PAUSED', 'Pausadas'],
                      ['testing', 'En Prueba'],
                      ['completed', 'Finalizadas'],
                    ].map(([val, label]) => (
                      <button
                        key={val}
                        onClick={() => setCampaignStatusFilter(val)}
                        className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                          campaignStatusFilter === val
                            ? 'bg-brand-primary text-white'
                            : 'text-chrome-text hover:text-chrome-text-active'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
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

              {campanasFiltradas.length === 0 ? (
                <div className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-8 text-center text-xs text-chrome-text-muted">
                  No se encontraron campañas con el filtro seleccionado.
                </div>
              ) : viewMode === 'grid' ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {campanasFiltradas.map((c) => (
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
                  campaigns={campanasFiltradas}
                  onAnalyze={analizarCampana}
                  onAdjustBudget={proponerAjustePresupuesto}
                  onToggleStatus={proponerToggleEstado}
                />
              )}
            </div>
          )}

          {/* ── PESTAÑA 6: CREATIVOS V5 ── */}
          {activeTab === 'creativos' && (
            <CreativesHubView
              creatives={creatives}
              prompts={creativePrompts}
              onRefresh={loadData}
              onAskAssistant={preguntar}
            />
          )}

          {/* ── PESTAÑA 7: BIBLIOTECA DE PROMPTS ── */}
          {activeTab === 'prompts' && (
            <PromptLibraryView
              prompts={creativePrompts}
              onRefresh={loadData}
              onAskAssistant={preguntar}
            />
          )}

          {/* Límites de Seguridad Activos */}
          <div className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-chrome-text-active">
              <ShieldCheck size={16} className="text-emerald-400" />
              <span>Protección y Límites de Seguridad Activos (Motor V4)</span>
            </div>
            <p className="mt-1 text-xs text-chrome-text-muted leading-relaxed">
              El asistente opera bajo reglas de seguridad estrictas: Máximo cambio diario de <strong>R$ {limites.maxDailyBudgetChange || 150}</strong> por operación, incremento máximo de <strong>+{limites.maxBudgetIncreasePercent || 50}%</strong>, y presupuesto de creación limitado a <strong>R$ {limites.maxCampaignCreationBudget || 250}/día</strong>. Las campañas se crean siempre en estado <strong>PAUSED</strong> y cualquier acción sensible exige confirmación humana previa.
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

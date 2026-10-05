import React from 'react';
import { Megaphone, ArrowRight, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';

/**
 * Componente especializado para visualizar propuestas de Meta Ads.
 * Muestra valores anteriores, propuestos, cambio porcentual, motivo e impacto.
 */
export default function AdsProposalDetail({ proposal }) {
  const d = proposal.payload || {};
  const isBudgetChange = proposal.tipo === 'ads_cambiar_presupuesto_campana';
  const isAdSetBudget = proposal.tipo === 'ads_cambiar_presupuesto_adset';
  const isStatusChange = proposal.tipo === 'ads_cambiar_estado_campana';
  const isCreateCampaign = proposal.tipo === 'ads_crear_campana';
  const isExperimentV4 = proposal.tipo === 'ads_experimento_v4';
  const isPublishCreative = proposal.tipo === 'ads_publicar_creativo';

  const diffPct = Number(d.cambio_porcentual) || 0;
  const isPositive = diffPct >= 0;

  return (
    <div className={`mt-2.5 rounded-lg border p-3 text-xs ${isExperimentV4 ? 'border-indigo-500/30 bg-indigo-500/5' : 'border-sky-500/20 bg-sky-500/5'}`}>
      {/* Header con badge */}
      <div className={`flex items-center justify-between gap-2 border-b pb-2 ${isExperimentV4 ? 'border-indigo-500/20' : 'border-sky-500/10'}`}>
        <div className={`flex items-center gap-1.5 font-semibold ${isExperimentV4 ? 'text-indigo-400' : 'text-sky-400'}`}>
          <Megaphone size={14} />
          <span>{isExperimentV4 ? 'Motor Científico V4 — Experimento de Campaña' : isBudgetChange ? 'Ajuste de Presupuesto' : isAdSetBudget ? 'Presupuesto del Conjunto' : isStatusChange ? 'Cambio de Estado' : isCreateCampaign ? 'Nueva Campaña' : 'Operación'}</span>
        </div>
        {(d.campaign_id || d.adset_id || d.experiment_id) && (
          <span className="font-mono text-[10px] text-chrome-text-muted">
            {d.experiment_id ? `exp: ${d.experiment_id.slice(0, 8)}` : d.adset_id ? `conjunto ${d.adset_id}` : d.campaign_id}
          </span>
        )}
      </div>

      {/* Target info */}
      <div className="mt-2 space-y-2">
        <p className="text-chrome-text-active">
          <span className="text-chrome-text-muted">{isExperimentV4 ? 'Experimento / Campaña:' : isAdSetBudget ? 'Conjunto:' : 'Campaña:'}</span>{' '}
          <strong className="font-semibold">{d.nombre_campana || d.nombre_conjunto || d.nombre || 'Campaña'}</strong>
          {d.servicio && (
            <span className="ml-2 rounded bg-brand-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-primary">
              {d.servicio}
            </span>
          )}
        </p>

        {isExperimentV4 && (
          <div className="space-y-2 rounded-md bg-chrome-bg-raised p-3">
            {/* Hipótesis Científica */}
            <div className="border-l-2 border-indigo-400 pl-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">Hipótesis a Comprobar</p>
              <p className="mt-0.5 text-xs font-medium text-chrome-text-active">{d.hipotesis}</p>
              {d.pregunta && <p className="mt-0.5 text-[11px] text-chrome-text-muted">Pregunta: {d.pregunta}</p>}
            </div>

            {/* Variable analizada vs Control */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded border border-chrome-border/60 bg-chrome-bg/50 p-2">
                <span className="text-[10px] font-semibold text-emerald-400">CONTROL (Constante)</span>
                <p className="mt-0.5 text-[11px] text-chrome-text">{d.control}</p>
              </div>
              <div className="rounded border border-indigo-500/30 bg-indigo-500/5 p-2">
                <span className="text-[10px] font-semibold text-indigo-400">VARIABLE PROBADA (Tratamiento)</span>
                <p className="mt-0.5 text-[11px] text-chrome-text">{d.variable_a_probar}</p>
              </div>
            </div>

            {/* Métricas y Presupuesto */}
            <div className="grid grid-cols-2 gap-2 border-t border-chrome-border/40 pt-2 text-[11px]">
              <div>
                <span className="text-chrome-text-muted">Métrica Primaria de Negocio:</span>
                <p className="font-semibold text-amber-400">{d.metrica_primaria}</p>
              </div>
              <div>
                <span className="text-chrome-text-muted">Presupuesto Diario Total:</span>
                <p className="font-semibold text-emerald-400">R$ {Number(d.presupuesto_diario || 0).toFixed(2)}/día</p>
              </div>
            </div>

            {/* Variantes Diseñadas */}
            {Array.isArray(d.variantes) && d.variantes.length > 0 && (
              <div className="space-y-1.5 border-t border-chrome-border/40 pt-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-chrome-text-muted">
                  Variantes Diseñadas ({d.variantes.length})
                </p>
                <div className="space-y-1.5">
                  {d.variantes.map((v, i) => (
                    <div key={i} className="rounded border border-chrome-border bg-chrome-bg/40 p-2 text-[11px]">
                      <div className="flex items-center justify-between font-semibold text-chrome-text-active">
                        <span>{v.variant_name}</span>
                        {v.cta && <span className="text-[10px] text-brand-primary">{v.cta}</span>}
                      </div>
                      <p className="mt-1 text-chrome-text"><strong className="text-chrome-text-muted">Hook:</strong> “{v.hook}”</p>
                      <p className="mt-0.5 text-chrome-text-muted"><strong className="text-chrome-text-muted">Copy:</strong> {v.copy}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reglas de Decisión */}
            {d.reglas_decision && (
              <div className="rounded bg-chrome-bg/60 p-2 text-[11px] text-chrome-text-muted space-y-0.5">
                <p className="font-semibold text-chrome-text-active">Criterios de Decisión Post-Medición:</p>
                {d.reglas_decision.scale_condition && <p>• <strong>Escalar:</strong> {d.reglas_decision.scale_condition}</p>}
                {d.reglas_decision.pause_condition && <p>• <strong>Pausar:</strong> {d.reglas_decision.pause_condition}</p>}
              </div>
            )}
          </div>
        )}

        {isAdSetBudget && d.nombre_campana && (
          <p className="text-[11px] text-chrome-text-muted">Campaña: {d.nombre_campana}</p>
        )}

        {(isBudgetChange || isAdSetBudget) && (
          <div className="my-2 grid grid-cols-3 gap-2 rounded-md bg-chrome-bg-raised p-2 text-center">
            <div>
              <p className="text-[10px] uppercase text-chrome-text-muted">Antes</p>
              <p className="text-sm font-semibold text-chrome-text">R$ {Number(d.presupuesto_actual || 0).toFixed(2)}<span className="text-[10px] font-normal text-chrome-text-muted">/día</span></p>
            </div>
            <div className="flex flex-col items-center justify-center">
              <ArrowRight size={14} className="text-chrome-text-muted" />
              <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${isPositive ? 'text-green-400' : 'text-amber-400'}`}>
                {isPositive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {isPositive ? `+${diffPct}%` : `${diffPct}%`}
              </span>
            </div>
            <div>
              <p className="text-[10px] uppercase text-chrome-text-muted">Después</p>
              <p className="text-sm font-semibold text-sky-400">R$ {Number(d.nuevo_presupuesto || 0).toFixed(2)}<span className="text-[10px] font-normal text-chrome-text-muted">/día</span></p>
            </div>
          </div>
        )}

        {isStatusChange && (
          <div className="my-2 flex items-center justify-between rounded-md bg-chrome-bg-raised p-2.5">
            <span className="text-chrome-text-muted">Nuevo estado propuesto:</span>
            <span className={`rounded px-2 py-0.5 font-bold ${d.nuevo_estado === 'ACTIVE' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
              {d.nuevo_estado === 'ACTIVE' ? '▶ ACTIVAR' : '⏸ PAUSAR'}
            </span>
          </div>
        )}

        {isCreateCampaign && (
          <div className="my-2 space-y-1.5 rounded-md bg-chrome-bg-raised p-2.5">
            <div className="flex justify-between">
              <span className="text-chrome-text-muted">Objetivo:</span>
              <span className="font-semibold text-chrome-text-active">{d.objetivo}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-chrome-text-muted">Presupuesto inicial:</span>
              <span className="font-semibold text-sky-400">R$ {Number(d.presupuesto_diario || 0).toFixed(2)}/día</span>
            </div>
          </div>
        )}

        {isPublishCreative && (
          <div className="my-2 space-y-1.5 rounded-md bg-chrome-bg-raised p-2.5">
            <p><span className="text-chrome-text-muted">Titular:</span> <strong className="text-chrome-text-active">{d.titular}</strong></p>
            <p><span className="text-chrome-text-muted">Texto:</span> {d.texto_principal}</p>
            <p><span className="text-chrome-text-muted">Conjunto:</span> {d.adset_nombre || d.adset_id} · <span className="text-chrome-text-muted">Formato:</span> {d.formato}</p>
            <ul className="list-disc pl-4 text-chrome-text-muted">{(d.riesgos || []).map((r, i) => <li key={i}>{r}</li>)}</ul>
          </div>
        )}

        {d.motivo && !isExperimentV4 && (
          <p className="mt-1 text-chrome-text">
            <span className="text-chrome-text-muted">Motivo:</span> {d.motivo}
          </p>
        )}
      </div>

      <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-amber-400/90">
        <AlertCircle size={12} className="shrink-0" />
        <span>
          {isExperimentV4
            ? 'Al confirmar, se creará la campaña en Meta Ads (PAUSADA por seguridad hasta confirmación de encendido).'
            : isPublishCreative
            ? 'Al confirmar, se subirá la imagen y se creará el anuncio en Meta Ads en estado PAUSADO.'
            : 'Esta acción modificará la configuración real en Meta Ads al confirmar.'}
        </span>
      </div>
    </div>
  );
}

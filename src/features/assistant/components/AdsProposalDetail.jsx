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

  const diffPct = Number(d.cambio_porcentual) || 0;
  const isPositive = diffPct >= 0;

  return (
    <div className="mt-2.5 rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 text-xs">
      {/* Header con badge */}
      <div className="flex items-center justify-between gap-2 border-b border-sky-500/10 pb-2">
        <div className="flex items-center gap-1.5 font-semibold text-sky-400">
          <Megaphone size={14} />
          <span>Meta Ads — {isBudgetChange ? 'Ajuste de Presupuesto' : isAdSetBudget ? 'Presupuesto del Conjunto' : isStatusChange ? 'Cambio de Estado' : isCreateCampaign ? 'Nueva Campaña' : 'Operación'}</span>
        </div>
        {(d.campaign_id || d.adset_id) && (
          <span className="font-mono text-[10px] text-chrome-text-muted">
            ID: {d.adset_id ? `conjunto ${d.adset_id}` : d.campaign_id}
          </span>
        )}
      </div>

      {/* Target info */}
      <div className="mt-2 space-y-1">
        <p className="text-chrome-text-active">
          <span className="text-chrome-text-muted">{isAdSetBudget ? 'Conjunto:' : 'Campaña:'}</span>{' '}
          <strong className="font-semibold">{d.nombre_conjunto || d.nombre_campana || d.nombre || 'Campaña'}</strong>
        </p>

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

        {d.motivo && (
          <p className="mt-1 text-chrome-text">
            <span className="text-chrome-text-muted">Motivo:</span> {d.motivo}
          </p>
        )}
      </div>

      <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-amber-400/90">
        <AlertCircle size={12} className="shrink-0" />
        <span>Esta acción modificará la configuración real en Meta Ads al confirmar.</span>
      </div>
    </div>
  );
}

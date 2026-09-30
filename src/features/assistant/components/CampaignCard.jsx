import React from 'react';
import { TrendingUp, Sparkles } from 'lucide-react';

/**
 * Tarjeta individual de Campaña de Meta Ads
 */
export default function CampaignCard({ campaign, onAnalyze, onAdjustBudget, onToggleStatus }) {
  const m = campaign.metrics || {};
  const isActive = campaign.status === 'ACTIVE';

  return (
    <div className="flex flex-col justify-between rounded-xl border border-chrome-border bg-chrome-bg-raised p-4 transition-all hover:border-chrome-border-hover">
      <div>
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  isActive ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'
                }`}
              />
              <p className="truncate text-sm font-semibold text-chrome-text-active" title={campaign.name}>
                {campaign.name}
              </p>
            </div>
            <p className="mt-0.5 text-[11px] font-mono text-chrome-text-muted">ID: {campaign.id}</p>
          </div>
          <span
            className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              isActive
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
            }`}
          >
            {isActive ? 'Activa' : 'Pausada'}
          </span>
        </div>

        {/* Métricas Principales */}
        <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg bg-chrome-bg/50 p-2.5">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-chrome-text-muted">Gasto</p>
            <p className="text-sm font-bold text-chrome-text-active">
              R$ {Number(m.spend || 0).toFixed(2)}
            </p>
            {campaign.daily_budget && (
              <p className="text-[10px] text-chrome-text-muted">
                Presupuesto: R$ {Number(campaign.daily_budget).toFixed(2)}/d
              </p>
            )}
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider text-chrome-text-muted">Conversaciones</p>
            <p className="text-sm font-bold text-sky-400">
              {m.conversations || 0}
            </p>
            {m.costPerConversation !== null ? (
              <p className="text-[10px] text-chrome-text-muted">
                Costo: R$ {Number(m.costPerConversation).toFixed(2)}/u
              </p>
            ) : (
              <p className="text-[10px] italic text-chrome-text-muted">Sin costo unitario</p>
            )}
          </div>
        </div>

        {/* Métricas Secundarias */}
        <div className="mt-3 grid grid-cols-3 gap-1 border-t border-chrome-border/50 pt-2.5 text-center text-xs">
          <div>
            <p className="text-[10px] text-chrome-text-muted">Clics</p>
            <p className="font-medium text-chrome-text">{m.clicks || 0}</p>
          </div>
          <div>
            <p className="text-[10px] text-chrome-text-muted">CTR</p>
            <p className="font-medium text-chrome-text">{Number(m.ctr || 0).toFixed(2)}%</p>
          </div>
          <div>
            <p className="text-[10px] text-chrome-text-muted">CPC</p>
            <p className="font-medium text-chrome-text">R$ {Number(m.cpc || 0).toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Acciones */}
      <div className="mt-4 flex items-center justify-between gap-1.5 border-t border-chrome-border/60 pt-3">
        <button
          onClick={() => onAnalyze?.(campaign)}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-chrome-bg px-2 py-1.5 text-xs font-medium text-chrome-text hover:bg-chrome-bg-active hover:text-chrome-text-active"
        >
          <Sparkles size={12} className="text-brand-primary" />
          <span>Analizar</span>
        </button>

        <button
          onClick={() => onAdjustBudget?.(campaign)}
          className="inline-flex items-center justify-center rounded-md border border-chrome-border bg-transparent px-2 py-1.5 text-xs text-chrome-text hover:border-chrome-border-hover hover:text-chrome-text-active"
          title="Ajustar presupuesto"
        >
          <TrendingUp size={12} />
        </button>

        <button
          onClick={() => onToggleStatus?.(campaign)}
          className={`inline-flex items-center justify-center rounded-md px-2 py-1.5 text-xs font-medium ${
            isActive
              ? 'text-amber-400 hover:bg-amber-500/10'
              : 'text-emerald-400 hover:bg-emerald-500/10'
          }`}
          title={isActive ? 'Proponer pausa' : 'Proponer reactivación'}
        >
          {isActive ? 'Pausar' : 'Activar'}
        </button>
      </div>
    </div>
  );
}

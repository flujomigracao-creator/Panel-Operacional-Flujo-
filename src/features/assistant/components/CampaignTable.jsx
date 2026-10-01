import React from 'react';
import { Sparkles, TrendingUp } from 'lucide-react';

/**
 * Tabla detallada de Campañas de Meta Ads
 */
export default function CampaignTable({ campaigns = [], onAnalyze, onAdjustBudget, onToggleStatus }) {
  if (!campaigns.length) {
    return (
      <div className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-8 text-center">
        <p className="text-sm text-chrome-text-muted">No hay campañas registradas para el período seleccionado.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-chrome-border bg-chrome-bg-raised">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-chrome-border bg-chrome-bg text-[11px] font-semibold uppercase tracking-wider text-chrome-text-muted">
            <tr>
              <th className="px-4 py-3">Campaña</th>
              <th className="px-3 py-3 text-center">Estado</th>
              <th className="px-3 py-3 text-right">Presupuesto/d</th>
              <th className="px-3 py-3 text-right">Gasto</th>
              <th className="px-3 py-3 text-right">Conversaciones</th>
              <th className="px-3 py-3 text-right">Costo/Conv.</th>
              <th className="px-3 py-3 text-right">Clics</th>
              <th className="px-3 py-3 text-right">CTR</th>
              <th className="px-3 py-3 text-right">CPC</th>
              <th className="px-4 py-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-chrome-border">
            {campaigns.map((c) => {
              const m = c.metrics || {};
              // status vacío/nulo = la fuente local no lo guarda: no se asume "Pausada".
              const tieneEstado = Boolean(c.status);
              const isActive = c.status === 'ACTIVE';

              return (
                <tr key={c.id} className="hover:bg-chrome-bg/40">
                  <td className="px-4 py-3 font-medium text-chrome-text-active">
                    <div className="max-w-xs truncate" title={c.name}>
                      {c.name}
                    </div>
                    <span className="font-mono text-[10px] text-chrome-text-muted">{c.id}</span>
                  </td>

                  <td className="px-3 py-3 text-center">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${
                        isActive
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                      }`}
                    >
                      {!tieneEstado ? 'Sin estado' : isActive ? 'Activa' : 'Pausada'}
                    </span>
                  </td>

                  <td className="px-3 py-3 text-right font-medium text-chrome-text">
                    {c.daily_budget ? `R$ ${Number(c.daily_budget).toFixed(2)}` : '—'}
                  </td>

                  <td className="px-3 py-3 text-right font-semibold text-chrome-text-active">
                    R$ {Number(m.spend || 0).toFixed(2)}
                  </td>

                  <td className="px-3 py-3 text-right font-bold text-sky-400">
                    {m.conversations || 0}
                  </td>

                  <td className="px-3 py-3 text-right font-medium text-chrome-text">
                    {m.costPerConversation !== null ? `R$ ${Number(m.costPerConversation).toFixed(2)}` : '—'}
                  </td>

                  <td className="px-3 py-3 text-right text-chrome-text">
                    {m.clicks || 0}
                  </td>

                  <td className="px-3 py-3 text-right text-chrome-text">
                    {Number(m.ctr || 0).toFixed(2)}%
                  </td>

                  <td className="px-3 py-3 text-right text-chrome-text">
                    R$ {Number(m.cpc || 0).toFixed(2)}
                  </td>

                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => onAnalyze?.(c)}
                        className="rounded p-1 text-chrome-text-muted hover:bg-chrome-bg-active hover:text-brand-primary"
                        title="Analizar con Asistente"
                      >
                        <Sparkles size={14} />
                      </button>
                      <button
                        onClick={() => onAdjustBudget?.(c)}
                        className="rounded p-1 text-chrome-text-muted hover:bg-chrome-bg-active hover:text-chrome-text-active"
                        title="Ajustar Presupuesto"
                      >
                        <TrendingUp size={14} />
                      </button>
                      <button
                        onClick={() => onToggleStatus?.(c)}
                        className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                          !tieneEstado
                            ? 'text-chrome-text-muted hover:bg-chrome-bg-active'
                            : isActive
                              ? 'text-amber-400 hover:bg-amber-500/10'
                              : 'text-emerald-400 hover:bg-emerald-500/10'
                        }`}
                      >
                        {!tieneEstado ? 'Revisar' : isActive ? 'Pausar' : 'Activar'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

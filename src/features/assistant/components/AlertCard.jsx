import React from 'react';
import { AlertTriangle, CheckCircle2, Info, ArrowRight } from 'lucide-react';

/**
 * Tarjeta de Alerta y Hallazgo Inteligente
 */
export default function AlertCard({ type = 'info', title, detail, actionLabel, onAction }) {
  const styles = {
    alerta: {
      border: 'border-amber-500/30',
      bg: 'bg-amber-500/5',
      iconColor: 'text-amber-400',
      Icon: AlertTriangle,
      btn: 'text-amber-400 hover:bg-amber-500/10',
    },
    exito: {
      border: 'border-emerald-500/30',
      bg: 'bg-emerald-500/5',
      iconColor: 'text-emerald-400',
      Icon: CheckCircle2,
      btn: 'text-emerald-400 hover:bg-emerald-500/10',
    },
    info: {
      border: 'border-sky-500/30',
      bg: 'bg-sky-500/5',
      iconColor: 'text-sky-400',
      Icon: Info,
      btn: 'text-sky-400 hover:bg-sky-500/10',
    },
  };

  const conf = styles[type] || styles.info;
  const { Icon } = conf;

  return (
    <div className={`flex flex-col justify-between rounded-xl border p-4 transition-colors ${conf.border} ${conf.bg}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 shrink-0 ${conf.iconColor}`}>
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-chrome-text-active">{title}</p>
          <p className="mt-1 text-xs text-chrome-text leading-relaxed">{detail}</p>
        </div>
      </div>

      {actionLabel && (
        <div className="mt-3 flex justify-end border-t border-chrome-border/40 pt-2">
          <button
            onClick={onAction}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${conf.btn}`}
          >
            <span>{actionLabel}</span>
            <ArrowRight size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

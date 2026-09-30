import React from 'react';

/**
 * Tarjeta de métrica empresarial.
 * Muestra valor, subtítulo, variación opcional y maneja estado sin datos.
 */
export default function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend, // { value: number | string, positive?: boolean, label?: string }
  badge,
  tone = 'default', // 'default' | 'accent' | 'emerald' | 'amber'
  onClick,
}) {
  const isAvailable = value !== undefined && value !== null && value !== '';

  const toneClasses = {
    default: 'border-chrome-border bg-chrome-bg-raised text-chrome-text-active',
    accent: 'border-brand-primary/40 bg-brand-primary/5 text-brand-primary',
    emerald: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-400',
    amber: 'border-amber-500/30 bg-amber-500/5 text-amber-400',
  };

  return (
    <div
      onClick={onClick}
      className={`relative flex flex-col justify-between rounded-xl border p-4 transition-all duration-150 ${toneClasses[tone] || toneClasses.default} ${
        onClick ? 'cursor-pointer hover:border-brand-primary/60 hover:shadow-md' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-chrome-text-muted">{title}</p>
          <div className="mt-1.5 flex items-baseline gap-2">
            {isAvailable ? (
              <span className="text-2xl font-bold tracking-tight text-chrome-text-active">{value}</span>
            ) : (
              <span className="text-sm italic text-chrome-text-muted">Datos no disponibles</span>
            )}
            {badge && (
              <span className="rounded-full bg-chrome-bg-active px-2 py-0.5 text-[10px] font-semibold text-chrome-text-muted">
                {badge}
              </span>
            )}
          </div>
        </div>
        {Icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-chrome-bg-active text-chrome-text-muted">
            <Icon size={18} />
          </div>
        )}
      </div>

      {(subtitle || trend) && (
        <div className="mt-3 flex items-center justify-between border-t border-chrome-border/60 pt-2 text-xs">
          {subtitle && <span className="text-chrome-text-muted">{subtitle}</span>}
          {trend && (
            <span
              className={`font-semibold ${
                trend.positive ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {trend.positive ? '▲ +' : '▼ '}
              {trend.value} {trend.label || ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

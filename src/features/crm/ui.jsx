import React from 'react';
import { initials } from './format';

export function Avatar({ name, size = 28 }) {
  return (
    <span
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38) }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-primary-light font-semibold text-brand-primary"
    >
      {initials(name)}
    </span>
  );
}

const TONE = {
  open: 'bg-info-bg text-info',
  won: 'bg-success-bg text-success',
  lost: 'bg-bg-elevated text-text-muted',
};

export function StagePill({ name, kind = 'open', color }) {
  return (
    <span className={`inline-flex max-w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${TONE[kind] || TONE.open}`}>
      {color && <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />}
      <span className="truncate">{name || '—'}</span>
    </span>
  );
}

export function Field({ label, children, action }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">{label}</p>
        {action}
      </div>
      {children}
    </div>
  );
}

// Encabezado de página compacto: título + contador + acciones a la derecha.
export function PageHeader({ title, count, children }) {
  return (
    <div className="flex min-h-[52px] flex-wrap items-center gap-2 border-b border-border bg-bg-surface px-4 py-2">
      <h1 className="text-[15px] font-semibold text-text-primary">{title}</h1>
      {count != null && <span className="text-xs text-text-muted">{count}</span>}
      <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function Modal({ title, onClose, children, width = 'max-w-sm' }) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-surface-overlay p-4" onMouseDown={onClose}>
      <div className={`w-full ${width} rounded-lg border border-border bg-bg-surface p-4 shadow-lg`} onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-sm font-semibold text-text-primary">{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function Empty({ children }) {
  return <p className="p-8 text-center text-sm text-text-muted">{children}</p>;
}

export function Loading() {
  return <p className="p-6 text-sm text-text-muted">Cargando…</p>;
}

export function ErrorText({ error, what = 'los datos' }) {
  return <p className="p-6 text-sm text-danger">No se pudieron cargar {what}: {error?.message || String(error)}</p>;
}

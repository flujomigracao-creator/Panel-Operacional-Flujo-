import React from 'react';

import { initials } from './format';

export function Avatar({ name, size = 28 }) {
  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.4 }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-primary-light font-semibold text-brand-primary"
    >
      {initials(name)}
    </span>
  );
}

const TONE = {
  open: 'bg-bg-elevated text-text-secondary',
  won: 'bg-success-bg text-success',
  lost: 'bg-bg-elevated text-text-muted',
};

export function StagePill({ name, kind = 'open' }) {
  return <span className={`inline-block max-w-full truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${TONE[kind] || TONE.open}`}>{name || '—'}</span>;
}

export function Field({ label, children }) {
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">{label}</p>
      {children}
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-sm rounded-lg border border-border bg-bg-surface p-4" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-sm font-semibold text-text-primary">{title}</h3>
        {children}
      </div>
    </div>
  );
}

import React from 'react';

// Marco común de cada página del centro de Nora: título, una línea que explica para qué sirve y acciones.
export default function NoraPage({ title, description, actions, children }) {
  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 px-6 py-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold text-text-primary">{title}</h1>
          {description && <p className="mt-0.5 text-[13px] text-text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export function Card({ title, action, children, className = '' }) {
  return (
    <section className={`rounded-lg border border-border bg-bg-surface ${className}`}>
      {title && (
        <header className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <h2 className="flex-1 text-[13px] font-semibold text-text-primary">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

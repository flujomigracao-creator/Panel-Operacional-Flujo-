import React from 'react';

// Tabla simple y legible: una fila por elemento; clic abre el editor.
// columns: [{ key, label, render?(row), className?, width? }]
export default function KnowledgeTable({ columns, rows, onOpen, empty = 'No hay nada todavía.', selectedId }) {
  if (!rows.length) return <p className="rounded-lg border border-border bg-bg-surface p-8 text-center text-sm text-text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-bg-surface">
      <table className="w-full min-w-[720px] text-[13px]">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-muted">
            {columns.map((c) => <th key={c.key} className={`px-3 py-2 font-medium ${c.className || ''}`} style={c.width ? { width: c.width } : undefined}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} onClick={onOpen ? () => onOpen(r) : undefined}
              className={`border-b border-border last:border-0 align-top ${onOpen ? 'cursor-pointer hover:bg-bg-elevated' : ''} ${selectedId === r.id ? 'bg-brand-primary-light' : ''}`}>
              {columns.map((c) => (
                <td key={c.key} className={`px-3 py-2 text-text-primary ${c.className || ''}`}>
                  {c.render ? c.render(r) : (r[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Texto largo recortado a pocas líneas dentro de una celda.
export function Clip({ children, lines = 2, className = '' }) {
  return <span className={`block overflow-hidden text-ellipsis ${className}`} style={{ display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical' }}>{children}</span>;
}

export function Tags({ tags }) {
  if (!tags?.length) return <span className="text-text-muted">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((t) => <span key={t} className="rounded bg-bg-elevated px-1.5 py-0.5 text-[11px] text-text-secondary">{t}</span>)}
    </span>
  );
}

export const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—');

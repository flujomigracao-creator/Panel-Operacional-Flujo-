import React from 'react';

// Números del conocimiento: qué sabe Nora hoy y qué espera una decisión.
export default function NoraStats({ resumen, onOpen }) {
  const r = resumen || {};
  const items = [
    ['Conocimiento activo', r.conocimientoActivo, 'Todo lo que Nora usa hoy', null],
    ['Respuestas', r.respuestasAprobadas, `${r.respuestasTotal ?? 0} en total`, 'respuestas'],
    ['Reglas activas', r.reglasActivas, `${r.reglasTotal ?? 0} en total`, 'reglas'],
    ['Casos aprobados', r.casosAprobados, 'Antecedentes reales', 'casos'],
    ['Documentos activos', r.documentosActivos, 'Información oficial', 'documentos'],
    ['Memorias', r.memoriasActivas, 'De clientes', 'memorias'],
  ];
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      {items.map(([label, valor, sub, seccion]) => {
        const Tag = seccion ? 'button' : 'div';
        return (
          <Tag key={label} onClick={seccion ? () => onOpen(seccion) : undefined}
            className={`rounded-lg border border-border bg-bg-surface px-3 py-2.5 text-left ${seccion ? 'hover:border-brand-primary' : ''}`}>
            <p className="text-[11px] text-text-muted">{label}</p>
            <p className="text-xl font-semibold tabular-nums text-text-primary">{valor ?? '—'}</p>
            <p className="truncate text-[11px] text-text-muted">{sub}</p>
          </Tag>
        );
      })}
    </div>
  );
}

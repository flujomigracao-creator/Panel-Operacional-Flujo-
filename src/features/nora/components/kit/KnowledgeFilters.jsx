import React from 'react';
import { Search } from 'lucide-react';
import { chipCls, inputCls, selectCls } from '@features/crm/format';

export const PERIODOS = [['', 'Cualquier fecha'], ['7', 'Últimos 7 días'], ['30', 'Últimos 30 días'], ['90', 'Últimos 90 días']];
export const dentroDePeriodo = (iso, dias) => !dias || (iso && Date.now() - new Date(iso) <= Number(dias) * 86400000);

// Filtros de una lista: estados como chips (con su cantidad), selects opcionales y texto.
// estados: [[valor, etiqueta, cantidad]] · selects: [{ key, label, value, options: [[v, l]], onChange }]
export default function KnowledgeFilters({ estados, estado, onEstado, selects = [], texto, onTexto, placeholder = 'Filtrar…' }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {estados && (
        <div className="flex flex-wrap gap-1">
          {estados.map(([v, l, n]) => (
            <button key={v} className={chipCls(estado === v)} onClick={() => onEstado(v)}>
              {l}{n != null && <span className="text-text-muted">{n}</span>}
            </button>
          ))}
        </div>
      )}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {selects.map((s) => (
          <select key={s.key} className={`${selectCls} !w-auto max-w-[170px]`} value={s.value} onChange={(e) => s.onChange(e.target.value)} aria-label={s.label}>
            {s.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        ))}
        {onTexto && (
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2.5 text-text-muted" />
            <input className={`${inputCls} !w-52 !pl-8`} placeholder={placeholder} value={texto} onChange={(e) => onTexto(e.target.value)} />
          </div>
        )}
      </div>
    </div>
  );
}

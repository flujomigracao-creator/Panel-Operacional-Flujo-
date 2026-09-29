import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { inputCls } from '@features/crm/format';
import { Loading, ErrorText } from '@features/crm/ui';
import { buscarConocimiento } from '../services/noraService';
import NoraPage, { Card } from './kit/NoraPage';
import { KnowledgeStatusBadge } from './kit/KnowledgeStatus';
import { estadoDocumento } from './DocumentosPage';

// Caja "Buscar conocimiento…" (va arriba en todo el centro de Nora).
export function KnowledgeSearchBox({ value, onSearch }) {
  const [q, setQ] = useState(value || '');
  useEffect(() => setQ(value || ''), [value]);
  return (
    <form className="relative w-[440px] max-w-full" onSubmit={(e) => { e.preventDefault(); if (q.trim().length >= 2) onSearch(q.trim()); }}>
      <Search size={14} className="absolute left-2.5 top-2.5 text-text-muted" />
      <input className={`${inputCls} !pl-8`} placeholder="Buscar conocimiento…" value={q} onChange={(e) => setQ(e.target.value)} />
    </form>
  );
}

const GRUPOS = [
  ['respuestas', 'Respuestas', (r) => r.pregunta, (r) => <KnowledgeStatusBadge estado={r.estado} />],
  ['reglas', 'Reglas', (r) => r.texto, (r) => <KnowledgeStatusBadge estado={r.activa ? 'activa' : 'inactiva'} />],
  ['casos', 'Casos', (r) => [r.tramite, r.resumen].filter(Boolean).join(' · '), (r) => <KnowledgeStatusBadge estado={r.estado} />],
  ['documentos', 'Documentos', (r) => r.title, (r) => <KnowledgeStatusBadge estado={estadoDocumento(r)} />],
  ['memorias', 'Memorias', (r) => `${r.clients?.full_name || 'Cliente'}: ${r.contenido}`, (r) => <KnowledgeStatusBadge estado={r.activa ? 'activa' : 'inactiva'} />],
  ['aprendizajes', 'Aprendizajes', (r) => r.leccion, (r) => <KnowledgeStatusBadge estado={r.estado} />],
];

// Resultados de la búsqueda en todo el conocimiento, agrupados por tipo.
export default function KnowledgeSearch({ query, onOpen }) {
  const q = useQuery({ queryKey: ['nora', 'buscar', query], queryFn: () => buscarConocimiento(query), enabled: !!query });
  return (
    <NoraPage title={`Resultados para “${query}”`} description="Búsqueda en respuestas, reglas, casos, documentos, memorias y aprendizajes.">
      {q.isLoading && <Loading />}
      {q.error && <ErrorText error={q.error} what="la búsqueda" />}
      {q.data && (
        <>
          <div className="flex flex-wrap gap-2 text-[13px]">
            {GRUPOS.map(([k, l]) => (
              <span key={k} className="rounded-md border border-border bg-bg-surface px-2.5 py-1">{l} <b className="tabular-nums">{q.data[k].length}</b></span>
            ))}
          </div>
          {GRUPOS.filter(([k]) => q.data[k].length).map(([k, l, texto, badge]) => (
            <Card key={k} title={`${l} (${q.data[k].length})`}>
              <ul className="divide-y divide-border">
                {q.data[k].map((r) => (
                  <li key={r.id}>
                    <button className="flex w-full items-center gap-3 py-2 text-left hover:bg-bg-elevated" onClick={() => onOpen(k, r.id)}>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-text-primary">{texto(r)}</span>
                      {badge(r)}
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
          {GRUPOS.every(([k]) => !q.data[k].length) && <p className="py-8 text-center text-sm text-text-muted">No se encontró nada.</p>}
        </>
      )}
    </NoraPage>
  );
}

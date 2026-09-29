import React, { lazy, Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { chipCls, relTime } from '@features/crm/format';
import { Loading, ErrorText } from '@features/crm/ui';
import { getFuentesUsadas } from '../services/noraService';
import { NK } from '../useNora';
import NoraPage from './kit/NoraPage';
import { FuentesUsadas } from './KnowledgePreview';

const ComercialView = lazy(() => import('@features/comercial/components/ComercialView'));

// Conversaciones de Nora: el tablero comercial (sin cambios) y el registro de qué conocimiento usó.
export default function ConversacionesPage({ leadAbiertoKommoId, onAbrirLead, onOpen, onNavigate }) {
  const [tab, setTab] = useState('tablero');
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-bg-surface px-4 py-2">
        <button className={chipCls(tab === 'tablero')} onClick={() => setTab('tablero')}>Conversaciones comerciales</button>
        <button className={chipCls(tab === 'fuentes')} onClick={() => setTab('fuentes')}>Conocimiento utilizado</button>
        <span className="mx-1 h-4 w-px bg-border" />
        <button className={chipCls(false)} onClick={() => onNavigate('leads')}>Leads</button>
        <button className={chipCls(false)} onClick={() => onNavigate('chats')}>Historial de conversaciones</button>
      </div>
      {tab === 'tablero' ? (
        <Suspense fallback={<Loading />}>
          <ComercialView leadAbiertoKommoId={leadAbiertoKommoId} onAbrirLead={onAbrirLead} />
        </Suspense>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto"><RegistroFuentes onOpen={onOpen} onAbrirLead={(id) => { setTab('tablero'); onAbrirLead?.(id); }} /></div>
      )}
    </div>
  );
}

function RegistroFuentes({ onOpen, onAbrirLead }) {
  const q = useQuery({ queryKey: NK.fuentesUsadas, queryFn: () => getFuentesUsadas({ limite: 40 }), refetchInterval: 30_000 });
  const [abierto, setAbierto] = useState(null);
  return (
    <NoraPage title="Conocimiento utilizado" description="Cada vez que Nora responde, queda registrado qué conocimiento le llegó y por qué. Las reglas activas le llegan siempre.">
      {q.isLoading && <Loading />}
      {q.error && <ErrorText error={q.error} what="el registro" />}
      {q.data && !q.data.length && <p className="rounded-lg border border-border bg-bg-surface p-8 text-center text-sm text-text-muted">Todavía no hay registros. Aparecen cuando Nora responde con la búsqueda completa activada.</p>}
      <div className="space-y-2">
        {(q.data || []).map((r) => (
          <article key={r.id} className="rounded-lg border border-border bg-bg-surface">
            <button className="flex w-full items-center gap-3 px-4 py-2.5 text-left" onClick={() => setAbierto(abierto === r.id ? null : r.id)}>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium text-text-primary">{r.lead_nombre || (r.kommo_lead_id ? `Lead ${r.kommo_lead_id}` : 'Conversación')}</span>
                <span className="block truncate text-xs text-text-muted">Cliente: “{r.consulta}”</span>
              </span>
              <span className="shrink-0 text-xs text-text-secondary">{r.fuentes.length} fuentes</span>
              <span className="shrink-0 text-[11px] text-text-muted">{relTime(r.created_at)}</span>
            </button>
            {abierto === r.id && (
              <div className="border-t border-border px-4 py-3">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Por qué Nora respondió esto</p>
                <FuentesUsadas fuentes={r.fuentes} onOpen={onOpen} />
                {r.kommo_lead_id && <button className="mt-2 text-xs text-brand-primary hover:underline" onClick={() => onAbrirLead(r.kommo_lead_id)}>Abrir la conversación</button>}
              </div>
            )}
          </article>
        ))}
      </div>
    </NoraPage>
  );
}

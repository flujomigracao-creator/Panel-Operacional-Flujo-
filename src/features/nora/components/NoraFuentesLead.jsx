import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Library } from 'lucide-react';
import { relTime } from '@features/crm/format';
import { getFuentesUsadas } from '../services/noraService';
import { FuentesUsadas } from './KnowledgePreview';

// "Ver conocimiento utilizado" dentro de la conversación de un lead: la última búsqueda de Nora y sus fuentes.
export default function NoraFuentesLead({ kommoLeadId }) {
  const [abierto, setAbierto] = useState(false);
  const q = useQuery({ queryKey: ['nora', 'fuentes_usadas', kommoLeadId], queryFn: () => getFuentesUsadas({ kommoLeadId, limite: 5 }), enabled: abierto && !!kommoLeadId });
  const ultima = q.data?.[0];
  return (
    <div className="border-b border-chrome-border px-4 py-2">
      <button className="flex w-full items-center gap-2 text-left text-xs text-chrome-text-muted hover:text-chrome-text-active" onClick={() => setAbierto(!abierto)}>
        {abierto ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <Library size={13} /> Ver conocimiento utilizado por Nora
      </button>
      {abierto && (
        <div className="mt-2 space-y-2">
          {q.isLoading && <p className="text-xs text-chrome-text-muted">Cargando…</p>}
          {q.data && !ultima && <p className="text-xs text-chrome-text-muted">Todavía no hay registro de qué usó Nora con este lead.</p>}
          {ultima && (
            <>
              <p className="text-xs text-chrome-text-muted">Última respuesta ({relTime(ultima.created_at)}) al mensaje: “{ultima.consulta}”</p>
              <FuentesUsadas fuentes={ultima.fuentes} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

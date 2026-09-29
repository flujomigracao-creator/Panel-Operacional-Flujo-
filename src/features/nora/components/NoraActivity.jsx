import React from 'react';
import { relTime } from '@features/crm/format';
import { useCrmData } from '@features/crm/useCrm';

const ENTIDAD = { respuesta: 'Respuesta', regla: 'Regla', caso: 'Caso', documento: 'Documento', memoria: 'Memoria', aprendizaje: 'Aprendizaje' };
const SECCION = { respuesta: 'respuestas', regla: 'reglas', caso: 'casos', documento: 'documentos', memoria: 'memorias', aprendizaje: 'aprendizajes' };
const TONO = { aprobado: 'bg-success', activado: 'bg-success', procesado: 'bg-success', 'error al procesar': 'bg-danger', 'para corregir': 'bg-danger', eliminado: 'bg-text-muted', archivado: 'bg-text-muted', desactivado: 'bg-text-muted', descartado: 'bg-text-muted' };

// Actividad reciente del conocimiento (la registra la base con cada cambio).
export default function NoraActivity({ items, onOpen }) {
  const { teamById } = useCrmData();
  if (!items?.length) return <p className="py-4 text-center text-sm text-text-muted">Sin actividad todavía.</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((a) => (
        <li key={a.id}>
          <button className="flex w-full items-start gap-2.5 py-2 text-left hover:bg-bg-elevated" disabled={a.accion === 'eliminado'}
            onClick={() => onOpen(SECCION[a.entidad], a.entidad_id)}>
            <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${TONO[a.accion] || 'bg-brand-primary'}`} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] text-text-primary">{ENTIDAD[a.entidad] || a.entidad} {a.accion}{a.actor ? ` · ${teamById[a.actor] || 'equipo'}` : ' · automático'}</span>
              {a.titulo && <span className="block truncate text-xs text-text-muted">{a.titulo}</span>}
            </span>
            <span className="shrink-0 text-[11px] text-text-muted">{relTime(a.created_at)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

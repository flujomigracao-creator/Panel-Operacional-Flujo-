import React from 'react';
import { Paperclip } from 'lucide-react';
import Modal from '../ui/Modal';
import { linkifyText } from '../../utils/linkifyText';

// Vista "a primera vista" de un proceso: la tarjeta de PoliceAndCitiesTab solo
// muestra el título (la descripción completa ahí volvía la tarjeta un bloque
// de texto ilegible cuando el proceso era largo). Clickear el proceso abre
// este modal con el detalle completo y sus archivos adjuntos.
export default function ProcesoDetailModal({ proceso, onClose, onViewArchivo }) {
  if (!proceso) return null;

  return (
    <Modal isOpen title={proceso.titulo || 'Proceso'} onClose={onClose} maxWidth={560}>
      {proceso.descripcion ? (
        <p className="text-sm text-chrome-text whitespace-pre-line">{linkifyText(proceso.descripcion)}</p>
      ) : (
        <p className="text-sm text-chrome-text-muted italic">Sin descripción.</p>
      )}

      {proceso.archivos && proceso.archivos.length > 0 && (
        <div className="mt-4 pt-4 border-t border-chrome-border">
          <p className="text-xs font-medium text-chrome-text-muted uppercase tracking-wider mb-2">
            Archivos
          </p>
          <div className="flex flex-wrap gap-2">
            {proceso.archivos.map(archivo => (
              <button
                key={archivo.id}
                type="button"
                onClick={() => onViewArchivo(archivo)}
                className="flex items-center gap-1 px-2 py-1 rounded bg-chrome-bg-active text-xs text-chrome-text-muted hover:text-brand-primary transition-colors"
              >
                <Paperclip size={12} />
                {archivo.nombre_archivo}
              </button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

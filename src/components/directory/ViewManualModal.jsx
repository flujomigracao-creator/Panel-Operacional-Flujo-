import React from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { Download } from 'lucide-react';

export default function ViewManualModal({ isOpen, onClose, manual }) {
  if (!isOpen || !manual) return null;

  const variantes = manual.variantes || [];
  const hayDocumentos = manual.url_pdf || variantes.length > 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={manual.titulo}
      maxWidth={800}
      footer={(
        <div className="flex justify-end w-full">
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      )}
    >
      <div className="flex flex-col gap-4 py-2 text-chrome-text">
        {manual.descripcion && (
          <p className="text-sm font-medium text-chrome-text-muted">
            {manual.descripcion}
          </p>
        )}
        <div className="prose prose-sm prose-invert max-w-none mt-2 whitespace-pre-wrap">
          {manual.contenido || (
            <span className="italic text-chrome-text-muted">
              No hay contenido detallado para este manual.
            </span>
          )}
        </div>

        {hayDocumentos && (
          <div className="border-t border-chrome-border pt-4">
            <p className="text-xs font-medium text-chrome-text-muted mb-2 uppercase tracking-wider">
              Documentos PDF
            </p>
            <div className="flex flex-wrap gap-2">
              {manual.url_pdf && (
                <a
                  href={manual.url_pdf}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 border border-brand-primary text-brand-primary rounded-lg text-sm font-medium hover:bg-brand-primary/10 transition-colors"
                >
                  <Download size={16} />
                  {variantes.length > 0 ? 'PDF general' : 'Descargar PDF'}
                </a>
              )}
              {variantes.map(v => (
                v.url_pdf && (
                  <a
                    key={v.id}
                    href={v.url_pdf}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 border border-chrome-border text-chrome-text rounded-lg text-sm font-medium hover:border-brand-primary/50 hover:text-brand-primary transition-colors"
                  >
                    <Download size={16} />
                    {v.etiqueta || 'Variante'}
                  </a>
                )
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

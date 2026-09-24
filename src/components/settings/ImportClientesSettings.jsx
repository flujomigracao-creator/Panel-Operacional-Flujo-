import React, { useState, lazy, Suspense } from 'react';
import { Upload, FileSpreadsheet } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';

const ImportClientsModal = lazy(() => import('../importClients/ImportClientsModal'));

export default function ImportClientesSettings() {
  const [showImportModal, setShowImportModal] = useState(false);
  const queryClient = useQueryClient();

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--color-text-primary)' }}>Importar Clientes</h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            Cargá tu base de clientes desde un archivo CSV, Excel o un link de Google Sheets.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowImportModal(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <Upload size={16} /> Importar clientes
        </button>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: '1rem',
        background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)', padding: '1.5rem',
      }}>
        <FileSpreadsheet size={28} color="var(--brand-primary)" style={{ flexShrink: 0 }} />
        <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
          Vas a poder elegir a qué campo corresponde cada columna de tu archivo antes de importar,
          así que sirve sin importar cómo esté organizada tu planilla actual.
        </p>
      </div>

      {showImportModal && (
        <Suspense fallback={null}>
          <ImportClientsModal
            onClose={() => setShowImportModal(false)}
            onImportComplete={() => queryClient.invalidateQueries({ queryKey: ['clientesList'] })}
          />
        </Suspense>
      )}
    </div>
  );
}

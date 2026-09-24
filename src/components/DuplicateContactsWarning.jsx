import React, { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import MergeContactsModal from './MergeContactsModal';
import { useQueryClient } from '@tanstack/react-query';

export default function DuplicateContactsWarning({ clientId, duplicateContacts, onMergeCompleteCallback, externalShowModal, setExternalShowModal, onNavigateToClient }) {
  const [showWarning, setShowWarning] = useState(true);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (externalShowModal !== undefined) {
        setShowMergeModal(externalShowModal);
    }
  }, [externalShowModal]);

  if (!duplicateContacts || duplicateContacts.length <= 1 || !showWarning) {
    return null;
  }

  const handleMergeComplete = async (mergedData, keepContactId) => {
    console.log('Fusión completada:', mergedData, keepContactId);
    setShowMergeModal(false);
    if (setExternalShowModal) setExternalShowModal(false);
    setShowWarning(false);
    
    if (keepContactId !== clientId && onNavigateToClient) {
        // Si el cliente actual fue eliminado y nos quedamos con el otro, redirigimos
        onNavigateToClient(keepContactId);
    } else {
        // Solo invalidamos si el cliente actual sigue existiendo
        queryClient.invalidateQueries({ queryKey: ['duplicateContacts'] });
        queryClient.invalidateQueries({ queryKey: ['client', clientId] });
        queryClient.invalidateQueries({ queryKey: ['clientData', clientId] });
        queryClient.invalidateQueries({ queryKey: ['entradas', clientId] });
        queryClient.invalidateQueries({ queryKey: ['documents', clientId] });
        
        if (onMergeCompleteCallback) {
            await onMergeCompleteCallback();
        }
    }
  };

  const handleCloseModal = () => {
      setShowMergeModal(false);
      if (setExternalShowModal) setExternalShowModal(false);
  };

  return (
    <>
      <div 
        className="glass-panel" 
        style={{ 
            margin: '0 2.5rem 2rem 2.5rem', 
            padding: '16px', 
            background: 'var(--color-warning-bg)', 
            borderColor: 'var(--color-warning-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <AlertTriangle style={{ width: '20px', height: '20px', color: 'var(--color-warning)', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
              <div>
                <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-warning)' }}>
                  Se detectaron {duplicateContacts.length} contactos duplicados con el mismo teléfono
                </p>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  {duplicateContacts.map(c => c.nombre || c.email || c.telefono).join(', ')}
                </p>
              </div>
              <button
                onClick={() => setShowWarning(false)}
                className="btn btn-ghost"
                style={{ padding: '4px', minHeight: 'auto', color: 'var(--color-warning)' }}
                aria-label="Cerrar notificación de duplicados"
              >
                <X style={{ width: '16px', height: '16px' }} />
              </button>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={() => {
                setShowMergeModal(true);
                if (setExternalShowModal) setExternalShowModal(true);
            }}
            className="btn"
            style={{ 
                background: 'var(--color-warning)', 
                color: '#fff', 
                padding: '6px 12px', 
                fontSize: '0.75rem',
                border: 'none'
            }}
          >
            Fusionar
          </button>
        </div>
      </div>

      {showMergeModal && (
        <MergeContactsModal
          isOpen={showMergeModal}
          onClose={handleCloseModal}
          onMergeComplete={handleMergeComplete}
          contact1={duplicateContacts[0]}
          contact2={duplicateContacts[1]}
        />
      )}
    </>
  );
}

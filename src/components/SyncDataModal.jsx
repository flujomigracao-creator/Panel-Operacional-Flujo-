import React, { useState, useEffect } from 'react';
import Modal from './ui/Modal';
import Button from './ui/Button';
import { RefreshCw, MapPin, Phone, Mail, Globe, Map, PlaneLanding, Calendar } from 'lucide-react';

const SyncDataModal = ({
  isOpen,
  onClose,
  sourceClient,
  targetClient,
  onSync,
  isSyncing
}) => {
  // Define what fields can be synchronized
  const SYNCABLE_FIELDS = [
    { id: 'direccion', label: 'Dirección Completa', icon: <MapPin size={16} /> },
    { id: 'telefono', label: 'Teléfono', icon: <Phone size={16} /> },
    { id: 'email', label: 'Email', icon: <Mail size={16} /> },
    { id: 'nacionalidad', label: 'Nacionalidad', icon: <Globe size={16} /> },
    { id: 'pais', label: 'País de Origen', icon: <Map size={16} /> },
    { id: 'lugar_entrada_brasil', label: 'Lugar de Entrada', icon: <PlaneLanding size={16} /> },
    { id: 'fecha_entrada_brasil', label: 'Fecha de Entrada', icon: <Calendar size={16} /> },
  ];

  const [selectedFields, setSelectedFields] = useState({});

  useEffect(() => {
    if (isOpen && sourceClient) {
      // By default, select fields that have a value in sourceClient
      const defaults = {};
      SYNCABLE_FIELDS.forEach(field => {
        if (sourceClient[field.id]) {
          defaults[field.id] = true;
        } else {
          defaults[field.id] = false;
        }
      });
      setSelectedFields(defaults);
    }
  }, [isOpen, sourceClient]);

  if (!isOpen || !sourceClient || !targetClient) return null;

  const handleToggleField = (fieldId) => {
    if (!sourceClient[fieldId]) return; // Cannot select if source has no value
    setSelectedFields(prev => ({
      ...prev,
      [fieldId]: !prev[fieldId]
    }));
  };

  const handleConfirmSync = () => {
    const payload = {};
    Object.keys(selectedFields).forEach(fieldId => {
      if (selectedFields[fieldId] && sourceClient[fieldId]) {
        payload[fieldId] = sourceClient[fieldId];
      }
    });

    if (Object.keys(payload).length === 0) {
      return; // Nothing to sync
    }

    onSync(targetClient.id, payload);
  };

  const formatValue = (fieldId, val) => {
    if (!val) return <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>Sin datos</span>;
    if (fieldId === 'direccion') {
      try {
        const parsed = typeof val === 'string' && val.startsWith('{') ? JSON.parse(val) : val;
        if (typeof parsed === 'object') {
           const { endereco, numero, bairro, cidade, estado } = parsed;
           return [endereco, numero, bairro, cidade, estado].filter(Boolean).join(', ');
        }
      } catch (_e) {}
    }
    if (fieldId === 'fecha_entrada_brasil' && val) {
      const parts = val.split('-');
      if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return val;
  };

  const hasSelectedFields = Object.values(selectedFields).some(Boolean);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Sincronizar datos con ${targetClient.nombre}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        
        <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
          Selecciona los campos que deseas copiar de <strong>{sourceClient.nombre}</strong> a <strong>{targetClient.nombre}</strong>. Los datos existentes en el destino serán sobrescritos.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '1rem', background: 'var(--surface-raised)' }}>
          {SYNCABLE_FIELDS.map(field => {
            const hasData = !!sourceClient[field.id];
            const isSelected = !!selectedFields[field.id];

            return (
              <div 
                key={field.id}
                onClick={() => handleToggleField(field.id)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '1rem',
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  background: isSelected ? 'var(--brand-primary-light)' : 'transparent',
                  border: `1px solid ${isSelected ? 'var(--brand-primary)' : 'transparent'}`,
                  cursor: hasData ? 'pointer' : 'not-allowed',
                  opacity: hasData ? 1 : 0.5,
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ paddingTop: '2px' }}>
                  <input 
                    type="checkbox" 
                    checked={isSelected}
                    readOnly
                    style={{ cursor: hasData ? 'pointer' : 'not-allowed' }}
                  />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                    {field.icon}
                    {field.label}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                    {formatValue(field.id, sourceClient[field.id])}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
          <Button variant="ghost" onClick={onClose} disabled={isSyncing}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleConfirmSync} disabled={!hasSelectedFields || isSyncing}>
            <RefreshCw size={16} className={isSyncing ? "animate-spin" : ""} />
            {isSyncing ? 'Sincronizando...' : 'Sincronizar Datos'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default SyncDataModal;

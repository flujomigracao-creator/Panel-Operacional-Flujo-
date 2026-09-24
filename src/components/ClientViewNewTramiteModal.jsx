import React from 'react';
import { Plus, Loader2 } from 'lucide-react';

export default function ClientViewNewTramiteModal({
  isOpen,
  onClose,
  catalogoTramites = [],
  operariosList = [],
  servicio,
  onServicioChange,
  operario,
  onOperarioChange,
  onCreate,
  isCreating,
}) {
  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
      <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '420px', padding: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={20} color="var(--color-primary)" /> Nueva operación
        </h2>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--color-text-secondary)' }}>
            Servicio / Tipo de operación <span style={{ color: 'var(--color-danger)' }}>*</span>
          </label>
          <select
            className="form-input"
            value={servicio}
            onChange={(e) => onServicioChange(e.target.value)}
            style={{ width: '100%', cursor: 'pointer' }}
            autoFocus
          >
            <option value="">SELECCIONAR...</option>
            {catalogoTramites.map(cat => (
              <option key={cat.id} value={cat.nombre}>{cat.nombre}</option>
            ))}
            {/* Si el trámite actual no está en el catálogo, mostrarlo también */}
            {servicio && !catalogoTramites.some(cat => cat.nombre.toUpperCase() === servicio.toUpperCase()) && (
              <option value={servicio}>{servicio.toUpperCase()}</option>
            )}
          </select>
        </div>
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem', color: 'var(--color-text-secondary)' }}>
            Operario / Responsable
          </label>
          <input
            className="form-input"
            type="text"
            list="operarios-list"
            placeholder="Selecciona o escribe el nombre"
            value={operario}
            onChange={(e) => onOperarioChange(e.target.value)}
            style={{ width: '100%' }}
          />
          <datalist id="operarios-list">
            {operariosList.map(op => (
              <option key={op.id} value={op.nombre} />
            ))}
          </datalist>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
          <button className="btn btn-ghost" onClick={() => { onClose(); onServicioChange(''); onOperarioChange(''); }}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={onCreate} disabled={isCreating || !servicio.trim()}>
            {isCreating ? <><Loader2 size={16} className="animate-spin" style={{ marginRight: '4px' }} /> Creando...</> : 'Crear operación'}
          </button>
        </div>
      </div>
    </div>
  );
}

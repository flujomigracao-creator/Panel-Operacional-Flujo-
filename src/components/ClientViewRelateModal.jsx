import React from 'react';
import { UserPlus } from 'lucide-react';

export default function ClientViewRelateModal({
  isOpen,
  onClose,
  searchQuery,
  onSearchChange,
  searchResults,
  allClientes,
  selectedId,
  onSelectId,
  selectedType,
  onSelectType,
  onOpenNewClient,
  clientId,
  onRelate,
}) {
  if (!isOpen) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
      <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '400px', padding: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1.5rem' }}>Vincular Familiar / Amigo</h2>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Buscar Cliente</label>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
              <input
                type="text"
                placeholder="Escriba para filtrar clientes..."
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}
              />
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', maxHeight: '300px', overflowY: 'auto', background: 'var(--color-bg-elevated)' }}>
                {(() => {
                  const list = searchQuery.trim().length >= 2 ? searchResults : allClientes.filter(c => (c.nombre || '').toLowerCase().includes(searchQuery.toLowerCase()));
                  const filteredList = list.filter(c => c.id !== clientId).slice(0, 50);
                  
                  if (filteredList.length === 0) {
                    return <div style={{ padding: '1rem', color: 'var(--color-text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>No hay resultados</div>;
                  }
                  
                  return filteredList.map(c => (
                    <div
                      key={c.id}
                      style={{ padding: '0.75rem 1rem', cursor: 'pointer', background: selectedId === c.id ? 'var(--color-primary)' : 'transparent', borderBottom: '1px solid rgba(255,255,255,0.05)', color: selectedId === c.id ? 'white' : 'var(--color-text-primary)', transition: 'background 0.2s', fontSize: '0.9rem' }}
                      onClick={() => onSelectId(c.id)}
                    >
                      {c.nombre || 'Sin nombre'} ({c.cpf || 'Sin CPF'})
                    </div>
                  ));
                })()}
              </div>
            </div>
            <button className="btn btn-secondary" style={{ padding: '0.5rem' }} onClick={onOpenNewClient} title="Crear Nuevo Cliente">
              <UserPlus size={18} />
            </button>
          </div>
        </div>
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Tipo de Relación</label>
          <select style={{ width: '100%', padding: '0.5rem', background: 'var(--color-bg-elevated)', color: 'white', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }} value={selectedType} onChange={(e) => onSelectType(e.target.value)}>
            <option value="conyuge">Cónyuge</option>
            <option value="hijo/hija">Hijo / Hija</option>
            <option value="padre/madre">Padre / Madre</option>
            <option value="hermano/hermana">Hermano / Hermana</option>
            <option value="familiar">Otro Familiar</option>
            <option value="amigo">Amigo</option>
            <option value="otro">Otro</option>
          </select>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={onRelate}>Vincular</button>
        </div>
      </div>
    </div>
  );
}

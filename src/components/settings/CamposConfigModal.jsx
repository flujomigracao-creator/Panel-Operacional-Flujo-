import React, { useState } from 'react';
import { X, Plus, Trash2, Save, GripVertical } from 'lucide-react';
import { updateCatalogoTramite } from '../../services/tramitesService';
import toast from 'react-hot-toast';

export default function CamposConfigModal({ tramite, onClose, onSaved }) {
  const [campos, setCampos] = useState(tramite.campos_config || []);
  const [saving, setSaving] = useState(false);

  const handleAddField = () => {
    setCampos([
      ...campos,
      { id: `campo_${Date.now()}`, label: 'Nuevo Campo', type: 'text' }
    ]);
  };

  const handleRemoveField = (index) => {
    setCampos(campos.filter((_, i) => i !== index));
  };

  const handleChange = (index, key, value) => {
    const newCampos = [...campos];
    newCampos[index][key] = value;
    // Auto-generate ID if label changes and it's a new field without custom ID
    if (key === 'label' && newCampos[index].id.startsWith('campo_')) {
        newCampos[index].id = value.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 20) || `campo_${Date.now()}`;
    }
    setCampos(newCampos);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateCatalogoTramite(tramite.id, { campos_config: campos });
      toast.success('Campos actualizados correctamente');
      onSaved();
      onClose();
    } catch (_err) {
      toast.error('Error al guardar configuración');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem'
    }}>
      <div style={{
        background: 'var(--color-bg-base)', width: '100%', maxWidth: '700px', maxHeight: '90vh',
        borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', overflow: 'hidden'
      }}>
        <div style={{
          padding: '1.25rem 2rem', borderBottom: '1px solid var(--color-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'var(--color-bg-elevated)', flexShrink: 0
        }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
              Campos Personalizados
            </h2>
            <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
              Operación: {tramite.nombre}
            </p>
          </div>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding: '0.5rem' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '1.5rem 2rem', flex: 1, overflowY: 'auto' }}>
          {campos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--color-text-secondary)' }}>
              <p>No hay campos personalizados configurados.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {campos.map((campo, index) => (
                <div key={index} style={{ 
                  display: 'flex', gap: '1rem', alignItems: 'center', 
                  background: 'var(--color-bg-surface)', padding: '1rem', 
                  borderRadius: '8px', border: '1px solid var(--color-border)'
                }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '0.2rem' }}>Etiqueta (Label)</label>
                    <input 
                      type="text" 
                      value={campo.label} 
                      onChange={e => handleChange(index, 'label', e.target.value)}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)' }}
                      placeholder="Ej. Fecha de Cita"
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '0.2rem' }}>Tipo de Dato</label>
                    <select 
                      value={campo.type} 
                      onChange={e => handleChange(index, 'type', e.target.value)}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)' }}
                    >
                      <option value="text">Texto Corto</option>
                      <option value="textarea">Texto Largo</option>
                      <option value="date">Fecha</option>
                      <option value="number">Número</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '0.2rem' }}>ID Interno</label>
                    <input 
                      type="text" 
                      value={campo.id} 
                      onChange={e => handleChange(index, 'id', e.target.value)}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', fontSize: '0.8rem' }}
                      placeholder="Identificador único"
                    />
                  </div>
                  <button onClick={() => handleRemoveField(index)} className="btn btn-ghost" style={{ padding: '0.5rem', color: '#ef4444', marginTop: '1.2rem' }} title="Eliminar campo">
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button onClick={handleAddField} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.5rem', width: '100%', justifyContent: 'center' }}>
            <Plus size={16} /> Agregar Campo Personalizado
          </button>
        </div>

        <div style={{
          padding: '1.25rem 2rem', borderTop: '1px solid var(--color-border)',
          display: 'flex', justifyContent: 'flex-end', gap: '1rem',
          background: 'var(--color-bg-elevated)', flexShrink: 0
        }}>
          <button onClick={onClose} className="btn btn-ghost" disabled={saving}>Cancelar</button>
          <button onClick={handleSave} className="btn btn-primary" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Save size={16} /> {saving ? 'Guardando...' : 'Guardar Configuración'}
          </button>
        </div>
      </div>
    </div>
  );
}

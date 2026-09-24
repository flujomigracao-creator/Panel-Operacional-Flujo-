import React, { useState, useEffect } from 'react';
import { getAllOperarios, createOperario, updateOperario } from '../../services/tramitesService';
import { LoadingSpinner } from '../LoadingSpinner';
import { Plus, Edit2, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';

export default function OperariosSettings() {
  const [operarios, setOperarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ nombre: '', iniciales: '', activo: true });
  
  const [isAdding, setIsAdding] = useState(false);
  const [newForm, setNewForm] = useState({ nombre: '', iniciales: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadOperarios();
  }, []);

  const loadOperarios = async () => {
    try {
      const data = await getAllOperarios();
      setOperarios(data);
    } catch (_error) {
      toast.error('Error al cargar operarios');
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (o) => {
    setEditingId(o.id);
    setEditForm({ nombre: o.nombre, iniciales: o.iniciales || '', activo: o.activo });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleSaveEdit = async (id) => {
    setSaving(true);
    try {
      await updateOperario(id, editForm);
      toast.success('Operario actualizado');
      setEditingId(null);
      loadOperarios();
    } catch (_error) {
      toast.error('Error al actualizar');
    } finally {
      setSaving(false);
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createOperario({ nombre: newForm.nombre, iniciales: newForm.iniciales, activo: true });
      toast.success('Operario agregado');
      setIsAdding(false);
      setNewForm({ nombre: '', iniciales: '' });
      loadOperarios();
    } catch (_error) {
      toast.error('Error al crear operario');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--color-text-primary)' }}>Directorio de Operarios</h2>
        <button className="btn btn-primary" onClick={() => setIsAdding(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={16} /> Nuevo Operario
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleAddSubmit} style={{ background: 'var(--color-bg-elevated)', padding: '1.5rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', border: '1px solid var(--color-border)', display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
          <div style={{ flex: 2 }}>
            <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Nombre Completo</label>
            <input required type="text" value={newForm.nombre} onChange={e => setNewForm({...newForm, nombre: e.target.value})} style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }} placeholder="Ej. Juan Pérez" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Iniciales</label>
            <input type="text" required value={newForm.iniciales} onChange={e => setNewForm({...newForm, iniciales: e.target.value.toUpperCase()})} style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }} placeholder="Ej. JP" maxLength={4} />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" onClick={() => setIsAdding(false)} className="btn btn-ghost" style={{ padding: '0.5rem' }}>Cancelar</button>
            <button type="submit" className="btn btn-primary" style={{ padding: '0.5rem 1rem' }} disabled={saving}>{saving ? '...' : 'Guardar'}</button>
          </div>
        </form>
      )}

      <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: 'var(--color-bg-elevated)' }}>
            <tr>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, fontSize: '0.875rem' }}>Nombre</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, fontSize: '0.875rem' }}>Iniciales</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 600, fontSize: '0.875rem' }}>Estado</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600, fontSize: '0.875rem' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {operarios.map(o => (
              <tr key={o.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                {editingId === o.id ? (
                  <>
                    <td style={{ padding: '0.5rem 1rem' }}>
                      <input type="text" value={editForm.nombre} onChange={e => setEditForm({...editForm, nombre: e.target.value})} style={{ width: '100%', padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }} />
                    </td>
                    <td style={{ padding: '0.5rem 1rem' }}>
                      <input type="text" value={editForm.iniciales} onChange={e => setEditForm({...editForm, iniciales: e.target.value.toUpperCase()})} style={{ width: '100%', padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }} maxLength={4} />
                    </td>
                    <td style={{ padding: '0.5rem 1rem', textAlign: 'center' }}>
                      <select value={editForm.activo} onChange={e => setEditForm({...editForm, activo: e.target.value === 'true'})} style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }}>
                        <option value="true">Activo</option>
                        <option value="false">Inactivo</option>
                      </select>
                    </td>
                    <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>
                      <button onClick={() => handleSaveEdit(o.id)} className="btn btn-ghost" style={{ padding: '0.25rem', color: '#10b981' }} disabled={saving}><Check size={18} /></button>
                      <button onClick={handleCancelEdit} className="btn btn-ghost" style={{ padding: '0.25rem', color: '#ef4444' }}><X size={18} /></button>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ padding: '0.75rem 1rem' }}>{o.nombre}</td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--color-text-secondary)' }}>{o.iniciales}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <span style={{ padding: '0.25rem 0.5rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 500, background: o.activo ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: o.activo ? '#10b981' : '#ef4444' }}>
                        {o.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <button onClick={() => handleEditClick(o)} className="btn btn-ghost" style={{ padding: '0.25rem' }}><Edit2 size={16} /></button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {operarios.length === 0 && (
              <tr><td colSpan="4" style={{ textAlign: 'center', padding: '1rem', color: 'var(--color-text-secondary)' }}>No hay operarios definidos</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

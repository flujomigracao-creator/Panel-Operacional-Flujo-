import React, { useState, useEffect } from 'react';
import { getEtiquetas, createEtiqueta, updateEtiqueta, deleteEtiqueta } from '../../services/tramitesService';
import { LoadingSpinner } from '../LoadingSpinner';
import { Plus, Edit2, Check, X, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

const COLORS = [
  { label: 'Rojo', value: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  { label: 'Naranja', value: '#f97316', bg: 'rgba(249,115,22,0.1)' },
  { label: 'Ambar', value: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  { label: 'Verde', value: '#10b981', bg: 'rgba(16,185,129,0.1)' },
  { label: 'Esmeralda', value: '#059669', bg: 'rgba(5,150,105,0.1)' },
  { label: 'Cian', value: '#06b6d4', bg: 'rgba(6,182,212,0.1)' },
  { label: 'Azul', value: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  { label: 'Índigo', value: '#6366f1', bg: 'rgba(99,102,241,0.1)' },
  { label: 'Morado', value: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
  { label: 'Rosa', value: '#ec4899', bg: 'rgba(236,72,153,0.1)' },
  { label: 'Gris', value: '#64748b', bg: 'rgba(100,116,139,0.1)' }
];

export default function EtiquetasSettings() {
  const [etiquetas, setEtiquetas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ nombre: '', color: '' });
  
  const [isAdding, setIsAdding] = useState(false);
  const [newForm, setNewForm] = useState({ nombre: '', color: COLORS[0].value });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadEtiquetas();
  }, []);

  const loadEtiquetas = async () => {
    try {
      const data = await getEtiquetas();
      setEtiquetas(data);
    } catch (_error) {
      toast.error('Error al cargar etiquetas');
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (t) => {
    setEditingId(t.id);
    setEditForm({ nombre: t.nombre, color: t.color });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleSaveEdit = async (id) => {
    if (!editForm.nombre.trim()) return;
    setSaving(true);
    try {
      await updateEtiqueta(id, editForm);
      toast.success('Etiqueta actualizada');
      setEditingId(null);
      loadEtiquetas();
    } catch (_error) {
      toast.error('Error al actualizar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta etiqueta? (Se quitará de todas las tarjetas donde esté asignada)')) return;
    try {
      await deleteEtiqueta(id);
      toast.success('Etiqueta eliminada');
      loadEtiquetas();
    } catch (_error) {
      toast.error('Error al eliminar etiqueta');
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!newForm.nombre.trim()) return;
    setSaving(true);
    try {
      await createEtiqueta({ nombre: newForm.nombre, color: newForm.color });
      toast.success('Etiqueta creada');
      setIsAdding(false);
      setNewForm({ nombre: '', color: COLORS[0].value });
      loadEtiquetas();
    } catch (_error) {
      toast.error('Error al crear etiqueta');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--color-text-primary)' }}>Etiquetas de Trámites</h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Crea etiquetas personalizadas para categorizar las tarjetas del pipeline.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsAdding(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={16} /> Nueva etiqueta
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleAddSubmit} style={{ background: 'var(--color-bg-elevated)', padding: '1.5rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', border: '1px solid var(--color-border)', display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Nombre de la etiqueta</label>
            <input required type="text" value={newForm.nombre} onChange={e => setNewForm({...newForm, nombre: e.target.value})} style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }} placeholder="Ej. VIP, Urgente, Falta Firma..." />
          </div>
          <div style={{ flex: '2 1 300px' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.5rem' }}>Color</label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {COLORS.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setNewForm({...newForm, color: c.value})}
                  style={{
                    width: '32px', height: '32px', borderRadius: '50%', background: c.value,
                    border: newForm.color === c.value ? '2px solid white' : '2px solid transparent',
                    boxShadow: newForm.color === c.value ? `0 0 0 2px ${c.value}` : 'none',
                    cursor: 'pointer', transition: 'all 0.2s'
                  }}
                  title={c.label}
                />
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" onClick={() => setIsAdding(false)} className="btn btn-ghost" style={{ padding: '0.5rem' }}>Cancelar</button>
            <button type="submit" className="btn btn-primary" style={{ padding: '0.5rem 1rem' }} disabled={saving}>{saving ? '...' : 'Guardar'}</button>
          </div>
        </form>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
        {etiquetas.map(t => {
          const isEditing = editingId === t.id;
          return (
            <div key={t.id} style={{ display: 'flex', flexDirection: 'column', padding: '1rem', background: 'var(--color-bg-base)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', gap: '0.75rem' }}>
              {isEditing ? (
                <>
                  <input type="text" required value={editForm.nombre} onChange={e => setEditForm({...editForm, nombre: e.target.value})} style={{ width: '100%', padding: '0.4rem 0.6rem', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', fontSize: '0.85rem' }} />
                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                    {COLORS.map(c => (
                      <button
                        key={c.value}
                        onClick={() => setEditForm({...editForm, color: c.value})}
                        style={{
                          width: '24px', height: '24px', borderRadius: '50%', background: c.value,
                          border: editForm.color === c.value ? '2px solid white' : '2px solid transparent',
                          boxShadow: editForm.color === c.value ? `0 0 0 2px ${c.value}` : 'none',
                          cursor: 'pointer'
                        }}
                      />
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.25rem', marginTop: '0.25rem' }}>
                    <button onClick={handleCancelEdit} className="btn btn-ghost" style={{ padding: '0.25rem 0.5rem', color: 'var(--color-text-muted)', fontSize: '0.75rem' }}><X size={14} /> Cancelar</button>
                    <button onClick={() => handleSaveEdit(t.id)} className="btn btn-ghost" style={{ padding: '0.25rem 0.5rem', color: '#10b981', fontSize: '0.75rem' }} disabled={saving}><Check size={14} /> Guardar</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ padding: '0.25rem 0.75rem', borderRadius: '9999px', background: `${t.color}20`, color: t.color, fontSize: '0.75rem', fontWeight: 600, border: `1px solid ${t.color}40` }}>
                      {t.nombre}
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      <button onClick={() => handleEditClick(t)} className="btn btn-ghost" style={{ padding: '0.25rem', color: 'var(--color-text-secondary)' }} title="Editar">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDelete(t.id)} className="btn btn-ghost" style={{ padding: '0.25rem', color: 'var(--color-danger)' }} title="Eliminar">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          );
        })}
        
        {etiquetas.length === 0 && !isAdding && (
          <div style={{ gridColumn: '1 / -1', padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)' }}>
            No hay etiquetas configuradas. Haz clic en "Nueva etiqueta" para crear la primera.
          </div>
        )}
      </div>
    </div>
  );
}

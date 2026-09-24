import React, { useState, useEffect } from 'react';
import { getAllCatalogoTramites, createCatalogoTramite, updateCatalogoTramite } from '../../services/tramitesService';
import { LoadingSpinner } from '../LoadingSpinner';
import { Plus, Edit2, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency } from '../../utils/currencyFormatter';

export default function TramitesSettings() {
  const [tramites, setTramites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ nombre: '', codigo: '', costo: 0, activo: true });

  const [isAdding, setIsAdding] = useState(false);
  const [newForm, setNewForm] = useState({ nombre: '', codigo: '', costo: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTramites();
  }, []);

  const loadTramites = async () => {
    try {
      const data = await getAllCatalogoTramites();
      // Las filas fastop_tipo son contenedores internos (ej. checklists de PDF
      // Único), no trámites facturables reales -- se gestionan desde FastOp.
      setTramites(data.filter(t => !t.fastop_tipo));
    } catch (_error) {
      toast.error('Error al cargar operaciones');
    } finally {
      setLoading(false);
    }
  };

  const handleEditClick = (t) => {
    setEditingId(t.id);
    setEditForm({ nombre: t.nombre, codigo: t.codigo || '', costo: t.costo || 0, activo: t.activo });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleSaveEdit = async (id) => {
    setSaving(true);
    try {
      await updateCatalogoTramite(id, editForm);
      toast.success('Operación actualizada');
      setEditingId(null);
      loadTramites();
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
      await createCatalogoTramite({ nombre: newForm.nombre, codigo: newForm.codigo, costo: Number(newForm.costo), activo: true });
      toast.success('Operación agregada');
      setIsAdding(false);
      setNewForm({ nombre: '', codigo: '', costo: 0 });
      loadTramites();
    } catch (_error) {
      toast.error('Error al crear operación');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--color-text-primary)' }}>Catálogo de Operaciones</h2>
        <button className="btn btn-primary" onClick={() => setIsAdding(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={16} /> Nueva operación
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleAddSubmit} style={{ background: 'var(--color-bg-elevated)', padding: '1.5rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', border: '1px solid var(--color-border)', display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
          <div style={{ flex: 2 }}>
            <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Nombre</label>
            <input required type="text" value={newForm.nombre} onChange={e => setNewForm({...newForm, nombre: e.target.value})} style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }} placeholder="Ej. SOLICITUD DE REFUGIO" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Código (opcional)</label>
            <input type="text" value={newForm.codigo} onChange={e => setNewForm({...newForm, codigo: e.target.value})} style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }} placeholder="Ej. REF-01" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Costo ($)</label>
            <input type="number" min="0" step="0.01" value={newForm.costo} onChange={e => setNewForm({...newForm, costo: e.target.value})} style={{ width: '100%', padding: '0.5rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }} placeholder="0.00" />
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
              <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 600, fontSize: '0.875rem' }}>Código</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600, fontSize: '0.875rem' }}>Costo</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: 600, fontSize: '0.875rem' }}>Estado</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600, fontSize: '0.875rem' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {tramites.map(t => (
              <tr key={t.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                {editingId === t.id ? (
                  <>
                    <td style={{ padding: '0.5rem 1rem' }}>
                      <input type="text" value={editForm.nombre} onChange={e => setEditForm({...editForm, nombre: e.target.value})} style={{ width: '100%', padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }} />
                    </td>
                    <td style={{ padding: '0.5rem 1rem' }}>
                      <input type="text" value={editForm.codigo} onChange={e => setEditForm({...editForm, codigo: e.target.value})} style={{ width: '100%', padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }} />
                    </td>
                    <td style={{ padding: '0.5rem 1rem' }}>
                      <input type="number" min="0" step="0.01" value={editForm.costo} onChange={e => setEditForm({...editForm, costo: e.target.value})} style={{ width: '100%', padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)', textAlign: 'right' }} />
                    </td>
                    <td style={{ padding: '0.5rem 1rem', textAlign: 'center' }}>
                      <select value={editForm.activo} onChange={e => setEditForm({...editForm, activo: e.target.value === 'true'})} style={{ padding: '0.25rem 0.5rem', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-bg-surface)', color: 'var(--color-text-primary)' }}>
                        <option value="true">Activo</option>
                        <option value="false">Inactivo</option>
                      </select>
                    </td>
                    <td style={{ padding: '0.5rem 1rem', textAlign: 'right' }}>
                      <button onClick={() => handleSaveEdit(t.id)} className="btn btn-ghost" style={{ padding: '0.25rem', color: '#10b981' }} disabled={saving}><Check size={18} /></button>
                      <button onClick={handleCancelEdit} className="btn btn-ghost" style={{ padding: '0.25rem', color: '#ef4444' }}><X size={18} /></button>
                    </td>
                  </>
                ) : (
                  <>
                    <td style={{ padding: '0.75rem 1rem' }}>{t.nombre}</td>
                    <td style={{ padding: '0.75rem 1rem', color: 'var(--color-text-secondary)' }}>{t.codigo || '-'}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 500 }}>{formatCurrency(t.costo || 0)}</td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                      <span style={{ padding: '0.25rem 0.5rem', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 500, background: t.activo ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: t.activo ? '#10b981' : '#ef4444' }}>
                        {t.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                      <button onClick={() => handleEditClick(t)} className="btn btn-ghost" style={{ padding: '0.25rem' }} title="Editar operación">
                        <Edit2 size={16} />
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {tramites.length === 0 && (
              <tr><td colSpan="4" style={{ textAlign: 'center', padding: '1rem', color: 'var(--color-text-secondary)' }}>No hay operaciones definidas</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

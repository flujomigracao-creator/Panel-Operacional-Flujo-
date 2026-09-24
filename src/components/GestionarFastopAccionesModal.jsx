import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Pencil, Check, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { getFastopAcciones, createFastopAccion, renameFastopAccion, deactivateFastopAccion } from '../services/tramitesService';

/**
 * GestionarFastopAccionesModal
 *
 * Interfaz de administración para las variantes de una acción FastOp (hoy
 * solo "PDF Único"): agregar, renombrar y desactivar — sin tocar código.
 * Cada fila es un contenedor en tramites_catalogo (fastop_tipo = tipo).
 */
export default function GestionarFastopAccionesModal({ tipo, tipoLabel, onClose, onChanged }) {
  const [acciones, setAcciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newNombre, setNewNombre] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editNombre, setEditNombre] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await getFastopAcciones(tipo);
      setAcciones(data);
    } catch (_err) {
      toast.error('Error al cargar las variantes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [tipo]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newNombre.trim()) return;
    setSaving(true);
    try {
      await createFastopAccion(newNombre, tipo);
      setNewNombre('');
      await load();
      if (onChanged) onChanged();
      toast.success('Variante agregada');
    } catch (err) {
      toast.error('No se pudo agregar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (accion) => {
    setEditingId(accion.id);
    setEditNombre(accion.nombre);
  };

  const handleSaveEdit = async (id) => {
    if (!editNombre.trim()) return;
    setSaving(true);
    try {
      await renameFastopAccion(id, editNombre);
      setEditingId(null);
      await load();
      if (onChanged) onChanged();
      toast.success('Variante renombrada');
    } catch (err) {
      toast.error('No se pudo renombrar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (accion) => {
    if (!window.confirm(`¿Desactivar "${accion.nombre}"? Ya no va a aparecer como opción, pero su checklist queda guardado.`)) return;
    setSaving(true);
    try {
      await deactivateFastopAccion(accion.id);
      await load();
      if (onChanged) onChanged();
      toast.success('Variante desactivada');
    } catch (err) {
      toast.error('No se pudo desactivar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem',
    }}>
      <div style={{
        background: 'var(--color-bg-base)', width: '100%', maxWidth: '520px', maxHeight: '85vh',
        borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', overflow: 'hidden',
      }}>
        <div style={{
          padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--color-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'var(--color-bg-elevated)', flexShrink: 0,
        }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
            Gestionar variantes de {tipoLabel}
          </h2>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding: '0.4rem' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '1.25rem 1.5rem', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-secondary)' }}>Cargando...</div>
          ) : acciones.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
              Todavía no hay ninguna variante. Agregá la primera abajo.
            </div>
          ) : (
            acciones.map(a => (
              <div key={a.id} style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                background: 'var(--color-bg-surface)', padding: '0.6rem 0.75rem',
                borderRadius: '8px', border: '1px solid var(--color-border)',
              }}>
                {editingId === a.id ? (
                  <>
                    <input
                      autoFocus
                      type="text"
                      value={editNombre}
                      onChange={e => setEditNombre(e.target.value)}
                      style={{ flex: 1, padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--color-primary)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', fontSize: '0.85rem' }}
                    />
                    <button onClick={() => handleSaveEdit(a.id)} disabled={saving} className="btn btn-ghost" style={{ padding: '0.4rem', color: 'var(--color-success)' }} title="Guardar">
                      <Check size={16} />
                    </button>
                    <button onClick={() => setEditingId(null)} disabled={saving} className="btn btn-ghost" style={{ padding: '0.4rem', color: 'var(--color-text-muted)' }} title="Cancelar">
                      <X size={16} />
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--color-text-primary)', fontWeight: 500 }}>{a.nombre}</span>
                    <button onClick={() => startEdit(a)} disabled={saving} className="btn btn-ghost" style={{ padding: '0.4rem', color: 'var(--color-text-muted)' }} title="Renombrar">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => handleDeactivate(a)} disabled={saving} className="btn btn-ghost" style={{ padding: '0.4rem', color: 'var(--color-danger)' }} title="Desactivar">
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleAdd} style={{
          padding: '1rem 1.5rem', borderTop: '1px solid var(--color-border)',
          background: 'var(--color-bg-elevated)', display: 'flex', gap: '0.5rem', flexShrink: 0,
        }}>
          <input
            type="text"
            value={newNombre}
            onChange={e => setNewNombre(e.target.value)}
            placeholder={`Ej. ${tipoLabel} Blumenau`}
            disabled={saving}
            style={{ flex: 1, padding: '0.55rem 0.75rem', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', fontSize: '0.85rem' }}
          />
          <button type="submit" className="btn btn-primary" disabled={saving || !newNombre.trim()} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '0.55rem 0.9rem', fontSize: '0.85rem' }}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Agregar
          </button>
        </form>
      </div>
    </div>
  );
}

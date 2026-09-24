import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Save, ArrowUp, ArrowDown } from 'lucide-react';
import { getRequisitosTramite, createRequisito, updateRequisito, deleteRequisito } from '../../services/tramitesService';
import { DOCUMENT_TYPE_OPTIONS } from '../clientView.constants';
import toast from 'react-hot-toast';

export default function RequisitosDocumentosModal({ tramite, onClose, onSaved }) {
  const [requisitos, setRequisitos] = useState([]);
  const [originalIds, setOriginalIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await getRequisitosTramite(tramite.id);
        if (!active) return;
        setRequisitos(data);
        setOriginalIds(new Set(data.map(r => r.id)));
      } catch (_err) {
        toast.error('Error al cargar el checklist de documentos');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [tramite.id]);

  const handleAddRow = () => {
    setRequisitos([
      ...requisitos,
      { id: `new-${Date.now()}`, tipo_dato: '', tipo_documento: DOCUMENT_TYPE_OPTIONS[0].value, obligatorio: true },
    ]);
  };

  const handleRemoveRow = (index) => {
    setRequisitos(requisitos.filter((_, i) => i !== index));
  };

  const handleChange = (index, key, value) => {
    const next = [...requisitos];
    next[index] = { ...next[index], [key]: value };
    setRequisitos(next);
  };

  const moveRow = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= requisitos.length) return;
    const next = [...requisitos];
    [next[index], next[target]] = [next[target], next[index]];
    setRequisitos(next);
  };

  const handleSave = async () => {
    if (requisitos.some(r => !r.tipo_dato.trim())) {
      toast.error('Cada fila necesita un nombre para mostrar.');
      return;
    }
    setSaving(true);
    try {
      const currentIds = new Set(requisitos.filter(r => !String(r.id).startsWith('new-')).map(r => r.id));
      const toDelete = [...originalIds].filter(id => !currentIds.has(id));

      await Promise.all([
        ...toDelete.map(id => deleteRequisito(id)),
        ...requisitos.map((r, index) => {
          const payload = {
            tramite_id: tramite.id,
            tipo_dato: r.tipo_dato.trim(),
            tipo_documento: r.tipo_documento,
            obligatorio: !!r.obligatorio,
            orden: index,
          };
          return String(r.id).startsWith('new-')
            ? createRequisito(payload)
            : updateRequisito(r.id, payload);
        }),
      ]);

      toast.success('Checklist de documentos actualizado');
      onSaved();
      onClose();
    } catch (_err) {
      toast.error('Error al guardar el checklist');
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
        background: 'var(--color-bg-base)', width: '100%', maxWidth: '760px', maxHeight: '90vh',
        borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', overflow: 'hidden',
      }}>
        <div style={{
          padding: '1.25rem 2rem', borderBottom: '1px solid var(--color-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'var(--color-bg-elevated)', flexShrink: 0,
        }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>
              Checklist de Documentos (PDF Único)
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
          <p style={{ margin: '0 0 1rem 0', fontSize: '0.8rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            Define, en orden, qué documentos componen el "PDF Único" de esta operación.
            Al generarlo para un cliente, el sistema buscará automáticamente entre sus
            documentos subidos uno cuyo "Tipo a buscar" coincida con cada fila.
          </p>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-secondary)' }}>Cargando...</div>
          ) : requisitos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--color-text-secondary)' }}>
              <p>Todavía no hay documentos definidos para el PDF único de esta operación.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {requisitos.map((req, index) => (
                <div key={req.id} style={{
                  display: 'flex', gap: '0.75rem', alignItems: 'flex-end',
                  background: 'var(--color-bg-surface)', padding: '0.75rem',
                  borderRadius: '8px', border: '1px solid var(--color-border)',
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingBottom: '0.3rem' }}>
                    <button onClick={() => moveRow(index, -1)} disabled={index === 0} className="btn btn-ghost" style={{ padding: '0.15rem' }} title="Mover arriba">
                      <ArrowUp size={14} />
                    </button>
                    <button onClick={() => moveRow(index, 1)} disabled={index === requisitos.length - 1} className="btn btn-ghost" style={{ padding: '0.15rem' }} title="Mover abajo">
                      <ArrowDown size={14} />
                    </button>
                  </div>
                  <div style={{ flex: 2 }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '0.2rem' }}>Nombre (para mostrar)</label>
                    <input
                      type="text"
                      value={req.tipo_dato}
                      onChange={e => handleChange(index, 'tipo_dato', e.target.value)}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)' }}
                      placeholder="Ej. Comprobante de Residencia"
                    />
                  </div>
                  <div style={{ flex: 2 }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '0.2rem' }}>Tipo a buscar</label>
                    <select
                      value={req.tipo_documento}
                      onChange={e => handleChange(index, 'tipo_documento', e.target.value)}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--color-border)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)' }}
                    >
                      {DOCUMENT_TYPE_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', paddingBottom: '0.6rem' }}>
                    <input
                      type="checkbox"
                      checked={!!req.obligatorio}
                      onChange={e => handleChange(index, 'obligatorio', e.target.checked)}
                      id={`oblig-${req.id}`}
                    />
                    <label htmlFor={`oblig-${req.id}`} style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Obligatorio</label>
                  </div>
                  <button onClick={() => handleRemoveRow(index)} className="btn btn-ghost" style={{ padding: '0.5rem', color: '#ef4444' }} title="Eliminar">
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button onClick={handleAddRow} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.5rem', width: '100%', justifyContent: 'center' }}>
            <Plus size={16} /> Agregar Documento
          </button>
        </div>

        <div style={{
          padding: '1.25rem 2rem', borderTop: '1px solid var(--color-border)',
          display: 'flex', justifyContent: 'flex-end', gap: '1rem',
          background: 'var(--color-bg-elevated)', flexShrink: 0,
        }}>
          <button onClick={onClose} className="btn btn-ghost" disabled={saving}>Cancelar</button>
          <button onClick={handleSave} className="btn btn-primary" disabled={saving || loading} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Save size={16} /> {saving ? 'Guardando...' : 'Guardar Checklist'}
          </button>
        </div>
      </div>
    </div>
  );
}

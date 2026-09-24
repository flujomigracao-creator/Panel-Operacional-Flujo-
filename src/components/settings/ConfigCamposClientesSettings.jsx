import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { LoadingSpinner } from '../LoadingSpinner';
import { Plus, Trash2, Pencil, ArrowUp, ArrowDown, Check, X, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';

const CATEGORIAS = [
  'Informaciones Personales',
  'Documentos de Identidad',
  'Datos Familiares'
];

const TIPO_LABELS = { text: 'Texto', date: 'Fecha', number: 'Número' };

export default function ConfigCamposClientesSettings() {
  const [campos, setCampos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const initialForm = {
    nombre_campo: '',
    identificador: '',
    categoria: 'Informaciones Personales',
    tipo: 'text',
    requerido: false
  };
  const [formData, setFormData] = useState(initialForm);

  useEffect(() => {
    loadCampos();
  }, []);

  const loadCampos = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('config_campos_clientes')
        .select('*')
        .order('orden', { ascending: true });

      if (error) throw error;
      setCampos(data || []);
    } catch (err) {
      console.error(err);
      toast.error('Error al cargar campos personalizados');
    } finally {
      setLoading(false);
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!formData.identificador || !formData.nombre_campo) {
       toast.error('Nombre e identificador son obligatorios');
       return;
    }

    // Validar formato de identificador
    if (!/^[a-z0-9_]+$/.test(formData.identificador)) {
      toast.error('El identificador solo puede contener minúsculas, números y guiones bajos');
      return;
    }

    setSaving(true);
    try {
      const maxOrden = campos.length > 0 ? Math.max(...campos.map(c => c.orden || 0)) : 0;

      const payload = {
        nombre_campo: formData.nombre_campo,
        identificador: formData.identificador,
        categoria: formData.categoria,
        tipo: formData.tipo,
        requerido: formData.requerido,
        orden: maxOrden + 1
      };

      const { error } = await supabase.from('config_campos_clientes').insert([payload]);

      if (error) {
        if (error.code === '23505') {
          toast.error('Ya existe un campo con este identificador. Si lo borraste antes, buscalo más abajo (aparece marcado "Eliminado") y restauralo en vez de crear uno nuevo — así no perdés los datos ya cargados.', { duration: 6000 });
        } else {
          throw error;
        }
      } else {
        toast.success('Campo agregado exitosamente');
        setIsAdding(false);
        setFormData(initialForm);
        loadCampos();
      }
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar el campo');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (campo) => {
    setEditingId(campo.id);
    setEditForm({
      nombre_campo: campo.nombre_campo,
      categoria: campo.categoria,
      tipo: campo.tipo || 'text',
      requerido: !!campo.requerido
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(null);
  };

  const handleEditSave = async (id) => {
    if (!editForm.nombre_campo) {
      toast.error('El nombre no puede quedar vacío');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('config_campos_clientes')
        .update({
          nombre_campo: editForm.nombre_campo,
          categoria: editForm.categoria,
          tipo: editForm.tipo,
          requerido: editForm.requerido
        })
        .eq('id', id);
      if (error) throw error;
      toast.success('Campo actualizado');
      cancelEdit();
      loadCampos();
    } catch (err) {
      console.error(err);
      toast.error('Error al actualizar el campo');
    } finally {
      setSaving(false);
    }
  };

  // Intercambia `orden` con el vecino anterior/siguiente DENTRO de la misma
  // categoría (el orden es global en la tabla, pero visualmente los campos se
  // agrupan por categoría, así que solo tiene sentido mover dentro del grupo).
  const handleMove = async (campo, direction) => {
    const grupo = campos
      .filter(c => c.categoria === campo.categoria)
      .sort((a, b) => (a.orden || 0) - (b.orden || 0));
    const idx = grupo.findIndex(c => c.id === campo.id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= grupo.length) return;

    const other = grupo[swapIdx];
    // Si ambos tienen el mismo orden (p.ej. 0 por defecto), desempatar
    let ordenA = other.orden || 0;
    let ordenB = campo.orden || 0;
    if (ordenA === ordenB) {
      ordenA = direction === 'up' ? ordenB - 1 : ordenB + 1;
    }

    try {
      const [resA, resB] = await Promise.all([
        supabase.from('config_campos_clientes').update({ orden: ordenA }).eq('id', campo.id),
        supabase.from('config_campos_clientes').update({ orden: ordenB }).eq('id', other.id)
      ]);
      if (resA.error) throw resA.error;
      if (resB.error) throw resB.error;
      loadCampos();
    } catch (err) {
      console.error(err);
      toast.error('Error al reordenar');
    }
  };

  // Soft-delete (activo=false): la fila y su identificador se conservan, así
  // que "Restaurar" siempre reconecta el campo exacto con sus datos viejos y
  // con cualquier otra parte del sistema (IA, extensión, plantillas...) que
  // lea ese identificador por clave literal — sin riesgo de typos al recrearlo.
  const handleDelete = async (id, nombre) => {
    if (!window.confirm(`¿Eliminar el campo "${nombre}"? Dejará de verse en la ficha del cliente. El dato y el campo no se borran: podés restaurarlo después desde esta misma pantalla.`)) return;

    try {
      const { error } = await supabase.from('config_campos_clientes').update({ activo: false }).eq('id', id);
      if (error) throw error;
      toast.success('Campo eliminado');
      loadCampos();
    } catch (err) {
      console.error(err);
      toast.error('Error al eliminar');
    }
  };

  const handleRestore = async (id, nombre) => {
    try {
      const { error } = await supabase.from('config_campos_clientes').update({ activo: true }).eq('id', id);
      if (error) throw error;
      toast.success(`Campo "${nombre}" restaurado`);
      loadCampos();
    } catch (err) {
      console.error(err);
      toast.error('Error al restaurar');
    }
  };

  const handleIdentificadorChange = (e) => {
    const val = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    setFormData(prev => ({ ...prev, identificador: val }));
  };

  if (loading) return <LoadingSpinner />;

  // Agrupar por categoría (las conocidas primero, cualquier otra al final)
  const categoriasPresentes = [
    ...CATEGORIAS,
    ...[...new Set(campos.map(c => c.categoria))].filter(c => !CATEGORIAS.includes(c))
  ];

  const thStyle = { padding: '0.75rem 1rem', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)' };
  const tdStyle = { padding: '0.75rem 1rem', fontSize: '0.875rem' };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--color-text-primary)' }}>Campos Base</h2>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
            Define campos nuevos que aparecerán en la ficha de tus clientes (Ej: Profesión), organizados por categoría. Puedes editarlos y reordenarlos después de creados.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setIsAdding(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Plus size={16} /> Nuevo Campo
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleAddSubmit} style={{ background: 'var(--color-bg-elevated)', padding: '1.5rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem', border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Nombre del Campo (Visible)</label>
              <input required type="text" value={formData.nombre_campo} onChange={e => setFormData({...formData, nombre_campo: e.target.value})} className="form-input" placeholder="Ej. Profesión" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Identificador Interno (Clave JSON)</label>
              <input required type="text" value={formData.identificador} onChange={handleIdentificadorChange} className="form-input" placeholder="ej. profesion" />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Categoría de Pestaña</label>
              <select value={formData.categoria} onChange={e => setFormData({...formData, categoria: e.target.value})} className="form-input">
                {CATEGORIAS.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Tipo de Input</label>
              <select value={formData.tipo} onChange={e => setFormData({...formData, tipo: e.target.value})} className="form-input">
                <option value="text">Texto</option>
                <option value="date">Fecha</option>
                <option value="number">Número</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button type="button" onClick={() => setIsAdding(false)} className="btn btn-ghost">Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar Campo'}
            </button>
          </div>
        </form>
      )}

      {campos.length === 0 ? (
        <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          No tienes campos personalizados configurados.
        </div>
      ) : (
        categoriasPresentes.map(cat => {
          const grupo = campos
            .filter(c => c.categoria === cat)
            .sort((a, b) => (a.orden || 0) - (b.orden || 0));
          if (grupo.length === 0) return null;

          return (
            <div key={cat} style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 0.5rem' }}>
                {cat} <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>({grupo.length})</span>
              </h3>
              <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--color-bg-elevated)', borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
                      <th style={thStyle}>Nombre</th>
                      <th style={thStyle}>Identificador</th>
                      <th style={thStyle}>Tipo</th>
                      <th style={thStyle}>Requerido</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupo.map((c, idx) => (
                      editingId === c.id ? (
                        <tr key={c.id} style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-elevated)' }}>
                          <td style={tdStyle}>
                            <input type="text" className="form-input" value={editForm.nombre_campo} onChange={e => setEditForm({ ...editForm, nombre_campo: e.target.value })} style={{ fontSize: '0.85rem', padding: '0.35rem 0.5rem' }} />
                          </td>
                          <td style={{ ...tdStyle, fontFamily: 'monospace', color: 'var(--color-text-muted)' }} title="El identificador no se puede cambiar: es la clave con la que ya están guardados los datos de los clientes">
                            {c.identificador}
                          </td>
                          <td style={tdStyle}>
                            <select className="form-input" value={editForm.tipo} onChange={e => setEditForm({ ...editForm, tipo: e.target.value })} style={{ fontSize: '0.85rem', padding: '0.35rem 0.5rem' }}>
                              <option value="text">Texto</option>
                              <option value="date">Fecha</option>
                              <option value="number">Número</option>
                            </select>
                          </td>
                          <td style={tdStyle}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                              <input type="checkbox" checked={editForm.requerido} onChange={e => setEditForm({ ...editForm, requerido: e.target.checked })} /> Sí
                            </label>
                            <select className="form-input" value={editForm.categoria} onChange={e => setEditForm({ ...editForm, categoria: e.target.value })} style={{ fontSize: '0.8rem', padding: '0.35rem 0.5rem', marginTop: '0.35rem' }} title="Categoría">
                              {CATEGORIAS.map(cat2 => <option key={cat2} value={cat2}>{cat2}</option>)}
                            </select>
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button onClick={() => handleEditSave(c.id)} disabled={saving} className="btn btn-ghost" style={{ padding: '0.25rem', color: 'var(--color-success)' }} title="Guardar cambios">
                              <Check size={16} />
                            </button>
                            <button onClick={cancelEdit} className="btn btn-ghost" style={{ padding: '0.25rem' }} title="Cancelar">
                              <X size={16} />
                            </button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={c.id} style={{ borderBottom: '1px solid var(--color-border)', opacity: c.activo === false ? 0.55 : 1 }}>
                          <td style={{ ...tdStyle, fontWeight: 500 }}>
                            {c.nombre_campo}
                            {c.activo === false && (
                              <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-danger)', border: '1px solid var(--color-danger)', borderRadius: '999px', padding: '0.05rem 0.5rem' }}>
                                Eliminado
                              </span>
                            )}
                          </td>
                          <td style={{ ...tdStyle, fontFamily: 'monospace', color: 'var(--color-primary)' }}>{c.identificador}</td>
                          <td style={tdStyle}>{TIPO_LABELS[c.tipo] || c.tipo}</td>
                          <td style={tdStyle}>{c.requerido ? 'Sí' : 'No'}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {c.activo === false ? (
                              <button onClick={() => handleRestore(c.id, c.nombre_campo)} className="btn btn-ghost" style={{ padding: '0.25rem', color: 'var(--color-success)' }} title="Restaurar campo (recupera el identificador y los datos originales)">
                                <RotateCcw size={15} />
                              </button>
                            ) : (
                              <>
                                <button onClick={() => handleMove(c, 'up')} disabled={idx === 0} className="btn btn-ghost" style={{ padding: '0.25rem', opacity: idx === 0 ? 0.3 : 1 }} title="Subir">
                                  <ArrowUp size={15} />
                                </button>
                                <button onClick={() => handleMove(c, 'down')} disabled={idx === grupo.length - 1} className="btn btn-ghost" style={{ padding: '0.25rem', opacity: idx === grupo.length - 1 ? 0.3 : 1 }} title="Bajar">
                                  <ArrowDown size={15} />
                                </button>
                                <button onClick={() => startEdit(c)} className="btn btn-ghost" style={{ padding: '0.25rem' }} title="Editar campo">
                                  <Pencil size={15} />
                                </button>
                                <button onClick={() => handleDelete(c.id, c.nombre_campo)} className="btn btn-ghost" style={{ padding: '0.25rem', color: 'var(--color-danger)' }} title="Eliminar campo">
                                  <Trash2 size={15} />
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      )
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { Search, Plus, X, GripVertical } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DEFAULT_CLIENT_CATEGORIES } from './clientView.constants';

const CATEGORY_ORDER_DEFAULT = DEFAULT_CLIENT_CATEGORIES;

function SortableCategory({ id, title, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `cat-${id}`, data: { type: 'category' } });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    padding: '1.5rem',
    marginBottom: '1.5rem',
    background: 'var(--color-bg-base)',
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--color-border)' }}>
        <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
          {title}
        </h3>
        <button type="button" {...attributes} {...listeners} className="btn btn-ghost" style={{ padding: '4px', cursor: 'grab' }}>
          <GripVertical size={16} color="var(--color-text-muted)" />
        </button>
      </div>
      {children}
    </div>
  );
}

function SortableField({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `field-${id}`, data: { type: 'field' } });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative',
    display: 'flex',
    gap: '0.5rem',
    alignItems: 'flex-start'
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div style={{ flex: 1 }}>{children}</div>
      <button type="button" {...attributes} {...listeners} className="btn btn-ghost" style={{ padding: '4px', marginTop: '24px', cursor: 'grab' }}>
        <GripVertical size={16} color="var(--color-text-muted)" />
      </button>
    </div>
  );
}

export default function ClientViewEditModal({
  isOpen, onClose, client = {}, relaciones = [], editFormData = [],
  onEditFormDataChange, newFields = [], _onNewFieldsChange,
  onSaveEdits, isSaving, searchQuery, onSearchChange,
  _fixedFieldsCatalog = [], handleCepSearch, toIsoDate,
  toSlashDate, onCreateField,
}) {
  const [isCopying, setIsCopying] = React.useState(false);
  const [isAddingField, setIsAddingField] = React.useState(false);
  const [isCreatingField, setIsCreatingField] = React.useState(false);
  const [newFieldForm, setNewFieldForm] = React.useState({
    nombre_campo: '', categoria: 'Informaciones Personales', tipo: 'text'
  });
  const [activeSection, setActiveSection] = useState('Todas');
  const [categoryOrderState, setCategoryOrderState] = useState(CATEGORY_ORDER_DEFAULT);

  // Sync category order state when new categories appear
  useEffect(() => {
    const present = [...new Set(editFormData.map(f => f.category_name || 'Otros'))];
    const missing = present.filter(c => !categoryOrderState.includes(c));
    if (missing.length > 0) {
      setCategoryOrderState(prev => [...prev, ...missing]);
    }
  }, [editFormData, categoryOrderState]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  if (!isOpen) return null;

  const handleCreateFieldSubmit = async () => {
    if (!onCreateField) return;
    setIsCreatingField(true);
    const ok = await onCreateField(newFieldForm);
    setIsCreatingField(false);
    if (ok) {
      setIsAddingField(false);
      setNewFieldForm({ nombre_campo: '', categoria: 'Informaciones Personales', tipo: 'text' });
    }
  };

  const ESTADO_CIVIL_OPTIONS = ["Casado(a)", "Divorciado(a)", "Outro", "Separado(a) Judicialmente", "Solteiro(a)", "União Estável", "Viúvo(a)"];
  const SEXO_OPTIONS = ["Masculino", "Feminino"];

  const normalizeEditSearchText = (value = '') => String(value || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const editModalQuery = normalizeEditSearchText(searchQuery);

  const filteredEditFormData = editFormData.filter(field => {
    if (!editModalQuery) return true;
    const fieldName = normalizeEditSearchText(field.nombre_campo);
    let fieldValue = '';
    if (field.id === 'nombre') fieldValue = normalizeEditSearchText(`${field._nombres || ''} ${field._apellidos || ''}`);
    else if (field.id === 'direccion') fieldValue = normalizeEditSearchText(`${field._endereco || ''} ${field._numero || ''} ${field._bairro || ''} ${field._cidade || ''}`);
    else fieldValue = normalizeEditSearchText(field.valor);
    return fieldName.includes(editModalQuery) || fieldValue.includes(editModalQuery);
  });

  const categoriasPresentes = categoryOrderState.filter(cat => filteredEditFormData.some(f => (f.category_name || 'Otros') === cat));
  
  const groupedFields = categoriasPresentes
    .map(cat => ({
      categoria: cat,
      fields: filteredEditFormData.filter(f => (f.category_name || 'Otros') === cat)
    }))
    .filter(g => g.fields.length > 0);

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    if (active.data.current?.type === 'category' && over.data.current?.type === 'category') {
      const activeCat = activeId.replace('cat-', '');
      const overCat = overId.replace('cat-', '');
      const oldIndex = categoryOrderState.indexOf(activeCat);
      const newIndex = categoryOrderState.indexOf(overCat);
      setCategoryOrderState(arrayMove(categoryOrderState, oldIndex, newIndex));
    } else if (active.data.current?.type === 'field' && over.data.current?.type === 'field') {
      const activeFieldId = activeId.replace('field-', '');
      const overFieldId = overId.replace('field-', '');
      
      const oldIndex = editFormData.findIndex(f => (f.id || f.campo_id) === activeFieldId);
      const newIndex = editFormData.findIndex(f => (f.id || f.campo_id) === overFieldId);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const newData = arrayMove(editFormData, oldIndex, newIndex);
        onEditFormDataChange(newData);
      }
    }
  };

  const hasEditModalResults = filteredEditFormData.length > 0 || newFields.length > 0;

  const handleCopyFromRelative = async (e) => {
    const relId = e.target.value;
    if (!relId) return;
    setIsCopying(true);
    try {
      const { supabase } = await import('../supabaseClient');
      const { data: relClient } = await supabase.from('clientes').select('*').eq('id', relId).single();
      const ignoredFields = ['nombre', 'cpf', 'rnm', 'carnet_identidad', 'fecha_nacimiento', 'sexo', 'numero_pasaporte', 'numero_refugio'];

      onEditFormDataChange(prev => prev.map(field => {
        let newVal = null;
        if (field.id === 'direccion') {
          if (relClient && (relClient.endereco || relClient.cidade || relClient.cep)) {
            return {
              ...field,
              _cep: relClient.cep || field._cep || '',
              _endereco: relClient.endereco || field._endereco || '',
              _numero: relClient.numero || field._numero || '',
              _bairro: relClient.bairro || field._bairro || '',
              _cidade: relClient.cidade || field._cidade || '',
              _estado: relClient.estado || field._estado || '',
              _complemento: relClient.complemento || field._complemento || ''
            };
          }
        } else if (!ignoredFields.includes(field.id) && !ignoredFields.includes(field.nombre_campo?.toLowerCase())) {
          if (field.id && relClient && relClient[field.id]) newVal = relClient[field.id];
          else if (field.is_custom_json && relClient && relClient.campos_personalizados) newVal = relClient.campos_personalizados[field.id];
        }
        if (newVal) return { ...field, valor: newVal };
        return field;
      }));
      const toast = (await import('react-hot-toast')).default;
      toast.success('Datos copiados exitosamente');
    } catch (err) {
      console.error(err);
      const toast = (await import('react-hot-toast')).default;
      toast.error('Error al copiar datos');
    } finally {
      setIsCopying(false);
      e.target.value = '';
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '1rem' }}>
      <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '900px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Editar Datos del Cliente</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" style={{ padding: '0.5rem', flexShrink: 0 }} onClick={onClose}>✕</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <select className="form-input" style={{ width: 'auto' }} value={activeSection} onChange={e => setActiveSection(e.target.value)}>
              <option value="Todas">Todas las secciones</option>
              {categoryOrderState.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>

            {relaciones && relaciones.length > 0 && (
              <select className="form-input" onChange={handleCopyFromRelative} disabled={isCopying} style={{ fontSize: '0.85rem', width: 'auto' }}>
                <option value="">{isCopying ? 'Copiando...' : 'Copiar datos de...'}</option>
                {relaciones.map(r => {
                  const relative = r.cliente_id === client.id ? r.cliente_secundario : r.cliente_principal;
                  return <option key={r.id} value={relative.id}>{relative.nombre} ({r.tipo_relacion})</option>;
                })}
              </select>
            )}

            <div style={{ marginLeft: 'auto', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* Nuevo campo arriba (a la izquierda del buscador) */}
              {onCreateField && (
                <button className="btn btn-secondary btn-sm" onClick={() => setIsAddingField(true)} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Plus size={14} /> Añadir campo nuevo
                </button>
              )}

              <div style={{ position: 'relative', width: '250px' }}>
                <Search size={16} color="var(--color-text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="Filtrar campos..."
                  className="form-input"
                  value={searchQuery}
                  onChange={e => onSearchChange(e.target.value)}
                  style={{ paddingLeft: '2.2rem', width: '100%', fontSize: '0.875rem' }}
                />
              </div>
            </div>
          </div>

          {isAddingField && onCreateField && (
            <div className="animate-fade-in" style={{ padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px dashed var(--color-border)', background: 'var(--color-bg-elevated)', display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>Nuevo campo de datos</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Nombre del campo</label>
                  <input type="text" className="form-input" placeholder="Ej. Profesión" value={newFieldForm.nombre_campo} onChange={e => setNewFieldForm(prev => ({ ...prev, nombre_campo: e.target.value }))} autoFocus />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Categoría</label>
                  <select className="form-input" value={newFieldForm.categoria} onChange={e => setNewFieldForm(prev => ({ ...prev, categoria: e.target.value }))}>
                    {categoryOrderState.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Tipo</label>
                  <select className="form-input" value={newFieldForm.tipo} onChange={e => setNewFieldForm(prev => ({ ...prev, tipo: e.target.value }))}>
                    <option value="text">Texto</option>
                    <option value="date">Fecha</option>
                    <option value="number">Número</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setIsAddingField(false)}>
                  <X size={14} style={{ marginRight: '4px' }} /> Cancelar
                </button>
                <button className="btn btn-primary btn-sm" onClick={handleCreateFieldSubmit} disabled={isCreatingField}>
                  {isCreatingField ? 'Creando...' : 'Crear Campo'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
          {!hasEditModalResults ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
              No se encontraron campos que coincidan.
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={categoriasPresentes.map(cat => `cat-${cat}`)} strategy={verticalListSortingStrategy}>
                {groupedFields.filter(group => activeSection === 'Todas' || group.categoria === activeSection).map(group => (
                  <SortableCategory key={group.categoria} id={group.categoria} title={group.categoria}>
                    <SortableContext items={group.fields.map(f => `field-${f.id || f.campo_id}`)} strategy={verticalListSortingStrategy}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                        {group.fields.map(field => {
                          const isDate = field.tipo === 'date' || (field.id && String(field.id).includes('fecha'));
                          const isNumber = field.tipo === 'number';
                          const isEstadoCivil = field.id === 'estado_civil';
                          const isSexo = field.id === 'sexo';
                          const isNombre = field.id === 'nombre';
                          const isDireccion = field.id === 'direccion';
                          const fieldId = field.id || field.campo_id;

                          const updateField = (updates) => {
                            onEditFormDataChange(prev => prev.map(f => (f.id === field.id && f.campo_id === field.campo_id) ? { ...f, ...updates } : f));
                          };

                          let fieldContent = null;

                          if (isNombre) {
                            fieldContent = (
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', width: '100%' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                  <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Nombres</label>
                                  <input type="text" className="form-input" value={field._nombres || ''} onChange={e => updateField({ _nombres: e.target.value })} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                  <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-secondary)' }}>Apellidos</label>
                                  <input type="text" className="form-input" value={field._apellidos || ''} onChange={e => updateField({ _apellidos: e.target.value })} />
                                </div>
                              </div>
                            );
                          } else if (isDireccion) {
                            fieldContent = (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '1.25rem', borderRadius: '0.5rem', border: '1px solid var(--color-border)', width: '100%' }}>
                                <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-secondary)' }}>{field.nombre_campo}</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>CEP</label>
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                      <input type="text" className="form-input" placeholder="00000-000" value={field._cep || ''} onChange={e => {
                                        const val = e.target.value;
                                        updateField({ _cep: val });
                                        if (val.replace(/\D/g, '').length === 8 && handleCepSearch) {
                                          handleCepSearch(val, (data) => updateField({ _endereco: data.logradouro, _bairro: data.bairro, _cidade: data.localidade, _estado: data.uf }));
                                        }
                                      }} />
                                      {handleCepSearch && (
                                        <button type="button" className="btn btn-secondary" onClick={() => handleCepSearch(field._cep, (data) => updateField({ _endereco: data.logradouro, _bairro: data.bairro, _cidade: data.localidade, _estado: data.uf }))}>
                                          <Search size={14} />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '1rem' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Calle/Avenida</label>
                                    <input type="text" className="form-input" value={field._endereco || ''} onChange={e => updateField({ _endereco: e.target.value })} />
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Número</label>
                                    <input type="text" className="form-input" value={field._numero || ''} onChange={e => updateField({ _numero: e.target.value })} />
                                  </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Bairro</label>
                                    <input type="text" className="form-input" value={field._bairro || ''} onChange={e => updateField({ _bairro: e.target.value })} />
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Ciudad</label>
                                    <input type="text" className="form-input" value={field._cidade || ''} onChange={e => updateField({ _cidade: e.target.value })} />
                                  </div>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Estado (UF)</label>
                                    <input type="text" className="form-input" value={field._estado || ''} onChange={e => updateField({ _estado: e.target.value })} />
                                  </div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                  <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Complemento / Referencia</label>
                                  <input type="text" className="form-input" value={field._complemento || ''} onChange={e => updateField({ _complemento: e.target.value })} />
                                </div>
                              </div>
                            );
                          } else {
                            fieldContent = (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
                                <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-secondary)' }}>{field.nombre_campo}</label>
                                {isDate ? (
                                  <input type="date" className="form-input" value={toIsoDate ? toIsoDate(field.valor) : (field.valor || '')} onChange={e => updateField({ valor: toSlashDate ? toSlashDate(e.target.value) : e.target.value })} />
                                ) : isEstadoCivil ? (
                                  <select className="form-input" value={field.valor || ''} onChange={e => updateField({ valor: e.target.value })}>
                                    <option value="">Seleccione...</option>
                                    {ESTADO_CIVIL_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                  </select>
                                ) : isSexo ? (
                                  <select className="form-input" value={field.valor || ''} onChange={e => updateField({ valor: e.target.value })}>
                                    <option value="">Seleccione...</option>
                                    {SEXO_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                  </select>
                                ) : (
                                  <input type={isNumber ? 'number' : 'text'} className="form-input" value={field.valor || ''} onChange={e => updateField({ valor: e.target.value })} />
                                )}
                              </div>
                            );
                          }

                          return (
                            <SortableField key={fieldId} id={fieldId}>
                              {fieldContent}
                            </SortableField>
                          );
                        })}
                      </div>
                    </SortableContext>
                  </SortableCategory>
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>

        <div style={{ padding: '1.5rem', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={onSaveEdits} disabled={isSaving}>
            {isSaving ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

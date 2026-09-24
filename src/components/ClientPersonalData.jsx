import React, { useState, useMemo } from 'react';
import { User, Search, Edit2, Copy, Check, Plus, X, Trash2, Loader2, GripVertical } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import toast from 'react-hot-toast';
import { formatDate } from '../utils/dateFormatter';
import useHorizontalDragScroll from '../hooks/useHorizontalDragScroll';
import { DEFAULT_CLIENT_CATEGORIES, ESTADO_CIVIL_OPTIONS, SEXO_OPTIONS, toIsoDate, toSlashDate } from './clientView.constants';

function SortableFieldRow({ id, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={{ ...style, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
      <button type="button" {...attributes} {...listeners} className="btn btn-ghost" style={{ padding: '2px', cursor: 'grab', flexShrink: 0, touchAction: 'none' }} title="Arrastrar para reordenar">
        <GripVertical size={14} color="var(--color-text-muted)" />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

const normalizeSearchText = (str = '') =>
  Array.from(String(str).toLowerCase().normalize('NFD'))
    .filter(ch => { const code = ch.codePointAt(0); return code < 0x0300 || code > 0x036f; })
    .join('');

const TITLE_MAP = {
  'Informaciones Personales': 'Datos Personales',
  'Documentos de Identidad': 'Documentos'
};
// "Datos Familiares" no tiene pestaña propia: sus campos se muestran junto a
// "Informaciones Personales" (una sola pestaña "Datos Personales").
const TAB_CATEGORY_GROUPS = {
  'Informaciones Personales': ['Informaciones Personales', 'Datos Familiares'],
};
const DEFAULT_TABS = ['Informaciones Personales', 'Documentos de Identidad'];
const FIELD_TYPE_OPTIONS = [
  { value: 'text', label: 'Texto' },
  { value: 'date', label: 'Fecha' },
  { value: 'number', label: 'Número' },
];

const ClientPersonalData = ({
  client,

  fixedFields,
  localSearchQuery,
  setLocalSearchQuery,
  openEditModal,
  handleCopy,
  copiedId,
  onCreateField,
  onSaveFieldValue,
  onDeleteCategory,
  onDeleteField,
  onReorderFields
}) => {
  // Estos identificadores de "Documentos de Identidad" ya se muestran con su
  // propio diseño agrupado en "Documentos Asociados" (docGroups, más abajo);
  // se excluyen aquí para no duplicarlos. Cualquier campo NUEVO que un admin
  // agregue en esa categoría (vía ConfigCamposClientesSettings) no está en esta
  // lista, así que sí pasa por el listado genérico y queda visible.
  const DOC_GROUP_FIELD_IDS = new Set([
    'rnm', 'numero_pasaporte', 'fecha_emision_pasaporte', 'fecha_vencimiento_pasaporte',
    'numero_refugio', 'fecha_vencimiento_refugio', 'carnet_identidad'
  ]);

  // ── Documentos dinámicos emparejados con sus fechas ─────────────────────────
  // Convención: si un admin crea un documento (ej. identificador `cnh`) y sus
  // fechas como campos tipo fecha cuyo identificador contiene el del documento
  // (ej. `fecha_vencimiento_cnh`, `fecha_emision_cnh`), acá se detecta el par y
  // el documento se muestra como tarjeta en "Documentos Asociados" con sus
  // fechas debajo, igual que Pasaporte/RNM/Refugio. Los campos sin par siguen
  // saliendo en el listado genérico de su categoría.
  const isDateLikeField = (f) => f.tipo === 'date' || /fecha|vencimiento|emision|validade/.test(String(f.id));
  const customDocFields = fixedFields.filter(f =>
    f.is_custom_json && f.category_name === 'Documentos de Identidad' && !DOC_GROUP_FIELD_IDS.has(f.id)
  );
  const customDocDateFields = customDocFields.filter(isDateLikeField);
  const dynamicDocGroups = customDocFields
    .filter(f => !isDateLikeField(f))
    .map(base => ({
      base,
      dates: customDocDateFields.filter(df => df.id !== base.id && String(df.id).includes(String(base.id)))
    }))
    .filter(g => g.dates.length > 0);
  const DYNAMIC_DOC_CARD_IDS = new Set(dynamicDocGroups.flatMap(g => [g.base.id, ...g.dates.map(d => d.id)]));

  // ── Categorías como pestañas ─────────────────────────────────────────────────
  // `categoria` en config_campos_clientes es texto libre: cualquier categoría
  // (además de las 3 por defecto) que tenga al menos un campo aparece acá sola.
  const categoriesWithFields = useMemo(() => {
    const seen = new Set(['Datos Familiares']); // absorbida en "Informaciones Personales", nunca su propia pestaña
    const ordered = [];
    DEFAULT_TABS.forEach(name => { ordered.push(name); seen.add(name); });
    fixedFields.forEach(f => {
      if (f.category_name && !seen.has(f.category_name)) {
        seen.add(f.category_name);
        ordered.push(f.category_name);
      }
    });
    return ordered;
  }, [fixedFields]);

  // Categorías creadas con el "+" en esta sesión que todavía no tienen ningún
  // campo — no persisten solas en la base (no hay tabla de categorías), recién
  // se vuelven "reales" cuando se les crea el primer campo (ver onCreateField).
  const [pendingCategories, setPendingCategories] = useState([]);
  const allCategories = [
    ...categoriesWithFields,
    ...pendingCategories.filter(c => !categoriesWithFields.includes(c))
  ];

  const [activeCategory, setActiveCategory] = useState(allCategories[0]);
  const currentCategory = allCategories.includes(activeCategory) ? activeCategory : allCategories[0];

  // La barra de pestañas es una sola fila que se desplaza con drag o con el
  // scroll del mouse (en vez de amontonarse en varias líneas cuando no entran).
  const { scrollContainerRef: tabsScrollRef, scrollHandlers: tabsScrollHandlers } = useHorizontalDragScroll();
  const handleTabsWheel = (e) => {
    if (!tabsScrollRef.current) return;
    tabsScrollRef.current.scrollLeft += (e.deltaY !== 0 ? e.deltaY : e.deltaX);
  };

  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const [showNewFieldForm, setShowNewFieldForm] = useState(false);
  const [newFieldForm, setNewFieldForm] = useState({ nombre_campo: '', tipo: 'text', valor: '' });
  const [isCreatingField, setIsCreatingField] = useState(false);

  const handleConfirmNewCategory = () => {
    const name = newCategoryName.trim();
    if (!name) {
      toast.error('El nombre de la categoría es obligatorio');
      return;
    }
    if (allCategories.some(c => c.toLowerCase() === name.toLowerCase())) {
      toast.error('Ya existe una categoría con ese nombre');
      return;
    }
    setPendingCategories(prev => [...prev, name]);
    setActiveCategory(name);
    setNewCategoryName('');
    setShowNewCategoryInput(false);
  };

  const handleCreateFieldSubmit = async () => {
    if (!onCreateField) return;
    setIsCreatingField(true);
    const ok = await onCreateField({
      nombre_campo: newFieldForm.nombre_campo,
      categoria: currentCategory,
      tipo: newFieldForm.tipo,
      valor: newFieldForm.valor
    });
    setIsCreatingField(false);
    if (ok) {
      setShowNewFieldForm(false);
      setNewFieldForm({ nombre_campo: '', tipo: 'text', valor: '' });
    }
  };

  const handleDeleteCategoryClick = async (e, cat) => {
    e.stopPropagation(); // no cambiar de pestaña al hacer clic en el tacho
    const isPersisted = categoriesWithFields.includes(cat);
    if (isPersisted) {
      if (!onDeleteCategory) return;
      const ok = await onDeleteCategory(cat);
      if (!ok) return;
    }
    setPendingCategories(prev => prev.filter(c => c !== cat));
    if (currentCategory === cat) setActiveCategory(DEFAULT_CLIENT_CATEGORIES[0]);
  };

  // ── Edición inline de valores (autoguardado al salir del campo) ─────────────
  // Overlay de ediciones en curso: no se sincroniza con `client` en cada
  // render, solo guarda el borrador mientras se edita. Al confirmar (blur, o
  // onChange directo en selects) se llama a onSaveFieldValue y se limpia la
  // key — el valor real llega de vuelta vía el refetch que dispara el hook.
  const [pendingEdits, setPendingEdits] = useState({});
  const [savingFieldId, setSavingFieldId] = useState(null);
  const [savedFieldId, setSavedFieldId] = useState(null);
  const [nombreDraft, setNombreDraft] = useState(null); // { nombres, apellidos } | null

  const saveField = async (fieldId, value, originalValue) => {
    if (!onSaveFieldValue) return;
    if (value === (originalValue || '')) return;
    setSavingFieldId(fieldId);
    const ok = await onSaveFieldValue(fieldId, value);
    setSavingFieldId(null);
    if (ok) {
      setSavedFieldId(fieldId);
      setTimeout(() => setSavedFieldId(prev => (prev === fieldId ? null : prev)), 1500);
    }
  };

  const handleGenericChange = (fieldId, value) => {
    setPendingEdits(prev => ({ ...prev, [fieldId]: value }));
  };

  const handleGenericBlur = (campo, originalValue) => {
    const draft = pendingEdits[campo.id];
    if (draft === undefined) return;
    setPendingEdits(prev => { const n = { ...prev }; delete n[campo.id]; return n; });
    saveField(campo.id, draft, originalValue);
  };

  const handleSelectCommit = (campo, value, originalValue) => {
    setPendingEdits(prev => ({ ...prev, [campo.id]: value }));
    saveField(campo.id, value, originalValue);
  };

  // Nombres/Apellidos se editan como un grupo: recién se guarda cuando el foco
  // sale de AMBOS inputs (no al pasar de uno al otro con Tab), para no pisar
  // un campo con el valor viejo del otro mientras el usuario sigue escribiendo.
  const handleNombreGroupBlur = (e, dato, n_nombres, n_apellidos) => {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    if (!nombreDraft) return;
    const joined = `${nombreDraft.nombres ?? n_nombres} ${nombreDraft.apellidos ?? n_apellidos}`.trim();
    setNombreDraft(null);
    saveField('nombre', joined, dato.valor);
  };

  // ── Borrar / reordenar campos dinámicos (los fijos no se pueden tocar) ──────
  const [deletingFieldId, setDeletingFieldId] = useState(null);
  const handleDeleteFieldClick = async (campo) => {
    if (!onDeleteField) return;
    setDeletingFieldId(campo.id);
    await onDeleteField(campo.id, campo.nombre_campo);
    setDeletingFieldId(null);
  };

  // Overlay optimista: al soltar el drag se ve el nuevo orden al instante, sin
  // esperar el refetch. Se limpia solo apenas onReorderFields resuelve.
  const [customOrderOverride, setCustomOrderOverride] = useState(null);
  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );
  const handleFieldDragEnd = (customIds) => async (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = customIds.indexOf(active.id);
    const newIndex = customIds.indexOf(over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(customIds, oldIndex, newIndex);
    setCustomOrderOverride(newOrder);
    if (onReorderFields) await onReorderFields(newOrder);
    setCustomOrderOverride(null);
  };

  // ── Campos de la categoría activa ────────────────────────────────────────────
  // Se listan TODOS los campos definidos, tengan o no valor cargado, para que
  // se puedan completar ahí mismo (antes un campo recién creado sin valor era
  // invisible porque se filtraba por `if (!val)`).
  const groupedCategoryNames = TAB_CATEGORY_GROUPS[currentCategory] || [currentCategory];
  const sectionFields = fixedFields.filter(f => groupedCategoryNames.includes(f.category_name));
  const sectionData = [];
  sectionFields.forEach(campo => {
    if (currentCategory === 'Documentos de Identidad' && (DOC_GROUP_FIELD_IDS.has(campo.id) || DYNAMIC_DOC_CARD_IDS.has(campo.id))) return;
    if (campo.id === 'direccion') return; // se renderiza como su propia sección más abajo

    let val = '';
    if (campo.is_custom_json) {
      val = client.campos_personalizados?.[campo.id];
    } else {
      val = client[campo.id];
    }
    sectionData.push({ campo_id: campo.id, valor: val || '' });
  });

  const query = normalizeSearchText(localSearchQuery);

  const visibleFields = sectionData.filter(d => {
    if (query) {
      const campoDef = sectionFields.find(c => c.id === d.campo_id);
      if (!campoDef) return false;
      const fieldName = normalizeSearchText(campoDef.nombre_campo);
      const fieldVal = normalizeSearchText(d.valor);
      if (!fieldName.includes(query) && !fieldVal.includes(query)) return false;
    }
    return true;
  });

  // Los fijos (columnas de `clientes`) se listan primero y no se pueden
  // borrar ni arrastrar; solo los dinámicos (config_campos_clientes) son
  // arrastrables/borrables — orden persistido vía `orden`.
  const visibleFieldsFixed = visibleFields.filter(d => !sectionFields.find(c => c.id === d.campo_id)?.is_custom_json);
  let visibleFieldsCustom = visibleFields.filter(d => sectionFields.find(c => c.id === d.campo_id)?.is_custom_json);
  if (customOrderOverride) {
    visibleFieldsCustom = [...visibleFieldsCustom].sort(
      (a, b) => customOrderOverride.indexOf(a.campo_id) - customOrderOverride.indexOf(b.campo_id)
    );
  }
  const customFieldIds = visibleFieldsCustom.map(d => d.campo_id);

  const renderDocumentosAsociados = () => {
    // Los 13 campos migratorios viven en `campos_personalizados` (JSONB), no
    // como columnas fijas. `custom: true` en cada field le indica a
    // `fieldValue` que lea de ahí en vez de `client[fieldId]` directo.
    const fieldValue = (fieldId, custom) => custom ? client?.campos_personalizados?.[fieldId] : client?.[fieldId];

    const docGroups = [
      {
        id: 'cpf',
        label: 'CPF',
        icon: '🆔',
        fields: [
          { id: 'cpf', label: 'Nº CPF' }
        ],
        fieldValue,
        color: '#378ADD'
      },
      {
        id: 'pasaporte',
        label: 'Pasaporte',
        icon: '🛂',
        fields: [
          { id: 'numero_pasaporte', label: 'Nº Pasaporte', custom: true },
          { id: 'fecha_emision_pasaporte', label: 'Emisión', custom: true },
          { id: 'fecha_vencimiento_pasaporte', label: 'Vencimiento', custom: true }
        ],
        fieldValue,
        color: '#1D9E75'
      },
      {
        id: 'rnm',
        label: 'RNM / Identidad',
        icon: '🪪',
        fields: [
          { id: 'rnm', label: 'Nº RNM', custom: true },
          { id: 'carnet_identidad', label: 'Carnet Identidad', custom: true }
        ],
        fieldValue,
        color: '#BA7517'
      },
      {
        id: 'refugio',
        label: 'Refugio',
        icon: '🛡️',
        fields: [
          { id: 'numero_refugio', label: 'Protocolo Refugio', custom: true },
          { id: 'fecha_vencimiento_refugio', label: 'Vencimiento', custom: true }
        ],
        fieldValue,
        color: '#D85A30'
      }
    ];

    // Tarjetas para documentos creados por el admin, con sus fechas
    // (vencimiento/emisión) debajo de su respectivo documento.
    const DYNAMIC_CARD_COLORS = ['#7C5CBF', '#2A9D8F', '#C0507E', '#5C7CBF', '#8A8455'];
    dynamicDocGroups.forEach((g, i) => {
      docGroups.push({
        id: g.base.id,
        label: g.base.nombre_campo,
        icon: '📄',
        fields: [
          { id: g.base.id, label: g.base.nombre_campo, custom: true },
          ...g.dates.map(d => ({ id: d.id, label: d.nombre_campo, custom: true, isDate: true }))
        ],
        fieldValue,
        color: DYNAMIC_CARD_COLORS[i % DYNAMIC_CARD_COLORS.length]
      });
    });

    const hasAnyData = docGroups.some(g => g.fields.some(f => g.fieldValue(f.id, f.custom)));
    if (!hasAnyData) return null;

    return (
      <React.Fragment>
        <div style={{ gridColumn: '1 / -1', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem', marginTop: '1.5rem' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            Documentos
          </h3>
        </div>
        <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '0.75rem', marginTop: '0.75rem' }}>
          {docGroups.map(group => {
            const hasData = group.fields.some(f => group.fieldValue(f.id, f.custom));
            if (!hasData) return null;

            return (
              <div
                key={group.id}
                style={{
                  border: `1px solid ${group.color}33`,
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  background: `${group.color}08`
                }}
              >
                {/* Header del grupo */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.5rem 0.75rem',
                  background: `${group.color}15`,
                  borderBottom: `1px solid ${group.color}22`,
                  fontSize: '0.78rem', fontWeight: 600,
                  color: group.color
                }}>
                  <span>{group.icon}</span>
                  <span>{group.label}</span>
                </div>

                <div style={{ padding: '0.65rem' }}>
                  {group.fields.map(field => {
                    const val = group.fieldValue(field.id, field.custom);
                    if (!val) return null;
                    return (
                      <div key={field.id} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '0.35rem 0', gap: '0.5rem'
                      }}>
                        <span style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em', flexShrink: 0 }}>
                          {field.label}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-primary)', textAlign: 'right', wordBreak: 'break-word' }}>
                            {(field.isDate || String(field.id).includes('fecha')) ? formatDate(val) : val}
                          </span>
                          <button onClick={() => handleCopy(val, `${group.id}-${field.id}`)} className="btn btn-ghost" style={{ padding: '0.15rem', borderRadius: '4px', flexShrink: 0 }}>
                            {copiedId === `${group.id}-${field.id}` ? <Check size={11} color="var(--color-success)" /> : <Copy size={11} />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </React.Fragment>
    );
  };

  const renderDireccion = () => {
    const dirDato = client['direccion'];
    if (!dirDato) return null;

    let dirObj = {};
    try {
      if (typeof dirDato === 'string' && dirDato.startsWith('{')) dirObj = JSON.parse(dirDato);
      else if (typeof dirDato === 'object' && dirDato !== null) dirObj = dirDato;
      else dirObj.endereco = dirDato;
    } catch (_e) {
      dirObj.endereco = dirDato;
    }

    const subFields = [
      { id: 'cep', label: 'CEP', val: dirObj.cep },
      { id: 'endereco', label: 'Endereço', val: dirObj.endereco },
      { id: 'numero', label: 'Número', val: dirObj.numero },
      { id: 'complemento', label: 'Complemento', val: dirObj.complemento },
      { id: 'bairro', label: 'Bairro', val: dirObj.bairro },
      { id: 'cidade', label: 'Cidade (Residência)', val: dirObj.cidade },
      { id: 'estado', label: 'Estado (Residência)', val: dirObj.estado },
      { id: 'ponto_referencia', label: 'Ponto de Referência', val: dirObj.ponto_referencia }
    ].filter(sf => {
      if (!sf.val) return false;
      if (query) {
        const fieldName = normalizeSearchText(sf.label);
        const fieldVal = normalizeSearchText(sf.val);
        if (!fieldName.includes(query) && !fieldVal.includes(query)) return false;
      }
      return true;
    });

    if (subFields.length === 0) return null;

    const rua = dirObj.endereco;
    const num = dirObj.numero;
    const comp = dirObj.complemento;
    const bairro = dirObj.bairro;
    const cid = dirObj.cidade;
    const uf = dirObj.estado;
    const cep = dirObj.cep;
    const ref = dirObj.ponto_referencia;

    let line1 = [rua, num].filter(Boolean).join(', ');
    if (comp) line1 += ` - ${comp}`;
    let line2 = [bairro, cid, uf].filter(Boolean).join(' - ');
    let addressFull = [line1, line2, cep ? `CEP: ${cep}` : '', ref ? `Ref: ${ref}` : ''].filter(Boolean).join(' | ');

    return (
      <React.Fragment>
        <div style={{ gridColumn: '1 / -1', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem', marginTop: '1.5rem' }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            Dirección Completa
          </h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
          {subFields.map(sf => (
            <div key={`dir-${sf.id}`} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '1rem', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)', marginBottom: '0.35rem' }}>
                  {sf.label}
                </label>
                <div style={{ fontSize: '1rem', color: 'var(--color-text-primary)', fontWeight: 500, wordBreak: 'break-word' }}>
                  {sf.val}
                </div>
              </div>
              <button onClick={() => handleCopy(sf.val, sf.id)} className="btn btn-ghost" style={{ padding: '0.4rem', borderRadius: 'var(--radius-md)', marginLeft: '0.5rem', background: 'var(--color-bg-primary)' }} title="Copiar rápido">
                {copiedId === sf.id ? <Check size={16} color="var(--color-success)" /> : <Copy size={16} />}
              </button>
            </div>
          ))}

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '1rem', background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)', marginBottom: '0.35rem' }}>
                Dirección Concatenada
              </label>
              <div style={{ fontSize: '1rem', color: 'var(--color-text-primary)', fontWeight: 500, wordBreak: 'break-word', lineHeight: '1.5' }}>
                {line1 && <div>{line1}</div>}
                {line2 && <div>{line2}</div>}
                {(cep || ref) && <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>{cep ? `CEP: ${cep}` : ''} {ref ? `(Ref: ${ref})` : ''}</div>}
                {(!line1 && !line2 && !cep && !ref && dirObj.endereco) && <div>{dirObj.endereco}</div>}
              </div>
            </div>
            <button onClick={() => handleCopy(addressFull || dirObj.endereco, 'direccion')} className="btn btn-ghost" style={{ padding: '0.4rem', borderRadius: 'var(--radius-md)', marginLeft: '0.5rem', background: 'var(--color-bg-primary)' }} title="Copiar dirección completa">
              {copiedId === 'direccion' ? <Check size={16} color="var(--color-success)" /> : <Copy size={16} />}
            </button>
          </div>
        </div>
      </React.Fragment>
    );
  };

  // Se calculan una sola vez para poder decidir el estado vacío sin llamar a
  // las funciones de render dos veces (antes esto mostraba "Sin campos..."
  // aunque la categoría sí tuviera contenido en estos bloques extra).
  const documentosAsociadosContent = currentCategory === 'Documentos de Identidad' ? renderDocumentosAsociados() : null;
  const direccionContent = currentCategory === 'Informaciones Personales' ? renderDireccion() : null;
  const hasAnyFieldDefined = sectionFields.length > 0;
  const isCategoryEmpty = !hasAnyFieldDefined && !documentosAsociadosContent && !direccionContent;
  const noSearchMatches = hasAnyFieldDefined && visibleFields.length === 0 && !documentosAsociadosContent && !direccionContent;

  return (
    <section id="personal-data" className="glass-panel" style={{ padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <User size={20} color="var(--color-primary)" /> Datos del Cliente
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, justifyContent: 'flex-end' }}>
          <div style={{ position: 'relative', maxWidth: '300px', width: '100%' }}>
            <Search size={16} color="var(--color-text-muted)" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Buscar dato (ej. Madre, Pasaporte)..."
              className="form-input"
              value={localSearchQuery}
              onChange={e => setLocalSearchQuery(e.target.value)}
              style={{ paddingLeft: '2.2rem', width: '100%', fontSize: '0.875rem' }}
            />
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => openEditModal('ALL_PERSONAL')} style={{ flexShrink: 0 }}>
            <Edit2 size={14} style={{ marginRight: '4px' }} /> Editar Datos
          </button>
        </div>
      </div>

      {/* Pestañas de categorías: una sola fila, se desplaza con scroll/drag en vez de amontonarse en varias líneas */}
      <div
        ref={tabsScrollRef}
        onWheel={handleTabsWheel}
        {...tabsScrollHandlers}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.25rem',
          borderBottom: '1px solid var(--color-border)',
          marginBottom: '1.25rem',
          flexWrap: 'nowrap',
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'thin',
          cursor: 'grab'
        }}
      >
        {allCategories.map(cat => {
          const isDefault = DEFAULT_CLIENT_CATEGORIES.includes(cat);
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              style={{
                padding: '0.6rem 0.6rem 0.6rem 1rem',
                fontSize: '0.85rem',
                fontWeight: 600,
                color: currentCategory === cat ? 'var(--color-primary)' : 'var(--color-text-muted)',
                borderBottom: currentCategory === cat ? '2px solid var(--color-primary)' : '2px solid transparent',
                background: 'transparent',
                border: 'none',
                borderRadius: 0,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                transition: 'color 0.2s'
              }}
            >
              {TITLE_MAP[cat] || cat}
              {!isDefault && (
                <Trash2
                  size={12}
                  onClick={e => handleDeleteCategoryClick(e, cat)}
                  style={{ opacity: 0.6 }}
                  title={`Borrar categoría "${cat}"`}
                />
              )}
            </button>
          );
        })}

        {showNewCategoryInput ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.35rem 0', flexShrink: 0 }}>
            <input
              type="text"
              autoFocus
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleConfirmNewCategory();
                if (e.key === 'Escape') { setShowNewCategoryInput(false); setNewCategoryName(''); }
              }}
              placeholder="Nombre de categoría"
              className="form-input"
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.5rem', width: '160px' }}
            />
            <button type="button" onClick={handleConfirmNewCategory} className="btn btn-ghost" style={{ padding: '4px' }} title="Crear categoría">
              <Check size={14} color="var(--color-success)" />
            </button>
            <button type="button" onClick={() => { setShowNewCategoryInput(false); setNewCategoryName(''); }} className="btn btn-ghost" style={{ padding: '4px' }} title="Cancelar">
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowNewCategoryInput(true)}
            className="btn btn-ghost"
            title="Nueva categoría"
            style={{ padding: '0.5rem 0.6rem', color: 'var(--color-text-muted)', flexShrink: 0 }}
          >
            <Plus size={16} />
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {isCategoryEmpty ? (
          <div style={{ padding: '1rem 0', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
            Sin campos en esta categoría todavía.
          </div>
        ) : noSearchMatches ? (
          <div style={{ padding: '1rem 0', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
            Ningún campo coincide con tu búsqueda.
          </div>
        ) : (
          <>
          {visibleFieldsFixed.map(dato => {
            const campo = sectionFields.find(c => c.id === dato.campo_id);
            const savingThis = savingFieldId === campo.id;
            const savedThis = savedFieldId === campo.id;

            if (campo.id === 'nombre') {
              const fullName = (dato.valor || '').trim().toUpperCase();
              const parts = fullName.split(' ');

              // nombre_padre/nombre_madre viven en campos_personalizados (JSONB),
              // no como columnas reales de `clientes`.
              const padreName = (client.campos_personalizados?.nombre_padre || '').trim().toUpperCase().split(' ');
              const madreName = (client.campos_personalizados?.nombre_madre || '').trim().toUpperCase().split(' ');

              let splitIndex = 1;

              if (parts.length > 2) {
                splitIndex = parts.length - 2;
                const padreApe1 = padreName.length > 1 ? padreName[padreName.length - 2] : null;
                const madreApe1 = madreName.length > 1 ? madreName[madreName.length - 2] : null;

                if (padreApe1 && madreApe1) {
                  const childApe1 = parts[parts.length - 2];
                  const childApe2 = parts[parts.length - 1];

                  if (childApe1 === padreApe1 && childApe2 === madreApe1) {
                    splitIndex = parts.length - 2;
                  } else {
                    const padreIdx = parts.indexOf(padreApe1);
                    if (padreIdx > 0) splitIndex = padreIdx;
                  }
                }
              }

              const n_nombres = parts.slice(0, splitIndex).join(' ') || '';
              const n_apellidos = parts.slice(splitIndex).join(' ') || '';
              const shownNombres = nombreDraft?.nombres ?? n_nombres;
              const shownApellidos = nombreDraft?.apellidos ?? n_apellidos;
              const savingNombre = savingFieldId === 'nombre';
              const savedNombre = savedFieldId === 'nombre';

              return (
                <div
                  key={campo.id}
                  onBlur={e => handleNombreGroupBlur(e, dato, n_nombres, n_apellidos)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.8rem 0', borderBottom: '1px solid var(--color-border)' }}>
                    <div style={{ flex: '0 0 140px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>
                      Nombres
                    </div>
                    <input
                      type="text"
                      className="form-input"
                      value={shownNombres}
                      onChange={e => setNombreDraft(prev => ({ nombres: e.target.value, apellidos: prev?.apellidos ?? n_apellidos }))}
                      style={{ flex: 1, fontSize: '0.875rem', padding: '0.35rem 0.5rem' }}
                    />
                    {savingNombre && <Loader2 size={14} className="animate-spin" color="var(--color-text-muted)" />}
                    {savedNombre && <Check size={14} color="var(--color-success)" />}
                    <button onClick={() => handleCopy(shownNombres || '', 'nombres')} className="btn btn-ghost" style={{ padding: '0.35rem', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-elevated)', flexShrink: 0 }} title="Copiar">
                      {copiedId === 'nombres' ? <Check size={14} color="var(--color-success)" /> : <Copy size={14} />}
                    </button>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.8rem 0', borderBottom: '1px solid var(--color-border)' }}>
                    <div style={{ flex: '0 0 140px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>
                      Apellidos
                    </div>
                    <input
                      type="text"
                      className="form-input"
                      value={shownApellidos}
                      onChange={e => setNombreDraft(prev => ({ nombres: prev?.nombres ?? n_nombres, apellidos: e.target.value }))}
                      style={{ flex: 1, fontSize: '0.875rem', padding: '0.35rem 0.5rem' }}
                    />
                    {savingNombre && <Loader2 size={14} className="animate-spin" color="var(--color-text-muted)" />}
                    {savedNombre && <Check size={14} color="var(--color-success)" />}
                    <button onClick={() => handleCopy(shownApellidos || '', 'apellidos')} className="btn btn-ghost" style={{ padding: '0.35rem', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-elevated)', flexShrink: 0 }} title="Copiar">
                      {copiedId === 'apellidos' ? <Check size={14} color="var(--color-success)" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              );
            }

            const isDate = campo.tipo === 'date' || String(campo.id).includes('fecha');
            const isNumber = campo.tipo === 'number';
            const isEstadoCivil = campo.id === 'estado_civil';
            const isSexo = campo.id === 'sexo';
            const shownValue = pendingEdits[campo.id] !== undefined ? pendingEdits[campo.id] : dato.valor;

            return (
              <div key={campo.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.8rem 0', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ flex: '0 0 140px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>
                  {campo.nombre_campo}
                </div>
                {isDate ? (
                  <input
                    type="date"
                    className="form-input"
                    value={toIsoDate(shownValue)}
                    onChange={e => handleGenericChange(campo.id, toSlashDate(e.target.value))}
                    onBlur={() => handleGenericBlur(campo, dato.valor)}
                    style={{ flex: 1, fontSize: '0.875rem', padding: '0.35rem 0.5rem' }}
                  />
                ) : isEstadoCivil ? (
                  <select
                    className="form-input"
                    value={shownValue}
                    onChange={e => handleSelectCommit(campo, e.target.value, dato.valor)}
                    style={{ flex: 1, fontSize: '0.875rem', padding: '0.35rem 0.5rem' }}
                  >
                    <option value="">Seleccione...</option>
                    {ESTADO_CIVIL_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                ) : isSexo ? (
                  <select
                    className="form-input"
                    value={shownValue}
                    onChange={e => handleSelectCommit(campo, e.target.value, dato.valor)}
                    style={{ flex: 1, fontSize: '0.875rem', padding: '0.35rem 0.5rem' }}
                  >
                    <option value="">Seleccione...</option>
                    {SEXO_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                ) : (
                  <input
                    type={isNumber ? 'number' : 'text'}
                    className="form-input"
                    value={shownValue}
                    onChange={e => handleGenericChange(campo.id, e.target.value)}
                    onBlur={() => handleGenericBlur(campo, dato.valor)}
                    style={{ flex: 1, fontSize: '0.875rem', padding: '0.35rem 0.5rem' }}
                  />
                )}
                {savingThis && <Loader2 size={14} className="animate-spin" color="var(--color-text-muted)" />}
                {savedThis && <Check size={14} color="var(--color-success)" />}
                <button onClick={() => handleCopy(shownValue, campo.id)} className="btn btn-ghost" style={{ padding: '0.35rem', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-elevated)', flexShrink: 0 }} title="Copiar">
                  {copiedId === campo.id ? <Check size={14} color="var(--color-success)" /> : <Copy size={14} />}
                </button>
              </div>
            );
          })}

          {visibleFieldsCustom.length > 0 && (
            <DndContext sensors={dragSensors} collisionDetection={closestCenter} onDragEnd={handleFieldDragEnd(customFieldIds)}>
              <SortableContext items={customFieldIds} strategy={verticalListSortingStrategy}>
                {visibleFieldsCustom.map(dato => {
                  const campo = sectionFields.find(c => c.id === dato.campo_id);
                  const savingThis = savingFieldId === campo.id;
                  const savedThis = savedFieldId === campo.id;
                  const isDate = campo.tipo === 'date' || String(campo.id).includes('fecha');
                  const isNumber = campo.tipo === 'number';
                  const shownValue = pendingEdits[campo.id] !== undefined ? pendingEdits[campo.id] : dato.valor;

                  return (
                    <SortableFieldRow key={campo.id} id={campo.id}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.8rem 0', borderBottom: '1px solid var(--color-border)' }}>
                        <div style={{ flex: '0 0 140px', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-muted)' }}>
                          {campo.nombre_campo}
                        </div>
                        {isDate ? (
                          <input
                            type="date"
                            className="form-input"
                            value={toIsoDate(shownValue)}
                            onChange={e => handleGenericChange(campo.id, toSlashDate(e.target.value))}
                            onBlur={() => handleGenericBlur(campo, dato.valor)}
                            style={{ flex: 1, fontSize: '0.875rem', padding: '0.35rem 0.5rem' }}
                          />
                        ) : (
                          <input
                            type={isNumber ? 'number' : 'text'}
                            className="form-input"
                            value={shownValue}
                            onChange={e => handleGenericChange(campo.id, e.target.value)}
                            onBlur={() => handleGenericBlur(campo, dato.valor)}
                            style={{ flex: 1, fontSize: '0.875rem', padding: '0.35rem 0.5rem' }}
                          />
                        )}
                        {savingThis && <Loader2 size={14} className="animate-spin" color="var(--color-text-muted)" />}
                        {savedThis && <Check size={14} color="var(--color-success)" />}
                        <button onClick={() => handleCopy(shownValue, campo.id)} className="btn btn-ghost" style={{ padding: '0.35rem', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg-elevated)', flexShrink: 0 }} title="Copiar">
                          {copiedId === campo.id ? <Check size={14} color="var(--color-success)" /> : <Copy size={14} />}
                        </button>
                        {onDeleteField && (
                          <button
                            onClick={() => handleDeleteFieldClick(campo)}
                            disabled={deletingFieldId === campo.id}
                            className="btn btn-ghost"
                            style={{ padding: '0.35rem', borderRadius: 'var(--radius-sm)', color: 'var(--color-danger)', flexShrink: 0 }}
                            title="Eliminar campo"
                          >
                            {deletingFieldId === campo.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                          </button>
                        )}
                      </div>
                    </SortableFieldRow>
                  );
                })}
              </SortableContext>
            </DndContext>
          )}
          </>
        )}

        {documentosAsociadosContent}
        {direccionContent}

        {onCreateField && (
          showNewFieldForm ? (
            <div className="animate-fade-in" style={{ padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px dashed var(--color-border)', background: 'var(--color-bg-elevated)', display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1.5rem' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                Nuevo campo en "{TITLE_MAP[currentCategory] || currentCategory}"
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Nombre del campo</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ej. Profesión"
                    value={newFieldForm.nombre_campo}
                    onChange={e => setNewFieldForm(prev => ({ ...prev, nombre_campo: e.target.value }))}
                    autoFocus
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Tipo</label>
                  <select
                    className="form-input"
                    value={newFieldForm.tipo}
                    onChange={e => setNewFieldForm(prev => ({ ...prev, tipo: e.target.value }))}
                  >
                    {FIELD_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Valor (opcional)</label>
                  <input
                    type={newFieldForm.tipo === 'date' ? 'date' : newFieldForm.tipo === 'number' ? 'number' : 'text'}
                    className="form-input"
                    placeholder="Cargar valor ahora"
                    value={newFieldForm.valor}
                    onChange={e => setNewFieldForm(prev => ({ ...prev, valor: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleCreateFieldSubmit(); } }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowNewFieldForm(false)}>
                  <X size={14} style={{ marginRight: '4px' }} /> Cancelar
                </button>
                <button className="btn btn-primary btn-sm" onClick={handleCreateFieldSubmit} disabled={isCreatingField}>
                  {isCreatingField ? 'Creando...' : 'Crear Campo'}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowNewFieldForm(true)}
              className="btn btn-secondary btn-sm"
              style={{ alignSelf: 'flex-start', marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
            >
              <Plus size={14} /> Nuevo campo
            </button>
          )
        )}
      </div>
    </section>
  );
};

export default ClientPersonalData;

/**
 * useClientViewEdit.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Encapsula toda la lógica del modal de edición de datos del cliente:
 * preparación del formulario, manejo de campos fijos y dinámicos, CEP lookup,
 * filtrado por búsqueda, guardado, y eliminación de campos.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState } from 'react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';
import { handleError } from '../utils/errorHandler';
import { FIXED_FIELDS_CATALOG, DEFAULT_CLIENT_CATEGORIES, SYSTEM_LINKED_FIELD_IDS } from '../components/clientView.constants';

export default function useClientViewEdit({ clientId, client, customFieldsConfig = [], fetchClientData }) {
  // FIXED_FIELDS_CATALOG solo trae los campos que SÍ son columnas reales de
  // `clientes` (nombre, cpf, email, etc.). Los 13 campos migratorios (rnm,
  // numero_pasaporte, nombre_madre, nombre_padre, etc.) y cualquier otro
  // campo dinámico viven en config_campos_clientes y se mergean acá,
  // marcados is_custom_json para leer/escribir en clientes.campos_personalizados
  // (JSONB) usando cf.identificador como clave — ver clientView.constants.js.
  const mergedFields = [
    ...FIXED_FIELDS_CATALOG,
    ...customFieldsConfig.map(cf => ({
      id: cf.identificador,
      nombre_campo: cf.nombre_campo,
      requerido: cf.requerido,
      es_fijo: true, // We treat them as fixed for the form generation logic
      category_name: cf.categoria,
      is_custom_json: true, // flag to know how to save it
      tipo: cf.tipo,
    }))
  ];
  const fixedFields = mergedFields;

  // Modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState(null);

  // Form data
  const [editFormData, setEditFormData] = useState([]);
  const [newFields, setNewFields] = useState([]);
  const [editModalSearchQuery, setEditModalSearchQuery] = useState('');

  // ── CEP Lookup ─────────────────────────────────────────────────────────────
  const handleCepSearch = async (cepValue, callback) => {
    if (!cepValue) return;
    const cleanCep = cepValue.replace(/\D/g, '');
    if (cleanCep.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await res.json();
        if (!data.erro) {
          if (callback) {
            callback(data);
          } else {
            setEditFormData(prev => prev.map(f => {
              if (f.id === 'direccion') {
                return {
                  ...f,
                  _endereco: data.logradouro || f._endereco,
                  _bairro: data.bairro || f._bairro,
                  _cidade: data.localidade || f._cidade,
                  _estado: data.uf || f._estado
                };
              }
              return f;
            }));
          }
        } else {
          toast.error("CEP no encontrado en ViaCEP");
        }
      } catch (err) {
        console.error('[useClientViewEdit] Error fetching CEP:', err);
        toast.error("Error al conectar con ViaCEP");
      }
    } else {
      toast.error("El CEP debe tener 8 números");
    }
  };

  // ── Open edit modal ────────────────────────────────────────────────────────
  const openEditModal = (categoriaId) => {
    let _targetTabs = [];
    let activeCategoriasNombres = [];

    if (categoriaId === 'ALL_PERSONAL') {
      // Además de las 3 por defecto, incluir cualquier categoría dinámica que
      // ya tenga campos (ej. una creada con "+" desde la ficha del cliente) —
      // si no, esos campos quedaban invisibles en este modal.
      const extraCategorias = [...new Set(customFieldsConfig.map(cf => cf.categoria))]
        .filter(c => c && !DEFAULT_CLIENT_CATEGORIES.includes(c));
      activeCategoriasNombres = [...DEFAULT_CLIENT_CATEGORIES, ...extraCategorias];
    } else {
      // If we used a tab string directly, though with the new system, we might not have dynamic tabs anyway.
      // But let's assume we map tabs if passed.
      activeCategoriasNombres = [categoriaId || 'Informaciones Personales'];
    }

    const activeFixedFields = fixedFields.filter(f => activeCategoriasNombres.includes(f.category_name));

    // 1. Populate Fixed Fields
    const formData = [];
    activeFixedFields.forEach(f => {
      let extraArgs = {};
      if (f.id === 'nombre') {
        const fullName = (client[f.id] || '').trim().toUpperCase();
        const parts = fullName.split(' ');

        const padreName = (client.campos_personalizados?.nombre_padre || client.nombre_padre || '').trim().toUpperCase().split(' ');
        const madreName = (client.campos_personalizados?.nombre_madre || client.nombre_madre || '').trim().toUpperCase().split(' ');

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
              if (padreIdx > 0) {
                splitIndex = padreIdx;
              }
            }
          }
        }

        extraArgs._nombres = parts.slice(0, splitIndex).join(' ') || '';
        extraArgs._apellidos = parts.slice(splitIndex).join(' ') || '';
      }
      if (f.id === 'direccion') {
        let dirData = {};
        try {
          if (typeof client.direccion === 'string' && client.direccion.startsWith('{')) {
            dirData = JSON.parse(client.direccion);
          } else if (typeof client.direccion === 'object' && client.direccion !== null) {
            dirData = client.direccion;
          } else if (client.direccion) {
            dirData._endereco = client.direccion;
          }
        } catch (_e) { }
        extraArgs._cep = dirData.cep || '';
        extraArgs._endereco = dirData.endereco || dirData._endereco || '';
        extraArgs._numero = dirData.numero || '';
        extraArgs._complemento = dirData.complemento || '';
        extraArgs._bairro = dirData.bairro || '';
        extraArgs._cidade = dirData.cidade || '';
        extraArgs._estado = dirData.estado || '';
        extraArgs._ponto_referencia = dirData.ponto_referencia || '';
      }
      let valor = '';
      if (f.is_custom_json) {
        valor = client.campos_personalizados?.[f.id] || '';
      } else {
        valor = client[f.id] || '';
      }

      formData.push({
        id: f.id,
        campo_id: f.id,
        nombre_campo: f.nombre_campo,
        valor: valor,
        es_fijo: true,
        is_custom_json: f.is_custom_json,
        category_name: f.category_name,
        tipo: f.tipo,
        ...extraArgs
      });
    });



    setEditFormData(formData);
    setNewFields([]);
    setEditingCategoryId(categoriaId);
    setIsEditModalOpen(true);
  };

  // ── Delete field data ──────────────────────────────────────────────────────
  const handleDeleteFieldData = async (dataId, es_fijo) => {
    if (!window.confirm('¿Borrar este dato del cliente?')) return;
    try {
      if (es_fijo) {
        // Acá dataId puede ser una columna fija normal o un campo JSON dinámico
        const isCustomJson = fixedFields.find(f => f.id === dataId)?.is_custom_json;
        if (isCustomJson) {
           const customJsonUpdates = { ...(client.campos_personalizados || {}) };
           delete customJsonUpdates[dataId];
           await supabase.from('clientes').update({ campos_personalizados: customJsonUpdates }).eq('id', clientId);
        } else {
           await supabase.from('clientes').update({ [dataId]: null }).eq('id', clientId);
        }
      }
      setEditFormData(editFormData.map(f => f.id === dataId ? { ...f, valor: '' } : f));
      await fetchClientData();
    } catch (err) { handleError(err, 'Error borrando dato base'); }
  };

  // ── Save a single field's value (autoguardado inline desde la pestaña) ──────
  const handleSaveFieldValue = async (fieldId, rawValue) => {
    try {
      const value = (rawValue ?? '').toString().trim().toUpperCase() || null;
      const isCustomJson = fixedFields.find(f => f.id === fieldId)?.is_custom_json;
      if (isCustomJson) {
        const customJsonUpdates = { ...(client.campos_personalizados || {}) };
        if (value) customJsonUpdates[fieldId] = value;
        else delete customJsonUpdates[fieldId];
        const { error } = await supabase.from('clientes').update({ campos_personalizados: customJsonUpdates }).eq('id', clientId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('clientes').update({ [fieldId]: value }).eq('id', clientId);
        if (error) throw error;
      }
      await fetchClientData();
      return true;
    } catch (err) {
      handleError(err, 'Error guardando el campo');
      return false;
    }
  };

  // ── Delete an entire dynamic category (todas sus filas en config_campos_clientes) ──
  // Soft-delete (activo=false) en vez de DELETE: la fila (y su identificador
  // exacto) se conserva, así que se puede restaurar sin riesgo de typos desde
  // Configuración > Campos Base. Ver handleDeleteField para el porqué.
  const handleDeleteCategory = async (categoria) => {
    const count = customFieldsConfig.filter(cf => cf.categoria === categoria).length;
    if (!window.confirm(`¿Eliminar la categoría "${categoria}" y sus ${count} campo(s)? Dejarán de verse en la ficha del cliente. Los datos y los campos en sí no se borran: se pueden restaurar desde Configuración > Campos Base.`)) {
      return false;
    }
    try {
      const { error } = await supabase.from('config_campos_clientes').update({ activo: false }).eq('categoria', categoria);
      if (error) throw error;
      toast.success(`Categoría "${categoria}" eliminada`);
      await fetchClientData();
      return true;
    } catch (err) {
      handleError(err, 'Error eliminando la categoría');
      return false;
    }
  };

  // ── Delete a single dynamic field definition (config_campos_clientes) ───────
  // Soft-delete (activo=false) en vez de DELETE. Antes esto borraba la fila
  // de verdad: los datos de los clientes quedaban huérfanos en
  // clientes.campos_personalizados y, si alguien recreaba el campo más tarde
  // escribiendo el nombre de nuevo, el identificador generado podía salir
  // levemente distinto (typo, palabra de más) — quedando desconectado tanto
  // de esos datos viejos como de cualquier código que lea ese campo por
  // clave literal (IA, extensión, fusión de duplicados, plantillas, importación
  // CSV — ver SYSTEM_LINKED_FIELD_IDS). Pasó exactamente eso con nombre_padre.
  // Con soft-delete, restaurar el campo desde Configuración > Campos Base
  // reactiva la MISMA fila con el MISMO identificador: cero riesgo de typo.
  const handleDeleteField = async (identificador, nombre) => {
    const warning = SYSTEM_LINKED_FIELD_IDS.has(identificador)
      ? `¿Eliminar el campo "${nombre}"?\n\nOJO: este campo lo usan directamente la extracción por IA, la extensión de Chrome y otras partes del sistema (identificador "${identificador}"). Dejará de verse en la ficha del cliente, pero el dato y el campo no se pierden: se pueden restaurar desde Configuración > Campos Base. Si en vez de eso creás un campo nuevo escribiendo el nombre de nuevo, el identificador puede salir distinto y esas otras partes van a dejar de encontrar el dato — restaurar es siempre más seguro que recrear.`
      : `¿Eliminar el campo "${nombre}"? Dejará de verse en la ficha del cliente. El dato y el campo no se borran: se pueden restaurar desde Configuración > Campos Base.`;
    if (!window.confirm(warning)) {
      return false;
    }
    try {
      const { error } = await supabase.from('config_campos_clientes').update({ activo: false }).eq('identificador', identificador);
      if (error) throw error;
      toast.success(`Campo "${nombre}" eliminado`);
      await fetchClientData();
      return true;
    } catch (err) {
      handleError(err, 'Error eliminando el campo');
      return false;
    }
  };

  // ── Reordenar campos dinámicos (drag & drop) ─────────────────────────────────
  // `orderedIdentificadores` puede mezclar campos de más de una categoría real
  // (ej. la pestaña "Datos Personales" agrupa Informaciones Personales + Datos
  // Familiares) — no importa: cada campo solo actualiza su propio `orden`, y
  // como todo el resto del sistema siempre filtra por `categoria` antes de
  // ordenar, que los números queden con huecos dentro de cada categoría no
  // rompe el orden ahí.
  const handleReorderFields = async (orderedIdentificadores) => {
    try {
      const { error } = (await Promise.all(
        orderedIdentificadores.map((identificador, idx) =>
          supabase.from('config_campos_clientes').update({ orden: idx }).eq('identificador', identificador)
        )
      )).find(r => r.error) || {};
      if (error) throw error;
      await fetchClientData();
      return true;
    } catch (err) {
      handleError(err, 'Error reordenando los campos');
      return false;
    }
  };

  // ── Add custom field ───────────────────────────────────────────────────────
  const handleAddCustomField = () => {
    setNewFields([...newFields, { id: Date.now(), campo_id: '', valor: '', customName: '' }]);
  };

  // ── Create a brand-new field definition from the edit modal ────────────────
  // Da de alta el campo en config_campos_clientes (mismo catálogo que
  // Configuración > Campos Base) y lo agrega al formulario abierto para que el
  // usuario pueda cargarle valor de inmediato. Si se pasa `valor`, además lo
  // guarda de una en clientes.campos_personalizados para este cliente (si no,
  // el valor se persiste recién al Guardar del modal, handleSaveEdits).
  const handleCreateFieldDefinition = async ({ nombre_campo, categoria, tipo, valor }) => {
    const nombre = (nombre_campo || '').trim();
    if (!nombre) {
      toast.error('El nombre del campo es obligatorio');
      return false;
    }
    const identificador = Array.from(nombre.toLowerCase().normalize('NFD'))
      .filter(ch => { const code = ch.codePointAt(0); return code < 0x0300 || code > 0x036f; })
      .join('')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    if (!identificador) {
      toast.error('El nombre no genera un identificador válido');
      return false;
    }
    if (mergedFields.some(f => f.id === identificador)) {
      toast.error('Ya existe un campo con este identificador');
      return false;
    }

    try {
      const { data: maxRow } = await supabase
        .from('config_campos_clientes')
        .select('orden')
        .order('orden', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { error } = await supabase.from('config_campos_clientes').insert([{
        nombre_campo: nombre,
        identificador,
        categoria,
        tipo,
        requerido: false,
        orden: (maxRow?.orden || 0) + 1
      }]);

      if (error) {
        if (error.code === '23505') {
          toast.error('Ya existe un campo con este identificador. Si lo borraste antes, restauralo desde Configuración > Campos Base en vez de crear uno nuevo — así no perdés los datos ya cargados.', { duration: 6000 });
        } else {
          throw error;
        }
        return false;
      }

      const trimmedValor = (valor ?? '').toString().trim();
      if (trimmedValor) {
        const upperValor = trimmedValor.toUpperCase();
        const { error: valErr } = await supabase
          .from('clientes')
          .update({ campos_personalizados: { ...(client.campos_personalizados || {}), [identificador]: upperValor } })
          .eq('id', clientId);
        if (valErr) {
          console.error('[useClientViewEdit] Error guardando valor del campo nuevo:', valErr);
          toast.error('Campo creado, pero no se pudo guardar el valor');
        }
      }

      setEditFormData(prev => ([...prev, {
        id: identificador,
        campo_id: identificador,
        nombre_campo: nombre,
        valor: trimmedValor,
        es_fijo: true,
        is_custom_json: true,
        category_name: categoria,
        tipo
      }]));

      toast.success(`Campo "${nombre}" creado`);
      // Refrescar el catálogo (customFieldsConfig) sin cerrar el modal
      await fetchClientData();
      return true;
    } catch (err) {
      handleError(err, 'Error creando el campo');
      return false;
    }
  };

  // ── Save all edits ─────────────────────────────────────────────────────────
  const handleSaveEdits = async () => {
    setIsSaving(true);
    try {
      const fixedUpdates = {};
      let customJsonUpdates = { ...(client.campos_personalizados || {}) };
      let hasCustomJsonUpdates = false;

      for (const field of editFormData) {
        if (field.es_fijo) {
          let upperValue = field.valor?.toUpperCase() || null;
          if (field.id === 'nombre') {
            upperValue = `${(field._nombres || '').trim()} ${(field._apellidos || '').trim()}`.trim().toUpperCase();
            upperValue = upperValue || null;
          }
          if (field.id === 'direccion') {
            const dirObj = {
              cep: field._cep || '',
              endereco: field._endereco || '',
              numero: field._numero || '',
              complemento: field._complemento || '',
              bairro: field._bairro || '',
              cidade: field._cidade || '',
              estado: field._estado || '',
              ponto_referencia: field._ponto_referencia || ''
            };
            upperValue = JSON.stringify(dirObj);
          }

          if (field.is_custom_json) {
             const prevVal = client.campos_personalizados?.[field.id] || null;
             if (prevVal !== upperValue && (prevVal || upperValue)) {
                customJsonUpdates[field.id] = upperValue;
                hasCustomJsonUpdates = true;
             }
          } else {
             if (client[field.id] !== upperValue && (client[field.id] || upperValue)) {
               fixedUpdates[field.id] = upperValue;
             }
          }
        }
      }

      // Process newFields (Custom EAV fields added via dropdown)
      for (const nf of newFields) {
        if (!nf.campo_id || !nf.valor) continue;
        const upperVal = nf.valor.toUpperCase();

        const isFixed = fixedFields.find(f => f.id === nf.campo_id);
        if (isFixed) {
          fixedUpdates[nf.campo_id] = upperVal;
          continue;
        }

        // Los campos nuevos que no están en el catálogo (fijo ni dinámico) no
        // se pueden crear libremente desde acá: hay que darlos de alta primero
        // en Configuración > Campos Base para que generen una entrada en
        // config_campos_clientes.
        console.warn('Ignoring new field not mapped in fixed config:', nf.campo_id);
      }

      if (hasCustomJsonUpdates) {
         fixedUpdates.campos_personalizados = customJsonUpdates;
      }

      if (Object.keys(fixedUpdates).length > 0) {
        const { error: fErr } = await supabase.from('clientes').update(fixedUpdates).eq('id', clientId);
        if (fErr) throw fErr;
      }

      await fetchClientData();
      setIsEditModalOpen(false);
    } catch (err) {
      console.error('[useClientViewEdit] Error saving edits:', err);
      alert('Error al guardar. Verifica la consola.');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Search filtering for edit modal ────────────────────────────────────────
  const normalizeEditSearchText = (value = '') =>
    String(value || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const editModalQuery = normalizeEditSearchText(editModalSearchQuery);

  const filteredEditFormData = editFormData.filter(field => {
    if (!editModalQuery) return true;
    const fieldName = normalizeEditSearchText(field.nombre_campo);
    let fieldValue = '';
    if (field.id === 'nombre') {
      fieldValue = normalizeEditSearchText(`${field._nombres || ''} ${field._apellidos || ''}`);
    } else if (field.id === 'direccion') {
      fieldValue = normalizeEditSearchText(`${field._endereco || ''} ${field._numero || ''} ${field._bairro || ''} ${field._cidade || ''}`);
    } else {
      fieldValue = normalizeEditSearchText(field.valor);
    }
    return fieldName.includes(editModalQuery) || fieldValue.includes(editModalQuery);
  });

  const filteredNewFields = newFields.filter(field => {
    if (!editModalQuery) return true;
    const campoRef = FIXED_FIELDS_CATALOG.find(f => f.id === field.campo_id);
    const fieldName = normalizeEditSearchText(campoRef?.nombre_campo || '');
    const fieldValue = normalizeEditSearchText(field.valor);
    return fieldName.includes(editModalQuery) || fieldValue.includes(editModalQuery);
  });

  const hasEditModalResults = filteredEditFormData.length > 0 || filteredNewFields.length > 0;

  return {
    // State
    isEditModalOpen,
    setIsEditModalOpen,
    isSaving,
    editFormData,
    setEditFormData,
    newFields,
    setNewFields,
    editModalSearchQuery,
    setEditModalSearchQuery,
    editingCategoryId,
    // Computed
    filteredEditFormData,
    filteredNewFields,
    hasEditModalResults,
    // Handlers
    openEditModal,
    handleSaveEdits,
    handleDeleteFieldData,
    handleAddCustomField,
    handleCreateFieldDefinition,
    handleSaveFieldValue,
    handleDeleteCategory,
    handleDeleteField,
    handleReorderFields,
    handleCepSearch,
  };
}

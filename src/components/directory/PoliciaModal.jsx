import React, { useState, useEffect, useRef } from 'react';
import { Building2, MapPin, Mail, Phone, Clock, AlignLeft, Plus, X, Paperclip, UploadCloud, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { validateFile } from '../../services/storageService';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import ProcesoArchivoViewer from './ProcesoArchivoViewer';
import { linkifyText, hasUrl } from '../../utils/linkifyText';

const PUNTO_VACIO = { sigla: '', direccion: '', telefono: [''], email: [''] };
const PROCESO_VACIO = { titulo: '', descripcion: '', archivos: [] };
const PROCESOS_BUCKET = 'policia_procesos';

const normalize = (s) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

// Los campos de contacto (telefono/email) se guardan como text[] en la BD
// para permitir varios por comisaría o punto; en el form siempre se edita
// como array con al menos una fila (aunque esté vacía).
const toEditableArray = (value) => {
  const arr = Array.isArray(value) ? value : (value ? [value] : []);
  return arr.length > 0 ? arr : [''];
};

const cleanArray = (arr) => (arr || []).map(s => s.trim()).filter(Boolean);

function ContactoMultiple({ icon: Icon, label, placeholder, type = 'text', values, onChangeItem, onAdd, onRemove, compact = false }) {
  const inputPadding = Icon ? 'px-10' : 'px-3';
  const inputPy = compact ? 'py-1.5' : 'py-2';
  return (
    <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
      <label className={compact ? 'text-xs text-chrome-text-muted' : 'text-sm font-medium text-chrome-text'}>{label}</label>
      <div className="flex flex-col gap-2">
        {values.map((value, index) => (
          <div key={index} className="flex items-center gap-2">
            <div className="relative flex-1">
              {Icon && <Icon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-chrome-text-muted" />}
              <input
                type={type}
                value={value}
                onChange={(e) => onChangeItem(index, e.target.value)}
                className={`w-full rounded-md border border-chrome-border bg-chrome-bg ${inputPadding} ${inputPy} text-sm text-chrome-text outline-none focus:border-brand-primary transition-colors`}
                placeholder={placeholder}
              />
            </div>
            {values.length > 1 && (
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="p-1.5 text-chrome-text-muted hover:text-danger rounded-md hover:bg-chrome-bg flex-shrink-0"
                title="Quitar"
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-1.5 self-start px-2.5 py-1 rounded-md border border-dashed border-chrome-border text-xs text-chrome-text-muted hover:border-brand-primary/50 hover:text-chrome-text transition-colors"
        >
          <Plus size={12} />
          Añadir {label.toLowerCase()}
        </button>
      </div>
    </div>
  );
}

// Textarea que crece con el contenido en vez de quedar fija con scroll
// interno — antes, al escribir un procedimiento largo, el texto quedaba
// apretado dentro de un cuadro de 3 filas mientras el modal se quedaba del
// mismo tamaño; ahora la caja crece (hasta el límite de alto del propio
// modal, que ya scrollea) a medida que se escribe.
//
// Un <textarea> nativo nunca puede renderizar un link clickeable (solo
// muestra texto plano) — por eso, cuando el texto tiene una URL y el campo
// no está enfocado, se muestra en su lugar una vista de solo lectura con el
// link clickeable; al hacer clic para escribir, vuelve a ser editable.
function AutoGrowTextarea({ value, onChange, className, placeholder, minRows = 3 }) {
  const textareaRef = useRef(null);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value, isFocused]);

  if (!isFocused && hasUrl(value)) {
    return (
      <div
        role="textbox"
        tabIndex={0}
        onFocus={() => setIsFocused(true)}
        onClick={() => setIsFocused(true)}
        onKeyDown={(e) => { if (e.key === 'Enter') setIsFocused(true); }}
        className={`${className} cursor-text whitespace-pre-wrap`}
      >
        {linkifyText(value)}
      </div>
    );
  }

  return (
    <textarea
      ref={textareaRef}
      autoFocus={isFocused}
      value={value}
      onChange={onChange}
      onBlur={() => setIsFocused(false)}
      rows={minRows}
      className={className}
      placeholder={placeholder}
      style={{ overflow: 'hidden', resize: 'none' }}
    />
  );
}

export default function PoliciaModal({ isOpen, onClose, policia, ciudades, onSave }) {
  const [formData, setFormData] = useState({
    nombre: '',
    direccion: '',
    telefono: [''],
    email: [''],
    horario_atencion: '',
    notas: '',
  });
  const [selectedCiudades, setSelectedCiudades] = useState([]);
  const [ciudadSearch, setCiudadSearch] = useState('');
  const [puntos, setPuntos] = useState([]);
  const [procesos, setProcesos] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [viewingArchivo, setViewingArchivo] = useState(null);
  // Procesos existentes arrancan colapsados (solo título) para ocupar el
  // menor espacio posible cuando hay varios cargados; se expanden al hacer
  // clic, o automáticamente al agregar uno nuevo (ver handleAddProceso).
  const [expandedProcesos, setExpandedProcesos] = useState(new Set());

  useEffect(() => {
    if (policia) {
      setFormData({
        nombre: policia.nombre || '',
        direccion: policia.direccion || '',
        telefono: toEditableArray(policia.telefono),
        email: toEditableArray(policia.email),
        horario_atencion: policia.horario_atencion || '',
        notas: policia.notas || '',
      });
      setSelectedCiudades(policia.ciudades?.map(c => c.id) || []);
      setPuntos(
        (policia.puntos || []).map(p => ({
          id: p.id,
          sigla: p.sigla || '',
          direccion: p.direccion || '',
          telefono: toEditableArray(p.telefono),
          email: toEditableArray(p.email),
        }))
      );
      // policia_procesos es la tabla nueva; si todavía no tiene filas pero
      // el posto tenía algo cargado en la vieja columna "proceso", se usa
      // como semilla de un primer proceso para no perder ese contenido.
      setProcesos(
        policia.procesos && policia.procesos.length > 0
          ? policia.procesos.map(p => ({
              id: p.id,
              titulo: p.titulo || '',
              descripcion: p.descripcion || '',
              archivos: p.archivos || [],
            }))
          : (policia.proceso ? [{ titulo: '', descripcion: policia.proceso, archivos: [] }] : [])
      );
      setExpandedProcesos(new Set());
    } else {
      setFormData({
        nombre: '',
        direccion: '',
        telefono: [''],
        email: [''],
        horario_atencion: '',
        notas: '',
      });
      setSelectedCiudades([]);
      setPuntos([]);
      setProcesos([]);
      setExpandedProcesos(new Set());
    }
    setCiudadSearch('');
  }, [policia, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleArrayFieldChange = (field, index, value) => {
    setFormData(prev => {
      const next = [...prev[field]];
      next[index] = value;
      return { ...prev, [field]: next };
    });
  };

  const handleAddArrayField = (field) => {
    setFormData(prev => ({ ...prev, [field]: [...prev[field], ''] }));
  };

  const handleRemoveArrayField = (field, index) => {
    setFormData(prev => {
      const next = prev[field].filter((_, i) => i !== index);
      return { ...prev, [field]: next.length > 0 ? next : [''] };
    });
  };

  const handlePuntoArrayChange = (puntoIndex, field, itemIndex, value) => {
    setPuntos(prev => prev.map((p, i) => {
      if (i !== puntoIndex) return p;
      const next = [...p[field]];
      next[itemIndex] = value;
      return { ...p, [field]: next };
    }));
  };

  const handleAddPuntoArrayItem = (puntoIndex, field) => {
    setPuntos(prev => prev.map((p, i) => (i === puntoIndex ? { ...p, [field]: [...p[field], ''] } : p)));
  };

  const handleRemovePuntoArrayItem = (puntoIndex, field, itemIndex) => {
    setPuntos(prev => prev.map((p, i) => {
      if (i !== puntoIndex) return p;
      const next = p[field].filter((_, idx) => idx !== itemIndex);
      return { ...p, [field]: next.length > 0 ? next : [''] };
    }));
  };

  const handleCiudadToggle = (ciudadId) => {
    setSelectedCiudades(prev =>
      prev.includes(ciudadId)
        ? prev.filter(id => id !== ciudadId)
        : [...prev, ciudadId]
    );
  };

  const handlePuntoChange = (index, field, value) => {
    setPuntos(prev => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  };

  const handleAddPunto = () => {
    setPuntos(prev => [...prev, { ...PUNTO_VACIO }]);
  };

  const handleRemovePunto = (index) => {
    setPuntos(prev => prev.filter((_, i) => i !== index));
  };

  const handleProcesoChange = (index, field, value) => {
    setProcesos(prev => prev.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  };

  const handleAddProceso = () => {
    setProcesos(prev => {
      const next = [...prev, { ...PROCESO_VACIO, archivos: [] }];
      // El recién agregado arranca expandido (hay que llenarlo); los demás
      // quedan como estaban — colapsados por defecto para ocupar el menor
      // espacio posible cuando hay varios procesos cargados.
      setExpandedProcesos(exp => new Set(exp).add(next.length - 1));
      return next;
    });
  };

  const handleRemoveProceso = (index) => {
    const titulo = procesos[index]?.titulo?.trim();
    if (!window.confirm(titulo ? `¿Eliminar el procedimiento "${titulo}"?` : '¿Eliminar este procedimiento?')) return;
    setProcesos(prev => prev.filter((_, i) => i !== index));
    setExpandedProcesos(prev => {
      const next = new Set();
      prev.forEach(i => {
        if (i < index) next.add(i);
        else if (i > index) next.add(i - 1);
      });
      return next;
    });
  };

  const toggleProcesoExpanded = (index) => {
    setExpandedProcesos(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleAddProcesoArchivos = (index, fileList) => {
    const files = Array.from(fileList || []);
    const validFiles = [];
    for (const file of files) {
      const { valid, error: validationError } = validateFile(file);
      if (!valid) {
        setError(validationError);
        continue;
      }
      validFiles.push(file);
    }
    if (validFiles.length === 0) return;
    setProcesos(prev => prev.map((p, i) => (i === index ? { ...p, archivos: [...p.archivos, ...validFiles] } : p)));
  };

  const handleRemoveProcesoArchivo = (procesoIndex, archivoIndex) => {
    setProcesos(prev => prev.map((p, i) => {
      if (i !== procesoIndex) return p;
      return { ...p, archivos: p.archivos.filter((_, idx) => idx !== archivoIndex) };
    }));
  };


  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!formData.nombre) {
      setError('El nombre es obligatorio.');
      return;
    }

    const payload = {
      ...formData,
      telefono: cleanArray(formData.telefono),
      email: cleanArray(formData.email),
    };

    setIsSaving(true);
    let procesosTablesMissing = false;
    try {
      const guardarPolicia = async (data) =>
        policia?.id
          ? supabase.from('policias').update(data).eq('id', policia.id).select().single()
          : supabase.from('policias').insert([data]).select().single();

      const { data: savedPolicia, error: saveError } = await guardarPolicia(payload);
      if (saveError) throw saveError;

      if (policia?.id) {
        // Delete existing relationships and puntos de atención — tablas
        // independientes entre sí, se borran en paralelo.
        await Promise.all([
          supabase.from('policias_ciudades').delete().eq('policia_id', policia.id),
          supabase.from('policia_puntos').delete().eq('policia_id', policia.id),
        ]);
      }

      // Relaciones con ciudades, puntos de atención y procesos (con sus
      // archivos) no dependen entre sí — solo de savedPolicia.id — así que
      // se guardan los tres en paralelo en vez de uno detrás de otro.
      const relsToInsert = selectedCiudades.map(ciudad_id => ({
        policia_id: savedPolicia.id,
        ciudad_id: ciudad_id
      }));
      const relsPromise = relsToInsert.length > 0
        ? supabase.from('policias_ciudades').insert(relsToInsert).then(({ error }) => { if (error) throw error; })
        : Promise.resolve();

      // Puntos de atención adicionales (ignora filas completamente vacías)
      const puntosToInsert = puntos
        .map(p => ({
          sigla: p.sigla,
          direccion: p.direccion,
          telefono: cleanArray(p.telefono),
          email: cleanArray(p.email),
        }))
        .filter(p => p.sigla || p.direccion || p.telefono.length > 0 || p.email.length > 0)
        .map(p => ({
          policia_id: savedPolicia.id,
          sigla: p.sigla || null,
          direccion: p.direccion || null,
          telefono: p.telefono,
          email: p.email,
        }));
      let puntosInsertados = [];
      const puntosPromise = puntosToInsert.length > 0
        ? supabase.from('policia_puntos').insert(puntosToInsert).select().then(({ data, error }) => {
            if (error) throw error;
            puntosInsertados = data || [];
          })
        : Promise.resolve();

      // Procesos: varios trámites por posto, cada uno con sus propios
      // archivos adjuntos. Se reemplazan todas las filas existentes (igual
      // que puntos); los archivos que ya estaban subidos se reusan por su
      // ruta de storage, los nuevos (instancias File) se suben ahora, y los
      // que quedaron afuera de la lista final se borran del bucket. Los
      // procesos se insertan en paralelo entre sí, y dentro de cada uno sus
      // archivos también se suben en paralelo — antes esto era todo
      // secuencial (relaciones, después puntos, después un proceso a la vez
      // esperando sus archivos uno por uno) y con varios procesos/archivos
      // guardar tardaba muchos round trips en serie.
      let procesosResueltos = [];
      const procesosPromise = (async () => {
        try {
          const originalArchivoPaths = new Set(
            (policia?.procesos || []).flatMap(p => (p.archivos || []).map(a => a.url_archivo))
          );

          const procesosLimpios = procesos
            .map(p => ({ titulo: p.titulo.trim(), descripcion: p.descripcion.trim(), archivos: p.archivos }))
            .filter(p => p.titulo || p.descripcion || p.archivos.length > 0);

          if (policia?.id) {
            await supabase.from('policia_procesos').delete().eq('policia_id', policia.id);
          }

          const procesoInserts = await Promise.all(
            procesosLimpios.map(proceso =>
              supabase
                .from('policia_procesos')
                .insert({ policia_id: savedPolicia.id, titulo: proceso.titulo || null, descripcion: proceso.descripcion || null })
                .select()
                .single()
            )
          );
          for (const { error: procesoError } of procesoInserts) {
            if (procesoError) throw procesoError;
          }

          const resolvedArchivos = await Promise.all(
            procesosLimpios.flatMap((proceso, i) => {
              const procesoId = procesoInserts[i].data.id;
              return proceso.archivos.map(async (archivo) => {
                if (archivo instanceof File) {
                  const ext = archivo.name.includes('.') ? `.${archivo.name.split('.').pop()}` : '';
                  const path = `${savedPolicia.id}/${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
                  const { error: uploadError } = await supabase.storage.from(PROCESOS_BUCKET).upload(path, archivo);
                  if (uploadError) throw uploadError;
                  return {
                    proceso_id: procesoId,
                    nombre_archivo: archivo.name,
                    url_archivo: path,
                    tipo_contenido: archivo.type,
                    tamano_bytes: archivo.size,
                  };
                }
                return {
                  proceso_id: procesoId,
                  nombre_archivo: archivo.nombre_archivo,
                  url_archivo: archivo.url_archivo,
                  tipo_contenido: archivo.tipo_contenido,
                  tamano_bytes: archivo.tamano_bytes,
                };
              });
            })
          );

          let archivosInsertados = [];
          if (resolvedArchivos.length > 0) {
            const { data, error: archivosError } = await supabase.from('policia_proceso_archivos').insert(resolvedArchivos).select();
            if (archivosError) throw archivosError;
            archivosInsertados = data || [];
          }

          procesosResueltos = procesoInserts.map(({ data: procesoRow }) => ({
            ...procesoRow,
            archivos: archivosInsertados.filter(a => a.proceso_id === procesoRow.id),
          }));

          const finalArchivoPaths = new Set(resolvedArchivos.map(a => a.url_archivo));
          const pathsToRemove = [...originalArchivoPaths].filter(path => path && !finalArchivoPaths.has(path));
          if (pathsToRemove.length > 0) {
            await supabase.storage.from(PROCESOS_BUCKET).remove(pathsToRemove);
          }
        } catch (procesosErr) {
          if (procesosErr.code === '42P01') {
            procesosTablesMissing = true;
          } else {
            throw procesosErr;
          }
        }
      })();

      await Promise.all([relsPromise, puntosPromise, procesosPromise]);

      // savedPolicia/puntosInsertados/procesosResueltos ya son las filas
      // reales devueltas por Supabase (con sus ids definitivos) — se arma acá
      // el objeto completo y se lo pasa al padre para que actualice ese único
      // registro en memoria, en vez de volver a pedir las 6 tablas del
      // directorio entero (policías, ciudades, relaciones, puntos, procesos y
      // archivos) solo para reflejar un cambio en una sola policía.
      const ciudadesResueltas = selectedCiudades
        .map(id => ciudades.find(c => c.id === id))
        .filter(Boolean);

      onSave({
        ...savedPolicia,
        ciudades: ciudadesResueltas,
        puntos: puntosInsertados,
        procesos: procesosTablesMissing ? (policia?.procesos || []) : procesosResueltos,
      });

      if (procesosTablesMissing) {
        setError('Se guardó todo menos los procesos con archivos: falta ejecutar 016_policia_procesos.sql en Supabase.');
      } else {
        onClose();
      }
    } catch (err) {
      console.error(err);
      if (err.code === '42P01') {
         setError('Las tablas no existen en Supabase. No se puede guardar. Asegúrate de ejecutar el script SQL.');
      } else {
         setError(err.message || 'Error al guardar la policía.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={policia ? 'Editar Policía' : 'Añadir Nueva Policía'}
      maxWidth={720}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={isSaving}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={isSaving} form="policia-form">
            {isSaving ? 'Guardando...' : (policia ? 'Guardar Cambios' : 'Añadir Policía')}
          </Button>
        </>
      )}
    >
      <form id="policia-form" onSubmit={handleSubmit} className="flex flex-col gap-5 py-4">
        
        {error && (
          <div className="rounded-md bg-danger/10 p-4 border border-danger/20 text-danger text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Nombre */}
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-sm font-medium text-chrome-text">Nombre de la Comisaría <span className="text-danger">*</span></label>
            <div className="relative">
              <Building2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-chrome-text-muted" />
              <input
                type="text"
                name="nombre"
                value={formData.nombre}
                onChange={handleChange}
                className="w-full rounded-md border border-chrome-border bg-chrome-bg px-10 py-2 text-sm text-chrome-text outline-none focus:border-brand-primary transition-colors"
                placeholder="Ej. Policía Federal de São Paulo"
              />
            </div>
          </div>

          {/* Dirección */}
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-sm font-medium text-chrome-text">Dirección</label>
            <div className="relative">
              <MapPin size={16} className="absolute left-3 top-3 text-chrome-text-muted" />
              <textarea
                name="direccion"
                value={formData.direccion}
                onChange={handleChange}
                rows={2}
                className="w-full rounded-md border border-chrome-border bg-chrome-bg pl-10 pr-4 py-2 text-sm text-chrome-text outline-none focus:border-brand-primary transition-colors resize-none"
                placeholder="Dirección completa"
              />
            </div>
          </div>

          {/* Teléfono */}
          <ContactoMultiple
            icon={Phone}
            label="Teléfono"
            placeholder="Ej. +55 11 1234-5678"
            values={formData.telefono}
            onChangeItem={(i, v) => handleArrayFieldChange('telefono', i, v)}
            onAdd={() => handleAddArrayField('telefono')}
            onRemove={(i) => handleRemoveArrayField('telefono', i)}
          />

          {/* Email */}
          <ContactoMultiple
            icon={Mail}
            label="Correo Electrónico"
            type="email"
            placeholder="pf@gov.br"
            values={formData.email}
            onChangeItem={(i, v) => handleArrayFieldChange('email', i, v)}
            onAdd={() => handleAddArrayField('email')}
            onRemove={(i) => handleRemoveArrayField('email', i)}
          />

          {/* Horario */}
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-sm font-medium text-chrome-text">Horario de Atención</label>
            <div className="relative">
              <Clock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-chrome-text-muted" />
              <input
                type="text"
                name="horario_atencion"
                value={formData.horario_atencion}
                onChange={handleChange}
                className="w-full rounded-md border border-chrome-border bg-chrome-bg px-10 py-2 text-sm text-chrome-text outline-none focus:border-brand-primary transition-colors"
                placeholder="Lunes a Viernes de 08:00 a 17:00"
              />
            </div>
          </div>
        </div>

        {/* Puntos de atención adicionales */}
        <div className="space-y-3 pt-4 border-t border-chrome-border">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-chrome-text">Postos</label>
              <p className="text-xs text-chrome-text-muted">
                Para trámites que se atienden en otra dirección dentro de la misma ciudad, ej. el posto de pasaportes.
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddPunto}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-chrome-border bg-chrome-bg-active text-sm text-chrome-text hover:border-brand-primary/50 transition-colors flex-shrink-0"
            >
              <Plus size={14} />
              Añadir posto
            </button>
          </div>

          {puntos.length > 0 && (
            <div className="flex flex-col gap-3">
              {puntos.map((punto, index) => (
                <div key={punto.id || index} className="rounded-md border border-chrome-border bg-chrome-bg-active p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <input
                      type="text"
                      value={punto.sigla}
                      onChange={(e) => handlePuntoChange(index, 'sigla', e.target.value)}
                      className="w-full rounded-md border border-chrome-border bg-chrome-bg px-3 py-1.5 text-sm text-chrome-text outline-none focus:border-brand-primary transition-colors"
                      placeholder="Sigla (ej. NUCART/ATM/PA)"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemovePunto(index)}
                      className="p-1.5 text-chrome-text-muted hover:text-danger rounded-md hover:bg-chrome-bg flex-shrink-0"
                      title="Quitar posto"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <textarea
                      value={punto.direccion}
                      onChange={(e) => handlePuntoChange(index, 'direccion', e.target.value)}
                      rows={2}
                      className="w-full rounded-md border border-chrome-border bg-chrome-bg px-3 py-1.5 text-sm text-chrome-text outline-none focus:border-brand-primary transition-colors resize-none md:col-span-2"
                      placeholder="Dirección de este punto"
                    />
                    <ContactoMultiple
                      compact
                      label="Teléfono"
                      placeholder="Teléfono"
                      values={punto.telefono}
                      onChangeItem={(i, v) => handlePuntoArrayChange(index, 'telefono', i, v)}
                      onAdd={() => handleAddPuntoArrayItem(index, 'telefono')}
                      onRemove={(i) => handleRemovePuntoArrayItem(index, 'telefono', i)}
                    />
                    <ContactoMultiple
                      compact
                      label="Email"
                      type="email"
                      placeholder="Email"
                      values={punto.email}
                      onChangeItem={(i, v) => handlePuntoArrayChange(index, 'email', i, v)}
                      onAdd={() => handleAddPuntoArrayItem(index, 'email')}
                      onRemove={(i) => handleRemovePuntoArrayItem(index, 'email', i)}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Procesos */}
        <div className="space-y-3 pt-4 border-t border-chrome-border">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-chrome-text">Procedimientos</label>
              <p className="text-xs text-chrome-text-muted">
                Un bloque por trámite (ej. Pasaporte, Cédula). Podés adjuntar formularios o ejemplos a cada uno.
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddProceso}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-chrome-border bg-chrome-bg-active text-sm text-chrome-text hover:border-brand-primary/50 transition-colors flex-shrink-0"
            >
              <Plus size={14} />
              Añadir procedimiento
            </button>
          </div>

          {procesos.length === 0 ? (
            <span className="text-sm text-chrome-text-muted italic">Ningún procedimiento cargado todavía.</span>
          ) : (
            <div className="flex flex-col gap-2">
              {procesos.map((proceso, index) => {
                const isExpanded = expandedProcesos.has(index);
                return (
                <div key={proceso.id || index} className="rounded-md border border-chrome-border bg-chrome-bg-active overflow-hidden">
                  <div className="flex items-center gap-1.5 p-2">
                    <button
                      type="button"
                      onClick={() => toggleProcesoExpanded(index)}
                      className="p-0.5 text-chrome-text-muted hover:text-chrome-text flex-shrink-0"
                      title={isExpanded ? 'Colapsar' : 'Expandir'}
                    >
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                    <input
                      type="text"
                      value={proceso.titulo}
                      onChange={(e) => handleProcesoChange(index, 'titulo', e.target.value)}
                      className="flex-1 min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm font-medium text-chrome-text outline-none focus:border-brand-primary focus:bg-chrome-bg transition-colors"
                      placeholder="Nombre del trámite (ej. Pasaporte)"
                    />
                    {proceso.archivos.length > 0 && (
                      <span
                        className="flex items-center gap-1 text-xs text-chrome-text-muted flex-shrink-0"
                        title={`${proceso.archivos.length} archivo(s) adjunto(s)`}
                      >
                        <Paperclip size={11} />
                        {proceso.archivos.length}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveProceso(index)}
                      className="p-1 text-danger hover:text-danger/80 rounded-md hover:bg-chrome-bg flex-shrink-0"
                      title="Eliminar procedimiento"
                    >
                      <Trash2 size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleProcesoExpanded(index)}
                      className="p-1 text-chrome-text-muted hover:text-chrome-text rounded-md hover:bg-chrome-bg flex-shrink-0"
                      title={isExpanded ? 'Cerrar' : 'Expandir'}
                    >
                      <X size={14} />
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="px-2 pb-2 space-y-2 border-t border-chrome-border pt-2">
                      <AutoGrowTextarea
                        value={proceso.descripcion}
                        onChange={(e) => handleProcesoChange(index, 'descripcion', e.target.value)}
                        className="w-full rounded-md border border-chrome-border bg-chrome-bg px-3 py-1.5 text-sm text-chrome-text outline-none focus:border-brand-primary transition-colors"
                        placeholder="Pasos del trámite: cómo se agenda, qué llevar, tiempos de espera, etc."
                      />

                      {proceso.archivos.length > 0 && (
                        <div className="flex flex-col gap-1">
                          {proceso.archivos.map((archivo, aIndex) => {
                            const isPending = archivo instanceof File;
                            const nombre = isPending ? archivo.name : archivo.nombre_archivo;
                            return (
                              <div key={aIndex} className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-chrome-bg text-xs text-chrome-text-muted">
                                {isPending ? (
                                  <span className="flex items-center gap-1.5 truncate">
                                    <Paperclip size={12} className="flex-shrink-0" />
                                    <span className="truncate">{nombre}</span>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setViewingArchivo(archivo)}
                                    className="flex items-center gap-1.5 truncate text-left hover:text-brand-primary transition-colors"
                                  >
                                    <Paperclip size={12} className="flex-shrink-0" />
                                    <span className="truncate">{nombre}</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveProcesoArchivo(index, aIndex)}
                                  className="p-0.5 text-chrome-text-muted hover:text-danger flex-shrink-0"
                                  title="Quitar archivo"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-dashed border-chrome-border text-xs text-chrome-text-muted hover:border-brand-primary/50 hover:text-chrome-text transition-colors cursor-pointer">
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          onChange={(e) => { handleAddProcesoArchivos(index, e.target.files); e.target.value = ''; }}
                        />
                        <UploadCloud size={12} />
                        Adjuntar archivo
                      </label>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Ciudades Relacionadas */}
        <div className="space-y-3 pt-4 border-t border-chrome-border">
          <label className="text-sm font-medium text-chrome-text">Ciudades que cubre</label>

          <div className="flex flex-wrap gap-2">
            {selectedCiudades.length === 0 ? (
              <span className="text-sm text-chrome-text-muted italic">Ninguna ciudad asignada todavía.</span>
            ) : (
              selectedCiudades.map(id => {
                const c = ciudades.find(ciudad => ciudad.id === id);
                if (!c) return null;
                return (
                  <span
                    key={id}
                    className="flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-md border border-brand-primary bg-brand-primary/10 text-brand-primary text-sm font-medium"
                  >
                    {c.nombre}
                    <button
                      type="button"
                      onClick={() => handleCiudadToggle(id)}
                      className="p-0.5 rounded hover:bg-brand-primary/20"
                      title="Quitar ciudad"
                    >
                      <X size={12} />
                    </button>
                  </span>
                );
              })
            )}
          </div>

          <div className="relative">
            <input
              type="text"
              value={ciudadSearch}
              onChange={(e) => setCiudadSearch(e.target.value)}
              className="w-full rounded-md border border-chrome-border bg-chrome-bg px-3 py-2 text-sm text-chrome-text outline-none focus:border-brand-primary transition-colors"
              placeholder="Buscar ciudad para agregar..."
            />
            {ciudadSearch.trim() && (
              <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-md border border-chrome-border bg-chrome-bg shadow-lg">
                {(() => {
                  const q = normalize(ciudadSearch);
                  const resultados = ciudades
                    .filter(c => !selectedCiudades.includes(c.id) && normalize(c.nombre).includes(q))
                    .slice(0, 30);
                  if (resultados.length === 0) {
                    return <p className="px-3 py-2 text-sm text-chrome-text-muted">Sin resultados.</p>;
                  }
                  return resultados.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { handleCiudadToggle(c.id); setCiudadSearch(''); }}
                      className="block w-full text-left px-3 py-2 text-sm text-chrome-text hover:bg-chrome-bg-active"
                    >
                      {c.nombre}{c.estado ? ` — ${c.estado}` : ''}
                    </button>
                  ));
                })()}
              </div>
            )}
          </div>
        </div>

        {/* Notas */}
        <div className="space-y-1.5 pt-4 border-t border-chrome-border">
          <label className="text-sm font-medium text-chrome-text">Notas o Requisitos Especiales</label>
          <div className="relative">
            <AlignLeft size={16} className="absolute left-3 top-3 text-chrome-text-muted" />
            <textarea
              name="notas"
              value={formData.notas}
              onChange={handleChange}
              rows={3}
              className="w-full rounded-md border border-chrome-border bg-chrome-bg pl-10 pr-4 py-2 text-sm text-chrome-text outline-none focus:border-brand-primary transition-colors resize-none"
              placeholder="Información adicional sobre esta comisaría..."
            />
          </div>
        </div>
      </form>
    </Modal>
    {viewingArchivo && (
      <ProcesoArchivoViewer archivo={viewingArchivo} onClose={() => setViewingArchivo(null)} />
    )}
    </>
  );
}

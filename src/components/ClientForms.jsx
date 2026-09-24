import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Copy, Trash2, Eye, Plus, CheckCircle, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { deleteFormulario, updateFormulario } from '../services/formulariosService';
import { updateCliente } from '../services/clientesService';
import { getConfig } from '../services/configService';

export default function ClientForms({
  clientId,
  client = {},
  formularios = [],
  onRefresh,
  onSendToExtension,
  customFieldsConfig = []
}) {
  const [viewingForm, setViewingForm] = useState(null);
  const [isSectionExpanded, setIsSectionExpanded] = useState(false);
  const [formulariosLinks, setFormulariosLinks] = useState([]);
  const [isEditingForm, setIsEditingForm] = useState(false);
  const [editedRespuestas, setEditedRespuestas] = useState({});
  const [isSavingForm, setIsSavingForm] = useState(false);

  const handleSaveEditedForm = async () => {
    setIsSavingForm(true);
    const toastId = toast.loading('Guardando cambios...');
    try {
      await updateFormulario(viewingForm.id, { respuestas: editedRespuestas }, clientId);
      toast.success('Formulario actualizado', { id: toastId });
      setIsEditingForm(false);
      setViewingForm({ ...viewingForm, respuestas: editedRespuestas });
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error(err);
      toast.error('Error al actualizar el formulario', { id: toastId });
    } finally {
      setIsSavingForm(false);
    }
  };

  const handlePassToProfile = async () => {
    if (!viewingForm || !viewingForm.respuestas) return;
    const toastId = toast.loading('Pasando datos al perfil...');
    
    try {
      let clientUpdates = {};
      let customJsonUpdates = { ...(client.campos_personalizados || {}) };
      let hasCustomUpdates = false;

      const mappingFijos = {
        'nombres': 'nombre',
        'apellidos': 'nombre',
        'cpf': 'cpf',
        'rnm / protocolo anterior': 'rnm',
        'rnm': 'rnm',
        'género': 'sexo',
        'fecha de nacimiento': 'fecha_nacimiento',
        'estado civil': 'estado_civil',
        'nacionalidad': 'nacionalidad'
      };

      let nombres = '';
      let apellidos = '';

      Object.entries(viewingForm.respuestas).forEach(([keyRaw, value]) => {
        if (!value) return;
        const key = keyRaw.toLowerCase().trim();

        if (key === 'nombres') nombres = value;
        if (key === 'apellidos') apellidos = value;

        let mappedFixed = mappingFijos[key];
        if (mappedFixed && mappedFixed !== 'nombre') {
           clientUpdates[mappedFixed] = value;
        } else {
           const configMatch = customFieldsConfig.find(c => c?.nombre_campo?.toLowerCase().trim() === key);
           if (configMatch) {
             customJsonUpdates[configMatch.identificador] = value;
             hasCustomUpdates = true;
           }
        }
      });

      if (nombres || apellidos) {
        clientUpdates.nombre = `${nombres} ${apellidos}`.trim();
      }

      if (hasCustomUpdates) {
        clientUpdates.campos_personalizados = customJsonUpdates;
      }

      if (Object.keys(clientUpdates).length > 0) {
        await updateCliente(clientId, clientUpdates);
      }

      toast.success('Datos pasados exitosamente al perfil del cliente', { id: toastId });
      if (onRefresh) onRefresh();
      
    } catch (err) {
      console.error(err);
      toast.error('Error al pasar datos', { id: toastId });
    }
  };

  useEffect(() => {
    const fetchUrl = async () => {
        const data = await getConfig('formularios_externos_links');
        if (data) {
            try {
                const parsed = JSON.parse(data);
                if (Array.isArray(parsed)) {
                    setFormulariosLinks(parsed);
                }
            } catch (e) {
                console.error(e);
            }
        } else {
            // Fallback backward compatibility
            const oldUrl = await getConfig('tally_base_url');
            if (oldUrl) {
                setFormulariosLinks([{ id: 1, name: 'Sisconare', url: oldUrl }]);
            } else {
                setFormulariosLinks([{ id: 1, name: 'Formulario', url: 'https://tally.so/r/tu-formulario' }]);
            }
        }
    };
    fetchUrl();
  }, []);

  const handleCopyLink = (e, formLink) => {
    e.stopPropagation();
    if (!formLink.url) return;
    const link = `${formLink.url}?cliente_id=${clientId}`;
    navigator.clipboard.writeText(link);
    toast.success(`Enlace de ${formLink.name} copiado`);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar este formulario?')) return;
    const toastId = toast.loading('Eliminando...');
    try {
      await deleteFormulario(id, clientId);
      toast.success('Formulario eliminado', { id: toastId });
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error(err);
      toast.error('Error al eliminar', { id: toastId });
    }
  };

  const renderFormValue = (val) => {
    if (typeof val === 'boolean') return val ? 'Sí' : 'No';
    if (Array.isArray(val)) {
      // If it's an array of URLs (like Tally file uploads)
      if (val.length > 0 && typeof val[0] === 'string' && val[0].startsWith('http')) {
        return (
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
            {val.map((url, i) => renderSingleUrl(url, i))}
          </div>
        );
      }
      return val.join(', ');
    }
    if (typeof val === 'string' && val.startsWith('http')) {
      return (
        <div style={{ marginTop: '0.5rem' }}>
          {renderSingleUrl(val, 0)}
        </div>
      );
    }
    if (typeof val === 'object' && val !== null) return JSON.stringify(val);
    return val;
  };

  const renderSingleUrl = (url, index) => {
    const isImage = url.match(/\.(jpeg|jpg|gif|png|webp)($|\?)/i) || url.includes('tally.so/files');
    if (isImage) {
      return (
        <a key={index} href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', width: '100px', height: '100px' }}>
          <img src={url} alt={`Archivo ${index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </a>
      );
    }
    return (
      <a key={index} href={url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)', textDecoration: 'underline', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem' }}>
        <ExternalLink size={14} /> Ver archivo {index + 1}
      </a>
    );
  };

  return (
    <section className="glass-panel" style={{ overflow: 'hidden', flexShrink: 0 }}>
      <div 
        style={{ 
          padding: '1.25rem', 
          borderBottom: isSectionExpanded ? '1px solid var(--color-border)' : 'none', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          cursor: 'pointer',
          flexWrap: 'wrap',
          gap: '1rem'
        }}
        onClick={() => setIsSectionExpanded(!isSectionExpanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: '200px' }}>
          <FileText size={18} color="var(--brand-primary)" />
          <h2 style={{ font: 'var(--font-page-title)', margin: 0, fontSize: '1rem' }}>
            Formularios Externos ({formularios.length})
          </h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {formulariosLinks.map(fl => (
            <button 
              key={fl.id}
              className="btn btn-primary btn-sm"
              onClick={(e) => handleCopyLink(e, fl)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              title={`Copiar link para ${fl.name}`}
            >
              <Copy size={14} /> Link {fl.name}
            </button>
          ))}
          
          <div style={{ paddingLeft: '0.5rem', display: 'flex', alignItems: 'center' }}>
            {isSectionExpanded ? (
              <ChevronUp size={18} color="var(--color-text-muted)" />
            ) : (
              <ChevronDown size={18} color="var(--color-text-muted)" />
            )}
          </div>
        </div>
      </div>

      {isSectionExpanded && (
        <div style={{ padding: '1.25rem', overflowY: 'auto', maxHeight: '400px' }}>
          {formularios.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>
              No hay formularios vinculados a este cliente.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {formularios.map(form => (
                <div 
                  key={form.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '1rem',
                    background: 'var(--color-bg-elevated)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)' }}>
                      <FileText size={20} />
                    </div>
                    <div>
                      <h4 style={{ margin: '0 0 0.25rem', fontSize: '0.9rem', fontWeight: 600 }}>
                        {form.tipo_formulario}
                      </h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', color: form.estado === 'Completado' ? 'var(--color-success)' : 'var(--color-warning)' }}>
                          <CheckCircle size={12} /> {form.estado}
                        </span>
                        <span>•</span>
                        {new Date(form.creado_en).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button 
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setViewingForm(form);
                        setEditedRespuestas(form.respuestas || {});
                        setIsEditingForm(false);
                      }}
                      title="Ver respuestas"
                    >
                      <Eye size={16} />
                    </button>
                    <button 
                      className="btn btn-ghost btn-sm"
                      onClick={() => handleDelete(form.id)}
                      style={{ color: 'var(--color-danger)' }}
                      title="Eliminar"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal para ver el formulario */}
      {viewingForm && createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem' }}>
          <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '900px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Respuestas de {viewingForm.tipo_formulario}</h2>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {!isEditingForm ? (
                  <button className="btn btn-secondary btn-sm" onClick={() => setIsEditingForm(true)}>Editar</button>
                ) : (
                  <button className="btn btn-ghost btn-sm" onClick={() => setIsEditingForm(false)}>Cancelar</button>
                )}
                <button className="btn btn-ghost" onClick={() => setViewingForm(null)}>✕</button>
              </div>
            </div>
            
            <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1 }}>
              {Object.keys(viewingForm.respuestas || {}).length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>El formulario está vacío o en formato incorrecto.</div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
                  {Object.entries(viewingForm.respuestas).map(([key, value], idx) => (
                    <div key={idx} style={{ padding: '1rem', background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                      <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem', textTransform: 'capitalize' }}>
                        {key.replace(/_/g, ' ')}
                      </div>
                      <div style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--color-text-primary)' }}>
                        {isEditingForm ? (
                          <textarea
                            className="form-input"
                            value={editedRespuestas[key] || ''}
                            onChange={(e) => setEditedRespuestas({...editedRespuestas, [key]: e.target.value})}
                            rows={editedRespuestas[key]?.toString().length > 50 ? 3 : 1}
                            style={{ width: '100%', resize: 'vertical' }}
                          />
                        ) : (
                          renderFormValue(value)
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div style={{ padding: '1.5rem', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              {isEditingForm ? (
                <button className="btn btn-primary" onClick={handleSaveEditedForm} disabled={isSavingForm}>
                  {isSavingForm ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              ) : (
                <>
                  <button className="btn btn-secondary" onClick={handlePassToProfile}>
                    Mapear al Perfil
                  </button>
                  {onSendToExtension && (
                    <button className="btn btn-primary" onClick={() => {
                      onSendToExtension();
                      toast.success('Enviado a la extensión');
                    }}>
                      Enviar a Extensión
                    </button>
                  )}
                  <button className="btn btn-ghost" onClick={() => {
                    const text = Object.entries(viewingForm.respuestas)
                      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${renderFormValue(v)}`)
                      .join('\n');
                    navigator.clipboard.writeText(text);
                    toast.success('Todas las respuestas copiadas');
                  }}>
                    <Copy size={16} style={{ marginRight: '0.5rem' }} /> Copiar todo
                  </button>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </section>
  );
}

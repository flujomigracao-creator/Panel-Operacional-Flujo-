import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Loader2, Link as LinkIcon, FileText, AlertCircle, RefreshCw, Search } from 'lucide-react';
import toast from 'react-hot-toast';

export default function TemplateEditorModal({ template, client, onClose, onSaved }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pdfFields, setPdfFields] = useState([]);
  const [availableFields, setAvailableFields] = useState([]);

  useEffect(() => {
    import('../services/templateService').then(({ getExtendedClientFields }) => getExtendedClientFields()).then(fields => setAvailableFields(fields));
  }, []);
  
  // mappings array: { pdfFieldName, kommoFieldId, isCustomText, customValue }
  const [mappings, setMappings] = useState([]);

  // Live preview states
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const lastUrlRef = useRef(null);

  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const loadFields = async () => {
      setLoading(true);
      try {
        const existingMappings = template.field_mappings || [];
        
        const isWord = template.tipo_contenido === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || template.nombre.endsWith('.docx');

        if (template.tipo_contenido === 'application/pdf' || isWord) {
          let fields = [];
          const { getDocxFields, getPDFFormFields } = await import('../services/templateService');

          if (isWord) {
             fields = await getDocxFields(template.url_archivo);
          } else {
             fields = await getPDFFormFields(template.url_archivo);
          }
          
          if (fields.length === 0 && existingMappings.length > 0 && existingMappings[0].x !== undefined) {
            // PDF PLANO: La IA encontró coordenadas pero no hay campos interactivos.
            // Sintetizamos los campos para que la UI los muestre y permita mapearlos.
            const syntheticFields = existingMappings.map(m => ({
              name: m.fieldLabel || `Campo_IA_${m.fieldId}`,
              type: 'Texto Detectado por IA',
            }));
            setPdfFields(syntheticFields);
            
            // Auto-mapeamos los campos de la IA para que ya tengan el `pdfFieldName` asignado
            const mapped = existingMappings.map(m => ({
              ...m,
              pdfFieldName: m.fieldLabel || `Campo_IA_${m.fieldId}`,
              kommoFieldId: m.fieldId
            }));
            setMappings(mapped);
          } else {
            setPdfFields(fields);
            // Solo cargamos los mapeos que tienen pdfFieldName para evitar duplicados "fantasmas" 
            // generados por la IA en PDFs interactivos (AcroForm).
            const validMappings = fields.length > 0 
              ? existingMappings.filter(m => m.pdfFieldName) 
              : existingMappings;
            setMappings(validMappings);
          }
        } else {
          setPdfFields([]);
          setMappings(existingMappings);
        }
      } catch (err) {
        console.error('Error loading template fields:', err);
        alert('Error cargando la plantilla: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    loadFields();
  }, [template]);

  // Debounced Live Preview Generator
  useEffect(() => {
    if (pdfFields.length === 0) return;
    
    setPreviewLoading(true);
    const timer = setTimeout(async () => {
      try {
        // Build preview mappings: Fill unmapped fields with [FieldName]
        // Para PDFs planos mantenemos las coordenadas X, Y que venían del template original
        const originalAI = template.field_mappings || [];

        const previewMappings = pdfFields.map(f => {
          const m = mappings.find(map => map.pdfFieldName === f.name);
          const aiData = originalAI.find(ai => (ai.fieldLabel || `Campo_IA_${ai.fieldId}`) === f.name);
          
          const coords = aiData ? { x: aiData.x, y: aiData.y } : {};

          if (m && (m.kommoFieldId || (m.isCustomText && m.customValue !== undefined))) {
            return { ...m, ...coords };
          }
          return { pdfFieldName: f.name, isCustomText: true, customValue: `[${f.name}]`, ...coords };
        });

        const isWord = template.tipo_contenido === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || template.nombre.endsWith('.docx');
        
        if (isWord) {
           setPdfPreviewUrl(null);
           return;
        }

        const { getFilledPdfBlob } = await import('../services/templateService');
        const blob = await getFilledPdfBlob(template.url_archivo, previewMappings, client, {});
        const url = URL.createObjectURL(blob);
        
        if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
        lastUrlRef.current = url;
        
        setPdfPreviewUrl(url);
      } catch (e) {
        console.error('Live preview error:', e);
        // Si hay un error (ej. CORS de Supabase en producción), avisar al usuario
        toast.error(`Error generando vista previa: ${e.message}`);
      } finally {
        setPreviewLoading(false);
      }
    }, 600); // 600ms debounce

    return () => clearTimeout(timer);
  }, [mappings, pdfFields, template.url_archivo, client]);

  // Cleanup object url on unmount
  useEffect(() => {
    return () => {
      if (lastUrlRef.current) URL.revokeObjectURL(lastUrlRef.current);
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const { saveTemplateMapping } = await import('../services/templateService');
    const result = await saveTemplateMapping(template.id, mappings);
    setSaving(false);
    
    if (result.error) {
      alert('Error guardando: ' + result.error);
    } else {
      if (onSaved) onSaved();
      onClose();
    }
  };

  const updateMapping = (pdfFieldName, updates) => {
    setMappings(prev => {
      const existing = prev.find(m => m.pdfFieldName === pdfFieldName);
      if (existing) {
        return prev.map(m => m.pdfFieldName === pdfFieldName ? { ...m, ...updates } : m);
      } else {
        return [...prev, { pdfFieldName, ...updates }];
      }
    });
  };

  const getMappingFor = (pdfFieldName) => {
    return mappings.find(m => m.pdfFieldName === pdfFieldName) || null;
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem'
    }}>
      <div style={{
        background: 'var(--color-bg-base)', width: '100%', maxWidth: '1400px', height: '90vh',
        borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', overflow: 'hidden',
        animation: 'scaleIn 0.2s ease-out'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 2rem', borderBottom: '1px solid var(--color-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'var(--color-bg-elevated)', flexShrink: 0
        }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--color-primary)', padding: '8px', borderRadius: '8px' }}>
                <LinkIcon size={20} />
              </div>
              Enlazar Campos & Vista Previa
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', margin: '0.4rem 0 0 2.5rem' }}>
              Plantilla: <strong style={{ color: 'var(--color-text-primary)' }}>{template.nombre}</strong>
            </p>
          </div>
          
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {previewLoading && (
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                <RefreshCw size={14} className="animate-spin" /> Actualizando PDF...
              </span>
            )}
            <button onClick={onClose} className="btn btn-ghost" style={{ borderRadius: '20px' }}>
              Cancelar
            </button>
            <button 
              onClick={handleSave} 
              disabled={saving || loading}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderRadius: '20px', padding: '0.6rem 1.5rem', boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              Guardar Cambios
            </button>
          </div>
        </div>

        {/* Split Content */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          
          {/* LEFT: MAPPING EDITOR (45%) */}
          <div style={{ 
            width: '45%', display: 'flex', flexDirection: 'column', 
            background: 'var(--color-bg-secondary)', borderRight: '1px solid var(--color-border)' 
          }}>
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)' }}>
                <Loader2 size={48} className="animate-spin" style={{ marginBottom: '1.5rem', color: 'var(--color-primary)' }} />
                <p style={{ fontSize: '1.1rem', fontWeight: 500 }}>Analizando documento...</p>
              </div>
            ) : pdfFields.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--color-text-secondary)' }}>
                <AlertCircle size={64} style={{ margin: '0 auto 1.5rem', opacity: 0.3 }} />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>Sin campos rellenables</h3>
                <p style={{ fontSize: '0.95rem', marginTop: '0.75rem' }}>Asegúrate de subir un PDF interactivo AcroForm.</p>
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
                <div style={{ 
                  padding: '1.25rem', background: 'linear-gradient(to right, rgba(59, 130, 246, 0.1), rgba(139, 92, 246, 0.05))', 
                  borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.2)',
                  display: 'flex', alignItems: 'flex-start', gap: '1rem', marginBottom: '1.5rem'
                }}>
                  <AlertCircle size={20} color="var(--color-primary)" style={{ marginTop: '2px', flexShrink: 0 }} />
                  <div>
                    <h4 style={{ margin: '0 0 0.4rem 0', color: 'var(--color-primary)', fontSize: '0.95rem' }}>
                      Mapeando {pdfFields.length} campos
                    </h4>
                    <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                      Los cambios que hagas aquí se reflejarán instantáneamente en el PDF de la derecha. Los campos vacíos aparecerán marcados en rojo.
                    </p>
                  </div>
                </div>
                
                <div style={{ marginBottom: '1.5rem', position: 'relative' }}>
                  <div style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }}>
                    <Search size={18} />
                  </div>
                  <input
                    type="text"
                    placeholder="Buscar campo por nombre PDF o valor mapeado..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem 0.75rem 2.5rem',
                      borderRadius: '12px',
                      border: '1px solid var(--color-border)',
                      background: 'var(--color-bg-base)',
                      fontSize: '0.9rem',
                      color: 'var(--color-text-primary)'
                    }}
                  />
                </div>
                
                <div style={{ 
                  background: 'var(--color-bg-base)', borderRadius: '12px', 
                  border: '1px solid var(--color-border)', overflow: 'hidden',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.02)'
                }}>
                  <div style={{ 
                    display: 'flex', padding: '1rem', 
                    borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-elevated)',
                    fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase'
                  }}>
                    <div style={{ flex: '1' }}>PDF</div>
                    <div style={{ flex: '1.5', paddingLeft: '1rem' }}>Dato</div>
                  </div>

                  {pdfFields.filter(field => {
                    if (!searchTerm) return true;
                    const term = searchTerm.toLowerCase();
                    if (field.name.toLowerCase().includes(term)) return true;
                    const map = getMappingFor(field.name);
                    if (map && map.kommoFieldId && map.kommoFieldId.toLowerCase().includes(term)) return true;
                    if (map && map.isCustomText && map.customValue && map.customValue.toLowerCase().includes(term)) return true;
                    return false;
                  }).map((field, idx, arr) => {
                    const currentMap = getMappingFor(field.name);
                    const isMapped = !!currentMap && (currentMap.kommoFieldId || currentMap.customValue);
                    const isCustom = currentMap?.isCustomText;
                    
                    return (
                        <div key={field.name} style={{
                        display: 'flex', alignItems: 'center',
                        padding: '1rem',
                        borderBottom: idx === arr.length - 1 ? 'none' : '1px solid var(--color-border)',
                        background: isMapped ? 'transparent' : 'rgba(239, 68, 68, 0.03)',
                        transition: 'background 0.2s'
                      }}>
                        <div style={{ flex: '1', overflow: 'hidden', paddingRight: '1rem' }}>
                          <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', margin: 0 }} title={field.name}>
                            {field.displayName || field.name}
                          </p>
                          <p style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', margin: '0.2rem 0 0 0' }}>{field.type}</p>
                        </div>
                        
                        <div style={{ flex: '1.5', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          <select
                            className="form-input"
                            value={isCustom ? 'custom_text' : (currentMap?.kommoFieldId || '')}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (!val) {
                                setMappings(prev => prev.filter(m => m.pdfFieldName !== field.name));
                              } else if (val === 'custom_text') {
                                updateMapping(field.name, { isCustomText: true, customValue: '', kommoFieldId: null });
                              } else {
                                updateMapping(field.name, { isCustomText: false, kommoFieldId: val, customValue: null });
                              }
                            }}
                            style={{ 
                              padding: '0.5rem 0.75rem', fontSize: '0.8rem', width: '100%', 
                              borderRadius: '8px', 
                              borderColor: isMapped ? 'var(--color-primary)' : 'var(--color-border)',
                            }}
                          >
                            <option value="">-- Sin mapear --</option>
                            <optgroup label="Datos del Cliente">
                              <option value="">-- Ignorar (No Llenar) --</option>
                              {availableFields.map(cf => (
                                <option key={cf.id} value={cf.id}>{cf.label}</option>
                              ))}
                            </optgroup>
                            <optgroup label="Personalizado">
                              <option value="custom_text">Texto Fijo / Manual...</option>
                            </optgroup>
                          </select>

                          {isCustom && (
                            <input
                              type="text"
                              className="form-input"
                              placeholder="Escribe un valor fijo..."
                              value={currentMap?.customValue || ''}
                              onChange={(e) => updateMapping(field.name, { customValue: e.target.value })}
                              style={{ padding: '0.5rem 0.75rem', fontSize: '0.8rem', width: '100%', borderRadius: '8px' }}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: LIVE PDF PREVIEW (55%) */}
          <div style={{ width: '55%', background: '#f1f5f9', position: 'relative' }}>
            {template.tipo_contenido === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || template.nombre.endsWith('.docx') ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)', padding: '2rem', textAlign: 'center' }}>
                <FileText size={64} style={{ opacity: 0.2, marginBottom: '1.5rem', color: 'var(--color-primary)' }} />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '0.5rem' }}>Documento de Word</h3>
                <p style={{ fontSize: '0.95rem', maxWidth: '350px', lineHeight: 1.5 }}>
                  La vista previa en vivo no está disponible para archivos Word. 
                  Mapea tus etiquetas en el panel izquierdo y haz clic en "Guardar Cambios".
                </p>
              </div>
            ) : pdfPreviewUrl ? (
              <iframe
                src={`${pdfPreviewUrl}#toolbar=0&navpanes=0&scrollbar=0`}
                title="Live PDF Preview"
                style={{ width: '100%', height: '100%', border: 'none', background: 'transparent' }}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)' }}>
                <Loader2 size={48} className="animate-spin" style={{ marginBottom: '1rem', color: 'var(--color-primary)' }} />
                <p>Generando vista previa...</p>
              </div>
            )}

            {/* Overlap Loader */}
            {previewLoading && pdfPreviewUrl && (
              <div style={{
                position: 'absolute', top: 16, right: 16,
                background: 'rgba(0,0,0,0.7)', color: 'white', padding: '8px 16px', borderRadius: '20px',
                display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', fontWeight: 600,
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)', backdropFilter: 'blur(4px)',
                animation: 'fadeIn 0.2s'
              }}>
                <RefreshCw size={14} className="animate-spin" /> Actualizando...
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import {  UploadCloud, FileText, Loader2, Tag, Eye, Trash2, Sparkles, Plus, Search, ChevronDown, ChevronUp, AlertCircle, Files, Sliders, CheckCircle2, Settings2 } from 'lucide-react';
import { getFastopAcciones, getRequisitosTramite } from '../services/tramitesService';

const VALID_MERGE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const isValidForMerge = (doc) => {
  if (doc.tipo_contenido && VALID_MERGE_TYPES.includes(doc.tipo_contenido)) return true;
  const name = (doc.nombre_archivo || '').toLowerCase();
  return name.endsWith('.pdf') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.webp');
};

// Cada uno arrastra sus propias dependencias pesadas (pdf-lib, docxtemplater,
// html2pdf.js, react-quill) — lazy() para que solo se descarguen cuando el
// usuario realmente abre uno de estos modales, no al abrir la ficha del cliente.
const TemplateEditorModal = lazy(() => import('./TemplateEditorModal'));
const TemplatePreviewModal = lazy(() => import('./TemplatePreviewModal'));
const HtmlTemplateBuilder = lazy(() => import('./HtmlTemplateBuilder'));
const DocumentoUnicoModal = lazy(() => import('./DocumentoUnicoModal'));
const RequisitosDocumentosModal = lazy(() => import('./settings/RequisitosDocumentosModal'));
const GestionarFastopAccionesModal = lazy(() => import('./GestionarFastopAccionesModal'));

/**
 * TemplateManager
 *
 * Reemplaza la sección "Generador de Trámites y Declaraciones".
 * Permite subir plantillas, gestionar mapeos y generar copias para un cliente.
 */
export default function TemplateManager({ client, clienteDatos, entradas, documentos = [], defaultExpanded = false, onGenerate }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(null); // templateId being analyzed
  const [isDragging, setIsDragging] = useState(false);

  // Modals
  const [editorTemplate, setEditorTemplate] = useState(null);
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [showHtmlBuilder, setShowHtmlBuilder] = useState(false);

  // Upload form
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadName, setUploadName] = useState('');

  // Search
  const [isTemplateExpanded, setIsTemplateExpanded] = useState(defaultExpanded);
  const [searchQuery, _setSearchQuery] = useState('');

  // Thumbnails cache (No longer used in UI, but kept for compatibility if needed)
  const [thumbnails, setThumbnails] = useState({});

  // FastOp: acciones rápidas sobre el cliente. "PDF Único" es la primera —
  // sus variantes viven en tramites_catalogo (fastop_tipo='pdf_unico') y se
  // administran 100% desde GestionarFastopAccionesModal, sin tocar código.
  const [pdfUnicoPanelOpen, setPdfUnicoPanelOpen] = useState(false);
  const [pdfUnicoAcciones, setPdfUnicoAcciones] = useState([]);
  const [loadingAcciones, setLoadingAcciones] = useState(true);
  const [accionesRefreshTick, setAccionesRefreshTick] = useState(0);
  const [selectedAccionId, setSelectedAccionId] = useState(null);
  const [showGestionarAcciones, setShowGestionarAcciones] = useState(false);
  const [showDocumentoUnico, setShowDocumentoUnico] = useState(false);
  const [checklistCatalogo, setChecklistCatalogo] = useState(null);
  const [exampleSlots, setExampleSlots] = useState([]);
  const [exampleLoading, setExampleLoading] = useState(false);
  const [exampleRefreshTick, setExampleRefreshTick] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoadingAcciones(true);
      try {
        const data = await getFastopAcciones('pdf_unico');
        if (!active) return;
        setPdfUnicoAcciones(data);
        setSelectedAccionId(prev => (prev && data.some(a => a.id === prev)) ? prev : (data[0]?.id ?? null));
      } catch (err) {
        console.error('[TemplateManager] Error cargando acciones FastOp:', err);
      } finally {
        if (active) setLoadingAcciones(false);
      }
    })();
    return () => { active = false; };
  }, [accionesRefreshTick]);

  const currentAccion = pdfUnicoAcciones.find(a => a.id === selectedAccionId) || null;

  // Ejemplo de armado con los archivos reales del cliente, sin abrir ningún
  // modal — solo lectura, para que el staff vea de un vistazo qué falta antes
  // de generar.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!currentAccion) { setExampleSlots([]); return; }
      setExampleLoading(true);
      try {
        const requisitos = await getRequisitosTramite(currentAccion.id);
        const mergeableDocs = documentos.filter(isValidForMerge);
        const slots = requisitos.map(req => {
          const candidatos = mergeableDocs
            .filter(d => d.tipo_documento === req.tipo_documento)
            .sort((a, b) => new Date(b.creado_en || 0) - new Date(a.creado_en || 0));
          return { label: req.tipo_dato, obligatorio: !!req.obligatorio, matchedDoc: candidatos[0] || null };
        });
        if (active) setExampleSlots(slots);
      } catch (err) {
        console.error('[TemplateManager] Error cargando ejemplo de FastOp:', err);
      } finally {
        if (active) setExampleLoading(false);
      }
    })();
    return () => { active = false; };
  }, [currentAccion, documentos, exampleRefreshTick]);

  const handleConfigurarChecklistFor = (accion) => {
    setPdfUnicoPanelOpen(false);
    setSelectedAccionId(accion.id);
    setChecklistCatalogo(accion);
  };

  const handleGenerarPdfUnico = () => {
    if (!currentAccion) return;
    setShowDocumentoUnico(true);
  };

  const fetchTemplates = useCallback(async () => {
    setLoading(true);
    const { getTemplates, renderPdfPageAsImage } = await import('../services/templateService');
    const { data } = await getTemplates();
    setTemplates(data);
    setLoading(false);

    // Generate thumbnails for PDFs (kept logic but not rendering them)
    for (const t of data) {
      if (t.tipo_contenido === 'application/pdf' && !thumbnails[t.id]) {
        try {
          const img = await renderPdfPageAsImage(t.url_archivo, 1, 0.5);
          setThumbnails(prev => ({ ...prev, [t.id]: img }));
        } catch (err) {
          console.warn('Thumbnail error for', t.nombre, err);
        }
      }
    }
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleUpload = useCallback(async (file) => {
    if (!file) return;

    const allowedTypes = [
      'application/pdf', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg', 'image/png', 'image/webp',
      'text/html'
    ];
    
    const isDocx = file.name.toLowerCase().endsWith('.docx');
    
    if (!allowedTypes.includes(file.type) && !isDocx) {
      alert('Solo se permiten archivos PDF, Word (.docx), JPEG, PNG o WebP.');
      return;
    }

    const nombre = uploadName.trim() || file.name.replace(/\.[^/.]+$/, '');
    setUploading(true);

    try {
      const { uploadTemplate, analyzeTemplateWithAI } = await import('../services/templateService');
      const { data: record, error } = await uploadTemplate(file, nombre);
      if (error) { alert('Error: ' + error); return; }

      setUploadName('');
      setShowUploadForm(false);
      await fetchTemplates();

      // Auto-analyze con IA SOLO para PDFs e Imágenes
      const isImageOrPdf = file.type === 'application/pdf' || file.type.startsWith('image/');
      if (record && isImageOrPdf) {
        setAnalyzing(record.id);
        try {
          let base64;
          if (file.type === 'application/pdf') {
            const { convertPdfPageToImageBase64 } = await import('../services/pdfToImage');
            ({ base64 } = await convertPdfPageToImageBase64(file));
          } else {
            base64 = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.readAsDataURL(file);
              reader.onload = () => resolve(reader.result);
              reader.onerror = reject;
            });
          }

          const detectedMappings = await analyzeTemplateWithAI(base64);

          if (detectedMappings.length > 0) {
            const { saveTemplateMapping } = await import('../services/templateService');
            await saveTemplateMapping(record.id, detectedMappings);
            await fetchTemplates();
          }
        } catch (aiErr) {
          console.warn('AI analysis failed:', aiErr.message);
        } finally {
          setAnalyzing(null);
        }
      }
    } finally {
      setUploading(false);
    }
  }, [uploadName, fetchTemplates]);

  const handleFileInput = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.name.toLowerCase().endsWith('.doc') || file.type === 'application/msword') {
        alert('Por favor, guarda tu documento como .DOCX (versión moderna de Word) en lugar de .DOC antes de subirlo.');
        e.target.value = '';
        return;
      }
      handleUpload(file);
    }
    e.target.value = '';
  };

  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      if (file.name.toLowerCase().endsWith('.doc') || file.type === 'application/msword') {
        alert('Por favor, guarda tu documento como .DOCX (versión moderna de Word) en lugar de .DOC antes de subirlo.');
        return;
      }
      handleUpload(file);
    }
  };

  const handleDelete = async (template) => {
    if (!window.confirm(`¿Eliminar la plantilla "${template.nombre}"?`)) return;
    const { deleteTemplate } = await import('../services/templateService');
    const { error } = await deleteTemplate(template);
    if (error) { alert('Error: ' + error); return; }
    await fetchTemplates();
  };

  // Filtered templates
  const filteredTemplates = String(searchQuery).trim()
    ? templates.filter(t => (t.nombre || '').toLowerCase().includes(String(searchQuery).toLowerCase()))
    : templates;

  // Construir el objeto completo del cliente con todos sus datos operacionales
  const fullClientData = React.useMemo(() => {
    if (!client) return null;
    const base = { ...client, entradas: entradas || [] };
    if (clienteDatos && Array.isArray(clienteDatos)) {
      clienteDatos.forEach(cd => {
        base[cd.campo_id] = cd.valor;
      });
    }
    return base;
  }, [client, clienteDatos, entradas]);

  return (
    <>
      <section id="template-engine" className="glass-panel" style={{ overflow: 'hidden', flexShrink: 0 }}>
        <div
          onClick={() => setIsTemplateExpanded(!isTemplateExpanded)}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: isTemplateExpanded ? '1px solid var(--color-border)' : 'none', cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
            <FileText size={18} color="var(--color-info)" />
            <h3 style={{ font: 'var(--font-section-title)', margin: 0, fontSize: '1rem' }}>Generador de Planillas ({templates.length})</h3>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button onClick={(e) => { e.stopPropagation(); setShowUploadForm(!showUploadForm); }} className="btn btn-ghost" style={{ padding: '0.4rem', color: 'var(--color-text-muted)' }} title="Subir plantilla">
              <UploadCloud size={18} />
            </button>
            <button onClick={(e) => { e.stopPropagation(); setShowHtmlBuilder(true); }} className="btn btn-ghost" style={{ padding: '0.4rem', color: 'var(--color-text-muted)' }} title="Crear HTML">
              <Plus size={18} />
            </button>
            {isTemplateExpanded ? <ChevronUp size={18} color="var(--color-text-muted)" /> : <ChevronDown size={18} color="var(--color-text-muted)" />}
          </div>
        </div>

        {isTemplateExpanded && (
          <>
            {showUploadForm && (
          <div style={{
            margin: '1.5rem', padding: '1.5rem',
            background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border)',
            animation: 'fadeIn 0.3s ease-out',
            boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.05)'
          }}>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{
                display: 'block', fontSize: '0.75rem', marginBottom: '0.5rem',
                color: 'var(--color-text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
              }}>
                Nombre de la nueva plantilla (Opcional)
              </label>
              <input
                className="form-input"
                type="text"
                placeholder="Si lo dejas en blanco, se usará el nombre del archivo original"
                value={uploadName}
                onChange={e => setUploadName(e.target.value)}
                style={{ fontSize: '0.9rem', maxWidth: '400px' }}
              />
            </div>

            <label
              htmlFor="template-upload-input"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                border: `2px dashed ${isDragging ? 'var(--color-primary)' : 'var(--color-border)'}`,
                backgroundColor: isDragging ? 'rgba(59,130,246,0.08)' : 'var(--color-bg-base)',
                borderRadius: 'var(--radius-md)', padding: '3rem 2rem',
                cursor: 'pointer', transition: 'all 0.3s ease',
                boxShadow: isDragging ? '0 0 0 4px rgba(59,130,246,0.1)' : 'none'
              }}
            >
              <input 
                id="template-upload-input" 
                type="file" 
                style={{ position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', borderWidth: 0 }} 
                onChange={handleFileInput} 
                disabled={uploading} 
                accept=".pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,.doc,.jpg,.jpeg,.png,.webp" 
              />
              {uploading ? (
                <>
                  <Loader2 className="animate-spin" size={36} color="var(--color-primary)" style={{ marginBottom: '1rem' }} />
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-primary)' }}>Subiendo y Analizando con IA...</div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.5rem' }}>Por favor espera un momento</div>
                </>
              ) : (
                <>
                  <div style={{ 
                    width: '64px', height: '64px', borderRadius: '50%', 
                    background: isDragging ? 'var(--color-primary)' : 'var(--color-bg-elevated)', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: '1rem', transition: 'all 0.3s ease',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
                  }}>
                    <UploadCloud size={32} color={isDragging ? 'white' : 'var(--color-text-secondary)'} />
                  </div>
                  <div style={{
                    fontSize: '1rem', fontWeight: 600,
                    color: isDragging ? 'var(--color-primary)' : 'var(--color-text-primary)',
                  }}>
                    {isDragging ? 'Suelta el archivo aquí' : 'Haz clic o arrastra tu documento aquí'}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                    <span style={{ background: 'var(--color-bg-elevated)', padding: '2px 8px', borderRadius: '10px' }}>PDF</span>
                    <span style={{ background: 'var(--color-bg-elevated)', padding: '2px 8px', borderRadius: '10px' }}>DOCX</span>
                    <span style={{ background: 'var(--color-bg-elevated)', padding: '2px 8px', borderRadius: '10px' }}>Imágenes (Max 10MB)</span>
                  </div>
                </>
              )}
            </label>
          </div>
        )}


        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--color-text-muted)' }}>
            <Loader2 size={32} className="animate-spin" color="var(--color-primary)" style={{ margin: '0 auto 1rem' }} />
            <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>Cargando planillas...</div>
          </div>
        ) : filteredTemplates.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '5rem 2rem',
            color: 'var(--color-text-muted)',
          }}>
            {templates.length === 0 ? (
              <div style={{ maxWidth: '400px', margin: '0 auto' }}>
                <div style={{ 
                  width: '80px', height: '80px', borderRadius: '20px', 
                  background: 'var(--color-bg-secondary)', 
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 1.5rem',
                  boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.05)'
                }}>
                  <FileText size={40} style={{ opacity: 0.5, color: 'var(--color-text-secondary)' }} />
                </div>
                <h4 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '0.5rem' }}>Tu biblioteca está vacía</h4>
                <p style={{ fontSize: '0.9rem', lineHeight: 1.5 }}>
                  Sube tu primer documento PDF o Word, y el sistema detectará los campos automáticamente para que puedas autocompletarlos.
                </p>
                <button 
                  className="btn btn-primary" 
                  onClick={() => setShowUploadForm(true)}
                  style={{ marginTop: '1.5rem', borderRadius: '20px', padding: '0.5rem 1.5rem' }}
                >
                  Subir mi primer documento
                </button>
              </div>
            ) : (
              <div>
                <Search size={40} style={{ margin: '0 auto 1rem', opacity: 0.3 }} />
                <div style={{ fontSize: '1rem', fontWeight: 500 }}>No se encontraron coincidencias</div>
              </div>
            )}
          </div>
        ) : (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: '0.75rem', 
            padding: '1.25rem', flex: 1, overflowY: 'auto'
          }}>
            {filteredTemplates.map(template => {
              const mappingCount = (template.field_mappings || []).length;
              const isAnalyzing = analyzing === template.id;
              
              const isHtml = template.tipo_contenido === 'text/html';
              const isWord = template.tipo_contenido === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || template.nombre.endsWith('.docx');
              const isPdf = template.tipo_contenido === 'application/pdf';
              
              let iconColor = 'var(--color-info)'; // Default
              let badgeBg = 'rgba(59, 130, 246, 0.1)';
              let typeLabel = 'DOC';

              if (isPdf) {
                iconColor = '#ef4444'; // Red for PDF
                badgeBg = 'rgba(239, 68, 68, 0.1)';
                typeLabel = 'PDF';
              } else if (isWord) {
                iconColor = '#3b82f6'; // Blue for Word
                badgeBg = 'rgba(59, 130, 246, 0.1)';
                typeLabel = 'DOCX';
              } else if (isHtml) {
                iconColor = '#8b5cf6'; // Purple for HTML
                badgeBg = 'rgba(139, 92, 246, 0.1)';
                typeLabel = 'HTML';
              }

              return (
                <div
                  key={template.id}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap',
                    background: 'var(--color-bg-elevated)',
                    borderRadius: 'var(--radius-md)', 
                    border: '1px solid var(--color-border)',
                    padding: '0.75rem 1rem', gap: '1rem',
                    transition: 'all 0.2s ease', 
                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = iconColor}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--color-border)'}
                >
                  {/* Info Section */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: '1 1 200px', overflow: 'hidden' }}>
                    <div style={{ 
                      width: '40px', height: '40px', borderRadius: '8px', background: badgeBg, 
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: iconColor, flexShrink: 0
                    }}>
                      <FileText size={20} />
                    </div>
                    
                    <div style={{ overflow: 'hidden' }}>
                      <h4 style={{ 
                        margin: '0 0 0.25rem 0', fontSize: '0.95rem', fontWeight: 600, 
                        color: 'var(--color-text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden'
                      }} title={template.nombre}>
                        {template.nombre}
                      </h4>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: iconColor, background: badgeBg, padding: '2px 6px', borderRadius: '4px' }}>
                          {typeLabel}
                        </span>
                        
                        {isAnalyzing ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-primary)', fontSize: '0.7rem', fontWeight: 600 }}>
                            <Sparkles size={12} className="animate-spin" /> Analizando IA...
                          </span>
                        ) : mappingCount > 0 ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-success)', fontSize: '0.7rem', fontWeight: 600 }}>
                            <Tag size={12} /> {mappingCount} campos
                          </span>
                        ) : (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-warning)', fontSize: '0.7rem', fontWeight: 600 }}>
                            <AlertCircle size={12} /> Sin mapear
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions Section */}
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', flexShrink: 0 }}>
                    {isHtml ? (
                      <button
                        className="btn btn-primary"
                        onClick={async () => {
                          const { generateFilledHtmlPdf } = await import('../services/templateService');
                          await generateFilledHtmlPdf(template.url_archivo, client, template.nombre);
                          if (onGenerate) onGenerate();
                        }}
                        style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '6px' }}
                      >
                        <FileText size={14} /> Generar
                      </button>
                    ) : (
                      <>
                        <button
                          className="btn btn-primary"
                          onClick={async () => {
                            if (mappingCount === 0) {
                              setEditorTemplate(template);
                            } else {
                              if (isWord) {
                                const { generateFilledDocx } = await import('../services/templateService');
                                await generateFilledDocx(template.url_archivo, client, template.nombre, template.field_mappings || []);
                                if (onGenerate) onGenerate();
                              } else {
                                setPreviewTemplate(template);
                              }
                            }
                          }}
                          style={{ 
                            padding: '0.4rem 0.75rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', borderRadius: '6px',
                            background: mappingCount === 0 ? 'var(--color-warning)' : 'var(--color-primary)',
                            color: mappingCount === 0 ? '#000' : '#fff'
                          }}
                        >
                          {mappingCount === 0 ? <><Tag size={14} /> Mapear</> : <><FileText size={14} /> Generar</>}
                        </button>

                        {mappingCount > 0 && (
                          <button
                            className="btn btn-secondary"
                            onClick={() => setEditorTemplate(template)}
                            style={{ padding: '0.4rem', borderRadius: '6px' }}
                            title="Editar mapeo"
                          >
                            <Tag size={14} />
                          </button>
                        )}
                      </>
                    )}

                    <button
                      className="btn btn-ghost"
                      onClick={() => handleDelete(template)}
                      style={{ padding: '0.4rem', color: 'var(--color-danger)', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.1)' }}
                      title="Eliminar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
          </>
        )}
      </section>

      <section id="fastop" className="glass-panel" style={{ overflow: 'hidden', flexShrink: 0, marginTop: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)' }}>
          <Files size={18} color="var(--color-info)" />
          <h3 style={{ font: 'var(--font-section-title)', margin: 0, fontSize: '1rem' }}>FastOp</h3>
        </div>
        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <button
                onClick={() => setPdfUnicoPanelOpen(o => !o)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0.6rem 0.9rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
                  background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)', fontSize: '0.85rem', fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Files size={16} color="var(--color-primary)" /> PDF Único
                </span>
                {pdfUnicoPanelOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {pdfUnicoPanelOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20,
                  background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)', boxShadow: '0 8px 24px rgba(0,0,0,0.25)', overflow: 'hidden',
                }}>
                  {loadingAcciones ? (
                    <div style={{ padding: '0.75rem 0.9rem', fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Loader2 size={14} className="animate-spin" /> Cargando...
                    </div>
                  ) : pdfUnicoAcciones.length === 0 ? (
                    <div style={{ padding: '0.75rem 0.9rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                      Todavía no hay ninguna variante. Usá "Gestionar" para crear la primera.
                    </div>
                  ) : (
                    pdfUnicoAcciones.map((a, i) => (
                      <div
                        key={a.id}
                        onClick={() => { setSelectedAccionId(a.id); setPdfUnicoPanelOpen(false); }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '0.6rem 0.9rem', cursor: 'pointer',
                          background: a.id === selectedAccionId ? 'rgba(59,130,246,0.1)' : 'transparent',
                          borderBottom: i < pdfUnicoAcciones.length - 1 ? '1px solid var(--color-border)' : 'none',
                        }}
                        onMouseEnter={(e) => { if (a.id !== selectedAccionId) e.currentTarget.style.background = 'var(--color-bg-surface)'; }}
                        onMouseLeave={(e) => { if (a.id !== selectedAccionId) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <span style={{ fontSize: '0.85rem', fontWeight: a.id === selectedAccionId ? 600 : 400, color: 'var(--color-text-primary)' }}>
                          {a.nombre}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleConfigurarChecklistFor(a); }}
                          className="btn btn-ghost"
                          style={{ padding: '0.3rem', color: 'var(--color-text-muted)' }}
                          title={`Configurar checklist de ${a.nombre}`}
                        >
                          <Sliders size={14} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <button
              onClick={() => setShowGestionarAcciones(true)}
              className="btn btn-secondary"
              style={{ padding: '0.6rem', borderRadius: 'var(--radius-md)', flexShrink: 0 }}
              title="Gestionar variantes de PDF Único (agregar, renombrar, desactivar)"
            >
              <Settings2 size={16} />
            </button>
          </div>

          {currentAccion && (
            <>
              <div style={{
                border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                padding: '0.85rem', background: 'var(--color-bg-surface)',
              }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                  Ejemplo con los archivos de este cliente — {currentAccion.nombre}
                </div>
                {exampleLoading ? (
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Loader2 size={14} className="animate-spin" /> Cargando...
                  </div>
                ) : exampleSlots.length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                    Todavía no hay un checklist configurado para "{currentAccion.nombre}". Usá la ruedita de arriba para definirlo.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {exampleSlots.map((s, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.8rem' }}>
                        <span style={{ color: 'var(--color-text-secondary)' }}>{s.label}{s.obligatorio ? ' *' : ''}</span>
                        {s.matchedDoc ? (
                          <span style={{ color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>
                            <CheckCircle2 size={12} style={{ flexShrink: 0 }} /> {s.matchedDoc.nombre_archivo}
                          </span>
                        ) : (
                          <span style={{ color: s.obligatorio ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>— falta —</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                className="btn btn-primary"
                onClick={handleGenerarPdfUnico}
                style={{ padding: '0.5rem 0.9rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', borderRadius: '6px' }}
              >
                <Files size={14} /> Generar PDF Único
              </button>
            </>
          )}
        </div>
      </section>

      {/* Modals */}
      <Suspense fallback={null}>
        {editorTemplate && (
          <TemplateEditorModal
            template={editorTemplate}
            client={fullClientData}
            onClose={() => setEditorTemplate(null)}
            onSaved={fetchTemplates}
          />
        )}

        {previewTemplate && (
          <TemplatePreviewModal
            template={previewTemplate}
            client={fullClientData}
            onClose={() => setPreviewTemplate(null)}
            onGenerate={onGenerate}
          />
        )}

        {showHtmlBuilder && (
          <HtmlTemplateBuilder
            onClose={() => setShowHtmlBuilder(false)}
            onSaved={() => {
              setShowHtmlBuilder(false);
              fetchTemplates();
            }}
          />
        )}

        {showDocumentoUnico && currentAccion && (
          <DocumentoUnicoModal
            tramiteCatalogo={currentAccion}
            title={currentAccion?.nombre}
            client={client}
            documentos={documentos}
            onClose={() => setShowDocumentoUnico(false)}
            onGenerated={() => {
              setShowDocumentoUnico(false);
              if (onGenerate) onGenerate();
            }}
          />
        )}

        {checklistCatalogo && (
          <RequisitosDocumentosModal
            tramite={checklistCatalogo}
            onClose={() => setChecklistCatalogo(null)}
            onSaved={() => {
              setChecklistCatalogo(null);
              setExampleRefreshTick(t => t + 1);
            }}
          />
        )}

        {showGestionarAcciones && (
          <GestionarFastopAccionesModal
            tipo="pdf_unico"
            tipoLabel="PDF Único"
            onClose={() => setShowGestionarAcciones(false)}
            onChanged={() => setAccionesRefreshTick(t => t + 1)}
          />
        )}
      </Suspense>
    </>
  );
}

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, Download, Loader2, RefreshCw, ChevronDown, FileText, PenTool, MousePointer2, Printer, ChevronLeft, ChevronRight } from 'lucide-react';
import { getFilledPdfBlob, getExtendedClientFields, getClientFieldValue, printDocumentBlob } from '../services/templateService';
import { getDocuments, getSignedUrl } from '../services/storageService';
import { convertPdfPageToImageBase64 } from '../services/pdfToImage';
import toast from 'react-hot-toast';

export default function TemplatePreviewModal({ template, client, onClose, onGenerate }) {
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null);
  
  // editableValues contains the overrides the user has set for specific pdfFieldNames
  const [editableValues, setEditableValues] = useState({});
  const [localMappings, setLocalMappings] = useState([]);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [availableFields, setAvailableFields] = useState([]);

  // Signature states
  const [signatures, setSignatures] = useState([]);
  const [signatureMode, setSignatureMode] = useState(false);
  const [selectedSignature, setSelectedSignature] = useState(null);
  const [placedSignatures, setPlacedSignatures] = useState([]);
  
  const [activePage, setActivePage] = useState(0); // 0-indexed
  const [totalPages, setTotalPages] = useState(1);
  const [pageImages, setPageImages] = useState({});
  const [isExtractingPdf, setIsExtractingPdf] = useState(false);

  // "Efecto de hoja escaneada"
  const [scanEffect, setScanEffect] = useState(false);

  const pdfContainerRef = useRef(null);

  useEffect(() => {
    getExtendedClientFields().then(setAvailableFields);
    getDocuments(client.id).then(async docs => {
      const firmas = docs.filter(d => d.tipo_documento === 'FIRMA_DIGITAL');
      const resolved = await Promise.all(firmas.map(async f => {
        try {
          const signedUrl = await getSignedUrl(f.url_archivo);
          return { ...f, url_archivo: signedUrl };
        } catch (err) {
          console.error('Error resolviendo URL de firma:', f.nombre_archivo, err);
          return null;
        }
      }));
      setSignatures(resolved.filter(Boolean));
    }).catch(console.error);
  }, [client.id]);

  // Pre-load mappings and generate initial preview
  const loadPreview = useCallback(async () => {
    setLoading(true);
    try {
      const loadedMappings = template.field_mappings || [];
      setLocalMappings(loadedMappings);

      const blob = await getFilledPdfBlob(template.url_archivo, loadedMappings, client, editableValues, placedSignatures);
      const url = URL.createObjectURL(blob);
      setPdfPreviewUrl(url);
      setPageImages({});
    } catch (err) {
      console.error('Error loading preview:', err);
    } finally {
      setLoading(false);
    }
  }, [template, client, editableValues, placedSignatures]);

  // Initial load only
  useEffect(() => {
    loadPreview();
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpdatePreview = async () => {
    setLoading(true);
    try {
      const blob = await getFilledPdfBlob(template.url_archivo, localMappings, client, editableValues, placedSignatures);
      const url = URL.createObjectURL(blob);
      
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(url);
      setPageImages({});
    } catch (err) {
      console.error('Error updating preview:', err);
    } finally {
      setLoading(false);
      setSignatureMode(false);
    }
  };

  const loadPageImage = useCallback(async (pageIdx, previewUrl) => {
    const urlToUse = previewUrl || pdfPreviewUrl;
    if (!urlToUse) return;
    setIsExtractingPdf(true);
    try {
      const res = await fetch(urlToUse);
      const blob = await res.blob();
      const file = new File([blob], 'doc.pdf', { type: 'application/pdf' });
      const { base64, totalPages: pagesCount } = await convertPdfPageToImageBase64(file, pageIdx + 1);
      setPageImages(prev => ({ ...prev, [pageIdx]: base64 }));
      setTotalPages(pagesCount);
    } catch (e) {
      console.error(e);
      toast.error("Error al renderizar la página para firmar.");
    } finally {
      setIsExtractingPdf(false);
    }
  }, [pdfPreviewUrl]);

  const toggleSignatureMode = async () => {
    if (!signatureMode) {
      setSignatureMode(true);
      if (!pageImages[activePage] && pdfPreviewUrl) {
        await loadPageImage(activePage, pdfPreviewUrl);
      }
    } else {
      setSignatureMode(false);
      setSelectedSignature(null);
    }
  };

  const handlePageChange = async (newPageIdx) => {
    if (newPageIdx < 0 || newPageIdx >= totalPages) return;
    setActivePage(newPageIdx);
    if (!pageImages[newPageIdx] && pdfPreviewUrl) {
      await loadPageImage(newPageIdx, pdfPreviewUrl);
    }
  };

  const getClientValue = (clientData, kommoFieldId) => getClientFieldValue(clientData, kommoFieldId);

  const handleGenerateFinal = async () => {
    setGenerating(true);
    try {
      let blob = await getFilledPdfBlob(template.url_archivo, localMappings, client, editableValues, placedSignatures);

      if (scanEffect) {
        const { applyScannedLook } = await import('../services/templateService');
        blob = await applyScannedLook(await blob.arrayBuffer());
      }

      const url = URL.createObjectURL(blob);
      const filename = `${template.nombre.replace(/\.[^/.]+$/, "")}_${client.nombre || 'documento'}.pdf`;

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const { uploadGeneratedDocumentToClient } = await import('../services/templateService');
      await uploadGeneratedDocumentToClient(blob, filename, client);
      
      if (onGenerate) onGenerate();
    } catch (err) {
      console.error(err);
      toast.error('Error generando PDF: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handlePrintFinal = async () => {
    setGenerating(true);
    try {
      let blob = await getFilledPdfBlob(template.url_archivo, localMappings, client, editableValues, placedSignatures);

      if (scanEffect) {
        const { applyScannedLook } = await import('../services/templateService');
        blob = await applyScannedLook(await blob.arrayBuffer());
      }

      const filename = `${template.nombre.replace(/\.[^/.]+$/, "")}_${client.nombre || 'documento'}`;
      await printDocumentBlob(blob, filename);
    } catch (err) {
      console.error(err);
      toast.error('Error al imprimir PDF: ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  const DEFAULT_SIG_WIDTH = 0.25;
  const DEFAULT_SIG_HEIGHT = 0.10;
  const MIN_DRAG = 0.015;

  const [dragRect, setDragRect] = useState(null);
  const isDraggingRef = useRef(false);

  const relativePoint = (e, container) => {
    const rect = container.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  };

  const handlePdfMouseDown = (e) => {
    if (!signatureMode || !selectedSignature) return;
    const { x, y } = relativePoint(e, e.currentTarget);
    isDraggingRef.current = true;
    setDragRect({ startX: x, startY: y, x, y, width: 0, height: 0 });
  };

  const handlePdfMouseMove = (e) => {
    if (!isDraggingRef.current) return;
    const { x, y } = relativePoint(e, e.currentTarget);
    setDragRect(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        x: Math.min(prev.startX, x),
        y: Math.min(prev.startY, y),
        width: Math.abs(x - prev.startX),
        height: Math.abs(y - prev.startY),
      };
    });
  };

  const finishPlacingSignature = () => {
    if (!isDraggingRef.current || !dragRect || !selectedSignature) {
      isDraggingRef.current = false;
      setDragRect(null);
      return;
    }
    isDraggingRef.current = false;

    let { x, y, width, height, startX, startY } = dragRect;
    if (width < MIN_DRAG && height < MIN_DRAG) {
      width = DEFAULT_SIG_WIDTH;
      height = DEFAULT_SIG_HEIGHT;
      x = startX - width / 2;
      y = startY - height / 2;
    }

    setPlacedSignatures(prev => [...prev, {
      id: Date.now(),
      url: selectedSignature.url_archivo,
      x, y, width, height,
      page: activePage
    }]);

    setSelectedSignature(null);
    setDragRect(null);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'var(--color-bg-base)',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '1rem 1.5rem', background: 'var(--color-bg-elevated)',
        borderBottom: '1px solid var(--color-border)', flexShrink: 0,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding: '0.5rem' }}>
            <X size={20} />
          </button>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Vista Previa de Generación</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{template.nombre}</p>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div style={{ paddingRight: '1rem', borderRight: '1px solid var(--color-border)' }}>
             <button
              onClick={toggleSignatureMode}
              disabled={isExtractingPdf}
              className={`btn ${signatureMode ? 'btn-primary' : 'btn-secondary'}`}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: signatureMode ? 'white' : '#0055ff', borderColor: 'rgba(0,85,255,0.2)' }}
             >
               {isExtractingPdf ? <Loader2 size={16} className="animate-spin" /> : <PenTool size={16} />}
               {signatureMode ? 'Salir de Firma' : 'Añadir Firma'}
             </button>
          </div>

          {signatureMode && totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'var(--color-bg-surface)', padding: '0.25rem 0.6rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => handlePageChange(activePage - 1)}
                disabled={activePage <= 0 || isExtractingPdf}
                title="Página Anterior"
                style={{ padding: '0.25rem' }}
              >
                <ChevronLeft size={16} />
              </button>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, minWidth: '85px', textAlign: 'center' }}>
                Pág. {activePage + 1} / {totalPages}
              </span>
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => handlePageChange(activePage + 1)}
                disabled={activePage >= totalPages - 1 || isExtractingPdf}
                title="Página Siguiente"
                style={{ padding: '0.25rem' }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}

          <button
            onClick={handleUpdatePreview}
            disabled={loading}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Actualizar Vista
          </button>

          <label
            title="Rasteriza el PDF final con leve rotación, grano y viñeta para que se vea como una hoja escaneada en vez de un PDF digital."
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--color-text-secondary)', cursor: 'pointer', userSelect: 'none' }}
          >
            <input type="checkbox" checked={scanEffect} onChange={(e) => setScanEffect(e.target.checked)} style={{ width: '1rem', height: '1rem', cursor: 'pointer' }} />
            Efecto escaneado
          </label>

          <button
            onClick={handlePrintFinal}
            disabled={loading || generating}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            title="Imprimir PDF final"
          >
            {generating ? <Loader2 size={16} className="animate-spin" /> : <Printer size={16} />}
            Imprimir
          </button>

          <button
            onClick={handleGenerateFinal}
            disabled={loading || generating}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--color-success)', color: 'white', border: 'none' }}
          >
            {generating ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Descargar PDF Final
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: PDF Preview iframe */}
        <div 
          style={{ flex: 1, position: 'relative', background: '#e5e7eb', overflow: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: signatureMode ? '2rem' : 0 }}
          ref={pdfContainerRef}
        >
          {loading && !pdfPreviewUrl && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
              <Loader2 size={40} className="animate-spin text-blue-500 mb-4" />
              <span className="text-gray-500 font-medium">Generando previsualización...</span>
            </div>
          )}
          
          {signatureMode && isExtractingPdf && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}>
              <Loader2 size={40} className="animate-spin text-blue-500 mb-4" />
              <span className="text-gray-500 font-medium">Cargando página {activePage + 1}...</span>
            </div>
          )}

          {!signatureMode && pdfPreviewUrl && (
            <iframe 
              src={`${pdfPreviewUrl}#toolbar=0&navpanes=0&scrollbar=0`} 
              style={{ width: '100%', height: '100%', border: 'none' }}
              title="PDF Preview"
            />
          )}

          {signatureMode && pageImages[activePage] && !isExtractingPdf && (
            <div
               style={{ position: 'relative', cursor: selectedSignature ? 'crosshair' : 'default', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', userSelect: 'none' }}
               onMouseDown={handlePdfMouseDown}
               onMouseMove={handlePdfMouseMove}
               onMouseUp={finishPlacingSignature}
               onMouseLeave={() => { if (isDraggingRef.current) finishPlacingSignature(); }}
            >
               <img src={pageImages[activePage]} alt={`PDF Page ${activePage + 1}`} style={{ maxWidth: '100%', display: 'block' }} draggable={false} />

               {/* Overlay placed signatures visually for CURRENT page */}
               {placedSignatures.filter(sig => (sig.page || 0) === activePage).map(sig => (
                 <img
                    key={sig.id}
                    src={sig.url}
                    alt="Firma"
                    style={{
                      position: 'absolute',
                      left: `${sig.x * 100}%`,
                      top: `${sig.y * 100}%`,
                      width: `${sig.width * 100}%`,
                      height: `${sig.height * 100}%`,
                      objectFit: 'contain',
                      pointerEvents: 'none',
                      filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.2))'
                    }}
                 />
               ))}

               {/* Rectángulo en vivo mientras se arrastra */}
               {dragRect && (
                 <div style={{
                   position: 'absolute',
                   left: `${dragRect.x * 100}%`,
                   top: `${dragRect.y * 100}%`,
                   width: `${dragRect.width * 100}%`,
                   height: `${dragRect.height * 100}%`,
                   border: '2px dashed var(--color-primary)',
                   background: 'rgba(37,99,235,0.12)',
                   pointerEvents: 'none',
                 }} />
               )}

               {!selectedSignature && (
                 <div style={{ position: 'absolute', top: '1rem', left: '1rem', background: 'rgba(255,255,255,0.9)', padding: '0.5rem 1rem', borderRadius: '4px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', fontWeight: 600, color: 'var(--color-primary)' }}>
                   Selecciona una firma a la derecha (Pág. {activePage + 1})
                 </div>
               )}
               {selectedSignature && (
                 <div style={{ position: 'absolute', top: '1rem', left: '1rem', background: 'rgba(255,255,255,0.9)', padding: '0.5rem 1rem', borderRadius: '4px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', fontWeight: 600, color: 'var(--color-primary)' }}>
                   Arrastrá para definir el tamaño en la Pág. {activePage + 1}
                 </div>
               )}
            </div>
          )}
        </div>

        {/* Right: Field panel */}
        <div style={{
          width: '350px', background: 'var(--color-bg-base)',
          borderLeft: '1px solid var(--color-border)', display: 'flex',
          flexDirection: 'column', flexShrink: 0,
        }}>
          {signatureMode ? (
             <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <PenTool size={16} /> Firmas Disponibles
                </h3>
                {signatures.length === 0 ? (
                  <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>No tienes firmas guardadas para este cliente. Añádelas desde la vista del cliente.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {signatures.map(sig => (
                      <div 
                        key={sig.id} 
                        onClick={() => setSelectedSignature(sig)}
                        style={{ 
                          border: `2px solid ${selectedSignature?.id === sig.id ? 'var(--color-primary)' : 'var(--color-border)'}`,
                          borderRadius: 'var(--radius-md)', padding: '0.5rem', cursor: 'pointer',
                          background: 'repeating-conic-gradient(#f0f0f0 0% 25%, transparent 0% 50%) 50% / 20px 20px',
                        }}
                      >
                         <img src={sig.url_archivo} alt="Firma" style={{ width: '100%', maxHeight: '100px', objectFit: 'contain' }} />
                      </div>
                    ))}
                  </div>
                )}

                {placedSignatures.length > 0 && (
                  <div style={{ marginTop: '2rem' }}>
                     <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.5rem' }}>Firmas Colocadas</h3>
                     {placedSignatures.map((ps, i) => (
                       <div key={ps.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', background: 'var(--color-bg-secondary)', borderRadius: '4px', marginBottom: '0.5rem' }}>
                         <span style={{ fontSize: '0.8rem' }}>Firma {i + 1} (Pág. {(ps.page || 0) + 1})</span>
                         <button 
                           onClick={() => setPlacedSignatures(prev => prev.filter(p => p.id !== ps.id))}
                           style={{ color: 'var(--color-danger)', cursor: 'pointer', background: 'none', border: 'none' }}
                         >
                           <X size={14} />
                         </button>
                       </div>
                     ))}
                  </div>
                )}
             </div>
          ) : (
            <>
              <div style={{
                padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)',
              }}>
                <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                  Datos del Cliente
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  Revisa y modifica los valores antes de generar el PDF final.
                </p>
              </div>

              <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
                {localMappings.map((mapping, idx) => {
                  let defaultValue = '';
                  if (mapping.isCustomText) {
                    defaultValue = mapping.fieldLabel || mapping.customValue || '';
                  } else {
                    defaultValue = getClientValue(client, mapping.kommoFieldId || mapping.fieldId);
                  }
                  
                  const currentValue = editableValues[mapping.pdfFieldName] !== undefined 
                    ? editableValues[mapping.pdfFieldName] 
                    : defaultValue;

                  const isEmpty = !currentValue.trim();

                  return (
                    <div
                      key={idx}
                      style={{
                        padding: '0.65rem 0.75rem', marginBottom: '0.5rem',
                        background: 'var(--color-bg-secondary)',
                        borderRadius: 'var(--radius-md)',
                        border: `1px solid ${isEmpty ? 'rgba(239,68,68,0.3)' : 'var(--color-border)'}`,
                      }}
                    >
                      <label style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        fontSize: '0.75rem', color: 'var(--color-text-muted)',
                        marginBottom: '0.4rem', fontWeight: 600,
                      }}>
                        <FileText size={12} />
                        {mapping.pdfFieldName}
                        {isEmpty && (
                          <span style={{ color: 'var(--color-danger)', fontSize: '0.65rem', marginLeft: 'auto' }}>
                            ¡Vacío!
                          </span>
                        )}
                      </label>
                      
                      <div style={{ position: 'relative' }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                          <textarea
                            className="form-input"
                            value={currentValue}
                            onChange={(e) => {
                              setEditableValues(prev => ({
                                ...prev, 
                                [mapping.pdfFieldName]: e.target.value
                              }));
                            }}
                            style={{
                              fontSize: '0.85rem', padding: '0.5rem',
                              background: isEmpty ? 'rgba(239,68,68,0.05)' : 'var(--color-bg-base)',
                              width: '100%',
                              minHeight: '40px',
                              resize: 'vertical'
                            }}
                            placeholder="Escribe un valor..."
                            rows={currentValue.includes('\n') || currentValue.length > 40 ? 3 : 1}
                          />
                          
                          {!mapping.isCustomText && (
                            <button
                              onClick={() => setOpenDropdown(openDropdown === idx ? null : idx)}
                              style={{
                                position: 'absolute', right: '4px', top: '8px',
                                background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', cursor: 'pointer',
                                padding: '0.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                color: 'var(--color-text-muted)', borderRadius: '4px'
                              }}
                            >
                              <ChevronDown size={16} />
                            </button>
                          )}
                        </div>

                        {openDropdown === idx && (
                          <div style={{
                            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                            background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-md)', maxHeight: '200px', overflowY: 'auto',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.2)', marginTop: '4px'
                          }}>
                            {availableFields.map(field => {
                              const clientVal = getClientValue(client, field.id);
                              if (!clientVal) return null;
                              return (
                                <div
                                  key={field.id}
                                  onClick={() => {
                                    setEditableValues(prev => ({ ...prev, [mapping.pdfFieldName]: clientVal }));
                                    setOpenDropdown(null);
                                  }}
                                  style={{
                                    padding: '0.6rem', cursor: 'pointer', fontSize: '0.8rem',
                                    borderBottom: '1px solid var(--color-border)',
                                    display: 'flex', flexDirection: 'column', gap: '0.25rem'
                                  }}
                                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                >
                                  <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{field.label}</span>
                                  <span style={{ color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {clientVal}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {localMappings.length === 0 && (
                  <div style={{
                    textAlign: 'center', padding: '2rem',
                    color: 'var(--color-text-muted)', fontSize: '0.85rem',
                  }}>
                    Esta plantilla no tiene campos mapeados.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
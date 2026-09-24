import React, { useRef, useState } from 'react';
import { FileText, Loader2, UploadCloud, X, ChevronDown, ChevronUp, Layers, CheckSquare, Square, CheckCircle2, Circle, Wand2, Archive, RotateCcw } from 'lucide-react';
import { SignedImage } from './SignedImage';
import EmptyState from './ui/EmptyState';
import PreUploadDocumentModal from './PreUploadDocumentModal';
import DocumentMergerModal from './DocumentMergerModal';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';

const ClientDocuments = ({
  client,
  documentos = [],
  defaultExpanded = false,
  uploading,
  isDragging,
  draggedDocument,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handleFileUpload,
  setDraggedDocument,
  setDragOverRelId,
  setViewingDocument,
  handleDeleteDocument,
  stagedFile,
  setStagedFile,
  handleConfirmUpload,
  handleOrganizeDocuments,
  organizing = false,
  onRefresh // We'll assume the parent might pass this, or we can use window.location.reload as fallback or just nothing since ClientView doesn't pass it yet. We'll add it.
}) => {
  const [isSectionExpanded, setIsSectionExpanded] = useState(defaultExpanded);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [showMergerModal, setShowMergerModal] = useState(false);
  const [resolvedUrls, setResolvedUrls] = useState({});
  const [showDiscarded, setShowDiscarded] = useState(false);
  const inputRef = useRef(null);

  const visibleDocs = documentos.filter(d => d.estado !== 'rechazado');
  const discardedDocs = documentos.filter(d => d.estado === 'rechazado');

  const restoreDocument = async (doc) => {
    try {
      const { error } = await supabase.from('documentos_operacionales').update({ estado: 'pendiente', motivo_rechazo: null }).eq('id', doc.id);
      if (error) throw error;
      toast.success('Documento restaurado');
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Error restoring document:', err);
      toast.error('Error al restaurar el documento');
    }
  };

  React.useEffect(() => {
    let active = true;
    const fetchUrls = async () => {
      const urls = {};
      const { getSignedUrl } = await import('../services/storageService');
      for (const doc of documentos) {
        if (!doc.url_archivo) continue;
        if (doc.url_archivo.startsWith('http')) {
          urls[doc.id] = doc.url_archivo;
        } else {
          try {
            urls[doc.id] = await getSignedUrl(doc.url_archivo);
          } catch (e) {
            console.error('Error fetching signed url for drag:', e);
          }
        }
      }
      if (active) setResolvedUrls(urls);
    };
    fetchUrls();
    return () => { active = false; };
  }, [documentos]);

  const toggleVerification = async (doc) => {
    // Los documentos que llegaron por Kommo/WhatsApp (id uuid) viven en
    // documentos_pendientes y usan un booleano `verificado`, no el texto
    // `estado` de documentos_operacionales.
    const isPendiente = typeof doc.id === 'string' && doc.id.includes('-');
    const newStatus = doc.estado === 'verificado' ? 'pendiente' : 'verificado';
    try {
      const { error } = isPendiente
        ? await supabase.from('documentos_pendientes').update({ verificado: newStatus === 'verificado' }).eq('id', doc.id)
        : await supabase.from('documentos_operacionales').update({ estado: newStatus }).eq('id', doc.id);
      if (error) throw error;
      toast.success(`Documento marcado como ${newStatus}`);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Error toggling document verification:', err);
      toast.error('Error al actualizar el estado');
    }
  };

  const openFilePicker = () => inputRef.current?.click();

  const validTypesForMerge = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  const isValidForMerge = (doc) => {
    if (doc.tipo_contenido && validTypesForMerge.includes(doc.tipo_contenido)) return true;
    const name = (doc.nombre_archivo || '').toLowerCase();
    return name.endsWith('.pdf') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.webp');
  };

  const toggleSelection = (doc) => {
    setSelectedDocs(prev => {
      const exists = prev.find(d => d.id === doc.id);
      if (exists) return prev.filter(d => d.id !== doc.id);
      return [...prev, doc];
    });
  };

  const openMerger = () => {
    if (selectedDocs.length < 2) {
      alert('Selecciona al menos 2 documentos para juntar.');
      return;
    }
    setShowMergerModal(true);
  };

  return (
    <section id="documentos-subidos" className="glass-panel" style={{ overflow: 'hidden', flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: isSectionExpanded ? '1px solid var(--color-border)' : 'none', cursor: 'pointer' }} onClick={() => setIsSectionExpanded(!isSectionExpanded)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1 }}>
          <FileText size={18} color="var(--color-info)" />
          <h3 style={{ font: 'var(--font-section-title)', margin: 0, fontSize: '1rem' }}>Documentos ({visibleDocs.length})</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {selectionMode ? (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); openMerger(); }}
                className="btn btn-primary"
                style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', display: 'flex', gap: '4px', alignItems: 'center' }}
              >
                <Layers size={14} /> Juntar ({selectedDocs.length})
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setSelectionMode(false); setSelectedDocs([]); }}
                className="btn btn-ghost"
                style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem' }}
              >
                Cancelar
              </button>
            </>
          ) : (
            <>
              {handleOrganizeDocuments && visibleDocs.length > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleOrganizeDocuments(); }}
                  disabled={organizing}
                  className="btn btn-secondary"
                  style={{ padding: '0.4rem', color: 'var(--color-primary)' }}
                  title="Organizar con IA: extrae datos de todos los documentos, mueve los de otra persona y descarta los que no sirven"
                >
                  {organizing ? <Loader2 size={18} className="animate-spin" /> : <Wand2 size={18} />}
                </button>
              )}
              {visibleDocs.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setSelectionMode(true); setIsSectionExpanded(true); }}
                  className="btn btn-secondary"
                  style={{ padding: '0.4rem', color: 'var(--color-primary)' }}
                  title="Juntar documentos"
                >
                  <Layers size={18} />
                </button>
              )}
              <button onClick={(e) => { e.stopPropagation(); openFilePicker(); }} disabled={uploading} className="btn btn-ghost" style={{ padding: '0.4rem', color: 'var(--color-text-muted)' }} title="Subir documento">
                {uploading ? <Loader2 size={18} className="animate-spin" /> : <UploadCloud size={18} />}
              </button>
            </>
          )}
          {isSectionExpanded ? <ChevronUp size={18} color="var(--color-text-muted)" /> : <ChevronDown size={18} color="var(--color-text-muted)" />}
        </div>
      </div>

      {isSectionExpanded && (
        <div style={{ padding: '1.25rem' }}>
        <label
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openFilePicker();
          }
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--gap-sm, 8px)',
          minHeight: '60px',
          border: `1px dashed ${isDragging ? 'var(--brand-primary)' : 'var(--border-default)'}`,
          backgroundColor: isDragging ? 'var(--brand-primary-light)' : 'var(--surface-elevated)',
          borderRadius: 'var(--radius-md)',
          padding: '0.75rem',
          textAlign: 'center',
          cursor: uploading ? 'wait' : 'pointer',
          transition: 'all var(--transition-normal)',
          marginBottom: '1rem',
          color: isDragging ? 'var(--brand-primary)' : 'var(--color-text-muted)'
        }}
      >
        <input ref={inputRef} type="file" style={{ display: 'none' }} onChange={handleFileUpload} disabled={uploading} />
        <UploadCloud size={18} />
        <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>
          {uploading ? 'Subiendo...' : isDragging ? 'Suelta aquí' : 'Arrastra un documento o haz clic'}
        </span>
      </label>

      {visibleDocs.length > 0 ? (        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem'
        }}>
          {visibleDocs.map(doc => {
            const selected = draggedDocument?.id === doc.id;
            const verified = doc.estado === 'verificado';
            return (
              <div
                key={doc.id}
                role="button"
                tabIndex={0}
                draggable
                onKeyDown={(e) => { if (e.key === 'Enter') setViewingDocument(doc); }}
                onDragStart={(event) => {
                  setDraggedDocument(doc);
                  const dragUrl = resolvedUrls[doc.id] || doc.url_archivo;
                  event.dataTransfer.setData('text/plain', doc.nombre_archivo || 'documento');
                  event.dataTransfer.setData('application/json', JSON.stringify({
                    type: 'document_copy',
                    url: dragUrl,
                    nombre: doc.nombre_archivo || 'documento',
                    tipo: doc.tipo_contenido || 'application/octet-stream'
                  }));
                  const isPdf = dragUrl?.toLowerCase().split('?')[0].endsWith('.pdf') || doc.tipo_contenido === 'application/pdf';
                  const mimeType = doc.tipo_contenido || (isPdf ? 'application/pdf' : 'application/octet-stream');
                  let fileName = doc.nombre_archivo || 'documento';
                  if (!fileName.includes('.')) fileName += isPdf ? '.pdf' : '';
                  const safeFileName = fileName.replace(/\s+/g, '_');
                  event.dataTransfer.setData('DownloadURL', `${mimeType}:${safeFileName}:${dragUrl}`);
                  try { event.dataTransfer.setData('text/uri-list', dragUrl); } catch (_err) { }
                  event.dataTransfer.effectAllowed = 'copyLink';
                }}
                onDragEnd={() => { setDraggedDocument(null); setDragOverRelId(null); }}
                onDoubleClick={() => setViewingDocument(doc)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '0.75rem 1rem',
                  background: selected ? 'var(--brand-primary-light)' : 'var(--surface-elevated)',
                  border: `1px solid ${verified ? 'var(--color-success)' : 'var(--border-default)'}`,
                  borderRadius: 'var(--radius-md)',
                  cursor: selectionMode && isValidForMerge(doc) ? 'pointer' : 'grab',
                  opacity: selected || (selectionMode && !isValidForMerge(doc)) ? 0.6 : 1,
                  position: 'relative'
                }}
                onClick={() => {
                  if (selectionMode && isValidForMerge(doc)) {
                    toggleSelection(doc);
                  }
                }}
              >
                {/* Selection Checkbox */}
                {selectionMode && (
                  <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                    {isValidForMerge(doc) ? (
                      selectedDocs.find(d => d.id === doc.id) ? 
                        <CheckSquare size={20} color="var(--color-primary)" /> : 
                        <Square size={20} color="var(--color-text-muted)" />
                    ) : (
                      <div style={{ width: 20, height: 20 }} title="Formato no soportado para juntar" />
                    )}
                  </div>
                )}
                
                {/* Image Thumbnail or File Icon */}
                <div style={{ width: 36, height: 36, flexShrink: 0, borderRadius: '4px', overflow: 'hidden', background: 'var(--surface-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    {doc.url_archivo && doc.tipo_contenido?.startsWith('image/') ? (
                      <>
                        <SignedImage 
                          path={doc.url_archivo} 
                          alt={doc.nombre_archivo} 
                          loading="lazy" 
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                          onError={(e) => {
                            e.target.style.display = 'none';
                            if (e.target.nextElementSibling) {
                              e.target.nextElementSibling.style.display = 'flex';
                            }
                          }}
                        />
                        <div style={{ display: 'none', position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
                        <FileText size={20} color="var(--color-info)" />
                      </div>
                    </>
                  ) : (
                    <FileText size={20} color="var(--color-info)" />
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {doc.nombre_archivo || 'Documento sin nombre'}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                    {doc.creado_en ? new Date(doc.creado_en).toLocaleDateString() : '—'} • {doc.tamano ? (doc.tamano / 1024).toFixed(0) + ' KB' : '—'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); toggleVerification(doc); }}
                    style={{
                      width: 24, height: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'transparent', color: verified ? 'var(--color-success)' : 'var(--color-text-muted)', border: 'none', cursor: 'pointer'
                    }}
                    title={verified ? 'Desmarcar verificación' : 'Marcar como verificado'}
                  >
                    {verified ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleDeleteDocument(doc); }}
                    style={{
                      width: 24, height: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'transparent', color: 'var(--color-text-muted)', border: 'none', cursor: 'pointer'
                    }}
                    title="Eliminar"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<FileText size={32} />}
          title="Sin documentos"
          description="Aún no hay documentos subidos para este cliente."
          actionLabel="Subir documento"
          onAction={openFilePicker}
          style={{ padding: 'var(--section-gap, 16px)' }}
        />
      )}

      {discardedDocs.length > 0 && (
        <div style={{ marginTop: '1rem' }}>
          <button
            type="button"
            onClick={() => setShowDiscarded(v => !v)}
            className="btn btn-ghost"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: 'var(--color-text-muted)', padding: '0.35rem 0' }}
          >
            <Archive size={14} /> Descartados ({discardedDocs.length}) {showDiscarded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showDiscarded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
              {discardedDocs.map(doc => (
                <div
                  key={doc.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.6rem 1rem',
                    background: 'var(--surface-elevated)', border: '1px dashed var(--border-default)',
                    borderRadius: 'var(--radius-md)', opacity: 0.7,
                  }}
                >
                  <FileText size={18} color="var(--color-text-muted)" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {doc.nombre_archivo || 'Documento sin nombre'}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                      {doc.motivo_rechazo || 'Descartado'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => restoreDocument(doc)}
                    className="btn btn-ghost btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', flexShrink: 0 }}
                    title="Restaurar documento"
                  >
                    <RotateCcw size={14} /> Restaurar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
      )}

      {stagedFile && (
        <PreUploadDocumentModal
          file={stagedFile}
          onClose={() => setStagedFile(null)}
          onConfirm={handleConfirmUpload}
        />
      )}

      {showMergerModal && (
        <DocumentMergerModal
          client={client}
          documents={selectedDocs}
          onClose={() => setShowMergerModal(false)}
          onSuccess={() => {
            setShowMergerModal(false);
            setSelectionMode(false);
            setSelectedDocs([]);
            if (onRefresh) onRefresh();
          }}
        />
      )}
    </section>
  );
};

export default ClientDocuments;
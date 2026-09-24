import React, { useState, useEffect, useRef } from 'react';
import { Play, Upload, Trash2, Loader2, FileVideo, ChevronDown, ChevronUp, Search, AlignLeft, Plus, Copy, X, FileText, Image as ImageIcon, Download } from 'lucide-react';
import { getMediaLibrary, uploadMedia, deleteMedia, addTemplate, resolveMediaUrl } from '../services/mediaLibraryService';
import toast from 'react-hot-toast';
import { createPortal } from 'react-dom';

export default function ClientMediaLibrary({ defaultExpanded = false }) {
  const [activeTab, setActiveTab] = useState('audios');
  const [isSectionExpanded, setIsSectionExpanded] = useState(defaultExpanded);
  const [mediaItems, setMediaItems] = useState([]);
  const [resolvedUrls, setResolvedUrls] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateText, setTemplateText] = useState('');

  useEffect(() => {
    fetchMedia();
  }, []);

  const fetchMedia = async () => {
    setLoading(true);
    const { data } = await getMediaLibrary();
    if (data) {
      setMediaItems(data);
      // El bucket es privado — url_archivo es una ruta relativa (o una URL
      // pública vieja), hay que resolverla a una URL firmada para poder
      // reproducir/descargar/arrastrar el archivo.
      const entries = await Promise.all(
        data.map(async (item) => [item.id, await resolveMediaUrl(item)])
      );
      setResolvedUrls(Object.fromEntries(entries));
    }
    setLoading(false);
  };

  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    let lastUploadedType = '';

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const { error } = await uploadMedia(file);
      if (error) {
        alert(`Error al subir ${file.name}: ` + error);
      } else {
        lastUploadedType = file.type;
      }
    }

    await fetchMedia();
    if (lastUploadedType.startsWith('video/')) setActiveTab('videos');
    else if (lastUploadedType.startsWith('audio/')) setActiveTab('audios');
    else if (lastUploadedType.startsWith('image/')) setActiveTab('imagenes');
    else if (lastUploadedType) setActiveTab('documentos');

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleTemplateSave = async () => {
    if (!templateName.trim() || !templateText.trim()) {
      toast.error('Por favor, completa ambos campos');
      return;
    }
    setUploading(true);
    const { error } = await addTemplate(templateName.trim(), templateText.trim());
    setUploading(false);
    if (error) {
      toast.error('Error al guardar plantilla');
    } else {
      toast.success('Plantilla guardada');
      setShowTemplateModal(false);
      setTemplateName('');
      setTemplateText('');
      fetchMedia();
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado al portapapeles');
  };

  const handleDelete = async (id, url) => {
    if (!window.confirm('¿Seguro que quieres eliminar este archivo?')) return;
    await deleteMedia(id, url);
    await fetchMedia();
  };

  const handleDragStart = (e, item) => {
    const url = resolvedUrls[item.id];
    if (!url) { e.preventDefault(); return; }
    e.dataTransfer.setData('text/plain', url);
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'media_library_item',
      nombre: item.nombre,
      url,
      tipo: item.tipo_contenido
    }));
    
    if (item.tipo_contenido !== 'template') {
      const isPdf = url.toLowerCase().split('?')[0].endsWith('.pdf') || item.tipo_contenido === 'application/pdf';
      const mimeType = item.tipo_contenido || (isPdf ? 'application/pdf' : 'application/octet-stream');
      let fileName = item.nombre || 'archivo';
      if (!fileName.includes('.')) fileName += isPdf ? '.pdf' : '';
      const safeFileName = fileName.replace(/\s+/g, '_');
      e.dataTransfer.setData('DownloadURL', `${mimeType}:${safeFileName}:${url}`);
      try { e.dataTransfer.setData('text/uri-list', url); } catch (_err) { }
    }
    
    e.dataTransfer.effectAllowed = 'copy';
  };

  const filteredItems = mediaItems.filter(item => {
    let matchesTab = false;
    if (activeTab === 'audios') matchesTab = item.tipo_contenido.startsWith('audio/');
    else if (activeTab === 'videos') matchesTab = item.tipo_contenido.startsWith('video/');
    else if (activeTab === 'plantillas') matchesTab = item.tipo_contenido === 'template';
    else if (activeTab === 'imagenes') matchesTab = item.tipo_contenido.startsWith('image/');
    else if (activeTab === 'documentos') {
      matchesTab = !item.tipo_contenido.startsWith('audio/')
        && !item.tipo_contenido.startsWith('video/')
        && !item.tipo_contenido.startsWith('image/')
        && item.tipo_contenido !== 'template';
    }

    const matchesSearch = item.nombre.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
      
      {/* Header with Upload */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: 'var(--surface-base)' }}>
        <div 
          onClick={() => setIsSectionExpanded(!isSectionExpanded)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
        >
          {isSectionExpanded ? <ChevronUp size={16} color="var(--color-text-secondary)" /> : <ChevronDown size={16} color="var(--color-text-secondary)" />}
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-secondary)', userSelect: 'none' }}>
            Biblioteca Global
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {activeTab === 'plantillas' ? (
            <button 
              onClick={() => setShowTemplateModal(true)} 
              disabled={uploading} 
              style={{ 
                background: '#00a884', color: 'white', border: 'none', 
                padding: '0.35rem 0.75rem', borderRadius: '4px', fontSize: '0.75rem', 
                display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: uploading ? 'wait' : 'pointer'
              }}
            >
              <Plus size={14} />
              Nueva
            </button>
          ) : (
            <button 
              onClick={() => fileInputRef.current?.click()} 
              disabled={uploading} 
              style={{ 
                background: 'var(--color-primary)', color: 'white', border: 'none', 
                padding: '0.35rem 0.75rem', borderRadius: '4px', fontSize: '0.75rem', 
                display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: uploading ? 'wait' : 'pointer'
              }}
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              Subir
            </button>
          )}
        </div>
        <input type="file" ref={fileInputRef} onChange={handleUpload} style={{ display: 'none' }} accept="audio/*,video/*,image/*,application/pdf,.doc,.docx,.txt" multiple />
      </div>

      {isSectionExpanded && (
        <>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', background: 'var(--surface-base)' }}>
            <button 
              onClick={() => setActiveTab('audios')}
              style={{ 
                flex: 1, padding: '0.6rem 1rem', fontSize: '0.8rem', fontWeight: 600, 
                color: activeTab === 'audios' ? 'white' : 'var(--color-text-muted)', 
                borderBottom: activeTab === 'audios' ? '2px solid #ff9800' : '2px solid transparent', 
                background: 'transparent', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              Audios pregrabados
            </button>
            <button 
              onClick={() => setActiveTab('videos')}
              style={{ 
                flex: 1, padding: '0.6rem 1rem', fontSize: '0.8rem', fontWeight: 600, 
                color: activeTab === 'videos' ? 'white' : 'var(--color-text-muted)', 
                borderBottom: activeTab === 'videos' ? '2px solid #ff9800' : '2px solid transparent', 
                background: 'transparent', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              Videos
            </button>
            <button 
              onClick={() => setActiveTab('plantillas')}
              style={{ 
                flex: 1, padding: '0.6rem 1rem', fontSize: '0.8rem', fontWeight: 600, 
                color: activeTab === 'plantillas' ? 'white' : 'var(--color-text-muted)', 
                borderBottom: activeTab === 'plantillas' ? '2px solid #00a884' : '2px solid transparent', 
                background: 'transparent', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              Plantillas
            </button>
            <button
              onClick={() => setActiveTab('documentos')}
              style={{
                flex: 1, padding: '0.6rem 1rem', fontSize: '0.8rem', fontWeight: 600,
                color: activeTab === 'documentos' ? 'white' : 'var(--color-text-muted)',
                borderBottom: activeTab === 'documentos' ? '2px solid #3b82f6' : '2px solid transparent',
                background: 'transparent', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              Documentos
            </button>
            <button
              onClick={() => setActiveTab('imagenes')}
              style={{
                flex: 1, padding: '0.6rem 1rem', fontSize: '0.8rem', fontWeight: 600,
                color: activeTab === 'imagenes' ? 'white' : 'var(--color-text-muted)',
                borderBottom: activeTab === 'imagenes' ? '2px solid #a855f7' : '2px solid transparent',
                background: 'transparent', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              Imágenes
            </button>
          </div>

          {/* Search Bar */}
          <div style={{ padding: '0.5rem 1rem', background: 'var(--color-bg-canvas)', borderBottom: '1px solid var(--color-border)' }}>
            <div style={{ position: 'relative' }}>
              <input 
                type="text" 
                placeholder={`Buscar ${activeTab}...`} 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ width: '100%', padding: '0.4rem 0.75rem 0.4rem 2rem', borderRadius: '6px', border: '1px solid var(--color-border)', outline: 'none', fontSize: '0.8rem', background: 'var(--surface-base)', color: 'var(--color-text-primary)' }}
              />
              <Search size={14} style={{ position: 'absolute', left: '0.6rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
            </div>
          </div>

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto', maxHeight: '350px', background: 'var(--color-bg-canvas)', position: 'relative' }}>
            {loading && (
              <div style={{ padding: '2rem', display: 'flex', justifyContent: 'center' }}>
                <Loader2 size={24} className="animate-spin" color="var(--color-text-muted)" />
              </div>
            )}

            {!loading && filteredItems.length === 0 && (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
                No hay {activeTab} {activeTab === 'imagenes' ? 'subidas' : 'subidos'} a la biblioteca.
              </div>
            )}

            {!loading && filteredItems.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {filteredItems.map((item) => {
                const itemUrl = resolvedUrls[item.id];
                const isBroken = item.tipo_contenido !== 'template' && !itemUrl;
                return (
                  <div
                    key={item.id}
                    draggable={!isBroken}
                    onDragStart={(e) => handleDragStart(e, item)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '0.5rem 1rem', borderBottom: '1px solid var(--color-border)',
                      cursor: isBroken ? 'default' : 'grab', transition: 'background 0.2s',
                      opacity: isBroken ? 0.6 : 1
                    }}
                    onMouseOver={(e) => e.currentTarget.style.background = 'var(--surface-elevated)'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                    title={isBroken ? 'Archivo no disponible — hay que volver a subirlo' : 'Arrastra este archivo al chat de WhatsApp o haz clic derecho para copiar la ruta'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden', flex: 1 }}>
                      <div style={{
                        width: '24px', height: '24px', borderRadius: '50%',
                        background: activeTab === 'audios' ? '#ff9800' : activeTab === 'videos' ? '#e91e63' : activeTab === 'documentos' ? '#3b82f6' : activeTab === 'imagenes' ? '#a855f7' : '#00a884',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, color: 'white'
                      }}>
                        {activeTab === 'audios' ? <Play size={12} fill="white" /> : activeTab === 'videos' ? <FileVideo size={12} /> : activeTab === 'documentos' ? <FileText size={12} /> : activeTab === 'imagenes' ? <ImageIcon size={12} /> : <AlignLeft size={12} />}
                      </div>

                      {isBroken ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.nombre}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--color-danger)' }}>
                            Archivo no disponible — hay que volver a subirlo
                          </span>
                        </div>
                      ) : activeTab === 'audios' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.nombre}
                          </span>
                          <audio
                            controls
                            src={itemUrl}
                            style={{ height: '28px', maxWidth: '100%' }} 
                            onPlay={(e) => {
                              const audios = document.getElementsByTagName('audio');
                              for (let i = 0; i < audios.length; i++) {
                                if (audios[i] !== e.target) {
                                  audios[i].pause();
                                  audios[i].currentTime = 0;
                                }
                              }
                            }}
                          />
                        </div>
                      ) : activeTab === 'videos' ? (
                        <a
                          href={itemUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-secondary)', textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                        >
                          {item.nombre}
                        </a>
                      ) : activeTab === 'imagenes' ? (
                        <a
                          href={itemUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden', textDecoration: 'none' }}
                        >
                          <img
                            src={itemUrl}
                            alt={item.nombre}
                            style={{ width: '32px', height: '32px', borderRadius: '4px', objectFit: 'cover', flexShrink: 0 }}
                          />
                          <span style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.nombre}
                          </span>
                        </a>
                      ) : activeTab === 'documentos' ? (
                        <a
                          href={itemUrl}
                          target="_blank"
                          rel="noreferrer"
                          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', fontWeight: 500, color: 'var(--color-text-secondary)', textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                        >
                          {item.nombre}
                          <Download size={12} style={{ flexShrink: 0, opacity: 0.7 }} />
                        </a>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden', cursor: 'pointer', flex: 1 }} onClick={() => copyToClipboard(item.url_archivo)}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.nombre}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {item.url_archivo}
                          </span>
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      {activeTab === 'plantillas' && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); copyToClipboard(item.url_archivo); }}
                          style={{ background: 'none', border: 'none', color: 'var(--color-info)', cursor: 'pointer', padding: '4px', opacity: 0.7 }}
                          onMouseOver={(e) => e.currentTarget.style.opacity = 1}
                          onMouseOut={(e) => e.currentTarget.style.opacity = 0.7}
                          title="Copiar texto"
                        >
                          <Copy size={14} />
                        </button>
                      )}
                      <button 
                        onClick={() => handleDelete(item.id, item.url_archivo)}
                      style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: '4px', opacity: 0.7 }}
                      onMouseOver={(e) => e.currentTarget.style.opacity = 1}
                      onMouseOut={(e) => e.currentTarget.style.opacity = 0.7}
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
          </div>
        </>
      )}
      
      {/* Modal para crear plantilla */}
      {showTemplateModal && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--color-bg-canvas)', padding: '1.5rem', borderRadius: '12px', width: '90%', maxWidth: '400px', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--color-text-primary)' }}>Nueva Plantilla</h3>
              <button onClick={() => setShowTemplateModal(false)} style={{ background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Nombre / Título</label>
                <input 
                  type="text" 
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="Ej: Saludo inicial"
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--color-border)', outline: 'none', background: 'var(--surface-base)', color: 'var(--color-text-primary)' }}
                />
              </div>
              
              <div>
                <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Mensaje</label>
                <textarea 
                  value={templateText}
                  onChange={(e) => setTemplateText(e.target.value)}
                  placeholder="Escribe el contenido de la plantilla..."
                  rows={5}
                  style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--color-border)', outline: 'none', background: 'var(--surface-base)', color: 'var(--color-text-primary)', resize: 'vertical' }}
                />
              </div>
              
              <button 
                onClick={handleTemplateSave}
                disabled={uploading}
                style={{ width: '100%', padding: '0.75rem', background: '#00a884', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: uploading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem' }}
              >
                {uploading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Guardar Plantilla
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

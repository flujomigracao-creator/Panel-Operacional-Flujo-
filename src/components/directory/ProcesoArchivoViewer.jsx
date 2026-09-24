import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Download, X, FileText, Image as ImageIcon, Loader2, Minus, Plus, RotateCw } from 'lucide-react';
import { useSignedUrl } from '../../hooks/useSignedUrl';

// Ventana flotante para ver un archivo adjunto a un proceso de policía —
// mismo patrón visual (arrastrable/redimensionable, sin backdrop) que
// DocumentViewerModal.jsx usa para los documentos de clientes, pero sin las
// acciones específicas de esa tabla (renombrar, recortar/firmar, IA,
// "efecto escaneado"): estos archivos son solo formularios/ejemplos de
// referencia, no documentos que el equipo edite.
const BUCKET = 'policia_procesos';
const MIN_WIDTH = 320;
const MIN_HEIGHT = 240;
const ZOOM_STEP = 0.15;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;

export default function ProcesoArchivoViewer({ archivo, onClose }) {
  const [position, setPosition] = useState({ x: 80, y: 40 });
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeDirection, setResizeDirection] = useState(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0 });
  const [resizeStartSize, setResizeStartSize] = useState({ width: 0, height: 0 });
  const [resizeStartPos, setResizeStartPos] = useState({ x: 0, y: 0 });
  const [isDownloading, setIsDownloading] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

  const contentRef = useRef(null);
  const modalRef = useRef(null);

  const { signedUrl, loading: loadingUrl } = useSignedUrl(archivo?.url_archivo, 300, BUCKET);

  // Centrar en el montaje
  useEffect(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPosition({
      x: Math.max(20, (vw - 800) / 2),
      y: Math.max(20, (vh - 600) / 2),
    });
  }, []);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleMouseMove = useCallback((e) => {
    if (isDragging) {
      setPosition({
        x: Math.max(0, e.clientX - dragOffset.x),
        y: Math.max(0, e.clientY - dragOffset.y),
      });
    }
    if (resizeDirection) {
      const dx = e.clientX - resizeStart.x;
      const dy = e.clientY - resizeStart.y;

      let newWidth = resizeStartSize.width;
      let newHeight = resizeStartSize.height;
      let newX = resizeStartPos.x;
      let newY = resizeStartPos.y;

      const dir = resizeDirection;

      if (dir.includes('e')) {
        newWidth = Math.max(MIN_WIDTH, resizeStartSize.width + dx);
      }
      if (dir.includes('w')) {
        const delta = resizeStartSize.width - Math.max(MIN_WIDTH, resizeStartSize.width - dx);
        newWidth = resizeStartSize.width - delta;
        newX = resizeStartPos.x + delta;
      }
      if (dir.includes('s')) {
        newHeight = Math.max(MIN_HEIGHT, resizeStartSize.height + dy);
      }
      if (dir.includes('n')) {
        const delta = resizeStartSize.height - Math.max(MIN_HEIGHT, resizeStartSize.height - dy);
        newHeight = resizeStartSize.height - delta;
        newY = resizeStartPos.y + delta;
      }

      setSize({ width: newWidth, height: newHeight });
      setPosition({ x: newX, y: newY });
    }
    if (isPanning) {
      setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    }
  }, [isDragging, resizeDirection, isPanning, dragOffset, resizeStart, resizeStartSize, resizeStartPos, panStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    setResizeDirection(null);
    setIsPanning(false);
  }, []);

  useEffect(() => {
    if (isDragging || resizeDirection || isPanning) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, resizeDirection, isPanning, handleMouseMove, handleMouseUp]);

  const handleHeaderMouseDown = (e) => {
    if (e.button !== 0) return;
    const rect = modalRef.current.getBoundingClientRect();
    setDragOffset({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setIsDragging(true);
  };

  const handleResizeMouseDown = (direction, e) => {
    e.preventDefault();
    e.stopPropagation();
    setResizeDirection(direction);
    setResizeStart({ x: e.clientX, y: e.clientY });
    setResizeStartSize({ width: size.width, height: size.height });
    setResizeStartPos({ x: position.x, y: position.y });
  };

  const handleImageMouseDown = (e) => {
    if (zoom > 1 && e.button === 0) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
    }
  };

  const handleWheel = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom(prev => Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + delta)) * 100) / 100);
    }
  }, []);

  useEffect(() => {
    const contentEl = contentRef.current;
    if (contentEl) {
      contentEl.addEventListener('wheel', handleWheel, { passive: false });
      return () => contentEl.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel]);

  const handleZoomIn = () => setZoom(prev => Math.min(MAX_ZOOM, Math.round((prev + ZOOM_STEP) * 100) / 100));
  const handleZoomOut = () => setZoom(prev => Math.max(MIN_ZOOM, Math.round((prev - ZOOM_STEP) * 100) / 100));
  const handleZoomReset = () => { setZoom(1); setRotation(0); setPanOffset({ x: 0, y: 0 }); };
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);

  const nombre = archivo?.nombre_archivo || 'Archivo';
  const isPdfFallback = archivo?.url_archivo?.toLowerCase().endsWith('.pdf') || nombre.toLowerCase().endsWith('.pdf');
  const isImageFallback = nombre.match(/\.(jpeg|jpg|gif|png|webp)$/i);
  const isImage = archivo?.tipo_contenido?.startsWith('image/') || (!isPdfFallback && isImageFallback);
  const isPdf = archivo?.tipo_contenido === 'application/pdf' || isPdfFallback;

  const handleDownload = async () => {
    if (!signedUrl) return;
    setIsDownloading(true);
    try {
      const response = await fetch(signedUrl);
      if (!response.ok) throw new Error('Network response was not ok');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Download error:', err);
      window.open(signedUrl, '_blank', 'noopener,noreferrer');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleStyle = { position: 'absolute', zIndex: 10 };

  const edgeHandle = (dir, style) => (
    <div
      style={{ ...handleStyle, ...style, cursor: dir === 'n' || dir === 's' ? 'ns-resize' : 'ew-resize' }}
      onMouseDown={(e) => handleResizeMouseDown(dir, e)}
    />
  );

  const cornerHandle = (dir, style) => (
    <div
      style={{ ...handleStyle, width: '16px', height: '16px', ...style, cursor: dir === 'se' || dir === 'nw' ? 'nwse-resize' : 'nesw-resize' }}
      onMouseDown={(e) => handleResizeMouseDown(dir, e)}
    />
  );

  return (
    <div
      ref={modalRef}
      className="animate-fade-in"
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        minWidth: MIN_WIDTH,
        minHeight: MIN_HEIGHT,
        background: 'var(--color-bg-base)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        userSelect: isDragging || resizeDirection ? 'none' : 'auto',
        // El modal de edición (PoliciaModal) es un Dialog de Radix: mientras
        // está abierto, Radix pone pointer-events: none en el resto de la
        // página para volverlo inerte. Este visor se renderiza como
        // hermano de ese Dialog (no dentro de su portal), así que hereda
        // ese none y quedaba visualmente encima pero sin poder recibir
        // scroll/clicks — el scroll caía al Dialog de atrás. Se reactiva acá.
        pointerEvents: 'auto',
      }}
    >
      {edgeHandle('n', { top: -4, left: 8, right: 8, height: 8 })}
      {edgeHandle('s', { bottom: -4, left: 8, right: 8, height: 8 })}
      {edgeHandle('w', { left: -4, top: 8, bottom: 8, width: 8 })}
      {edgeHandle('e', { right: -4, top: 8, bottom: 8, width: 8 })}
      {cornerHandle('nw', { top: -8, left: -8 })}
      {cornerHandle('ne', { top: -8, right: -8 })}
      {cornerHandle('sw', { bottom: -8, left: -8 })}
      {cornerHandle('se', { bottom: -8, right: -8 })}

      <div
        onMouseDown={handleHeaderMouseDown}
        style={{
          padding: '0.75rem 1rem',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: isDragging ? 'grabbing' : 'grab',
          background: 'var(--color-bg-elevated)',
          flexShrink: 0,
          borderTopLeftRadius: 'var(--radius-lg)',
          borderTopRightRadius: 'var(--radius-lg)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', overflow: 'hidden', flex: 1, paddingRight: '1rem' }}>
          {isImage ? <ImageIcon size={18} color="var(--color-primary)" /> : <FileText size={18} color="var(--color-primary)" />}
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {nombre}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
          <button
            className="btn btn-primary btn-sm"
            onClick={handleDownload}
            disabled={isDownloading || !signedUrl}
            title="Descargar archivo"
            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
          >
            {isDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {isDownloading ? 'Descargando...' : 'Descargar'}
          </button>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding: '0.35rem', borderRadius: 'var(--radius-md)' }} title="Cerrar (Esc)">
            <X size={18} />
          </button>
        </div>
      </div>

      {isImage && (
        <div style={{ padding: '0.35rem 0.75rem', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--color-bg-surface)', flexShrink: 0 }}>
          <button className="btn btn-ghost" onClick={handleZoomOut} disabled={zoom <= MIN_ZOOM} title="Alejar (Ctrl + Rueda)" style={{ padding: '0.25rem', display: 'flex', alignItems: 'center' }}>
            <Minus size={14} />
          </button>
          <button className="btn btn-ghost" onClick={handleZoomReset} title="Restablecer zoom" style={{ padding: '0.15rem 0.5rem', fontSize: '0.72rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {Math.round(zoom * 100)}%
          </button>
          <button className="btn btn-ghost" onClick={handleZoomIn} disabled={zoom >= MAX_ZOOM} title="Acercar (Ctrl + Rueda)" style={{ padding: '0.25rem', display: 'flex', alignItems: 'center' }}>
            <Plus size={14} />
          </button>
          <div style={{ width: '1px', height: '16px', background: 'var(--color-border)', margin: '0 0.25rem' }} />
          <button className="btn btn-ghost" onClick={handleRotate} title="Rotar 90°" style={{ padding: '0.25rem', display: 'flex', alignItems: 'center' }}>
            <RotateCw size={14} />
          </button>
        </div>
      )}

      <div
        ref={contentRef}
        onMouseDown={handleImageMouseDown}
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-bg-base)',
          position: 'relative',
          cursor: isPanning ? 'grabbing' : (zoom > 1 ? 'grab' : 'default'),
          userSelect: 'none',
        }}
      >
        {isImage ? (
          <>
            {loadingUrl && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-muted)' }}>
                <Loader2 size={32} className="animate-spin" />
                <span style={{ fontSize: '0.875rem' }}>Obteniendo acceso seguro...</span>
              </div>
            )}
            {!imgLoaded && !imgError && !loadingUrl && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-muted)' }}>
                <Loader2 size={32} className="animate-spin" />
                <span style={{ fontSize: '0.875rem' }}>Cargando imagen...</span>
              </div>
            )}
            {imgError && !loadingUrl && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-muted)' }}>
                <ImageIcon size={48} opacity={0.4} />
                <span style={{ fontSize: '0.875rem' }}>No se pudo cargar la imagen</span>
              </div>
            )}
            {signedUrl && !loadingUrl && (
              <img
                src={signedUrl}
                alt={nombre}
                onLoad={() => setImgLoaded(true)}
                onError={() => setImgError(true)}
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg) translate(${panOffset.x / zoom}px, ${panOffset.y / zoom}px)`,
                  transformOrigin: 'center center',
                  maxWidth: zoom <= 1 ? '100%' : 'none',
                  maxHeight: zoom <= 1 ? '100%' : 'none',
                  objectFit: zoom <= 1 ? 'contain' : 'none',
                  display: imgLoaded && !imgError ? 'block' : 'none',
                  transition: isPanning ? 'none' : 'transform 0.1s ease-out',
                  pointerEvents: 'none',
                }}
                draggable={false}
              />
            )}
          </>
        ) : isPdf ? (
          <>
            {loadingUrl && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-muted)' }}>
                <Loader2 size={32} className="animate-spin" />
                <span style={{ fontSize: '0.875rem' }}>Obteniendo acceso seguro...</span>
              </div>
            )}
            {signedUrl && !loadingUrl && (
              <iframe src={signedUrl} title={nombre} style={{ width: '100%', height: '100%', border: 'none' }} />
            )}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', color: 'var(--color-text-muted)', padding: '2rem' }}>
            <FileText size={64} opacity={0.3} />
            <span style={{ fontSize: '1rem', fontWeight: 500, textAlign: 'center', wordBreak: 'break-word' }}>{nombre}</span>
            <span style={{ fontSize: '0.8rem' }}>Vista previa no disponible para este tipo de archivo</span>
          </div>
        )}
      </div>
    </div>
  );
}

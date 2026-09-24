import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Download, X, FileText, Image as ImageIcon, Loader2, Maximize2, Minus, Plus, RotateCw, Edit2, Check, Sparkles, Crop, Printer } from 'lucide-react';
import { supabase } from '../supabaseClient';
import ImageCropperModal from './ImageCropperModal';
import { useSignedUrl } from '../hooks/useSignedUrl';

const MIN_WIDTH = 320;
const MIN_HEIGHT = 240;
const ZOOM_STEP = 0.15;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;

export default function DocumentViewerModal({ document: doc, onClose, onAnalyze }) {
    const [position, setPosition] = useState({ x: 80, y: 40 });
    const [size, setSize] = useState({ width: 800, height: 600 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const [resizeDirection, setResizeDirection] = useState(null);
    const [resizeStart, setResizeStart] = useState({ x: 0, y: 0 });
    const [resizeStartSize, setResizeStartSize] = useState({ width: 0, height: 0 });
    const [resizeStartPos, setResizeStartPos] = useState({ x: 0, y: 0 });
    const [isDownloading, setIsDownloading] = useState(false);
    const [isPrinting, setIsPrinting] = useState(false);
    const [scanEffect, setScanEffect] = useState(false);
    const [imgLoaded, setImgLoaded] = useState(false);
    const [imgError, setImgError] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });
    const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
    const [isEditingName, setIsEditingName] = useState(false);
    const [newName, setNewName] = useState('');
    const [isSavingName, setIsSavingName] = useState(false);
    const [currentName, setCurrentName] = useState(doc?.nombre_archivo || 'Documento');
    const [currentUrl, setCurrentUrl] = useState(doc?.url_archivo);
    const [isCropping, setIsCropping] = useState(false);
    const [_isSavingCrop, setIsSavingCrop] = useState(false);

    const contentRef = useRef(null);
    const imgRef = useRef(null);
    const modalRef = useRef(null);
    const renameInputRef = useRef(null);

    const { signedUrl, loading: loadingUrl } = useSignedUrl(doc?.url_archivo, 60);

    useEffect(() => {
        setCurrentName(doc?.nombre_archivo || 'Documento');
        if (signedUrl) setCurrentUrl(signedUrl);
        else if (!doc?.url_archivo) setCurrentUrl(null);
    }, [doc?.nombre_archivo, doc?.url_archivo, signedUrl]);

    // Focus input when editing starts
    useEffect(() => {
        if (isEditingName && renameInputRef.current) {
            renameInputRef.current.focus();
            renameInputRef.current.select();
        }
    }, [isEditingName]);

    // Center on mount
    useEffect(() => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        setPosition({
            x: Math.max(20, (vw - 800) / 2),
            y: Math.max(20, (vh - 600) / 2),
        });
    }, []);

    // Close on Escape, Edit on F2
    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === 'Escape') {
                if (isEditingName) {
                    setIsEditingName(false);
                } else {
                    onClose();
                }
            }
            if (e.key === 'F2' && !isEditingName) {
                setIsEditingName(true);
                setNewName(currentName);
                e.preventDefault();
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose, isEditingName, currentName]);

    const handleSaveName = async () => {
        if (!newName.trim() || newName.trim() === currentName) {
            setIsEditingName(false);
            return;
        }
        setIsSavingName(true);
        try {
            const isUuid = typeof doc.id === 'string' && doc.id.includes('-');
            const table = isUuid ? 'documentos_pendientes' : 'documentos_operacionales';
            const { error } = await supabase.from(table).update({ nombre_archivo: newName.trim() }).eq('id', doc.id);
            if (error) throw error;
            setCurrentName(newName.trim());
            setIsEditingName(false);
            
            // Si el padre escucha un evento global de refresco (opcional)
            window.dispatchEvent(new CustomEvent('documentRenamed', { detail: { id: doc.id, newName: newName.trim() } }));
        } catch (err) {
            console.error('Error renaming:', err);
            alert('Error al guardar el nuevo nombre: ' + (err.message || err.toString()));
        } finally {
            setIsSavingName(false);
        }
    };

    const handleCropComplete = async (file, customName) => {
        setIsSavingCrop(true);
        try {
            // El archivo resultante puede ser un JPG (recorte/firma sobre imagen)
            // o un PDF (firma sobre un PDF) — la extensión y el tipo guardado
            // tienen que reflejar el archivo real, no asumir siempre imagen.
            const ext = file.type === 'application/pdf' ? 'pdf' : 'jpg';
            const uniqueName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
            const clientId = doc.id_cliente || doc.cliente_id || 'unassigned';

            // Empresa única, sin multi-tenant: mismo patrón de ruta que storageService.js
            // (sin prefijo de organización).
            const storagePath = `${clientId}/${uniqueName}`;

            const { error: uploadError } = await supabase.storage
                .from('documentos_operacionales')
                .upload(storagePath, file, { upsert: false });

            if (uploadError) throw uploadError;

            const isUuid = typeof doc.id === 'string' && doc.id.includes('-');
            const table = isUuid ? 'documentos_pendientes' : 'documentos_operacionales';

            const nameToSave = customName || currentName;

            const { error: updateError } = await supabase.from(table).update({
                url_archivo: storagePath,
                nombre_archivo: nameToSave,
                tipo_contenido: file.type,
            }).eq('id', doc.id);

            if (updateError) throw updateError;

            const { data: signedData } = await supabase.storage
                .from('documentos_operacionales')
                .createSignedUrl(storagePath, 3600);

            setCurrentUrl(signedData?.signedUrl || storagePath);
            setCurrentName(nameToSave);
            setNewName(nameToSave);
            setIsCropping(false);
            
            // Trigger global refresh so parent updates
            window.dispatchEvent(new CustomEvent('documentRenamed', { detail: { id: doc.id, newName: nameToSave } }));
        } catch (err) {
            console.error('Error cropping image:', err);
            alert('Error al guardar la imagen recortada: ' + err.message);
        } finally {
            setIsSavingCrop(false);
        }
    };

    // Reset zoom when image changes
    useEffect(() => {
        setZoom(1);
        setRotation(0);
        setPanOffset({ x: 0, y: 0 });
        setImgLoaded(false);
        setImgError(false);
    }, [doc?.id]);

    // Global mouse move / up for dragging & resizing
    const handleMouseMove = useCallback((e) => {
        if (isDragging) {
            setPosition((_prev) => ({
                x: Math.max(0, e.clientX - dragOffset.x),
                y: Math.max(0, e.clientY - dragOffset.y),
            }));
        }
        if (resizeDirection) {
            const dx = e.clientX - resizeStart.x;
            const dy = e.clientY - resizeStart.y;

            let newWidth = resizeStartSize.width;
            let newHeight = resizeStartSize.height;
            let newX = resizeStartPos.x;
            let newY = resizeStartPos.y;

            const dir = resizeDirection;

            // Horizontal
            if (dir.includes('e')) {
                newWidth = Math.max(MIN_WIDTH, resizeStartSize.width + dx);
            }
            if (dir.includes('w')) {
                const delta = resizeStartSize.width - Math.max(MIN_WIDTH, resizeStartSize.width - dx);
                newWidth = resizeStartSize.width - delta;
                newX = resizeStartPos.x + delta;
            }

            // Vertical
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
            setPanOffset({
                x: e.clientX - panStart.x,
                y: e.clientY - panStart.y,
            });
        }
    }, [isDragging, resizeDirection, isPanning, dragOffset, resizeStart, resizeStartSize, resizeStartPos, panStart]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
        setResizeDirection(null);
        if (isPanning) {
            setPanOffset({ x: 0, y: 0 });
            setIsPanning(false);
        }
    }, [isPanning]);

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
        // Only left click on header (not on buttons)
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
            setZoom(prev => {
                const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + delta));
                return Math.round(newZoom * 100) / 100;
            });
        }
    }, []);

    // Attach wheel event listener to the content area for zoom
    useEffect(() => {
        const contentEl = contentRef.current;
        if (contentEl) {
            contentEl.addEventListener('wheel', handleWheel, { passive: false });
            return () => contentEl.removeEventListener('wheel', handleWheel);
        }
    }, [handleWheel]);

    const handleZoomIn = () => {
        setZoom(prev => Math.min(MAX_ZOOM, Math.round((prev + ZOOM_STEP) * 100) / 100));
    };

    const handleZoomOut = () => {
        setZoom(prev => Math.max(MIN_ZOOM, Math.round((prev - ZOOM_STEP) * 100) / 100));
    };

    const handleZoomReset = () => {
        setZoom(1);
        setRotation(0);
        setPanOffset({ x: 0, y: 0 });
    };

    const handleRotate = () => {
        setRotation(prev => (prev + 90) % 360);
    };

    const isPdfFallback = doc?.url_archivo?.toLowerCase().endsWith('.pdf') || doc?.nombre_archivo?.toLowerCase().endsWith('.pdf');
    const isImageFallback = doc?.url_archivo?.match(/\.(jpeg|jpg|gif|png|webp)$/i) || doc?.nombre_archivo?.match(/\.(jpeg|jpg|gif|png|webp)$/i) || (!doc?.url_archivo?.match(/\./) && !isPdfFallback);
    const isImage = doc?.tipo_contenido?.startsWith('image/') || isImageFallback;
    const isPdf = doc?.tipo_contenido === 'application/pdf' || isPdfFallback;

    const handleDownload = async () => {
        if (!doc?.url_archivo) return;
        setIsDownloading(true);
        try {
            let filename = doc.nombre_archivo || 'documento';
            if (isPdf && !filename.toLowerCase().endsWith('.pdf')) filename += '.pdf';
            if (isImage && !filename.match(/\.(jpeg|jpg|gif|png|webp)$/i)) filename += '.jpg';

            let downloadUrl = currentUrl || doc.url_archivo;

            if (scanEffect) {
                const { applyScannedLookToDocument } = await import('../services/templateService');
                const blob = await applyScannedLookToDocument(downloadUrl, isPdf);
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                return;
            }

            if (downloadUrl.includes('supabase.co/storage/v1/object/public/')) {
                const pubUrl = new URL(downloadUrl);
                pubUrl.searchParams.set('download', filename);
                const a = document.createElement('a');
                a.href = pubUrl.toString();
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                return;
            }

            const response = await fetch(downloadUrl);
            if (!response.ok) throw new Error('Network response was not ok');
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (err) {
            console.error('Download error:', err);
            window.open(doc.url_archivo, '_blank');
        } finally {
            setIsDownloading(false);
        }
    };

    const handlePrint = async () => {
        if (!doc?.url_archivo) return;
        setIsPrinting(true);
        try {
            let downloadUrl = currentUrl || doc.url_archivo;
            const { applyScannedLookToDocument, printDocumentBlob } = await import('../services/templateService');
            
            let blob;
            if (scanEffect) {
                blob = await applyScannedLookToDocument(downloadUrl, isPdf);
            } else {
                const response = await fetch(downloadUrl);
                blob = await response.blob();
            }
            await printDocumentBlob(blob, currentName);
        } catch (err) {
            console.error('Print error:', err);
            alert('Error al imprimir documento: ' + err.message);
        } finally {
            setIsPrinting(false);
        }
    };

    // Resize handle style
    const handleStyle = {
        position: 'absolute',
        zIndex: 10,
    };

    const edgeHandle = (dir, style) => (
        <div
            style={{
                ...handleStyle,
                ...style,
                cursor: dir === 'n' || dir === 's' ? 'ns-resize' : dir === 'e' || dir === 'w' ? 'ew-resize' : 'nwse-resize',
            }}
            onMouseDown={(e) => handleResizeMouseDown(dir, e)}
        />
    );

    const cornerHandle = (dir, style) => (
        <div
            style={{
                ...handleStyle,
                width: '16px',
                height: '16px',
                ...style,
                cursor: dir === 'se' || dir === 'nw' ? 'nwse-resize' : 'nesw-resize',
            }}
            onMouseDown={(e) => handleResizeMouseDown(dir, e)}
        />
    );

    return (
        <>
            {/* No backdrop - la ventana es flotante y no bloquea la interacción con la app */}

            {/* Modal window */}
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
                    pointerEvents: 'auto',
                }}
            >
                {/* Resize edges */}
                {edgeHandle('n', { top: -4, left: 8, right: 8, height: 8 })}
                {edgeHandle('s', { bottom: -4, left: 8, right: 8, height: 8 })}
                {edgeHandle('w', { left: -4, top: 8, bottom: 8, width: 8 })}
                {edgeHandle('e', { right: -4, top: 8, bottom: 8, width: 8 })}

                {/* Resize corners */}
                {cornerHandle('nw', { top: -8, left: -8 })}
                {cornerHandle('ne', { top: -8, right: -8 })}
                {cornerHandle('sw', { bottom: -8, left: -8 })}
                {cornerHandle('se', { bottom: -8, right: -8 })}

                {/* Header */}
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
                        {isImage ? (
                            <ImageIcon size={18} color="var(--color-primary)" />
                        ) : (
                            <FileText size={18} color="var(--color-primary)" />
                        )}
                        {isEditingName ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1 }}>
                                <input
                                    ref={renameInputRef}
                                    type="text"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveName();
                                    }}
                                    onBlur={handleSaveName}
                                    disabled={isSavingName}
                                    className="form-input"
                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem', height: 'auto', flex: 1, minWidth: '150px' }}
                                />
                                {isSavingName && <Loader2 size={14} className="animate-spin" color="var(--color-text-muted)" />}
                            </div>
                        ) : (
                            <span 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setIsEditingName(true);
                                    setNewName(currentName);
                                }}
                                title="Renombrar (F2)"
                                style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                            >
                                {currentName}
                                <Edit2 size={12} color="var(--color-text-muted)" style={{ opacity: 0.5 }} />
                            </span>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0 }}>
                        {(isImage || isPdf) && (
                            <label
                                title="Aplica grano, leve rotación y viñeta para simular hoja escaneada al descargar o imprimir."
                                style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--color-text-secondary)', cursor: 'pointer', userSelect: 'none', marginRight: '0.25rem' }}
                            >
                                <input type="checkbox" checked={scanEffect} onChange={(e) => setScanEffect(e.target.checked)} style={{ width: '0.9rem', height: '0.9rem', cursor: 'pointer' }} />
                                Escaneado
                            </label>
                        )}
                        {onAnalyze && (isImage || isPdf) && (
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={(e) => { e.stopPropagation(); onAnalyze(doc); }}
                                title="Reescanear con IA"
                                style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                            >
                                <Sparkles size={14} color="var(--color-accent-blue)" />
                                <span>IA</span>
                            </button>
                        )}
                        {(isImage || isPdf) && (
                            <button
                                className="btn btn-secondary btn-sm"
                                onClick={(e) => { e.stopPropagation(); setIsCropping(true); }}
                                title={isImage ? 'Editar (Recortar / Firmar)' : 'Firmar PDF'}
                                style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                            >
                                <Crop size={14} />
                                <span>Editar</span>
                            </button>
                        )}
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={handlePrint}
                            disabled={isPrinting || isDownloading}
                            title="Imprimir documento"
                            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                        >
                            {isPrinting ? (
                                <Loader2 size={14} className="animate-spin" />
                            ) : (
                                <Printer size={14} />
                            )}
                            {isPrinting ? 'Imprimiendo...' : 'Imprimir'}
                        </button>
                        <button
                            className="btn btn-primary btn-sm"
                            onClick={handleDownload}
                            disabled={isDownloading}
                            title="Descargar archivo completo"
                            style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                        >
                            {isDownloading ? (
                                <Loader2 size={14} className="animate-spin" />
                            ) : (
                                <Download size={14} />
                            )}
                            {isDownloading ? 'Descargando...' : 'Descargar'}
                        </button>
                        <button
                            className="btn btn-ghost"
                            onClick={onClose}
                            style={{ padding: '0.35rem', borderRadius: 'var(--radius-md)' }}
                            title="Cerrar (Esc)"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* Toolbar for zoom controls (only for images) */}
                {isImage && (
                    <div
                        style={{
                            padding: '0.35rem 0.75rem',
                            borderBottom: '1px solid var(--color-border)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            background: 'var(--color-bg-surface)',
                            flexShrink: 0,
                        }}
                    >
                        <button
                            className="btn btn-ghost"
                            onClick={handleZoomOut}
                            disabled={zoom <= MIN_ZOOM}
                            title="Alejar (Ctrl + Rueda)"
                            style={{ padding: '0.25rem', display: 'flex', alignItems: 'center' }}
                        >
                            <Minus size={14} />
                        </button>
                        <button
                            className="btn btn-ghost"
                            onClick={handleZoomReset}
                            title="Restablecer zoom"
                            style={{
                                padding: '0.15rem 0.5rem',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                fontVariantNumeric: 'tabular-nums',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                            }}
                        >
                            {Math.round(zoom * 100)}%
                        </button>
                        <button
                            className="btn btn-ghost"
                            onClick={handleZoomIn}
                            disabled={zoom >= MAX_ZOOM}
                            title="Acercar (Ctrl + Rueda)"
                            style={{ padding: '0.25rem', display: 'flex', alignItems: 'center' }}
                        >
                            <Plus size={14} />
                        </button>
                        <div style={{ width: '1px', height: '16px', background: 'var(--color-border)', margin: '0 0.25rem' }} />
                        <button
                            className="btn btn-ghost"
                            onClick={handleRotate}
                            title="Rotar 90°"
                            style={{ padding: '0.25rem', display: 'flex', alignItems: 'center' }}
                        >
                            <RotateCw size={14} />
                        </button>
                        <div style={{ flex: 1 }} />
                        <span style={{ fontSize: '0.6rem', color: 'var(--color-text-muted)' }}>
                            Ctrl + Rueda para zoom • Arrastra para mover
                        </span>
                    </div>
                )}

                {/* Content area */}
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
                                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--color-text-muted)', background: 'var(--color-bg-base)', zIndex: 10 }}>
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
                            {currentUrl && !loadingUrl && (
                                <img
                                    ref={imgRef}
                                    src={currentUrl}
                                    alt={doc?.nombre_archivo || 'Imagen'}
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
                                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--color-text-muted)', background: 'var(--color-bg-base)', zIndex: 10 }}>
                                    <Loader2 size={32} className="animate-spin" />
                                    <span style={{ fontSize: '0.875rem' }}>Obteniendo acceso seguro...</span>
                                </div>
                            )}
                            {currentUrl && !loadingUrl && (
                                <iframe
                                    src={currentUrl}
                                    title={doc?.nombre_archivo || 'PDF'}
                                    style={{ width: '100%', height: '100%', border: 'none' }}
                                />
                            )}
                        </>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', color: 'var(--color-text-muted)', padding: '2rem' }}>
                            <FileText size={64} opacity={0.3} />
                            <span style={{ fontSize: '1rem', fontWeight: 500, textAlign: 'center', wordBreak: 'break-word' }}>
                                {currentName}
                            </span>
                            <span style={{ fontSize: '0.8rem' }}>
                                Tipo: {doc?.tipo_contenido || 'Desconocido'}
                            </span>
                            <span style={{ fontSize: '0.8rem' }}>
                                Vista previa no disponible para este tipo de archivo
                            </span>
                        </div>
                    )}

                    {/* Zoom level indicator inside content */}
                    {isImage && zoom !== 1 && (
                        <div
                            style={{
                                position: 'absolute',
                                bottom: '0.5rem',
                                right: '0.5rem',
                                fontSize: '0.65rem',
                                color: 'white',
                                background: 'rgba(0,0,0,0.6)',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                pointerEvents: 'none',
                                fontWeight: 600,
                                fontVariantNumeric: 'tabular-nums',
                            }}
                        >
                            {Math.round(zoom * 100)}%
                        </div>
                    )}
                </div>

                {/* Footer with download button */}
                <div
                    style={{
                        padding: '0.5rem 1rem',
                        borderTop: '1px solid var(--color-border)',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '0.5rem',
                        background: 'var(--color-bg-elevated)',
                        flexShrink: 0,
                    }}
                >
                    <button
                        className="btn btn-primary"
                        onClick={handleDownload}
                        disabled={isDownloading}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}
                    >
                        {isDownloading ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : (
                            <Download size={16} />
                        )}
                        {isDownloading ? 'Descargando...' : `Descargar ${currentName}`}
                    </button>
                </div>

                {/* Size indicator */}
                <div
                    style={{
                        position: 'absolute',
                        bottom: '2.5rem',
                        right: '0.5rem',
                        fontSize: '0.6rem',
                        color: 'var(--color-text-muted)',
                        background: 'rgba(0,0,0,0.6)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        pointerEvents: 'none',
                        opacity: resizeDirection ? 1 : 0,
                        transition: 'opacity 0.15s',
                    }}
                >
                    {size.width} × {size.height}
                </div>
            </div>
            
            <ImageCropperModal
                isOpen={isCropping}
                imageUrl={currentUrl}
                initialDocName={currentName}
                clientId={doc?.id_cliente || doc?.cliente_id}
                isPdf={isPdf}
                onClose={() => setIsCropping(false)}
                onCropComplete={handleCropComplete}
            />
        </>
    );
}
import React, { useState, useRef, useCallback, useEffect } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { X, Check, RefreshCw, Crop, PenTool } from 'lucide-react';
import { getDocuments, getSignedUrl } from '../services/storageService';

function centerAspectCrop(mediaWidth, mediaHeight, aspect) {
  return centerCrop(
    makeAspectCrop(
      {
        unit: '%',
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight,
    ),
    mediaWidth,
    mediaHeight,
  );
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

const DEFAULT_SIG_WIDTH = 0.3;
const DEFAULT_SIG_HEIGHT = 0.12;
const MIN_DRAG = 0.015;

export default function ImageCropperModal({ isOpen, imageUrl, initialDocName, clientId, isPdf = false, onClose, onCropComplete }) {
  const [activeTab, setActiveTab] = useState('crop'); // 'crop' | 'firma'

  const [crop, setCrop] = useState();
  const [completedCrop, setCompletedCrop] = useState(null);
  const imgRef = useRef(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [customName, setCustomName] = React.useState('');

  // ── Firma ──────────────────────────────────────────────────────────────────
  const [signatures, setSignatures] = useState([]);
  const [loadingSignatures, setLoadingSignatures] = useState(false);
  const [selectedSignature, setSelectedSignature] = useState(null);
  const [placedFirmas, setPlacedFirmas] = useState([]);
  const [dragRect, setDragRect] = useState(null);
  const isDraggingRef = useRef(false);
  const firmaImgRef = useRef(null);

  // ── PDF: soporte para múltiples páginas
  const [pdfPageDataUrl, setPdfPageDataUrl] = useState(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [activePage, setActivePage] = useState(0); // 0-indexed
  const [totalPages, setTotalPages] = useState(1);
  const [pdfPageImages, setPdfPageImages] = useState({}); // cache por página
  const pdfBytesRef = useRef(null);

  React.useEffect(() => {
    if (isOpen) {
      setCustomName(initialDocName || 'Documento de Kommo');
      setActiveTab(isPdf ? 'firma' : 'crop');
      setPlacedFirmas([]);
      setSelectedSignature(null);
      setDragRect(null);
      setPdfPageDataUrl(null);
      setActivePage(0);
      setTotalPages(1);
      setPdfPageImages({});
    }
  }, [isOpen, initialDocName, isPdf]);

  const loadPdfPage = useCallback(async (pageIdx, arrayBuffer) => {
    const buffer = arrayBuffer || pdfBytesRef.current;
    if (!buffer) return;
    if (pdfPageImages[pageIdx]) {
      setPdfPageDataUrl(pdfPageImages[pageIdx]);
      return;
    }
    setLoadingPdf(true);
    try {
      const pdfjsLib = await import('pdfjs-dist');
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
      }
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer.slice(0)) });
      const pdf = await loadingTask.promise;
      setTotalPages(pdf.numPages);
      
      const targetPageNum = Math.min(Math.max(1, pageIdx + 1), pdf.numPages);
      const page = await pdf.getPage(targetPageNum);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      
      const dataUrl = canvas.toDataURL('image/png');
      setPdfPageImages(prev => ({ ...prev, [pageIdx]: dataUrl }));
      setPdfPageDataUrl(dataUrl);
    } catch (err) {
      console.error('Error rasterizando página del PDF:', err);
    } finally {
      setLoadingPdf(false);
    }
  }, [pdfPageImages]);

  useEffect(() => {
    if (!isOpen || !isPdf || !imageUrl) return;
    (async () => {
      try {
        setLoadingPdf(true);
        const res = await fetch(imageUrl);
        const arrayBuffer = await res.arrayBuffer();
        pdfBytesRef.current = arrayBuffer;
        await loadPdfPage(0, arrayBuffer);
      } catch (err) {
        console.error('Error cargando PDF:', err);
        setLoadingPdf(false);
      }
    })();
  }, [isOpen, isPdf, imageUrl]);

  const handlePageChange = async (newPageIdx) => {
    if (newPageIdx < 0 || newPageIdx >= totalPages) return;
    setActivePage(newPageIdx);
    await loadPdfPage(newPageIdx);
  };

  useEffect(() => {
    if (!isOpen || !clientId) return;
    setLoadingSignatures(true);
    getDocuments(clientId).then(async docs => {
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
    }).catch(console.error).finally(() => setLoadingSignatures(false));
  }, [isOpen, clientId]);

  const onImageLoad = useCallback((e) => {
    const { width, height } = e.currentTarget;
    setCrop(centerAspectCrop(width, height, 1));
  }, []);

  const handleSave = async () => {
    if (!completedCrop || !imgRef.current) {
      onClose();
      return;
    }

    setIsProcessing(true);
    try {
      const image = imgRef.current;
      const canvas = document.createElement('canvas');
      const scaleX = image.naturalWidth / image.width;
      const scaleY = image.naturalHeight / image.height;
      const ctx = canvas.getContext('2d');
      const pixelRatio = window.devicePixelRatio;

      canvas.width = Math.floor(completedCrop.width * scaleX * pixelRatio);
      canvas.height = Math.floor(completedCrop.height * scaleY * pixelRatio);

      ctx.scale(pixelRatio, pixelRatio);
      ctx.imageSmoothingQuality = 'high';

      const cropX = completedCrop.x * scaleX;
      const cropY = completedCrop.y * scaleY;

      ctx.drawImage(
        image,
        cropX,
        cropY,
        completedCrop.width * scaleX,
        completedCrop.height * scaleY,
        0,
        0,
        completedCrop.width * scaleX,
        completedCrop.height * scaleY,
      );

      canvas.toBlob((blob) => {
        if (!blob) {
          console.error('Canvas is empty');
          setIsProcessing(false);
          return;
        }
        const file = new File([blob], 'recortado.jpg', { type: 'image/jpeg' });
        onCropComplete(file, customName);
        setIsProcessing(false);
      }, 'image/jpeg', 0.95);
    } catch (err) {
      console.error('Error recortando imagen:', err);
      setIsProcessing(false);
    }
  };

  const relativeFirmaPoint = (e, container) => {
    const rect = container.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  };

  const handleFirmaMouseDown = (e) => {
    if (!selectedSignature) return;
    const { x, y } = relativeFirmaPoint(e, e.currentTarget);
    isDraggingRef.current = true;
    setDragRect({ startX: x, startY: y, x, y, width: 0, height: 0 });
  };

  const handleFirmaMouseMove = (e) => {
    if (!isDraggingRef.current) return;
    const { x, y } = relativeFirmaPoint(e, e.currentTarget);
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

  const finishPlacingFirma = () => {
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

    setPlacedFirmas(prev => [...prev, {
      id: Date.now(),
      url: selectedSignature.url_archivo,
      x, y, width, height,
      page: activePage
    }]);

    setSelectedSignature(null);
    setDragRect(null);
  };

  const handleSaveFirmaPdf = async () => {
    if (!pdfBytesRef.current || placedFirmas.length === 0) {
      onClose();
      return;
    }

    setIsProcessing(true);
    try {
      const pdfjsLib = await import('pdfjs-dist');
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
      }
      const { PDFDocument } = await import('pdf-lib');
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBytesRef.current.slice(0)) });
      const srcPdf = await loadingTask.promise;
      const originalDoc = await PDFDocument.load(pdfBytesRef.current.slice(0));
      const outDoc = await PDFDocument.create();

      for (let i = 1; i <= srcPdf.numPages; i++) {
        const pageIdx = i - 1;
        const firmasForPage = placedFirmas.filter(f => (f.page || 0) === pageIdx);

        if (firmasForPage.length > 0) {
          const page = await srcPdf.getPage(i);
          const viewport = page.getViewport({ scale: 2.2 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          await page.render({ canvasContext: ctx, viewport }).promise;

          for (const firma of firmasForPage) {
            const sigImg = await loadImageElement(firma.url);
            ctx.drawImage(
              sigImg,
              firma.x * canvas.width,
              firma.y * canvas.height,
              firma.width * canvas.width,
              firma.height * canvas.height
            );
          }

          const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.92);
          const jpegBytes = Uint8Array.from(atob(jpegDataUrl.split(',')[1]), c => c.charCodeAt(0));
          const embeddedImage = await outDoc.embedJpg(jpegBytes);
          const pageSize = page.getViewport({ scale: 1 });
          const outPage = outDoc.addPage([pageSize.width, pageSize.height]);
          outPage.drawImage(embeddedImage, { x: 0, y: 0, width: pageSize.width, height: pageSize.height });
        } else {
          // Si la página no tiene firmas, copiarla vectorialmente sin tocar
          const [copiedPage] = await outDoc.copyPages(originalDoc, [pageIdx]);
          outDoc.addPage(copiedPage);
        }
      }

      const outBytes = await outDoc.save();
      const blob = new Blob([outBytes], { type: 'application/pdf' });
      const file = new File([blob], 'firmado_documento.pdf', { type: 'application/pdf' });
      onCropComplete(file, customName);
    } catch (err) {
      console.error('Error firmando PDF:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveFirma = async () => {
    if (isPdf) return handleSaveFirmaPdf();

    if (!firmaImgRef.current) {
      onClose();
      return;
    }
    if (placedFirmas.length === 0) {
      onClose();
      return;
    }

    setIsProcessing(true);
    try {
      const image = firmaImgRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

      for (const firma of placedFirmas) {
        const sigImg = await loadImageElement(firma.url);
        ctx.drawImage(
          sigImg,
          firma.x * canvas.width,
          firma.y * canvas.height,
          firma.width * canvas.width,
          firma.height * canvas.height
        );
      }

      canvas.toBlob((blob) => {
        if (!blob) {
          console.error('Canvas is empty');
          setIsProcessing(false);
          return;
        }
        const file = new File([blob], 'firmado_image.jpg', { type: 'image/jpeg' });
        onCropComplete(file, customName);
        setIsProcessing(false);
      }, 'image/jpeg', 0.95);
    } catch (err) {
      console.error('Error firmando imagen:', err);
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  const tabButtonStyle = (tab) => ({
    display: 'flex', alignItems: 'center', gap: '0.4rem',
    padding: '0.4rem 0.85rem', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 600,
    border: '1px solid var(--color-border, #444)', cursor: 'pointer',
    background: activeTab === tab ? 'var(--color-primary, #2563eb)' : 'transparent',
    color: activeTab === tab ? '#fff' : 'var(--color-text-secondary, #ccc)',
  });

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '1rem'
    }}>
      <div style={{
        backgroundColor: 'var(--color-bg-canvas, #1e1e1e)',
        borderRadius: 'var(--radius-lg, 8px)',
        padding: '1.5rem',
        maxWidth: '800px',
        width: '100%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
        border: '1px solid var(--color-border, #333)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: 'var(--color-text-primary, #fff)', fontSize: '1.25rem' }}>{isPdf ? 'Firmar PDF' : 'Editar Imagen'}</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted, #999)', cursor: 'pointer' }}>
            <X size={24} />
          </button>
        </div>

        {!isPdf && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={() => setActiveTab('crop')} style={tabButtonStyle('crop')}>
              <Crop size={14} /> Recortar
            </button>
            <button onClick={() => setActiveTab('firma')} style={tabButtonStyle('firma')}>
              <PenTool size={14} /> Firmar
            </button>
          </div>
        )}

        {activeTab === 'crop' ? (
          <div style={{
            flex: 1,
            overflow: 'auto',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: '#000',
            borderRadius: '4px',
            minHeight: '300px'
          }}>
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompletedCrop(c)}
            >
              <img
                ref={imgRef}
                src={imageUrl}
                onLoad={onImageLoad}
                style={{ maxHeight: '60vh', maxWidth: '100%', objectFit: 'contain' }}
                crossOrigin="anonymous"
                alt="Crop"
              />
            </ReactCrop>
          </div>
        ) : (
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem', minHeight: '300px' }}>
            {loadingSignatures || (isPdf && loadingPdf) ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '0.5rem', color: 'var(--color-text-muted, #999)' }}>
                <RefreshCw size={20} className="animate-spin" />
                {isPdf && loadingPdf && <span style={{ fontSize: '0.8rem' }}>Preparando el PDF para firmar...</span>}
              </div>
            ) : isPdf && !pdfPageDataUrl ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--color-text-muted, #999)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem' }}>
                No se pudo preparar el PDF para firmar. Cerrá esta ventana y probá de nuevo.
              </div>
            ) : signatures.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--color-text-muted, #999)', fontSize: '0.85rem', textAlign: 'center', padding: '2rem' }}>
                No tenés firmas guardadas para este cliente. Extraela primero desde "Extraer Firma" en la ficha del cliente.
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', padding: '0.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '6px', flex: 1 }}>
                    {signatures.map(sig => (
                      <div
                        key={sig.id}
                        onClick={() => setSelectedSignature(sig)}
                        style={{
                          flexShrink: 0, cursor: 'pointer', padding: '0.4rem', borderRadius: '6px',
                          border: `2px solid ${selectedSignature?.id === sig.id ? 'var(--color-primary, #2563eb)' : 'transparent'}`,
                          background: 'repeating-conic-gradient(#e5e5e5 0% 25%, #fff 0% 50%) 50% / 16px 16px',
                        }}
                      >
                        <img src={sig.url_archivo} alt="Firma" style={{ height: '48px', maxWidth: '120px', objectFit: 'contain' }} />
                      </div>
                    ))}
                  </div>

                  {isPdf && totalPages > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.08)', padding: '0.35rem 0.65rem', borderRadius: '6px', flexShrink: 0 }}>
                      <button
                        className="btn btn-ghost btn-xs"
                        onClick={() => handlePageChange(activePage - 1)}
                        disabled={activePage <= 0 || loadingPdf}
                        style={{ color: '#fff', border: '1px solid #555', padding: '0.2rem 0.5rem' }}
                      >
                        &lt;
                      </button>
                      <span style={{ fontSize: '0.8rem', color: '#fff', fontWeight: 600, minWidth: '70px', textAlign: 'center' }}>
                        Pág. {activePage + 1} / {totalPages}
                      </span>
                      <button
                        className="btn btn-ghost btn-xs"
                        onClick={() => handlePageChange(activePage + 1)}
                        disabled={activePage >= totalPages - 1 || loadingPdf}
                        style={{ color: '#fff', border: '1px solid #555', padding: '0.2rem 0.5rem' }}
                      >
                        &gt;
                      </button>
                    </div>
                  )}
                </div>

                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #999)', margin: 0 }}>
                  {selectedSignature
                    ? (isPdf ? `Arrastrá para definir el tamaño de firma en la Pág. ${activePage + 1}.` : 'Arrastrá sobre la imagen para definir el tamaño.')
                    : 'Elegí una firma arriba y luego colocala sobre la imagen.'}
                </p>

                <div
                  style={{ position: 'relative', display: 'flex', justifyContent: 'center', backgroundColor: '#000', borderRadius: '4px', cursor: selectedSignature ? 'crosshair' : 'default', userSelect: 'none' }}
                  onMouseDown={handleFirmaMouseDown}
                  onMouseMove={handleFirmaMouseMove}
                  onMouseUp={finishPlacingFirma}
                  onMouseLeave={() => { if (isDraggingRef.current) finishPlacingFirma(); }}
                >
                  <img
                    ref={firmaImgRef}
                    src={isPdf ? pdfPageDataUrl : imageUrl}
                    alt="Documento"
                    crossOrigin="anonymous"
                    draggable={false}
                    style={{ maxHeight: '50vh', maxWidth: '100%', objectFit: 'contain', display: 'block' }}
                  />

                  {placedFirmas.filter(firma => !isPdf || (firma.page || 0) === activePage).map(firma => (
                    <img
                      key={firma.id}
                      src={firma.url}
                      alt="Firma colocada"
                      style={{
                        position: 'absolute',
                        left: `${firma.x * 100}%`,
                        top: `${firma.y * 100}%`,
                        width: `${firma.width * 100}%`,
                        height: `${firma.height * 100}%`,
                        objectFit: 'contain',
                        pointerEvents: 'none',
                        filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.3))'
                      }}
                    />
                  ))}

                  {dragRect && (
                    <div style={{
                      position: 'absolute',
                      left: `${dragRect.x * 100}%`,
                      top: `${dragRect.y * 100}%`,
                      width: `${dragRect.width * 100}%`,
                      height: `${dragRect.height * 100}%`,
                      border: '2px dashed var(--color-primary, #2563eb)',
                      background: 'rgba(37,99,235,0.12)',
                      pointerEvents: 'none',
                    }} />
                  )}
                </div>
              </>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
          <label style={{ color: 'var(--color-text-secondary, #ccc)', fontSize: '0.875rem' }}>Nombre del Documento</label>
          <input
            type="text"
            className="form-input"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Ej: Pasaporte, Frente RNM..."
            style={{ width: '100%', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid var(--color-border, #444)' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1rem' }}>
          <button
            onClick={onClose}
            className="btn"
            style={{
              background: 'transparent',
              border: '1px solid var(--color-border, #444)',
              color: 'var(--color-text-primary, #fff)',
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Cancelar
          </button>
          <button
            onClick={activeTab === 'crop' ? handleSave : handleSaveFirma}
            disabled={isProcessing || (activeTab === 'firma' && placedFirmas.length === 0)}
            className="btn btn-primary"
            style={{
              background: 'var(--color-primary, #2563eb)',
              border: 'none',
              color: '#fff',
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              cursor: isProcessing ? 'wait' : 'pointer',
              opacity: (activeTab === 'firma' && placedFirmas.length === 0) ? 0.5 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            {isProcessing ? <RefreshCw size={18} className="animate-spin" /> : <Check size={18} />}
            {isProcessing ? 'Procesando...' : 'Guardar y Continuar'}
          </button>
        </div>
      </div>
    </div>
  );
}

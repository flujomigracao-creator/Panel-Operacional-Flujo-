import React, { useState, useEffect, useRef } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { X, RotateCw, FileText } from 'lucide-react';
import { getCroppedImg } from '../utils/canvasUtils';
import { DOCUMENT_TYPE_OPTIONS } from './clientView.constants';

export default function PreUploadDocumentModal({ file, onClose, onConfirm }) {
  const [fileName, setFileName] = useState('');
  const [fileType, setFileType] = useState('');
  const [isImage, setIsImage] = useState(false);
  
  const [imgSrc, setImgSrc] = useState('');
  const imgRef = useRef(null);
  const [crop, setCrop] = useState();
  const [completedCrop, setCompletedCrop] = useState(null);
  const [rotation, setRotation] = useState(0);

  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (file) {
      setFileName(file.name);
      
      const isImg = file.type.startsWith('image/');
      setIsImage(isImg);
      setFileType(isImg ? 'FOTO' : 'COMPROBANTE');

      if (isImg) {
        setCrop(undefined); // Reset crop when file changes
        const reader = new FileReader();
        reader.addEventListener('load', () =>
          setImgSrc(reader.result?.toString() || '')
        );
        reader.readAsDataURL(file);
      }
    }
  }, [file]);

  function onImageLoad(e) {
    const { _width, _height } = e.currentTarget;
    // By default, no crop is applied until user drags.
    // If we wanted to default to full image crop:
    // setCrop({ unit: '%', x: 0, y: 0, width: 100, height: 100 });
  }

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      let finalFile = file;

      if (isImage && (completedCrop || rotation !== 0)) {
        const croppedBlob = await getCroppedImg(
          imgSrc,
          completedCrop,
          rotation
        );
        
        if (croppedBlob) {
          // Mantener la extensión original o forzar jpg
          const ext = file.name.split('.').pop().toLowerCase();
          const safeName = fileName.endsWith(`.${ext}`) ? fileName : `${fileName}.${ext}`;
          
          finalFile = new File([croppedBlob], safeName, { type: 'image/jpeg' });
        }
      } else {
        // Just rename the file if name changed
        const ext = file.name.split('.').pop().toLowerCase();
        const safeName = fileName.endsWith(`.${ext}`) ? fileName : `${fileName}.${ext}`;
        if (safeName !== file.name) {
          finalFile = new File([file], safeName, { type: file.type });
        }
      }

      const metadata = {
        nombre_archivo: finalFile.name,
        tipo_documento: fileType
      };

      onConfirm(finalFile, metadata);
    } catch (e) {
      console.error('Error procesando imagen', e);
      alert('Hubo un error al procesar la imagen.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }}>
      <div className="modal-content animate-fade-in" style={{ width: '90%', maxWidth: '800px', padding: '0', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
        
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--color-text-primary)' }}>Preparar Documento</h2>
          <button onClick={onClose} className="btn-icon" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-muted)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', overflowY: 'auto' }}>
          
          {/* Metadata Fields */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: '200px' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Nombre del Archivo</label>
              <input 
                type="text" 
                value={fileName} 
                onChange={e => setFileName(e.target.value)}
                className="input-field"
                style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--surface-raised)', color: 'var(--color-text-primary)' }}
              />
            </div>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Tipo de Documento</label>
              <select 
                value={fileType}
                onChange={e => setFileType(e.target.value)}
                className="input-field"
                style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--surface-raised)', color: 'var(--color-text-primary)' }}
              >
                {DOCUMENT_TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Image Editor or PDF Placeholder */}
          {isImage ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                  Puedes arrastrar sobre la imagen para recortarla.
                </span>
                <button 
                  onClick={() => setRotation(r => r + 90)}
                  className="btn btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}
                >
                  <RotateCw size={16} /> Rotar 90°
                </button>
              </div>

              <div style={{ 
                background: 'var(--surface-raised)', 
                borderRadius: 'var(--radius-md)', 
                border: '1px dashed var(--color-border)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                overflow: 'hidden',
                position: 'relative',
                minHeight: '300px',
                padding: '1rem'
              }}>
                {imgSrc && (
                  <ReactCrop
                    crop={crop}
                    onChange={(_, percentCrop) => setCrop(percentCrop)}
                    onComplete={(c) => setCompletedCrop(c)}
                  >
                    <img
                      ref={imgRef}
                      alt="Crop me"
                      src={imgSrc}
                      style={{ 
                        transform: `scale(1) rotate(${rotation}deg)`, 
                        maxHeight: '50vh',
                        maxWidth: '100%',
                        objectFit: 'contain',
                        transition: 'transform 0.2s'
                      }}
                      onLoad={onImageLoad}
                    />
                  </ReactCrop>
                )}
              </div>
            </div>
          ) : (
            <div style={{ 
              background: 'var(--surface-raised)', 
              borderRadius: 'var(--radius-md)', 
              border: '1px dashed var(--color-border)', 
              display: 'flex', 
              flexDirection: 'column',
              alignItems: 'center', 
              justifyContent: 'center',
              minHeight: '200px',
              color: 'var(--color-text-muted)'
            }}>
              <FileText size={48} style={{ marginBottom: '1rem' }} />
              <p style={{ margin: 0 }}>El archivo seleccionado no es una imagen.</p>
              <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.85rem' }}>Podemos subirlo con el nombre y tipo indicados arriba.</p>
            </div>
          )}

        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', padding: '1.25rem 1.5rem', borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-elevated)', borderBottomLeftRadius: 'var(--radius-lg)', borderBottomRightRadius: 'var(--radius-lg)' }}>
          <button onClick={onClose} className="btn btn-secondary" disabled={isProcessing}>Cancelar</button>
          <button onClick={handleConfirm} className="btn btn-primary" disabled={isProcessing}>
            {isProcessing ? 'Procesando...' : 'Confirmar y Analizar'}
          </button>
        </div>
        
      </div>
    </div>
  );
}

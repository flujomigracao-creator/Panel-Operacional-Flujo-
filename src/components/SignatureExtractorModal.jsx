import React, { useState, useRef } from 'react';
import { X, Upload, Scissors, Edit2, Loader2, Save, Trash2, CheckCircle } from 'lucide-react';
import ReactCrop from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { uploadDocument } from '../services/storageService';

export default function SignatureExtractorModal({ client, onClose, onSaved }) {
  const [src, setSrc] = useState(null);
  const [crop, setCrop] = useState();
  const [completedCrop, setCompletedCrop] = useState(null);
  const imgRef = useRef(null);
  
  const [processing, setProcessing] = useState(false);
  const [processedBase64, setProcessedBase64] = useState(null);
  const [saving, setSaving] = useState(false);
  const [threshold, setThreshold] = useState(150); // Para decidir qué es blanco y qué es oscuro
  const [invert, setInvert] = useState(false); // Para fondos oscuros
  const [inkColor, setInkColor] = useState('#0000bb'); // "Caneta Azul"
  const [error, setError] = useState(null);

  const handleSelectFile = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setCrop(undefined);
      setCompletedCrop(null);
      setProcessedBase64(null);
      setError(null);
      const reader = new FileReader();
      reader.addEventListener('load', () => setSrc(reader.result));
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const onImageLoad = (e) => {
    imgRef.current = e.currentTarget;
    setCrop({ unit: '%', width: 90, height: 50, x: 5, y: 25 });
  };

  const extractSignature = () => {
    if (!completedCrop || !imgRef.current) return;
    setProcessing(true);
    
    setTimeout(() => {
      try {
        const image = imgRef.current;
        const canvas = document.createElement('canvas');
        const scaleX = image.naturalWidth / image.width;
        const scaleY = image.naturalHeight / image.height;
        
        canvas.width = completedCrop.width * scaleX;
        canvas.height = completedCrop.height * scaleY;
        const ctx = canvas.getContext('2d');
        
        ctx.drawImage(
          image,
          completedCrop.x * scaleX,
          completedCrop.y * scaleY,
          completedCrop.width * scaleX,
          completedCrop.height * scaleY,
          0,
          0,
          completedCrop.width * scaleX,
          completedCrop.height * scaleY
        );

        // Process pixels to remove background and make ink blue
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // Parse selected ink color
        const hex = inkColor.replace('#', '');
        const rTarget = parseInt(hex.substring(0, 2), 16);
        const gTarget = parseInt(hex.substring(2, 4), 16);
        const bTarget = parseInt(hex.substring(4, 6), 16);

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];

          // Ignore already transparent pixels
          if (a < 50) {
            data[i + 3] = 0;
            continue;
          }
          
          // Calculate perceived luminance (grayscale)
          const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
          
          const isBackground = invert ? (luminance < threshold) : (luminance > threshold);
          
          if (isBackground) {
            // It's background - make transparent
            data[i + 3] = 0; 
          } else {
            // It's ink - change to target color but keep some anti-aliasing based on darkness
            // darker original pixel -> more opaque (if not inverted)
            const intensity = invert ? (luminance / 255) : (1 - (luminance / threshold));
            data[i] = rTarget;
            data[i + 1] = gTarget;
            data[i + 2] = bTarget;
            data[i + 3] = Math.min(255, Math.floor(Math.max(0.2, intensity) * 255 * 1.5)); // Boost opacity slightly
          }
        }
        
        ctx.putImageData(imageData, 0, 0);
        
        // Trim transparent edges (optional optimization, but good to have)
        setProcessedBase64(canvas.toDataURL('image/png'));
      } catch (err) {
        console.error(err);
        setError('Error al procesar la firma.');
      } finally {
        setProcessing(false);
      }
    }, 100); // Small delay to allow UI to show loader
  };

  const handleSave = async () => {
    if (!processedBase64) return;
    setSaving(true);
    try {
      // Convert base64 to File
      const res = await fetch(processedBase64);
      const blob = await res.blob();
      const file = new File([blob], `firma_${client.nombre.replace(/\s+/g, '_')}.png`, { type: 'image/png' });

      // Upload to Supabase Storage
      const response = await uploadDocument(file, client.id, file.name, 'FIRMA_DIGITAL');
      if (response.error) throw new Error(response.error);
      
      if (onSaved) onSaved(response.data);
      onClose();
    } catch (err) {
      console.error(err);
      setError('Error al guardar la firma: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem'
    }}>
      <div style={{
        background: 'var(--color-bg-base)', width: '100%', maxWidth: '900px', maxHeight: '90vh',
        borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column',
        boxShadow: 'var(--shadow-2xl)', overflow: 'hidden', animation: 'scaleIn 0.2s ease-out'
      }}>
        {/* Header */}
        <div style={{
          padding: '1.25rem 2rem', borderBottom: '1px solid var(--color-border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'var(--color-bg-elevated)', flexShrink: 0
        }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: 'rgba(59,130,246,0.1)', color: 'var(--color-primary)', padding: '8px', borderRadius: '8px' }}>
              <Edit2 size={20} />
            </div>
            Extractor de Firma (Caneta Azul)
          </h2>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding: '0.5rem' }}>
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem 2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {error && (
            <div style={{ padding: '1rem', background: 'rgba(239,68,68,0.1)', color: 'var(--color-danger)', borderRadius: 'var(--radius-md)' }}>
              {error}
            </div>
          )}

          {!src ? (
            <div style={{ 
              border: '2px dashed var(--color-border)', borderRadius: 'var(--radius-lg)', 
              padding: '4rem 2rem', textAlign: 'center', cursor: 'pointer',
              background: 'var(--color-bg-secondary)', transition: 'all 0.2s'
            }} onClick={() => document.getElementById('signature-upload').click()}>
              <Upload size={48} style={{ margin: '0 auto 1rem', color: 'var(--color-text-muted)' }} />
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>Sube una foto de la firma</h3>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Formatos soportados: JPG, PNG, WEBP (Carnet o papel en blanco)</p>
              <input 
                id="signature-upload"
                type="file" 
                accept="image/*" 
                onChange={handleSelectFile} 
                style={{ display: 'none' }} 
              />
            </div>
          ) : !processedBase64 ? (
            <div style={{ display: 'flex', gap: '2rem', height: '100%' }}>
              <div style={{ flex: 2, background: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', padding: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <ReactCrop 
                  crop={crop} 
                  onChange={(_, percentCrop) => setCrop(percentCrop)} 
                  onComplete={(c) => setCompletedCrop(c)}
                  style={{ maxHeight: '100%' }}
                >
                  <img ref={imgRef} src={src} alt="Source" onLoad={onImageLoad} style={{ maxHeight: '500px', objectFit: 'contain' }} />
                </ReactCrop>
              </div>
              
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>1. Recorta la firma</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Ajusta el recuadro para que cubra únicamente la firma.</p>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Tinta y Filtro</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div 
                      onClick={() => setInkColor('#0000bb')} 
                      style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#0000bb', cursor: 'pointer', border: inkColor === '#0000bb' ? '2px solid var(--color-primary)' : '2px solid transparent', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                      title="Caneta Azul Oscuro"
                    />
                    <div 
                      onClick={() => setInkColor('#0055ff')} 
                      style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#0055ff', cursor: 'pointer', border: inkColor === '#0055ff' ? '2px solid var(--color-primary)' : '2px solid transparent', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                      title="Caneta Azul Claro"
                    />
                    <div 
                      onClick={() => setInkColor('#000000')} 
                      style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#000000', cursor: 'pointer', border: inkColor === '#000000' ? '2px solid var(--color-primary)' : '2px solid transparent', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                      title="Negro"
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 600 }}>Sensibilidad de fondo ({threshold})</label>
                  <input 
                    type="range" 
                    min="10" max="250" 
                    value={threshold} 
                    onChange={(e) => setThreshold(Number(e.target.value))} 
                    style={{ width: '100%' }}
                  />
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={invert} onChange={e => setInvert(e.target.checked)} />
                    El fondo es oscuro (modo oscuro)
                  </label>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Si el fondo se vuelve azul, ajusta la sensibilidad o marca la casilla de fondo oscuro.</p>
                </div>

                <button 
                  onClick={extractSignature} 
                  disabled={!completedCrop?.width || !completedCrop?.height || processing}
                  className="btn btn-primary"
                  style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                >
                  {processing ? <Loader2 className="animate-spin" size={18} /> : <Scissors size={18} />}
                  Extraer Firma
                </button>
                
                <button 
                  onClick={() => setSrc(null)}
                  className="btn btn-ghost"
                  style={{ color: 'var(--color-text-muted)' }}
                >
                  Cambiar imagen
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem' }}>
              <div style={{ textAlign: 'center' }}>
                <CheckCircle size={48} style={{ color: 'var(--color-success)', margin: '0 auto 1rem' }} />
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>¡Firma extraída con éxito!</h3>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>Revisa el resultado. El fondo blanco ha sido eliminado.</p>
              </div>

              <div style={{ 
                background: 'repeating-conic-gradient(#f0f0f0 0% 25%, transparent 0% 50%) 50% / 20px 20px',
                border: '1px solid var(--color-border)', 
                borderRadius: 'var(--radius-md)', 
                padding: '2rem', 
                maxWidth: '100%', 
                overflow: 'auto',
                boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.05)'
              }}>
                <img src={processedBase64} alt="Extracted Signature" style={{ maxHeight: '200px' }} />
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <button 
                  onClick={() => setProcessedBase64(null)} 
                  disabled={saving}
                  className="btn btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                  <Trash2 size={18} />
                  Descartar y reintentar
                </button>
                <button 
                  onClick={handleSave} 
                  disabled={saving}
                  className="btn btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--color-success)', color: 'white', border: 'none' }}
                >
                  {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                  Guardar Firma
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill/dist/quill.snow.css';
import { X, Save, Copy, Check, Loader2 } from 'lucide-react';

export default function HtmlTemplateBuilder({ onClose, onSaved }) {
  const [htmlContent, setHtmlContent] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [saving, setSaving] = useState(false);
  const [availableFields, setAvailableFields] = useState([]);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    import('../services/templateService').then(({ getExtendedClientFields }) => getExtendedClientFields()).then(setAvailableFields);
  }, []);

  const handleCopy = (text) => {
    navigator.clipboard.writeText(`{{${text}}}`);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSave = async () => {
    if (!templateName.trim()) {
      alert('Por favor, ingresa un nombre para la plantilla.');
      return;
    }
    if (!htmlContent.trim()) {
      alert('El contenido no puede estar vacío.');
      return;
    }

    setSaving(true);
    try {
      const { createHtmlTemplate } = await import('../services/templateService');
      const { error } = await createHtmlTemplate(htmlContent, templateName);
      if (error) {
        alert('Error al guardar: ' + error);
      } else {
        onSaved();
      }
    } finally {
      setSaving(false);
    }
  };

  const modules = {
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'align': [] }],
      ['clean']
    ],
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
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>Creador de Plantillas Web</h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Crea documentos con variables dinámicas que se ajustan solas</p>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <input 
            type="text" 
            placeholder="Nombre de la plantilla..." 
            className="form-input"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            style={{ width: '250px' }}
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Guardar Plantilla
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: Editor */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1rem', background: '#fff', color: '#000' }}>
          <ReactQuill 
            theme="snow" 
            value={htmlContent} 
            onChange={setHtmlContent} 
            modules={modules}
            style={{ height: 'calc(100% - 42px)', overflowY: 'auto' }}
            placeholder="Escribe el documento aquí y pega las variables donde correspondan..."
          />
        </div>

        {/* Right: Variables panel */}
        <div style={{
          width: '320px', background: 'var(--color-bg-secondary)',
          borderLeft: '1px solid var(--color-border)', display: 'flex',
          flexDirection: 'column', flexShrink: 0,
        }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid var(--color-border)' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Variables Disponibles</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
              Haz clic para copiar e insertar en el texto.
            </p>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {availableFields.map(field => (
              <div 
                key={field.id}
                onClick={() => handleCopy(field.id)}
                style={{
                  padding: '0.75rem', background: 'var(--color-bg-elevated)',
                  borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
                  cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--color-bg-elevated)'}
              >
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>{field.label}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-primary)', marginTop: '0.2rem', fontFamily: 'monospace' }}>
                    {`{{${field.id}}}`}
                  </div>
                </div>
                {copiedId === field.id ? <Check size={16} color="var(--color-success)" /> : <Copy size={16} color="var(--color-text-muted)" />}
              </div>
            ))}
            
            {/* Especial de Dirección */}
            <div style={{ marginTop: '1rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Variables de Dirección</div>
              {['endereco', 'numero', 'bairro', 'cidade', 'estado', 'cep'].map(k => (
                <div 
                  key={k}
                  onClick={() => handleCopy(`direccion.${k}`)}
                  style={{
                    padding: '0.5rem 0.75rem', background: 'var(--color-bg-elevated)',
                    borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
                    cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    marginBottom: '0.4rem', transition: 'background 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--color-bg-elevated)'}
                >
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-primary)', fontFamily: 'monospace' }}>
                    {`{{direccion.${k}}}`}
                  </div>
                  {copiedId === `direccion.${k}` ? <Check size={14} color="var(--color-success)" /> : <Copy size={14} color="var(--color-text-muted)" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

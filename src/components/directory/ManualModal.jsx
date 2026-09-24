import React, { useState, useEffect } from 'react';
import { Save, FileText, Link as LinkIcon, AlignLeft, Bot, Upload, Loader2, Plus, X } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { chat } from '../../services/aiService';
import { extractPdfText } from '../../services/pdfToImage';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

const VARIANTE_VACIA = { etiqueta: '', url_pdf: '' };

export default function ManualModal({ isOpen, onClose, manual, onSave }) {
  const [formData, setFormData] = useState({
    titulo: '',
    descripcion: '',
    contenido: '',
    url_pdf: '',
  });
  const [variantes, setVariantes] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = React.useRef(null);

  useEffect(() => {
    if (manual) {
      setFormData({
        titulo: manual.titulo || '',
        descripcion: manual.descripcion || '',
        contenido: manual.contenido || '',
        url_pdf: manual.url_pdf || '',
      });
      setVariantes(
        (manual.variantes || []).map(v => ({
          id: v.id,
          etiqueta: v.etiqueta || '',
          url_pdf: v.url_pdf || '',
        }))
      );
    } else {
      setFormData({
        titulo: '',
        descripcion: '',
        contenido: '',
        url_pdf: '',
      });
      setVariantes([]);
    }
  }, [manual, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleVarianteChange = (index, field, value) => {
    setVariantes(prev => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)));
  };

  const handleAddVariante = () => {
    setVariantes(prev => [...prev, { ...VARIANTE_VACIA }]);
  };

  const handleRemoveVariante = (index) => {
    setVariantes(prev => prev.filter((_, i) => i !== index));
  };

  const handleOrganizeText = async (textToOrganize) => {
    const text = typeof textToOrganize === 'string' ? textToOrganize : formData.contenido;
    if (!text || text.trim().length === 0) return;
    
    setIsGenerating(true);
    setError('');
    try {
      const messages = [
        { role: 'system', content: 'Eres un asistente experto en organizar manuales y procedimientos. Tu objetivo es tomar un texto en bruto y convertirlo en una guía clara, estructurada por pasos y bien formateada usando Markdown. Evita saludos, despedidas o introducciones; devuelve únicamente el contenido organizado.' },
        { role: 'user', content: `Por favor resume y organiza este texto de un documento de trámites en un plan de pasos claros y ordenados:\n\n${text}` }
      ];
      const response = await chat(messages);
      setFormData(prev => ({ ...prev, contenido: response }));
    } catch (err) {
      console.error(err);
      setError('Error al generar resumen con IA.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // reset
    setIsGenerating(true);
    setError('');
    try {
      const text = await extractPdfText(file);
      if (!text || text.trim().length === 0) {
        throw new Error('El PDF parece estar vacío o es una imagen escaneada sin texto seleccionable.');
      }
      await handleOrganizeText(text);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Error al procesar el PDF.');
      setIsGenerating(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!formData.titulo) {
      setError('El título es obligatorio.');
      return;
    }

    setIsSaving(true);
    let variantesTableMissing = false;
    try {
      let savedManualId = manual?.id || null;

      if (manual?.id) {
        // Update
        const { error: updateError } = await supabase
          .from('manuales_tramites')
          .update(formData)
          .eq('id', manual.id);
        if (updateError) throw updateError;

        await supabase.from('manual_variantes').delete().eq('manual_id', manual.id);
      } else {
        // Insert
        const { data, error: insertError } = await supabase
          .from('manuales_tramites')
          .insert([formData])
          .select()
          .single();
        if (insertError) throw insertError;
        savedManualId = data.id;
      }

      // Guardar variantes de PDF por ciudad/posto (ignora filas vacías)
      const variantesToInsert = variantes
        .filter(v => v.etiqueta || v.url_pdf)
        .map(v => ({
          manual_id: savedManualId,
          etiqueta: v.etiqueta || null,
          url_pdf: v.url_pdf || null,
        }));
      if (variantesToInsert.length > 0) {
        const { error: variantesError } = await supabase
          .from('manual_variantes')
          .insert(variantesToInsert);
        if (variantesError) {
          if (variantesError.code === '42P01') {
            variantesTableMissing = true;
          } else {
            throw variantesError;
          }
        }
      }

      onSave();

      if (variantesTableMissing) {
        setError('Se guardó el manual, pero las variantes de PDF no: falta ejecutar 009_manual_variantes.sql en Supabase.');
      } else {
        onClose();
      }
    } catch (err) {
      console.error(err);
      if (err.code === '42P01') {
         setError('Las tablas no existen en Supabase. No se puede guardar. Asegúrate de ejecutar el script SQL.');
      } else {
         setError(err.message || 'Error al guardar el manual.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={manual ? 'Editar Manual' : 'Añadir Nuevo Manual'}
      maxWidth={640}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={isSaving}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={isSaving} form="manual-form">
            {isSaving ? 'Guardando...' : (manual ? 'Guardar Cambios' : 'Añadir Manual')}
          </Button>
        </>
      )}
    >
      <form id="manual-form" onSubmit={handleSubmit} className="flex flex-col gap-5 py-4">
        
        {error && (
          <div className="rounded-md bg-danger/10 p-4 border border-danger/20 text-danger text-sm">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-chrome-text">Título del Manual <span className="text-danger">*</span></label>
          <div className="relative">
            <FileText size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-chrome-text-muted" />
            <input
              type="text"
              name="titulo"
              value={formData.titulo}
              onChange={handleChange}
              className="w-full rounded-md border border-chrome-border bg-chrome-bg px-10 py-2 text-sm text-chrome-text outline-none focus:border-brand-primary transition-colors"
              placeholder="Ej. Manual de Refugio"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-chrome-text">Breve Descripción</label>
          <div className="relative">
            <AlignLeft size={16} className="absolute left-3 top-3 text-chrome-text-muted" />
            <textarea
              name="descripcion"
              value={formData.descripcion}
              onChange={handleChange}
              rows={2}
              className="w-full rounded-md border border-chrome-border bg-chrome-bg pl-10 pr-4 py-2 text-sm text-chrome-text outline-none focus:border-brand-primary transition-colors resize-none"
              placeholder="¿De qué trata este trámite?"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <label className="text-sm font-medium text-chrome-text">Contenido (Texto libre / Markdown)</label>
            <div className="flex gap-3">
              <button 
                type="button" 
                onClick={() => fileInputRef.current?.click()} 
                disabled={isGenerating}
                className="text-xs flex items-center gap-1.5 text-brand-primary hover:text-brand-primary/80 transition-colors disabled:opacity-50"
              >
                {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} 
                Subir PDF y Resumir
              </button>
              <button 
                type="button" 
                onClick={handleOrganizeText} 
                disabled={isGenerating || !formData.contenido.trim()}
                className="text-xs flex items-center gap-1.5 text-brand-primary hover:text-brand-primary/80 transition-colors disabled:opacity-50"
                title="Organizar texto actual con IA"
              >
                {isGenerating ? <Loader2 size={14} className="animate-spin" /> : <Bot size={14} />} 
                Mejorar Texto
              </button>
            </div>
          </div>
          <input 
            type="file" 
            accept="application/pdf" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
          />
          <textarea
            name="contenido"
            value={formData.contenido}
            onChange={handleChange}
            disabled={isGenerating}
            rows={6}
            className="w-full rounded-md border border-chrome-border bg-chrome-bg p-3 text-sm text-chrome-text outline-none focus:border-brand-primary transition-colors resize-y disabled:opacity-75"
            placeholder={isGenerating ? "La IA está analizando y estructurando el contenido..." : "Escribe aquí el contenido detallado del trámite o pega la guía..."}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-chrome-text">Enlace al PDF principal (Opcional)</label>
          <div className="relative">
            <LinkIcon size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-chrome-text-muted" />
            <input
              type="url"
              name="url_pdf"
              value={formData.url_pdf}
              onChange={handleChange}
              className="w-full rounded-md border border-chrome-border bg-chrome-bg px-10 py-2 text-sm text-chrome-text outline-none focus:border-brand-primary transition-colors"
              placeholder="https://..."
            />
          </div>
        </div>

        {/* Variantes de PDF por ciudad/posto */}
        <div className="space-y-3 pt-4 border-t border-chrome-border">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-chrome-text">Variantes de PDF por ciudad</label>
              <p className="text-xs text-chrome-text-muted">
                Cuando el mismo trámite pide un formulario distinto según el posto, ej. Florianópolis, Itajaí o Joinville.
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddVariante}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-chrome-border bg-chrome-bg-active text-sm text-chrome-text hover:border-brand-primary/50 transition-colors flex-shrink-0"
            >
              <Plus size={14} />
              Añadir variante
            </button>
          </div>

          {variantes.length > 0 && (
            <div className="flex flex-col gap-2">
              {variantes.map((variante, index) => (
                <div key={variante.id || index} className="flex items-start gap-2">
                  <input
                    type="text"
                    value={variante.etiqueta}
                    onChange={(e) => handleVarianteChange(index, 'etiqueta', e.target.value)}
                    className="w-40 flex-shrink-0 rounded-md border border-chrome-border bg-chrome-bg px-3 py-1.5 text-sm text-chrome-text outline-none focus:border-brand-primary transition-colors"
                    placeholder="Ciudad (ej. Itajaí)"
                  />
                  <input
                    type="url"
                    value={variante.url_pdf}
                    onChange={(e) => handleVarianteChange(index, 'url_pdf', e.target.value)}
                    className="flex-1 rounded-md border border-chrome-border bg-chrome-bg px-3 py-1.5 text-sm text-chrome-text outline-none focus:border-brand-primary transition-colors"
                    placeholder="https://..."
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveVariante(index)}
                    className="p-1.5 text-chrome-text-muted hover:text-danger rounded-md hover:bg-chrome-bg-active flex-shrink-0"
                    title="Quitar variante"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      </form>
    </Modal>
  );
}

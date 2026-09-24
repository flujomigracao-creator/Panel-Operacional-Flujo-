import React, { useState, useEffect, useMemo } from 'react';
import { X, ArrowUp, ArrowDown, FileText, Loader2, Save, Plus, AlertTriangle, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from './ui/Modal';
import Button from './ui/Button';
import { getRequisitosTramite } from '../services/tramitesService';

const VALID_MERGE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const isValidForMerge = (doc) => {
  if (doc.estado === 'rechazado') return false; // descartado (manual o por el organizador IA) -- nunca entra a un PDF Único
  if (doc.tipo_contenido && VALID_MERGE_TYPES.includes(doc.tipo_contenido)) return true;
  const name = (doc.nombre_archivo || '').toLowerCase();
  return name.endsWith('.pdf') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.webp');
};

let slotCounter = 0;
const nextSlotId = () => `slot-${++slotCounter}`;

export default function DocumentoUnicoModal({ tramiteCatalogo, title, client, documentos = [], onClose, onGenerated }) {
  const [loading, setLoading] = useState(true);
  const [slots, setSlots] = useState([]);
  const cityLabel = (title || '').replace(/^PDF Únicos?\s*/i, '').trim();
  const [mergedName, setMergedName] = useState(
    `PDF UNICO${cityLabel ? ' ' + cityLabel.toUpperCase() : ''} - ${(client?.nombre || 'CLIENTE').toUpperCase()}`
  );
  const [generating, setGenerating] = useState(false);

  const mergeableDocs = useMemo(() => documentos.filter(isValidForMerge), [documentos]);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!tramiteCatalogo) {
        setSlots([]);
        setLoading(false);
        return;
      }
      try {
        const requisitos = await getRequisitosTramite(tramiteCatalogo.id);
        if (!active) return;
        const initialSlots = requisitos.map(req => {
          const candidatos = mergeableDocs
            .filter(d => d.tipo_documento === req.tipo_documento)
            .sort((a, b) => new Date(b.creado_en || 0) - new Date(a.creado_en || 0));
          return {
            id: nextSlotId(),
            label: req.tipo_dato,
            obligatorio: !!req.obligatorio,
            tipoDocumento: req.tipo_documento,
            selectedDocId: candidatos[0] ? String(candidatos[0].id) : '',
          };
        });
        setSlots(initialSlots);
      } catch (_err) {
        toast.error('Error al cargar el checklist de documentos de esta operación');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [tramiteCatalogo, mergeableDocs]);

  const handleAddExtra = () => {
    setSlots(prev => [...prev, { id: nextSlotId(), label: 'Documento adicional', obligatorio: false, tipoDocumento: null, selectedDocId: '' }]);
  };

  const handleRemoveSlot = (index) => {
    setSlots(prev => prev.filter((_, i) => i !== index));
  };

  const handlePick = (index, docId) => {
    setSlots(prev => {
      const next = [...prev];
      next[index] = { ...next[index], selectedDocId: docId };
      return next;
    });
  };

  const moveSlot = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= slots.length) return;
    setSlots(prev => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  // Candidatos ordenados: primero los que coinciden con el tipo esperado del slot.
  const optionsFor = (slot) => {
    const withMatch = mergeableDocs.map(d => ({ doc: d, matches: slot.tipoDocumento && d.tipo_documento === slot.tipoDocumento }));
    withMatch.sort((a, b) => (b.matches === a.matches ? 0 : b.matches ? 1 : -1));
    return withMatch.map(w => w.doc);
  };

  const missingObligatorios = slots.filter(s => s.obligatorio && !s.selectedDocId);
  const resolvedDocs = slots
    .map(s => mergeableDocs.find(d => String(d.id) === s.selectedDocId))
    .filter(Boolean);

  const handleGenerate = async () => {
    if (resolvedDocs.length === 0) {
      toast.error('Selecciona al menos un documento.');
      return;
    }
    if (!mergedName.trim()) {
      toast.error('Escribe un nombre para el PDF.');
      return;
    }
    if (missingObligatorios.length > 0) {
      const labels = missingObligatorios.map(s => s.label).join(', ');
      if (!window.confirm(`Faltan documentos obligatorios: ${labels}.\n\n¿Generar el PDF único de todas formas?`)) {
        return;
      }
    }

    setGenerating(true);
    const toastId = toast.loading('Generando PDF único...');
    try {
      // Se manda TODOS los slots (no solo resolvedDocs): el que no tenga
      // documento elegido sale como página de aviso en el PDF en vez de
      // faltar en silencio -- ver mergeDocumentsToPdfWithGaps.
      const slotsForMerge = slots.map(s => ({
        doc: mergeableDocs.find(d => String(d.id) === s.selectedDocId) || null,
        label: s.label,
        obligatorio: s.obligatorio,
      }));
      const { mergeDocumentsToPdfWithGaps } = await import('../services/pdfMergerService');
      const { blob: mergedBlob } = await mergeDocumentsToPdfWithGaps(slotsForMerge);

      const filename = `${mergedName.replace(/[^a-zA-Z0-9.\-_ ]/g, '')}.pdf`;

      toast.loading('Guardando en la carpeta del cliente...', { id: toastId });
      const { uploadGeneratedDocumentToClient } = await import('../services/templateService');
      await uploadGeneratedDocumentToClient(mergedBlob, filename, client);

      toast.success('¡PDF único generado exitosamente!', { id: toastId });
      if (onGenerated) onGenerated();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(`Error al generar: ${err.message}`, { id: toastId, duration: 5000 });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={!generating ? onClose : () => {}} title={`Generar ${title || 'PDF Único'}`}>
      <div className="flex flex-col gap-4 py-2">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-gray-500">
            <Loader2 size={20} className="animate-spin mr-2" /> Cargando checklist...
          </div>
        ) : (
          <>
            {slots.length === 0 && (
              <div className="p-3 bg-yellow-50 text-yellow-800 rounded-lg text-sm border border-yellow-200">
                ⚠️ "{title || 'Esta acción'}" todavía no tiene un checklist de documentos configurado.
                Usá "Configurar checklist" para definirlo, o agregá documentos manualmente abajo.
              </div>
            )}

            <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-2">
              {slots.map((slot, index) => {
                const missing = slot.obligatorio && !slot.selectedDocId;
                return (
                  <div key={slot.id} className="flex items-center justify-between gap-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => moveSlot(index, -1)} disabled={index === 0} className="p-1 text-gray-500 hover:bg-gray-200 rounded disabled:opacity-30 disabled:hover:bg-transparent" title="Mover arriba">
                        <ArrowUp size={14} />
                      </button>
                      <button onClick={() => moveSlot(index, 1)} disabled={index === slots.length - 1} className="p-1 text-gray-500 hover:bg-gray-200 rounded disabled:opacity-30 disabled:hover:bg-transparent" title="Mover abajo">
                        <ArrowDown size={14} />
                      </button>
                    </div>

                    <div className="flex-shrink-0 text-brand-primary">
                      {slot.selectedDocId ? <CheckCircle2 size={18} className="text-green-600" /> : <FileText size={18} />}
                    </div>

                    <div className="flex flex-col flex-shrink-0" style={{ minWidth: '160px' }}>
                      <span className="text-sm font-medium text-gray-800">{slot.label || 'Documento adicional'}</span>
                      {slot.obligatorio && <span className="text-xs text-gray-500">Obligatorio</span>}
                      {missing && (
                        <span className="text-xs text-red-600 flex items-center gap-1"><AlertTriangle size={12} /> Falta</span>
                      )}
                    </div>

                    <select
                      value={slot.selectedDocId}
                      onChange={e => handlePick(index, e.target.value)}
                      className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-brand-primary focus:outline-none"
                    >
                      <option value="">— Sin seleccionar —</option>
                      {optionsFor(slot).map(doc => (
                        <option key={doc.id} value={String(doc.id)}>
                          {doc.nombre_archivo} ({doc.tipo_documento || 'sin tipo'})
                        </option>
                      ))}
                    </select>

                    <button onClick={() => handleRemoveSlot(index)} className="p-1 text-red-500 hover:bg-red-50 rounded flex-shrink-0" title="Quitar de la lista">
                      <X size={16} />
                    </button>
                  </div>
                );
              })}
            </div>

            {mergeableDocs.length === 0 && (
              <div className="p-3 bg-yellow-50 text-yellow-800 rounded-lg text-sm border border-yellow-200">
                ⚠️ Este cliente no tiene documentos (PDF/imagen) subidos todavía.
              </div>
            )}

            <button
              type="button"
              onClick={handleAddExtra}
              className="flex items-center justify-center gap-2 p-2 text-sm text-brand-primary border border-dashed border-brand-primary rounded-lg hover:bg-brand-primary-light"
            >
              <Plus size={14} /> Agregar documento adicional
            </button>

            <div className="mt-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del PDF final</label>
              <div className="flex items-center">
                <input
                  type="text"
                  value={mergedName}
                  onChange={e => setMergedName(e.target.value)}
                  className="flex-1 rounded-l-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-primary focus:outline-none"
                  placeholder="Ej. PDF UNICO - NOMBRE CLIENTE"
                />
                <span className="bg-gray-100 border border-l-0 border-gray-300 px-3 py-2 rounded-r-md text-sm text-gray-500">
                  .pdf
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-4">
              <Button type="button" variant="ghost" onClick={onClose} disabled={generating}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleGenerate}
                disabled={generating || resolvedDocs.length === 0 || !mergedName.trim()}
              >
                {generating ? (
                  <><Loader2 size={16} className="animate-spin mr-2" /> Generando...</>
                ) : (
                  <><Save size={16} className="mr-2" /> Generar PDF Único</>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

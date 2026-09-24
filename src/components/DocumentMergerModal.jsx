import React, { useState } from 'react';
import { X, ArrowUp, ArrowDown, FileText, Loader2, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from './ui/Modal';
import Button from './ui/Button';

export default function DocumentMergerModal({ documents, client, onClose, onSuccess }) {
  const [docs, setDocs] = useState([...documents]);
  const [mergedName, setMergedName] = useState('Documentos_Fusionados');
  const [merging, setMerging] = useState(false);

  const moveUp = (index) => {
    if (index === 0) return;
    const newDocs = [...docs];
    const temp = newDocs[index - 1];
    newDocs[index - 1] = newDocs[index];
    newDocs[index] = temp;
    setDocs(newDocs);
  };

  const moveDown = (index) => {
    if (index === docs.length - 1) return;
    const newDocs = [...docs];
    const temp = newDocs[index + 1];
    newDocs[index + 1] = newDocs[index];
    newDocs[index] = temp;
    setDocs(newDocs);
  };

  const removeDoc = (index) => {
    setDocs(docs.filter((_, i) => i !== index));
  };

  const handleMerge = async () => {
    if (docs.length < 2) {
      toast.error('Necesitas al menos 2 documentos para fusionar.');
      return;
    }
    if (!mergedName.trim()) {
      toast.error('Escribe un nombre para el nuevo archivo.');
      return;
    }

    setMerging(true);
    const toastId = toast.loading('Fusionando documentos. Esto puede tardar unos segundos...');

    try {
      const { mergeDocumentsToPdf } = await import('../services/pdfMergerService');
      const mergedBlob = await mergeDocumentsToPdf(docs);

      const filename = `${mergedName.replace(/[^a-zA-Z0-9.\-_ ]/g, '')}.pdf`;
      
      toast.loading('Guardando en la carpeta del cliente...', { id: toastId });
      const { uploadGeneratedDocumentToClient } = await import('../services/templateService');
      await uploadGeneratedDocumentToClient(mergedBlob, filename, client);
      
      toast.success('¡Documentos fusionados exitosamente!', { id: toastId });
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(`Error al fusionar: ${err.message}`, { id: toastId, duration: 5000 });
    } finally {
      setMerging(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={!merging ? onClose : () => {}} title="Juntar Documentos (PDFs e Imágenes)">
      <div className="flex flex-col gap-4 py-2">
        <div>
          <p className="text-sm text-gray-600 mb-4">
            Selecciona el orden en el que aparecerán los documentos en el archivo final. Puedes usar las flechas para moverlos.
          </p>
          
          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-2">
            {docs.map((doc, index) => (
              <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="text-brand-primary flex-shrink-0">
                    <FileText size={20} />
                  </div>
                  <span className="text-sm font-medium text-gray-800 whitespace-nowrap overflow-hidden text-ellipsis">
                    {doc.nombre_archivo}
                  </span>
                </div>
                
                <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                  <button 
                    onClick={() => moveUp(index)} 
                    disabled={index === 0}
                    className="p-1 text-gray-500 hover:bg-gray-200 rounded disabled:opacity-30 disabled:hover:bg-transparent"
                    title="Mover arriba"
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button 
                    onClick={() => moveDown(index)} 
                    disabled={index === docs.length - 1}
                    className="p-1 text-gray-500 hover:bg-gray-200 rounded disabled:opacity-30 disabled:hover:bg-transparent"
                    title="Mover abajo"
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button 
                    onClick={() => removeDoc(index)}
                    className="p-1 text-red-500 hover:bg-red-50 rounded ml-1"
                    title="Quitar de la lista"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
          
          {docs.length < 2 && (
             <div className="mt-4 p-3 bg-yellow-50 text-yellow-800 rounded-lg text-sm border border-yellow-200">
               ⚠️ Necesitas al menos 2 documentos en la lista para fusionar. Añade más cerrando esta ventana o quitaste demasiados.
             </div>
          )}
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nombre del nuevo PDF
          </label>
          <div className="flex items-center">
            <input 
              type="text" 
              value={mergedName}
              onChange={e => setMergedName(e.target.value)}
              className="flex-1 rounded-l-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-primary focus:outline-none"
              placeholder="Ej. Tramite_Completo_Juan"
            />
            <span className="bg-gray-100 border border-l-0 border-gray-300 px-3 py-2 rounded-r-md text-sm text-gray-500">
              .pdf
            </span>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={merging}>
            Cancelar
          </Button>
          <Button 
            type="button" 
            variant="primary" 
            onClick={handleMerge} 
            disabled={merging || docs.length < 2 || !mergedName.trim()}
          >
            {merging ? (
              <><Loader2 size={16} className="animate-spin mr-2" /> Fusionando...</>
            ) : (
              <><Save size={16} className="mr-2" /> Guardar PDF Fusionado</>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

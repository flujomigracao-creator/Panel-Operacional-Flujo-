/**
 * useClientViewDocuments.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Encapsula la lógica de documentos de la vista de cliente: subida, eliminación,
 * drag & drop, toggle de verificación, y visualización.
 *
 * La lógica de extracción IA tras subida queda aquí; para la copia a
 * relacionamientos se delega a useClientViewExtraction (que recibe callbacks).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../supabaseClient';
import { handleError } from '../utils/errorHandler';
import { analyzeDocumentImage } from '../services/aiService';
import { resolvePersonAndApplyData, organizeClientDocuments } from '../services/clientExtractionService';
import { getCliente } from '../services/clientesService';
import { uploadDocument, deleteDocument, reassignDocument } from '../services/storageService';

export default function useClientViewDocuments({
  clientId,
  queryClient,
  fetchClientData,
  // Callbacks para extracción IA (compartidos con useClientViewExtraction)
  setExtractedData,
  setIsExtractionModalOpen,
  setUploadedDocRecord,
  // Campos personalizados ya existentes, para que la IA los reutilice en vez
  // de crear duplicados (ver useClientViewExtraction.getExtraCustomFieldsForAiPrompt)
  extraCustomFieldsForAi,
}) {
  // Upload state
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [stagedFile, setStagedFile] = useState(null);

  // Drag document thumbnails state (for dragging to related clients)
  const [draggedDocument, setDraggedDocument] = useState(null);
  const [dragOverRelId, setDragOverRelId] = useState(null);

  // Document viewer
  const [viewingDocument, setViewingDocument] = useState(null);

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDeleteDocument = useCallback(async (doc) => {
    if (!window.confirm(`Eliminar "${doc.nombre_archivo}"?`)) return;
    const { error } = await deleteDocument(doc);
    if (error) { alert(`Error eliminando documento: ${error}`); return; }
    await fetchClientData(false);
  }, [fetchClientData]);

  // ── Toggle verification status ─────────────────────────────────────────────
  const handleToggleDocumentStatus = useCallback(async (doc) => {
    const newEstado = doc.estado === 'verificado' ? 'pendiente' : 'verificado';
    try {
      await supabase.from('documentos_operacionales').update({ estado: newEstado }).eq('id', doc.id);
      queryClient.invalidateQueries({ queryKey: ['documents', clientId] });
    } catch (err) {
      handleError(err, 'Error actualizando estado del documento');
    }
  }, [clientId, queryClient]);

  // ── Stage File (Before Upload) ──────────────────────────────────────────────
  const handleFileUpload = useCallback(async (e) => {
    e.preventDefault();
    let file;
    if (e.dataTransfer && e.dataTransfer.files) {
      file = e.dataTransfer.files[0];
    } else if (e.target && e.target.files) {
      file = e.target.files[0];
    }
    if (!file) return;
    
    // Validate file quickly before staging
    if (file.size > 10 * 1024 * 1024) {
      alert('El archivo supera el límite de 10MB.');
      return;
    }
    
    setStagedFile(file);
    
    // Clear input so same file can be selected again
    if (e.target && e.target.type === 'file') {
      e.target.value = '';
    }
  }, []);

  // ── Confirm Upload (with AI analysis) ───────────────────────────────────────
  const handleConfirmUpload = useCallback(async (file, metadata) => {
    setUploading(true);
    setStagedFile(null); // Close modal
    try {
      const { data: docRecord, error } = await uploadDocument(
        file,
        clientId,
        metadata?.nombre_archivo,
        metadata?.tipo_documento
      );
      
      if (error) { alert(`Error: ${error}`); return; }

      await fetchClientData(false);

      // Si es imagen o PDF, lanzar análisis IA
      if ((file.type.startsWith('image/') || file.type === 'application/pdf') && docRecord) {
        try {
          let fileOrBase64 = file;
          if (file.type === 'application/pdf') {
            const { convertPdfPageToImageBase64 } = await import('../services/pdfToImage');
            ({ base64: fileOrBase64 } = await convertPdfPageToImageBase64(file));
          }
          const aiData = await analyzeDocumentImage(fileOrBase64, extraCustomFieldsForAi);
          if (aiData && Object.keys(aiData).filter(k => aiData[k]).length > 0) {
            // Auto-renombrar inmediatamente y añadir al estado
            const tipo = aiData.TIPO_DOCUMENTO || 'DOCUMENTO';
            const nombre = aiData.NOMBRE_COMPLETO || 'DESCONOCIDO';
            const newFileName = `${tipo} - ${nombre}`.toUpperCase();

            aiData.NOMBRE_ARCHIVO = newFileName;

            if (docRecord) {
              const isUuid = typeof docRecord.id === 'string' && docRecord.id.includes('-');
              const table = isUuid ? 'documentos_pendientes' : 'documentos_operacionales';
              supabase.from(table).update({ nombre_archivo: newFileName }).eq('id', docRecord.id).then(() => fetchClientData());
            }

            // Guardado automático ANTES de que un operacional lo vea -- solo
            // llena campos vacíos, nunca pisa un dato ya cargado a mano. Si la
            // IA detecta que el documento es de otra persona, no le guarda los
            // datos al cliente actual: crea/vincula el cliente relacionado
            // correcto y le mueve el documento y los datos para allá (ver
            // resolvePersonAndApplyData, compartido con el botón "Organizar
            // documentos" de organizeClientDocuments).
            let mismatchHandled = false;
            try {
              const currentCliente = await getCliente(clientId);
              const { moved, targetClient, isNewClient } = await resolvePersonAndApplyData({
                currentCliente,
                extractedData: aiData,
                customFieldsConfig: extraCustomFieldsForAi,
                moveDocument: docRecord ? (targetId) => reassignDocument(docRecord.id, targetId) : null,
              });
              await fetchClientData();
              if (moved) {
                mismatchHandled = true;
                toast.success(
                  `Documento de ${aiData.NOMBRE_COMPLETO || 'otra persona'} detectado — ` +
                  `${isNewClient ? 'se creó el cliente' : 'se vinculó al cliente existente'} ` +
                  `"${targetClient.nombre}" y se le movieron el documento y los datos.`,
                  { duration: 9000, icon: '🔀' }
                );
              }
            } catch (autoSaveErr) {
              console.warn('[useClientViewDocuments] Auto-guardado / chequeo de persona distinta falló:', autoSaveErr.message);
            }

            // El modal de revisión solo se abre si el documento seguía siendo
            // del cliente actual -- si se movió a otro cliente relacionado, ya
            // no tiene sentido revisar acá los datos de una persona distinta.
            if (!mismatchHandled) {
              setExtractedData(aiData);
              if (setUploadedDocRecord) setUploadedDocRecord(docRecord);
              setIsExtractionModalOpen(true);
            }
          } else {
            console.warn('[useClientViewDocuments] IA no encontró datos en el documento.');
          }
        } catch (aiErr) {
          console.warn('[useClientViewDocuments] AI analysis error:', aiErr.message);
          if (aiErr.message.includes('API Key')) {
            alert('Aviso: Análisis IA no disponible. Verifica VITE_OPENROUTER_API_KEY en el .env');
          }
        }
      }
    } finally {
      setUploading(false);
    }
  }, [clientId, fetchClientData, setExtractedData, setIsExtractionModalOpen, extraCustomFieldsForAi]);

  // ── Organizar documentos (botón en la lista) ────────────────────────────────
  // Corre organizeClientDocuments sobre TODOS los documentos ya subidos del
  // cliente (no solo el último) -- mueve los de otra persona a su cliente
  // relacionado, completa datos vacíos y descarta los que la IA no pudo leer.
  const [organizing, setOrganizing] = useState(false);

  const handleOrganizeDocuments = useCallback(async () => {
    if (!window.confirm(
      'Esto analiza con IA TODOS los documentos de este cliente: puede mover documentos de otra persona a un cliente relacionado, completar datos vacíos del cliente y descartar los documentos sin datos legibles.\n\n¿Continuar?'
    )) {
      return;
    }

    setOrganizing(true);
    const toastId = toast.loading('Organizando documentos con IA...');
    try {
      const resumen = await organizeClientDocuments({ clienteId: clientId, extraCustomFieldsForAi });
      await fetchClientData();

      if (resumen.analizados === 0) {
        toast.success('No había documentos nuevos para analizar.', { id: toastId });
        return;
      }

      const partes = [];
      if (resumen.aplicados) partes.push(`${resumen.aplicados} con datos aplicados`);
      if (resumen.movidos) partes.push(`${resumen.movidos} movidos a otro cliente`);
      if (resumen.descartados) partes.push(`${resumen.descartados} descartados`);
      if (resumen.omitidos) partes.push(`${resumen.omitidos} omitidos`);
      if (resumen.errores.length) partes.push(`${resumen.errores.length} con error`);

      toast.success(
        `Organización completa (${resumen.analizados} analizados): ${partes.join(', ') || 'sin cambios'}.`,
        { id: toastId, duration: 8000 }
      );
    } catch (err) {
      console.error('[useClientViewDocuments] Error organizando documentos:', err);
      toast.error('Error al organizar documentos: ' + err.message, { id: toastId });
    } finally {
      setOrganizing(false);
    }
  }, [clientId, fetchClientData, extraCustomFieldsForAi]);

  // ── Drag & Drop zone handlers ──────────────────────────────────────────────
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e) => {
    e.preventDefault();
    setIsDragging(false);

    try {
      const customDataStr = e.dataTransfer.getData('application/json');
      if (customDataStr) {
        const customData = JSON.parse(customDataStr);
        if (customData.type === 'whatsapp_media') {
          setUploading(true);
          try {
             const response = await fetch(customData.url);
             if (!response.ok) throw new Error('Error al descargar el archivo.');
             const blob = await response.blob();
             const file = new File([blob], customData.name, { type: customData.mimeType });
             
             await handleConfirmUpload(file, { nombre_archivo: customData.name, tipo_documento: 'Otro' });
          } catch(err) {
             alert('Error copiando archivo desde WhatsApp: ' + err.message);
          } finally {
             setUploading(false);
          }
          return;
        }
      }
    } catch (_err) {
      // Si falla el parseo, continuamos con la lógica normal de arrastrar archivos nativos
    }

    handleFileUpload(e);
  }, [handleFileUpload, handleConfirmUpload]);

  return {
    // State
    uploading,
    isDragging,
    draggedDocument,
    setDraggedDocument,
    dragOverRelId,
    setDragOverRelId,
    viewingDocument,
    setViewingDocument,
    organizing,
    // Handlers
    handleDeleteDocument,
    handleToggleDocumentStatus,
    handleFileUpload,
    handleOrganizeDocuments,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    stagedFile,
    setStagedFile,
    handleConfirmUpload,
  };
}

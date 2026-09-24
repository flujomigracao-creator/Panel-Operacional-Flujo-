import { useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';
import { getCliente } from '../services/clientesService';
import { getDocuments } from '../services/storageService';
import { getRequisitosTramite, getFastopAcciones } from '../services/tramitesService';

const VALID_MERGE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const isValidForMerge = (doc) => {
  if (doc.estado === 'rechazado') return false; // descartado (manual o por el organizador IA) -- nunca entra a un PDF Único
  if (doc.tipo_contenido && VALID_MERGE_TYPES.includes(doc.tipo_contenido)) return true;
  const name = (doc.nombre_archivo || '').toLowerCase();
  return name.endsWith('.pdf') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.webp');
};

// Tipo/estado con el que se marca un PDF Único armado solo, sin que nadie
// tocó el botón "Generar" — así se distingue de uno manual y sale con el
// círculo "sin verificar" que ya existe en la lista de documentos del
// cliente (ClientDocuments.jsx). El operario lo aprueba con el mismo toggle
// que usa para cualquier otro documento — no hace falta UI nueva.
const BORRADOR_TIPO = 'PDF_UNICO_BORRADOR';

/**
 * Cuando un cliente sube un documento desde el Portal de Clientes, revisa si
 * ese documento completó el checklist de alguna variante de "PDF Único"
 * (tramites_catalogo.fastop_tipo = 'pdf_unico') y, si es así, arma el PDF
 * automáticamente y lo deja como borrador (estado 'pendiente') esperando
 * aprobación de un operario. No hace nada con subidas del propio dashboard
 * (esas ya tienen su botón manual "Generar PDF Único" en TemplateManager).
 */
export const GlobalDocumentoUnicoListener = () => {
  // Evita procesar el mismo cliente en paralelo si el portal manda varios
  // archivos seguidos (ej. el cliente sube 4 fotos de una).
  const inFlightRef = useRef(new Set());

  useEffect(() => {
    console.log('[GlobalDocumentoUnicoListener] Iniciando escucha de subidas del Portal de Clientes...');

    const channel = supabase
      .channel('documento_unico_listener')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'documentos_operacionales' }, async (payload) => {
        const doc = payload.new;
        // Filtramos acá adentro (no en el `filter` de la suscripción) para no
        // depender de cómo Realtime escapa espacios/paréntesis en el valor.
        if (!doc || !doc.id_cliente || doc.subido_por !== 'Cliente (App)') return;

        const lockKey = String(doc.id_cliente);
        if (inFlightRef.current.has(lockKey)) return;
        inFlightRef.current.add(lockKey);

        try {
          await checkAndGenerateDrafts(doc.id_cliente);
        } catch (err) {
          console.error('[GlobalDocumentoUnicoListener] Error evaluando checklist:', err);
        } finally {
          inFlightRef.current.delete(lockKey);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return null;
};

async function checkAndGenerateDrafts(clienteId) {
  const [cliente, acciones, docs] = await Promise.all([
    getCliente(clienteId),
    getFastopAcciones('pdf_unico'),
    getDocuments(clienteId),
  ]);

  if (!cliente || acciones.length === 0) return;
  const mergeableDocs = docs.filter(isValidForMerge);
  if (mergeableDocs.length === 0) return;

  const bestDocFor = (tipoDocumento) =>
    mergeableDocs
      .filter(d => d.tipo_documento === tipoDocumento)
      .sort((a, b) => new Date(b.creado_en || 0) - new Date(a.creado_en || 0))[0];

  for (const accion of acciones) {
    const requisitos = await getRequisitosTramite(accion.id);
    const obligatorios = requisitos.filter(r => r.obligatorio);
    if (obligatorios.length === 0) continue; // checklist sin configurar todavía

    // Antes: solo se armaba el PDF Único cuando el checklist estaba 100%
    // completo (isComplete). Ahora se arma apenas hay AL MENOS UN documento
    // que matchea el checklist, aunque falten otros -- los que falten salen
    // como página de aviso (ver mergeDocumentsToPdfWithGaps) en vez de
    // esperar en silencio a que llegue el último documento. Así el operario
    // ya tiene un PDF Único para revisar/completar a mano en vez de nada.
    const matchedCount = requisitos.filter(req => !!bestDocFor(req.tipo_documento)).length;
    if (matchedCount === 0) continue;
    const isComplete = obligatorios.every(req => !!bestDocFor(req.tipo_documento));

    const cityLabel = (accion.nombre || '').replace(/^PDF Únicos?\s*/i, '').trim();
    const draftBaseName = `PDF UNICO BORRADOR${cityLabel ? ' ' + cityLabel.toUpperCase() : ''} - ${(cliente.nombre || 'CLIENTE').toUpperCase()}`;
    const filename = `${draftBaseName.replace(/[^a-zA-Z0-9.\-_ ]/g, '')}.pdf`;

    // Ya hay un borrador de esta misma variante esperando aprobación: no duplicar
    // (si ese borrador ya fue revisado/aprobado -- deja de estar 'pendiente' --
    // sí se genera uno nuevo con lo que haya llegado desde entonces).
    const alreadyPending = docs.some(d =>
      d.tipo_documento === BORRADOR_TIPO && d.estado === 'pendiente' && d.nombre_archivo === filename
    );
    if (alreadyPending) continue;

    try {
      const slots = requisitos.map(req => ({
        doc: bestDocFor(req.tipo_documento) || null,
        label: req.tipo_dato,
        obligatorio: req.obligatorio,
      }));

      const { mergeDocumentsToPdfWithGaps } = await import('../services/pdfMergerService');
      const { blob: mergedBlob, missing } = await mergeDocumentsToPdfWithGaps(slots);

      const { uploadGeneratedDocumentToClient } = await import('../services/templateService');
      await uploadGeneratedDocumentToClient(mergedBlob, filename, cliente, {
        estado: 'pendiente',
        tipoDocumento: BORRADOR_TIPO,
        subidoPor: 'Automático (Portal)',
        silent: true,
      });

      const estadoLabel = isComplete ? 'completo' : `incompleto — falta: ${missing.join(', ')}`;
      toast.success(`PDF Único (borrador, ${estadoLabel}) listo para revisar — ${cliente.nombre} · ${accion.nombre}`, {
        duration: 9000,
        icon: isComplete ? '🤖' : '⚠️',
      });
    } catch (err) {
      console.error(`[GlobalDocumentoUnicoListener] Error generando borrador para cliente ${clienteId} / acción ${accion.id}:`, err);
    }
  }
}

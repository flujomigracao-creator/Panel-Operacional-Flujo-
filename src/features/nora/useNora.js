import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { refrescarVectores } from './services/noraService';

export const NK = {
  respuestas: ['nora', 'respuestas'],
  reglas: ['nora', 'reglas'],
  casos: ['nora', 'casos'],
  documentos: ['nora', 'documentos'],
  memorias: ['nora', 'memorias'],
  aprendizajes: ['nora', 'aprendizajes'],
  dudas: ['nora', 'dudas'],
  resumen: ['nora', 'resumen'],
  actividad: ['nora', 'actividad'],
  vectores: ['nora', 'vectores'],
  fuentesUsadas: ['nora', 'fuentes_usadas'],
};

// Guardar algo del conocimiento: avisa, refresca las listas y recalcula vectores si el texto cambió.
export function useNoraSave(keys) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const save = async (fn, ok, { vectores = true } = {}) => {
    setBusy(true);
    try {
      const r = await fn();
      if (ok) toast.success(ok);
      [...keys, NK.resumen, NK.actividad, NK.vectores].forEach((k) => qc.invalidateQueries({ queryKey: k }));
      if (vectores) refrescarVectores();
      return r;
    } catch (err) {
      toast.error(err.message || 'No se pudo guardar');
      // El editor no lo vuelve a avisar.
      if (err && typeof err === 'object') err.avisado = true;
      throw err;
    } finally {
      setBusy(false);
    }
  };
  return [save, busy];
}

export const IDIOMAS = [['es', 'Español'], ['pt', 'Portugués'], ['en', 'Inglés']];
export const TONOS = [['humano', 'Humano'], ['formal', 'Formal'], ['cercano', 'Cercano'], ['directo', 'Directo']];
export const TRAMITES_SUGERIDOS = ['Agendamiento', 'RNM', 'CPF', 'Residencia', 'Refugio', 'Naturalización', 'Pasaporte', 'Visado'];
export const TIPOS_MEMORIA = [
  ['client_fact', 'Dato del cliente'],
  ['client_preference', 'Preferencia'],
  ['conversation_summary', 'Resumen de conversación'],
  ['pending_item', 'Pendiente'],
  ['previous_procedure', 'Trámite anterior'],
];
export const idiomaLabel = (v) => (IDIOMAS.find(([k]) => k === v) || [v, v || '—'])[1];
export const tonoLabel = (v) => (TONOS.find(([k]) => k === v) || [v, v || '—'])[1];
export const tipoMemoriaLabel = (v) => (TIPOS_MEMORIA.find(([k]) => k === v) || [v, v || '—'])[1];

// Las acciones que borran piden confirmación explícita.
export const confirmar = (texto) => window.confirm(texto);

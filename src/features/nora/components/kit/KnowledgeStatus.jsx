import React from 'react';
import { Check, Archive, ShieldAlert } from 'lucide-react';
import { btnCls } from '@features/crm/format';

// Estados del conocimiento con los colores de la interfaz:
// verde = aprobado / en uso · amarillo = pendiente · rojo = problema · gris = archivado o inactivo.
const ESTADOS = {
  borrador: ['Borrador', 'warning'],
  pendiente: ['Pendiente', 'warning'],
  aprobada: ['Aprobada', 'success'],
  aprobado: ['Aprobado', 'success'],
  archivada: ['Archivada', 'muted'],
  archivado: ['Archivado', 'muted'],
  descartada: ['Descartado', 'muted'],
  corregir: ['Corregir', 'danger'],
  activa: ['Activa', 'success'],
  inactiva: ['Inactiva', 'muted'],
  activo: ['Activo', 'success'],
  inactivo: ['Inactivo', 'muted'],
  procesando: ['Procesando', 'warning'],
  error: ['Error', 'danger'],
};

const TONOS = {
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
  muted: 'bg-bg-elevated text-text-muted',
  info: 'bg-info-bg text-info',
};

export function KnowledgeStatusBadge({ estado, label }) {
  const [texto, tono] = ESTADOS[estado] || [estado || '—', 'muted'];
  return <span className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${TONOS[tono]}`}>{label || texto}</span>;
}

const PRIORIDADES = { critica: ['Crítica', 'danger'], importante: ['Importante', 'warning'], normal: ['Normal', 'muted'] };
export function PriorityBadge({ prioridad }) {
  const [texto, tono] = PRIORIDADES[prioridad] || PRIORIDADES.normal;
  return <span className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${TONOS[tono]}`}>{texto}</span>;
}

export function ApprovalButton({ onClick, disabled, children = 'Aprobar' }) {
  return (
    <button className={`${btnCls} !border-success-border text-success hover:!bg-success-bg`} onClick={onClick} disabled={disabled}>
      <Check size={13} /> {children}
    </button>
  );
}

export function ArchiveButton({ onClick, disabled, children = 'Archivar' }) {
  return (
    <button className={btnCls} onClick={onClick} disabled={disabled}>
      <Archive size={13} /> {children}
    </button>
  );
}

// El vector no se muestra nunca: solo si el texto ya se puede encontrar por significado.
export function EmbeddingStatus({ listo, pendienteLabel = 'Pendiente' }) {
  return listo
    ? <span className="text-[11px] text-text-muted" title="Nora ya puede encontrar este texto">Listo para búsqueda</span>
    : <span className="text-[11px] text-warning" title="El texto es nuevo o cambió: el vector se recalcula solo">{pendienteLabel}</span>;
}

const FUENTES = {
  document: 'Información oficial',
  approved_answer: 'Respuesta aprobada',
  case: 'Caso histórico',
  lesson: 'Lección aprendida',
  memory: 'Memoria del cliente',
  regla: 'Regla',
  manual: 'Manual',
  importacion: 'Importación',
  historico_anonimizado: 'Histórico anonimizado',
  aprendizaje: 'Aprendizaje',
  duda: 'Duda de cliente',
  automatica: 'Automática',
  entrenador: 'Entrenador',
  dueno: 'Dueño',
  privacidad: 'Privacidad',
  panel: 'Panel',
  asistente: 'Asistente',
};
export const fuenteLabel = (f) => FUENTES[f] || (f ? f.charAt(0).toUpperCase() + f.slice(1).replace(/_/g, ' ') : '—');

export function KnowledgeSource({ fuente }) {
  return <span className="text-xs text-text-secondary">{fuenteLabel(fuente)}</span>;
}

export function PrivacyWarning({ tipos, onLimpiar }) {
  if (!tipos?.length) return null;
  return (
    <div className="flex items-start gap-2 rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning">
      <ShieldAlert size={14} className="mt-0.5 shrink-0" />
      <div className="flex-1">
        Parece tener datos personales ({tipos.join(', ')}). El conocimiento general de Nora no debe incluirlos.
        {onLimpiar && <button className="ml-1 font-medium underline" onClick={onLimpiar}>Quitarlos</button>}
      </div>
    </div>
  );
}

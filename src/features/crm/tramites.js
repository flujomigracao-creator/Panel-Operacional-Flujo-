// Reglas operativas de un trámite, compartidas por Inicio, Trámites y el detalle del trámite.

export const TRAMITE_STATUS = {
  pending: { label: 'Pendiente', tone: 'text-warning' },
  in_progress: { label: 'En curso', tone: 'text-text-primary' },
  on_hold: { label: 'En pausa', tone: 'text-warning' },
  completed: { label: 'Finalizado', tone: 'text-success' },
  cancelled: { label: 'Cancelado', tone: 'text-text-muted' },
};

export const isActiveTramite = (t) => ['pending', 'in_progress', 'on_hold'].includes(t.status);

const IDLE_DAYS = 7;

// Qué frena a un trámite en curso, según su checklist y su última actividad.
// level: 0 problema (rojo), 1 por revisar (atención), 2 falta algo (atención), 3 sin movimiento, null = nada.
export function tramiteIssue(t, items = []) {
  if (!isActiveTramite(t)) return null;
  const rejected = items.filter((i) => i.estado === 'rechazado' || i.estado === 'vencido');
  if (rejected.length) return { level: 0, text: rejected.length === 1 ? `Documento rechazado: ${rejected[0].label}` : `${rejected.length} documentos rechazados` };
  const review = items.filter((i) => i.estado === 'revisar');
  if (review.length) return { level: 1, text: review.length === 1 ? `Revisar: ${review[0].label}` : `${review.length} documentos por revisar` };
  const missing = items.filter((i) => i.required && (i.estado === 'falta' || i.estado === 'reutilizable'));
  if (missing.length) return { level: 2, text: missing.length === 1 ? `Falta: ${missing[0].label}` : `Faltan ${missing.length} requisitos` };
  if (t.status === 'on_hold') return { level: 2, text: 'En pausa' };
  const idle = Math.floor((Date.now() - new Date(t.updated_at)) / 86400000);
  if (idle >= IDLE_DAYS) return { level: 3, text: `Sin movimiento hace ${idle} días` };
  return null;
}

export const ISSUE_TONE = ['text-danger', 'text-warning', 'text-warning', 'text-text-muted'];
export const ISSUE_DOT = ['bg-danger', 'bg-warning', 'bg-warning', 'bg-border-hover'];

// Bloqueado = algo impide avanzar (documento rechazado o trámite en pausa).
export const isBlocked = (t, items = []) => t.status === 'on_hold' || tramiteIssue(t, items)?.level === 0;

export function groupChecklist(rows = []) {
  const by = {};
  for (const i of rows) (by[i.client_service_id] ||= []).push(i);
  return by;
}

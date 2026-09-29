import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { User } from 'lucide-react';
import { useCrmData, KEYS } from '../useCrm';
import { getTramites, getChecklist, getOpenTasks } from '../services/crmService';
import { relTime } from '../format';
import { TRAMITE_STATUS, isActiveTramite, tramiteIssue, groupChecklist, ISSUE_TONE } from '../tramites';

function Part({ title, children }) {
  return (
    <div className="border-b border-border px-4 py-3 last:border-0">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">{title}</p>
      {children}
    </div>
  );
}

// Panel derecho de Conversaciones: lo operativo del cliente (trámites, qué falta, qué sigue),
// para responder sin salir del chat.
export default function ClientOpsPanel({ conv, leads = [], onNavigateToClient, onOpenTramite }) {
  const { teamById } = useCrmData();
  const clientId = conv.client_id;
  const tramites = useQuery({ queryKey: ['crm', 'tramites'], queryFn: getTramites, staleTime: 60_000 });
  const mine = useMemo(() => (tramites.data || []).filter((t) => t.client_id === clientId), [tramites.data, clientId]);
  const checklist = useQuery({
    queryKey: ['crm', 'checklist', 'chat', clientId, mine.map((t) => t.id).join(',')],
    queryFn: () => getChecklist({ clientServiceIds: mine.map((t) => t.id) }),
    enabled: mine.length > 0,
  });
  const tasks = useQuery({ queryKey: [...KEYS.tasks, clientId], queryFn: () => getOpenTasks({ clientId }), enabled: !!clientId });
  const itemsBy = groupChecklist(checklist.data);
  const active = mine.filter(isActiveTramite);
  const missing = active.flatMap((t) => (itemsBy[t.id] || []).filter((i) => i.required && ['falta', 'rechazado', 'vencido'].includes(i.estado)).map((i) => ({ ...i, service: t.services?.name })));
  const lead = leads[0];

  return (
    <aside className="w-80 shrink-0 overflow-y-auto border-l border-border bg-bg-surface">
      <div className="border-b border-border px-4 py-3.5">
        <p className="truncate text-[15px] font-semibold text-text-primary">{conv.display_name || 'Sin nombre'}</p>
        <p className="text-xs text-text-muted">{conv.phone || ''}</p>
        {clientId && onNavigateToClient && (
          <button className="mt-2 inline-flex items-center gap-1 text-xs text-brand-primary hover:underline" onClick={() => onNavigateToClient(clientId, conv.display_name)}>
            <User size={12} /> Ficha del cliente
          </button>
        )}
      </div>

      <Part title="Trámites">
        {mine.length === 0 && <p className="text-xs text-text-muted">{tramites.isLoading ? 'Cargando…' : 'Sin trámites.'}</p>}
        <ul className="flex flex-col gap-2.5">
          {mine.map((t) => {
            const issue = tramiteIssue(t, itemsBy[t.id]);
            const st = TRAMITE_STATUS[t.status] || { label: t.status, tone: 'text-text-muted' };
            return (
              <li key={t.id}>
                <button className="w-full text-left" onClick={() => onOpenTramite?.(t.id)}>
                  <p className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="font-medium text-text-primary hover:text-brand-primary">{t.services?.name || 'Trámite'}</span>
                    <span className={`text-xs ${st.tone}`}>{st.label}</span>
                  </p>
                  <p className="text-xs text-text-secondary">{t.service_stages?.name || 'Sin etapa'}{t.assigned_to ? ` · ${teamById[t.assigned_to] || ''}` : ''}</p>
                  {issue && <p className={`text-xs ${ISSUE_TONE[issue.level]}`}>{issue.text}</p>}
                </button>
              </li>
            );
          })}
        </ul>
      </Part>

      {missing.length > 0 && (
        <Part title="Pendiente del cliente">
          <ul className="flex flex-col gap-1 text-[13px]">
            {missing.slice(0, 6).map((i) => (
              <li key={`${i.client_service_id}-${i.requirement_id}`} className="flex gap-1.5">
                <span className={i.estado === 'falta' ? 'text-text-muted' : 'text-danger'}>{i.estado === 'falta' ? '○' : '✕'}</span>
                <span className="text-text-primary">{i.label}{active.length > 1 && <span className="text-text-muted"> · {i.service}</span>}</span>
              </li>
            ))}
            {missing.length > 6 && <li className="text-xs text-text-muted">+{missing.length - 6} más</li>}
          </ul>
        </Part>
      )}

      <Part title="Próxima tarea">
        {tasks.data?.[0] ? (
          <p className="text-[13px] text-text-primary">{tasks.data[0].title}{tasks.data[0].due_at && <span className="block text-xs text-text-muted">vence {relTime(tasks.data[0].due_at)}</span>}</p>
        ) : <p className="text-xs text-text-muted">Sin tareas.</p>}
      </Part>

      {lead && (
        <Part title="Comercial">
          <p className="text-[13px] text-text-primary">{lead.service_label || 'Lead'} · <span className="text-text-secondary">{lead.stage_name}</span></p>
          <p className="text-xs text-text-muted">{teamById[lead.assigned_to] || 'Sin responsable'}{lead.ai_paused ? ' · Nora pausada' : ''}</p>
        </Part>
      )}
    </aside>
  );
}

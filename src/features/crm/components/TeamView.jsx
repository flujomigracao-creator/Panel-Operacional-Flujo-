import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCrmData } from '../useCrm';
import { getConversations } from '../services/crmService';
import { Avatar, PageHeader, Loading, ErrorText } from '../ui';
import { relTime } from '../format';

const ROLE = { owner: 'Dueño', admin: 'Administrador', admin_plus: 'Administrador', member: 'Operador', agent: 'Operador' };

// Equipo de la organización y su carga de trabajo en el CRM.
export default function TeamView() {
  const { team, leads } = useCrmData();
  const convs = useQuery({ queryKey: ['crm', 'conversations'], queryFn: getConversations });

  const load = useMemo(() => {
    const m = {};
    for (const l of leads.data || []) {
      if (!l.assigned_to) continue;
      const r = (m[l.assigned_to] ||= { open: 0, reply: 0, won: 0 });
      if (l.stage_kind === 'open') r.open += 1;
      if (l.stage_kind === 'open' && l.needs_reply) r.reply += 1;
      if (l.stage_kind === 'won') r.won += 1;
    }
    return m;
  }, [leads.data]);
  const unassigned = (leads.data || []).filter((l) => !l.assigned_to && l.stage_kind === 'open').length;

  if (team.isLoading) return <Loading />;
  if (team.error) return <ErrorText error={team.error} what="el equipo" />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Equipo" count={`${team.data.length} personas`} />
      <div className="min-h-0 flex-1 overflow-auto bg-bg-surface">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 bg-bg-base shadow-[inset_0_-1px_0_var(--color-border)]">
            <tr className="text-left text-[11px] uppercase tracking-wide text-text-muted">
              <th className="px-4 py-2 font-medium">Persona</th>
              <th className="px-2 py-2 font-medium">Rol</th>
              <th className="px-2 py-2 text-right font-medium">Leads abiertos</th>
              <th className="px-2 py-2 text-right font-medium">Sin responder</th>
              <th className="px-2 py-2 text-right font-medium">Ganados</th>
              <th className="px-2 py-2 font-medium">En el equipo</th>
            </tr>
          </thead>
          <tbody>
            {team.data.map((m) => (
              <tr key={m.id} className="border-b border-border">
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <Avatar name={m.name} size={28} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-text-primary">{m.name}</p>
                      <p className="truncate text-[11px] text-text-muted">{m.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-2 text-text-secondary">{ROLE[m.role] || m.role}</td>
                <td className="px-2 text-right tabular-nums text-text-primary">{load[m.id]?.open || 0}</td>
                <td className={`px-2 text-right tabular-nums ${load[m.id]?.reply ? 'font-medium text-success' : 'text-text-muted'}`}>{load[m.id]?.reply || 0}</td>
                <td className="px-2 text-right tabular-nums text-text-primary">{load[m.id]?.won || 0}</td>
                <td className="px-2 text-text-muted">{relTime(m.since)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-4 py-3 text-xs text-text-muted">
          {unassigned} leads abiertos sin responsable{convs.data ? ` · ${convs.data.filter((c) => c.unread_count > 0).length} conversaciones esperando respuesta` : ''}.
          Las invitaciones y los permisos se siguen gestionando desde Supabase.
        </p>
      </div>
    </div>
  );
}

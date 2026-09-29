import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useCrmData } from '../useCrm';
import { getTramites } from '../services/crmService';
import { Avatar, PageHeader, Loading, ErrorText } from '../ui';
import { money, relTime, normalize, inputCls, chipCls } from '../format';

const TRAMITE_STATUS = {
  pending: ['Pendiente', 'bg-warning-bg text-warning'],
  in_progress: ['En curso', 'bg-info-bg text-info'],
  on_hold: ['En pausa', 'bg-warning-bg text-warning'],
  completed: ['Concluido', 'bg-success-bg text-success'],
  cancelled: ['Cancelado', 'bg-bg-elevated text-text-muted'],
};

const FILTERS = [
  ['active', 'En curso', (t) => ['pending', 'in_progress', 'on_hold'].includes(t.status)],
  ['completed', 'Concluidos', (t) => t.status === 'completed'],
  ['all', 'Todos', () => true],
];

// Trámites (client_services): el proceso post-venta de cada contacto. La gestión detallada
// (etapas, campos, documentos) sigue en la ficha del contacto.
export default function TramitesView({ onNavigateToClient }) {
  const { teamById } = useCrmData();
  const q = useQuery({ queryKey: ['crm', 'tramites'], queryFn: getTramites, refetchInterval: 60_000 });
  const [filter, setFilter] = useState('active');
  const [service, setService] = useState('');
  const [search, setSearch] = useState('');

  const rows = useMemo(() => q.data || [], [q.data]);
  const services = useMemo(() => [...new Set(rows.map((t) => t.services?.name).filter(Boolean))].sort(), [rows]);
  const filtered = useMemo(() => {
    const match = FILTERS.find(([k]) => k === filter)[2];
    const s = normalize(search).trim();
    return rows.filter((t) => match(t)
      && (!service || t.services?.name === service)
      && (!s || normalize(`${t.clients?.full_name} ${t.clients?.phone} ${t.services?.name} ${t.service_stages?.name}`).includes(s)));
  }, [rows, filter, service, search]);

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorText error={q.error} what="los trámites" />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Trámites" count={`${filtered.length} de ${rows.length}`} />
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-bg-surface px-4 py-2">
        {FILTERS.map(([k, label]) => <button key={k} className={chipCls(filter === k)} onClick={() => setFilter(k)}>{label}</button>)}
        <select className={`h-7 rounded-md border px-1.5 text-xs ${service ? 'border-brand-primary bg-brand-primary-light text-brand-primary' : 'border-border bg-bg-surface text-text-secondary'}`} value={service} onChange={(e) => setService(e.target.value)}>
          <option value="">Servicio</option>
          {services.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="relative ml-auto w-64">
          <Search size={13} className="absolute left-2.5 top-2 text-text-muted" />
          <input className={`${inputCls} h-7 !py-1 !pl-7`} placeholder="Buscar cliente, servicio, etapa…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-bg-surface">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 bg-bg-base shadow-[inset_0_-1px_0_var(--color-border)]">
            <tr className="text-left text-[11px] uppercase tracking-wide text-text-muted">
              <th className="px-4 py-2 font-medium">Cliente</th>
              <th className="px-2 py-2 font-medium">Servicio</th>
              <th className="px-2 py-2 font-medium">Etapa</th>
              <th className="px-2 py-2 font-medium">Estado</th>
              <th className="px-2 py-2 font-medium">Responsable</th>
              <th className="px-2 py-2 text-right font-medium">Valor</th>
              <th className="px-2 py-2 font-medium">Actualizado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => {
              const [label, cls] = TRAMITE_STATUS[t.status] || [t.status, 'bg-bg-elevated text-text-muted'];
              return (
                <tr key={t.id} onClick={() => onNavigateToClient(t.client_id, t.clients?.full_name)} className="cursor-pointer border-b border-border hover:bg-bg-base">
                  <td className="px-4 py-1.5">
                    <div className="flex items-center gap-2">
                      <Avatar name={t.clients?.full_name} size={24} />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-text-primary">{t.clients?.full_name || 'Sin nombre'}</p>
                        <p className="truncate text-[11px] text-text-muted">{t.clients?.phone || ''}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 text-text-primary">{t.services?.name || '—'}</td>
                  <td className="px-2 text-text-secondary">{t.service_stages?.name || '—'}</td>
                  <td className="px-2"><span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>{label}</span></td>
                  <td className="px-2 text-text-secondary">{teamById[t.assigned_to] || '—'}</td>
                  <td className="px-2 text-right tabular-nums text-text-primary">{money(t.price) || '—'}</td>
                  <td className="whitespace-nowrap px-2 text-text-muted">{relTime(t.updated_at)}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={7} className="p-10 text-center text-sm text-text-muted">No hay trámites con estos filtros.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

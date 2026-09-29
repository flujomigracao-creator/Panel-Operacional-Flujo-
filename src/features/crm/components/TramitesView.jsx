import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Search } from 'lucide-react';
import { useCrmData } from '../useCrm';
import { getTramites, getChecklist, updateTramite } from '../services/crmService';
import { Loading, ErrorText } from '../ui';
import { relTime, normalize, inputCls, selectCls } from '../format';
import { TRAMITE_STATUS, isActiveTramite, tramiteIssue, isBlocked, groupChecklist, ISSUE_TONE } from '../tramites';

const FILTERS = [
  ['all', 'Todos', () => true],
  ['pending', 'Pendientes', (t) => t.status === 'pending'],
  ['in_progress', 'En curso', (t) => t.status === 'in_progress'],
  ['blocked', 'Bloqueados', (t, items) => isBlocked(t, items)],
  ['done', 'Finalizados', (t) => t.status === 'completed' || t.status === 'cancelled'],
];

// Trámites: el centro de la operación. Una fila por trámite; clic abre el detalle.
export default function TramitesView({ onOpenTramite }) {
  const qc = useQueryClient();
  const { team, teamById } = useCrmData();
  const q = useQuery({ queryKey: ['crm', 'tramites'], queryFn: getTramites, refetchInterval: 60_000 });
  const rows = useMemo(() => q.data || [], [q.data]);
  const activeIds = rows.filter(isActiveTramite).map((t) => t.id);
  const checklist = useQuery({
    queryKey: ['crm', 'checklist', 'activos', activeIds.join(',')],
    queryFn: () => getChecklist({ clientServiceIds: activeIds }),
    enabled: activeIds.length > 0,
  });
  const itemsBy = useMemo(() => groupChecklist(checklist.data), [checklist.data]);
  const [filter, setFilter] = useState('all');
  const [service, setService] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);

  const services = useMemo(() => [...new Set(rows.map((t) => t.services?.name).filter(Boolean))].sort(), [rows]);
  const counts = Object.fromEntries(FILTERS.map(([k, , fn]) => [k, rows.filter((t) => fn(t, itemsBy[t.id])).length]));
  const filtered = useMemo(() => {
    const fn = FILTERS.find(([k]) => k === filter)[2];
    const s = normalize(search).trim();
    return rows.filter((t) => fn(t, itemsBy[t.id])
      && (!service || t.services?.name === service)
      && (!s || normalize(`${t.clients?.full_name} ${t.clients?.phone} ${t.services?.name} ${t.service_stages?.name}`).includes(s)));
  }, [rows, filter, service, search, itemsBy]);

  const toggle = (id) => setSelected((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const allSelected = filtered.length > 0 && filtered.every((t) => selected.has(t.id));

  const assign = async (userId) => {
    if (userId === '') return;
    setBusy(true);
    try {
      for (const id of selected) await updateTramite(id, { assigned_to: userId === 'none' ? null : userId });
      toast.success('Responsable actualizado');
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ['crm', 'tramites'] });
    } catch (err) {
      toast.error(err.message || 'No se pudo asignar');
    } finally {
      setBusy(false);
    }
  };

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorText error={q.error} what="los trámites" />;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg-surface">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-5">
        <h1 className="text-[15px] font-semibold text-text-primary">Trámites</h1>
        <div className="ml-3 flex items-center gap-1">
          {FILTERS.map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`rounded-md px-2.5 py-1.5 text-[13px] ${filter === k ? 'bg-brand-primary-light font-medium text-brand-primary' : 'text-text-secondary hover:bg-bg-elevated'}`}>
              {label} <span className="text-xs text-text-muted">{counts[k]}</span>
            </button>
          ))}
        </div>
        <select className={`${selectCls} ml-auto !w-44`} value={service} onChange={(e) => setService(e.target.value)} aria-label="Servicio">
          <option value="">Todos los servicios</option>
          {services.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="relative w-64 shrink-0">
          <Search size={14} className="absolute left-2.5 top-2.5 text-text-muted" />
          <input className={`${inputCls} h-9 !pl-8`} placeholder="Buscar cliente o trámite" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {selected.size > 0 && (
        <div className="flex shrink-0 items-center gap-3 border-b border-border bg-brand-primary-light px-5 py-2 text-[13px]">
          <span className="font-medium text-brand-primary">{selected.size} seleccionados</span>
          <select className={`${selectCls} !w-52`} value="" disabled={busy} onChange={(e) => assign(e.target.value)}>
            <option value="">Asignar responsable…</option>
            <option value="none">Sin responsable</option>
            {(team.data || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <button className="ml-auto text-xs text-text-muted hover:text-text-primary" onClick={() => setSelected(new Set())}>Cancelar</button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-bg-surface shadow-[inset_0_-1px_0_var(--color-border)]">
            <tr className="h-10 text-left text-[11px] uppercase tracking-wide text-text-muted">
              <th className="w-10 pl-5"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(filtered.map((t) => t.id)))} aria-label="Seleccionar todos" /></th>
              <th className="px-2 font-medium">Cliente</th>
              <th className="px-2 font-medium">Trámite</th>
              <th className="px-2 font-medium">Etapa</th>
              <th className="px-2 font-medium">Estado</th>
              <th className="px-2 font-medium">Responsable</th>
              <th className="px-2 pr-5 text-right font-medium">Actualizado</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => {
              const issue = tramiteIssue(t, itemsBy[t.id]);
              const st = TRAMITE_STATUS[t.status] || { label: t.status, tone: 'text-text-muted' };
              return (
                <tr key={t.id} onClick={() => onOpenTramite(t.id)} className={`h-11 cursor-pointer border-b border-border ${selected.has(t.id) ? 'bg-brand-primary-light' : 'hover:bg-bg-base'}`}>
                  <td className="pl-5" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} aria-label="Seleccionar" /></td>
                  <td className="px-2 font-medium text-text-primary">{t.clients?.full_name || 'Sin nombre'}</td>
                  <td className="px-2 text-text-primary">{t.services?.name || '—'}</td>
                  <td className="px-2 text-text-secondary">{t.service_stages?.name || '—'}</td>
                  <td className="max-w-[260px] truncate px-2">
                    {issue ? <span className={ISSUE_TONE[issue.level]}>{issue.text}</span> : <span className={st.tone}>{st.label}</span>}
                  </td>
                  <td className="px-2 text-text-secondary">{teamById[t.assigned_to] || <span className="text-text-muted">Sin asignar</span>}</td>
                  <td className="whitespace-nowrap px-2 pr-5 text-right text-text-muted">{relTime(t.updated_at)}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={7} className="p-12 text-center text-sm text-text-muted">No hay trámites en esta vista.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, FileText, Image as ImageIcon } from 'lucide-react';
import { getDocumentos } from '../services/crmService';
import { PageHeader, Loading, ErrorText } from '../ui';
import { relTime, normalize, inputCls, chipCls } from '../format';

const STATUS = {
  pending: ['Pendiente', 'bg-warning-bg text-warning'],
  received: ['Por revisar', 'bg-info-bg text-info'],
  approved: ['Aprobado', 'bg-success-bg text-success'],
  rejected: ['Rechazado', 'bg-danger-bg text-danger'],
  expired: ['Vencido', 'bg-bg-elevated text-text-muted'],
};

const FILTERS = [
  ['received', 'Por revisar'],
  ['pending', 'Pendientes'],
  ['approved', 'Aprobados'],
  ['rejected', 'Rechazados'],
  ['', 'Todos'],
];

// Documentos de todos los trámites. Se revisan (aprobar/rechazar, ver) desde la ficha del contacto.
export default function DocumentosView({ onNavigateToClient }) {
  const q = useQuery({ queryKey: ['crm', 'documentos'], queryFn: getDocumentos, refetchInterval: 60_000 });
  const [status, setStatus] = useState('received');
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');

  const rows = useMemo(() => q.data || [], [q.data]);
  const types = useMemo(() => [...new Set(rows.map((d) => d.document_types?.name).filter(Boolean))].sort(), [rows]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([k]) => [k, k ? rows.filter((d) => d.status === k).length : rows.length])), [rows]);
  const filtered = useMemo(() => {
    const s = normalize(search).trim();
    return rows.filter((d) => (!status || d.status === status)
      && (!type || d.document_types?.name === type)
      && (!s || normalize(`${d.clients?.full_name} ${d.file_name} ${d.document_types?.name}`).includes(s)));
  }, [rows, status, type, search]);

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorText error={q.error} what="los documentos" />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Documentos" count={`${filtered.length} de ${rows.length}`} />
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-bg-surface px-4 py-2">
        {FILTERS.map(([k, label]) => (
          <button key={k || 'all'} className={chipCls(status === k)} onClick={() => setStatus(k)}>
            {label} <span className="text-text-muted">{counts[k]}</span>
          </button>
        ))}
        <select className={`h-7 rounded-md border px-1.5 text-xs ${type ? 'border-brand-primary bg-brand-primary-light text-brand-primary' : 'border-border bg-bg-surface text-text-secondary'}`} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Tipo de documento</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <div className="relative ml-auto w-64">
          <Search size={13} className="absolute left-2.5 top-2 text-text-muted" />
          <input className={`${inputCls} h-7 !py-1 !pl-7`} placeholder="Buscar cliente o archivo…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto bg-bg-surface">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 bg-bg-base shadow-[inset_0_-1px_0_var(--color-border)]">
            <tr className="text-left text-[11px] uppercase tracking-wide text-text-muted">
              <th className="px-4 py-2 font-medium">Documento</th>
              <th className="px-2 py-2 font-medium">Cliente</th>
              <th className="px-2 py-2 font-medium">Tipo</th>
              <th className="px-2 py-2 font-medium">Estado</th>
              <th className="px-2 py-2 font-medium">Recibido</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d) => {
              const [label, cls] = STATUS[d.status] || [d.status, 'bg-bg-elevated text-text-muted'];
              const Icon = /image/.test(d.mime_type || '') ? ImageIcon : FileText;
              return (
                <tr key={d.id} onClick={() => d.client_id && onNavigateToClient(d.client_id, d.clients?.full_name)} className="cursor-pointer border-b border-border hover:bg-bg-base">
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-2">
                      <Icon size={14} className="shrink-0 text-text-muted" />
                      <span className="truncate text-text-primary">{d.file_name || 'Sin archivo'}</span>
                      {d.legivel === false && <span className="rounded bg-danger-bg px-1 text-[10px] text-danger">ilegible</span>}
                    </span>
                  </td>
                  <td className="px-2 text-text-primary">{d.clients?.full_name || '—'}</td>
                  <td className="px-2 text-text-secondary">{d.document_types?.name || '—'}</td>
                  <td className="px-2"><span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>{label}</span></td>
                  <td className="whitespace-nowrap px-2 text-text-muted">{relTime(d.created_at)}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={5} className="p-10 text-center text-sm text-text-muted">No hay documentos con estos filtros.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

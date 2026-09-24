import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileSearch,
  FolderOpen,
  MessageSquare,
  Phone,
  Mail,
  Users,
  X,
} from 'lucide-react';
import {
  getClients,
  isActiveTramite,
  CLIENT_STATUS,
  TRAMITE_STATUS,
  KOMMO_CONTACT_URL,
  KOMMO_LEAD_URL,
} from '../services/clientsService';

const TONES = {
  sky: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  amber: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  green: 'bg-green-500/15 text-green-400 border-green-500/30',
  zinc: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
  red: 'bg-red-500/15 text-red-400 border-red-500/30',
};

const TABS = [
  { key: 'todos', label: 'Todos', match: () => true },
  { key: 'en_curso', label: 'Con trámite en curso', match: (c) => c.tramites_activos > 0 },
  { key: 'revisar', label: 'Documentos por revisar', match: (c) => c.documentos_por_revisar > 0 },
  { key: 'sin_tramite', label: 'Sin trámite activo', match: (c) => c.tramites_activos === 0 },
];

const SORTS = {
  created_at: (c) => c.created_at || '',
  last_activity_at: (c) => c.last_activity_at || '',
  full_name: (c) => (c.full_name || '').toLowerCase(),
  tramites_activos: (c) => c.tramites_activos,
};

const normalize = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// Busca en nombre, teléfono (solo dígitos), email, nacionalidad y trámites.
// Todas las palabras de la búsqueda tienen que aparecer (AND).
function matchesSearch(client, query) {
  if (!query) return true;
  const text = normalize([
    client.full_name, client.email, client.nationality,
    ...client.tramites.map(t => `${t.servicio} ${t.etapa || ''} ${t.etapa_general || ''} ${t.kommo_lead_id || ''}`),
  ].join(' '));
  const digits = String(client.phone || '').replace(/\D/g, '');
  return normalize(query).split(/\s+/).filter(Boolean).every(term => {
    const termDigits = term.replace(/\D/g, '');
    return text.includes(term) || (termDigits.length >= 3 && digits.includes(termDigits));
  });
}

function formatPhone(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  const m = d.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : phone || '—';
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function relative(iso) {
  if (!iso) return 'Sin actividad';
  const days = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (days <= 0) return 'Hoy';
  if (days === 1) return 'Ayer';
  if (days < 30) return `Hace ${days} días`;
  return formatDate(iso);
}

// El nombre llega como teléfono cuando el contacto todavía no dio su nombre.
const displayName = (c) => (c.full_name && c.full_name !== c.phone ? c.full_name : 'Sin nombre');

function Pill({ tone = 'zinc', children }) {
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${TONES[tone]}`}>{children}</span>;
}

function SortHeader({ field, sort, onSort, children, className = '' }) {
  const active = sort.field === field;
  return (
    <th onClick={() => onSort(field)} className={`cursor-pointer select-none px-4 py-3 font-medium ${className}`}>
      <span className="inline-flex items-center gap-1">
        {children}
        {active && (sort.dir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />)}
      </span>
    </th>
  );
}

function TramiteChip({ tramite }) {
  const active = isActiveTramite(tramite);
  return (
    <span
      title={`${tramite.servicio} — ${tramite.etapa || 'sin etapa'}`}
      className={`inline-flex max-w-[220px] items-center gap-1 truncate rounded-md border px-2 py-0.5 text-xs ${
        active ? 'border-chrome-border bg-chrome-bg-raised text-chrome-text-active' : 'border-transparent text-chrome-text-muted line-through decoration-chrome-text-muted/40'
      }`}
    >
      <span className="truncate">{tramite.servicio}</span>
      {active && tramite.etapa_general && <span className="shrink-0 text-chrome-text-muted">· {tramite.etapa_general}</span>}
    </span>
  );
}

function ClientDrawer({ client, onClose }) {
  const status = CLIENT_STATUS[client.status] || CLIENT_STATUS.lead;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-chrome-border bg-chrome-bg shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-chrome-border p-5">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-chrome-text-active">{displayName(client)}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Pill tone={status.tone}>{status.label}</Pill>
              {client.nationality && <span className="text-xs text-chrome-text-muted">{client.nationality}</span>}
              <span className="text-xs text-chrome-text-muted">Registrado {formatDate(client.created_at)}</span>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-chrome-text hover:bg-chrome-bg-raised hover:text-chrome-text-active" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          <section className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-chrome-text-active"><Phone size={14} className="text-chrome-text-muted" /> {formatPhone(client.phone)}</div>
            {client.email && <div className="flex items-center gap-2 text-chrome-text-active"><Mail size={14} className="text-chrome-text-muted" /> {client.email}</div>}
            <div className="flex items-center gap-2 text-chrome-text-muted"><MessageSquare size={14} /> {client.mensajes} mensajes · última actividad: {relative(client.last_activity_at)}</div>
            {client.kommo_contact_id && (
              <a href={KOMMO_CONTACT_URL(client.kommo_contact_id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-sky-400 hover:underline">
                Abrir contacto en Kommo <ExternalLink size={12} />
              </a>
            )}
          </section>

          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-chrome-text-muted">Trámites ({client.tramites.length})</h3>
            {client.tramites.length === 0 ? (
              <p className="text-sm text-chrome-text-muted">Todavía no tiene trámites. Se crean solos cuando su lead entra al pipeline Operacional en Kommo.</p>
            ) : (
              <div className="space-y-3">
                {client.tramites.map(t => {
                  const ts = TRAMITE_STATUS[t.status] || TRAMITE_STATUS.pending;
                  return (
                    <div key={t.id} className="rounded-lg border border-chrome-border bg-chrome-bg-raised p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-chrome-text-active">{t.servicio}</p>
                        <Pill tone={ts.tone}>{ts.label}</Pill>
                      </div>
                      <p className="mt-1 text-xs text-chrome-text-muted">
                        {t.etapa_general || 'Sin etapa'}{t.etapa && t.etapa !== t.etapa_general ? ` · ${t.etapa}` : ''} · actualizado {relative(t.updated_at).toLowerCase()}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs">
                        {t.kommo_lead_id && (
                          <a href={KOMMO_LEAD_URL(t.kommo_lead_id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-400 hover:underline">
                            Lead en Kommo <ExternalLink size={11} />
                          </a>
                        )}
                        {t.drive_link && (
                          <a href={t.drive_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-400 hover:underline">
                            <FolderOpen size={12} /> Carpeta en Drive
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {client.documentos_por_revisar > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
              <FileSearch size={15} /> {client.documentos_por_revisar} documento(s) por revisar — aparecen en Hoy.
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function ClientsSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-y-auto bg-chrome-bg-subtle p-6 lg:p-8 animate-pulse">
      <div className="mb-6 h-7 w-48 rounded-md bg-chrome-bg-raised" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-14 rounded-lg border border-chrome-border bg-chrome-bg" />)}
      </div>
    </div>
  );
}

/**
 * Clientes — un registro por persona (teléfono), con todos sus trámites.
 * Los clientes se crean solos cuando un lead entra a Operacional en Kommo.
 */
export default function ClientsView({ searchQuery = '' }) {
  const { data: clients = [], isLoading, error } = useQuery({ queryKey: ['painel_clientes'], queryFn: getClients });
  const [tab, setTab] = useState('todos');
  const [servicio, setServicio] = useState('all');
  const [etapa, setEtapa] = useState('all');
  const [sort, setSort] = useState({ field: 'last_activity_at', dir: 'desc' });
  const [selected, setSelected] = useState(null);

  const servicios = useMemo(() => [...new Set(clients.flatMap(c => c.tramites.map(t => t.servicio)))].sort(), [clients]);
  const etapas = useMemo(() => [...new Set(clients.flatMap(c => c.tramites.filter(isActiveTramite).map(t => t.etapa_general).filter(Boolean)))], [clients]);

  const byTab = useMemo(() => Object.fromEntries(TABS.map(t => [t.key, clients.filter(t.match).length])), [clients]);

  const visible = useMemo(() => {
    const tabMatch = TABS.find(t => t.key === tab).match;
    const rows = clients.filter(c =>
      tabMatch(c)
      && (servicio === 'all' || c.tramites.some(t => t.servicio === servicio))
      && (etapa === 'all' || c.tramites.some(t => isActiveTramite(t) && t.etapa_general === etapa))
      && matchesSearch(c, searchQuery)
    );
    const key = SORTS[sort.field];
    return rows.sort((a, b) => {
      const va = key(a), vb = key(b);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [clients, tab, servicio, etapa, searchQuery, sort]);

  const onSort = (field) => setSort(s => ({ field, dir: s.field === field && s.dir === 'desc' ? 'asc' : 'desc' }));

  if (isLoading) return <ClientsSkeleton />;

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-chrome-bg-subtle p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-chrome-text">Clientes</h1>
        <p className="mt-1 text-chrome-text-muted">
          {clients.length} clientes · {byTab.en_curso} con trámites en curso. Se registran solos cuando su lead entra a Operacional en Kommo.
        </p>
      </header>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <AlertCircle size={16} /> No se pudieron cargar los clientes.
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              tab === t.key ? 'border-transparent bg-chrome-accent text-white' : 'border-chrome-border text-chrome-text hover:bg-chrome-bg-raised'
            }`}
          >
            {t.label} <span className="opacity-70">{byTab[t.key]}</span>
          </button>
        ))}

        <div className="ml-auto flex flex-wrap gap-2">
          <select value={servicio} onChange={e => setServicio(e.target.value)} className="rounded-md border border-chrome-border bg-chrome-bg px-2.5 py-1.5 text-xs text-chrome-text-active">
            <option value="all">Todos los trámites</option>
            {servicios.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={etapa} onChange={e => setEtapa(e.target.value)} className="rounded-md border border-chrome-border bg-chrome-bg px-2.5 py-1.5 text-xs text-chrome-text-active">
            <option value="all">Todas las etapas</option>
            {etapas.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
      </div>

      {searchQuery && (
        <p className="mb-3 text-xs text-chrome-text-muted">Buscando “{searchQuery}” · {visible.length} resultado(s)</p>
      )}

      <div className="overflow-hidden rounded-xl border border-chrome-border bg-chrome-bg">
        <table className="w-full text-sm">
          <thead className="border-b border-chrome-border text-left text-[11px] uppercase tracking-wide text-chrome-text-muted">
            <tr>
              <SortHeader field="full_name" sort={sort} onSort={onSort}>Cliente</SortHeader>
              <th className="px-4 py-3 font-medium">Trámites</th>
              <SortHeader field="last_activity_at" sort={sort} onSort={onSort} className="hidden md:table-cell">Última actividad</SortHeader>
              <SortHeader field="created_at" sort={sort} onSort={onSort} className="hidden lg:table-cell">Registro</SortHeader>
            </tr>
          </thead>
          <tbody>
            {visible.map(c => (
              <tr
                key={c.id}
                onClick={() => setSelected(c)}
                className="cursor-pointer border-b border-chrome-border last:border-0 transition-colors hover:bg-chrome-bg-raised"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs font-semibold text-white">
                      {displayName(c) === 'Sin nombre' ? <Users size={14} /> : displayName(c).substring(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-chrome-text-active">{displayName(c)}</span>
                        {c.documentos_por_revisar > 0 && (
                          <span title="Documentos por revisar" className="inline-flex items-center gap-0.5 text-[11px] text-amber-400">
                            <FileSearch size={12} /> {c.documentos_por_revisar}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-chrome-text-muted">{formatPhone(c.phone)}{c.nationality ? ` · ${c.nationality}` : ''}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {c.tramites.length === 0 ? <span className="text-xs text-chrome-text-muted">—</span> : c.tramites.map(t => <TramiteChip key={t.id} tramite={t} />)}
                  </div>
                </td>
                <td className="hidden px-4 py-3 text-chrome-text-muted md:table-cell">{relative(c.last_activity_at)}</td>
                <td className="hidden px-4 py-3 text-chrome-text-muted lg:table-cell">{formatDate(c.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {visible.length === 0 && (
          <div className="p-12 text-center text-sm text-chrome-text-muted">No hay clientes que coincidan.</div>
        )}
      </div>

      {selected && <ClientDrawer client={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertCircle, ChevronDown, ChevronUp, FileSearch, Plus, Users, X } from 'lucide-react';
import { useAuth } from '@features/auth/context/AuthContext';
import { getClients, getServices, createClientWithTramite, isActiveTramite } from '../services/clientsService';

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

// Alta manual: para casos que no entran por Kommo (ej. documentos cargados a
// mano desde otra fuente). Crea el cliente y, si se elige un trámite, lo deja
// en la primera etapa de ese servicio.
function NewClientModal({ organizationId, onClose, onCreated }) {
  const [services, setServices] = useState([]);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [nationality, setNationality] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { getServices().then(setServices).catch(() => setServices([])); }, []);

  const guardar = async () => {
    if (!fullName.trim()) { toast.error('El nombre es obligatorio.'); return; }
    setSaving(true);
    try {
      const client = await createClientWithTramite({ organizationId, fullName, phone, nationality, serviceId: serviceId || null });
      toast.success('Cliente creado');
      onCreated(client);
    } catch (err) {
      console.error(err);
      toast.error('No se pudo crear el cliente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-chrome-border bg-chrome-bg p-5" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-chrome-text-active">Nuevo cliente</h2>
          <button onClick={onClose} className="rounded-md p-1 text-chrome-text-muted hover:bg-chrome-bg-raised"><X size={16} /></button>
        </div>
        <div className="flex flex-col gap-3">
          <label className="text-xs text-chrome-text-muted">
            Nombre completo *
            <input value={fullName} onChange={e => setFullName(e.target.value)} autoFocus className="mt-1 w-full rounded-md border border-chrome-border bg-chrome-bg-raised px-2.5 py-1.5 text-sm text-chrome-text-active" />
          </label>
          <label className="text-xs text-chrome-text-muted">
            Teléfono
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+55 11 9…" className="mt-1 w-full rounded-md border border-chrome-border bg-chrome-bg-raised px-2.5 py-1.5 text-sm text-chrome-text-active" />
          </label>
          <label className="text-xs text-chrome-text-muted">
            Nacionalidad
            <input value={nationality} onChange={e => setNationality(e.target.value)} className="mt-1 w-full rounded-md border border-chrome-border bg-chrome-bg-raised px-2.5 py-1.5 text-sm text-chrome-text-active" />
          </label>
          <label className="text-xs text-chrome-text-muted">
            Trámite (opcional)
            <select value={serviceId} onChange={e => setServiceId(e.target.value)} className="mt-1 w-full rounded-md border border-chrome-border bg-chrome-bg-raised px-2.5 py-1.5 text-sm text-chrome-text-active">
              <option value="">Sin trámite por ahora</option>
              {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-xs text-chrome-text-muted hover:bg-chrome-bg-raised">Cancelar</button>
          <button onClick={guardar} disabled={saving} className="inline-flex items-center gap-1.5 rounded-md bg-chrome-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-chrome-accent-hover disabled:opacity-50">
            <Plus size={13} /> Crear cliente
          </button>
        </div>
      </div>
    </div>
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
export default function ClientsView({ searchQuery = '', onNavigateToClient }) {
  const { userProfile } = useAuth();
  const queryClient = useQueryClient();
  const { data: clients = [], isLoading, error } = useQuery({ queryKey: ['painel_clientes'], queryFn: getClients });
  const [tab, setTab] = useState('todos');
  const [servicio, setServicio] = useState('all');
  const [etapa, setEtapa] = useState('all');

  // Si el filtro de trámite/etapa elegido no existe en la pestaña nueva, se limpia solo
  // en vez de dejar una combinación que da 0 resultados sin ninguna pista de por qué.
  useEffect(() => {
    setServicio('all');
    setEtapa('all');
  }, [tab]);
  const [sort, setSort] = useState({ field: 'last_activity_at', dir: 'desc' });
  const [creating, setCreating] = useState(false);

  const byTab = useMemo(() => Object.fromEntries(TABS.map(t => [t.key, clients.filter(t.match).length])), [clients]);

  // Solo ofrece filtros de trámite/etapa que existen dentro de la pestaña activa — si no,
  // el usuario puede elegir una combinación que nunca da resultados y parece un filtro roto.
  const clientesDeLaPestana = useMemo(() => clients.filter(TABS.find(t => t.key === tab).match), [clients, tab]);
  const servicios = useMemo(() => [...new Set(clientesDeLaPestana.flatMap(c => c.tramites.map(t => t.servicio)))].sort(), [clientesDeLaPestana]);
  const etapas = useMemo(() => [...new Set(clientesDeLaPestana.flatMap(c => c.tramites.filter(isActiveTramite).map(t => t.etapa_general).filter(Boolean)))], [clientesDeLaPestana]);

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
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-chrome-text">Clientes</h1>
          <p className="mt-1 text-chrome-text-muted">
            {clients.length} clientes · {byTab.en_curso} con trámites en curso. Se registran solos cuando su lead entra a Operacional en Kommo.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded-md bg-chrome-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-chrome-accent-hover"
        >
          <Plus size={14} /> Nuevo cliente
        </button>
      </header>

      {creating && (
        <NewClientModal
          organizationId={userProfile.organization_id}
          onClose={() => setCreating(false)}
          onCreated={(client) => {
            setCreating(false);
            queryClient.invalidateQueries({ queryKey: ['painel_clientes'] });
            onNavigateToClient?.(client.id, client.full_name);
          }}
        />
      )}

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
                onClick={() => onNavigateToClient?.(c.id, displayName(c) === 'Sin nombre' ? formatPhone(c.phone) : displayName(c))}
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
    </div>
  );
}

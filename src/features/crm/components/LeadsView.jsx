import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Search, ArrowUp, ArrowDown, SlidersHorizontal, CloudOff } from 'lucide-react';
import { useAuth } from '@features/auth/context/AuthContext';
import { useCrmData, useMoveLead, useUnsynced, useRetryUnsynced, KEYS } from '../useCrm';
import { assignLeads, addTagToLeads, createLead } from '../services/crmService';
import LeadCard from './LeadCard';
import { StageLabel, Modal, Field, Loading, ErrorText } from '../ui';
import { money, relTime, normalize, stageColor, inputCls, selectCls, btnCls, btnPrimaryCls } from '../format';

const SORTS = {
  name: (l) => normalize(l.name),
  stage: (l) => l.stage_position ?? 0,
  value: (l) => Number(l.value) || 0,
  updated: (l) => l.updated_at || '',
  inbound: (l) => l.last_inbound_at || '',
  created: (l) => l.created_at || '',
};

const EMPTY_FILTERS = { stage: '', owner: '', service: '', source: '', country: '', city: '', tag: '', reply: false, mine: false };

const uniq = (rows, key) => [...new Set(rows.map((r) => r[key]).filter(Boolean))].sort();

function Th({ k, sort, onSort, children, className = '' }) {
  return (
    <th className={`whitespace-nowrap h-10 px-2 text-left text-[11px] font-medium uppercase tracking-wide text-text-muted ${className}`}>
      {k ? (
        <button className="inline-flex items-center gap-0.5 uppercase hover:text-text-primary" onClick={() => onSort(k)}>
          {children}{sort.key === k && (sort.dir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}
        </button>
      ) : children}
    </th>
  );
}

function NewLeadModal({ onClose, stages, team, onCreated }) {
  const openStages = stages.filter((st) => st.kind === 'open');
  const entry = openStages.find((st) => st.is_entry) || openStages[0];
  const [f, setF] = useState({ name: '', phone: '', serviceLabel: '', value: '', assignedTo: '', stageId: entry?.id || '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) return;
    setBusy(true);
    try {
      const res = await createLead(f);
      toast.success('Lead creado');
      onCreated(res.lead_id);
      onClose();
    } catch (err) {
      toast.error(err.message || 'No se pudo crear el lead');
      setBusy(false);
    }
  };

  return (
    <Modal title="Nuevo lead" onClose={onClose}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Nombre *"><input autoFocus className={inputCls} value={f.name} onChange={set('name')} /></Field>
        <Field label="Teléfono (WhatsApp)"><input className={inputCls} value={f.phone} onChange={set('phone')} placeholder="+55 11 9…" /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Trámite"><input className={inputCls} value={f.serviceLabel} onChange={set('serviceLabel')} placeholder="RNM, CPF…" /></Field>
          <Field label="Valor (R$)"><input type="number" min="0" className={inputCls} value={f.value} onChange={set('value')} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Etapa">
            <select className={selectCls} value={f.stageId} onChange={set('stageId')}>
              {openStages.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
          </Field>
          <Field label="Responsable">
            <select className={selectCls} value={f.assignedTo} onChange={set('assignedTo')}>
              <option value="">Sin asignar</option>
              {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
        </div>
        <p className="text-[11px] text-text-muted">Si el teléfono ya pertenece a un contacto, el lead se vincula a esa persona (no se duplica).</p>
        <div className="flex justify-end gap-2">
          <button type="button" className={btnCls} onClick={onClose}>Cancelar</button>
          <button type="submit" className={btnPrimaryCls} disabled={busy || !f.name.trim()}>Crear lead</button>
        </div>
      </form>
    </Modal>
  );
}

export default function LeadsView({ searchQuery = '', onNavigateToClient }) {
  const qc = useQueryClient();
  const { userId } = useAuth();
  const { leads, stages, team, tags, leadTags, teamById, stageById } = useCrmData();
  const move = useMoveLead(stages);
  const unsynced = useUnsynced();
  const retry = useRetryUnsynced();
  const [search, setSearch] = useState('');
  const [f, setF] = useState(EMPTY_FILTERS);
  const [sort, setSort] = useState({ key: 'updated', dir: 'desc' });
  const [selected, setSelected] = useState(new Set());
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const rows = useMemo(() => leads.data || [], [leads.data]);
  const tagIdsByLead = useMemo(() => {
    const m = {};
    for (const lt of leadTags.data || []) (m[lt.lead_id] ||= new Set()).add(lt.tag_id);
    return m;
  }, [leadTags.data]);

  const filtered = useMemo(() => {
    const q = normalize(`${searchQuery} ${search}`).trim().split(/\s+/).filter(Boolean);
    const out = rows.filter((l) => {
      if (f.stage && l.stage_id !== f.stage) return false;
      if (f.owner === 'none' ? l.assigned_to : f.owner && l.assigned_to !== f.owner) return false;
      if (f.mine && l.assigned_to !== userId) return false;
      if (f.service && l.service_label !== f.service) return false;
      if (f.source && l.lead_source !== f.source) return false;
      if (f.country && l.country !== f.country) return false;
      if (f.city && l.city !== f.city) return false;
      if (f.tag && !tagIdsByLead[l.id]?.has(f.tag)) return false;
      if (f.reply && !l.needs_reply) return false;
      if (!q.length) return true;
      const hay = normalize(`${l.name} ${l.service_label} ${l.country} ${l.city} ${l.stage_name}`);
      const digits = String(l.phone || '').replace(/\D/g, '');
      return q.every((t) => hay.includes(t) || (t.replace(/\D/g, '').length >= 3 && digits.includes(t.replace(/\D/g, ''))));
    });
    const get = SORTS[sort.key];
    out.sort((a, b) => (get(a) < get(b) ? -1 : get(a) > get(b) ? 1 : 0) * (sort.dir === 'asc' ? 1 : -1));
    return out;
  }, [rows, f, search, searchQuery, sort, userId, tagIdsByLead]);

  const toggleSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' }));
  const allSelected = filtered.length > 0 && filtered.every((l) => selected.has(l.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(filtered.map((l) => l.id)));
  const toggle = (id) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const ids = [...selected];
  const open = rows.find((l) => l.id === openId);

  const bulk = async (fn, okMsg) => {
    setBusy(true);
    try {
      await fn();
      toast.success(okMsg);
      setSelected(new Set());
    } catch (err) {
      toast.error(err.message || 'No se pudo aplicar');
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: KEYS.leads });
      qc.invalidateQueries({ queryKey: KEYS.leadTags });
      qc.invalidateQueries({ queryKey: KEYS.events });
    }
  };
  const bulkStage = (stageId) => stageId && bulk(async () => {
    // Uno por uno: cada cambio deja su evento y se sincroniza por separado con Kommo.
    let failed = 0;
    for (const l of rows.filter((r) => selected.has(r.id))) {
      try {
        const res = await move(l, stageId, { silent: true });
        if (res?.sync === 'failed') failed += 1;
      } catch { failed += 1; }
    }
    if (failed) toast.error(`${failed} lead(s) quedaron pendientes de sincronizar con Kommo`);
  }, `${ids.length} lead(s) movidos`);
  const bulkOwner = (uid) => uid !== '' && bulk(() => assignLeads(ids, uid === 'none' ? null : uid), 'Responsable actualizado');
  const bulkTag = (tagId) => tagId && bulk(() => addTagToLeads(ids, tagId), 'Etiqueta agregada');

  if (leads.isLoading) return <Loading />;
  if (leads.error) return <ErrorText error={leads.error} what="los leads" />;

  const activeFilters = Object.values(f).filter(Boolean).length;
  const setFilter = (key) => (e) => setF((s) => ({ ...s, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const sel = (key, label, options) => (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-text-muted">{label}</span>
      <select className={selectCls} value={f[key]} onChange={setFilter(key)}>
        <option value="">Todos</option>
        {options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </label>
  );

  return (
    <div className="flex h-full min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col bg-bg-surface">
        {/* Barra única: título, búsqueda, filtros y alta */}
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-5">
          <h1 className="text-[15px] font-semibold text-text-primary">Leads</h1>
          <span className="text-xs text-text-muted">{filtered.length}</span>
          <div className="relative ml-3 w-72 shrink-0">
            <Search size={14} className="absolute left-2.5 top-2.5 text-text-muted" />
            <input className={`${inputCls} h-9 !pl-8`} placeholder="Buscar" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button className={`${btnCls} h-9 ${activeFilters ? '!border-brand-primary !text-brand-primary' : ''}`} onClick={() => setShowFilters((v) => !v)}>
            <SlidersHorizontal size={14} /> Filtros{activeFilters ? ` · ${activeFilters}` : ''}
          </button>
          {unsynced.data?.length > 0 && (
            <button className="ml-auto inline-flex items-center gap-1.5 text-xs text-warning hover:underline" onClick={() => retry()} title="Cambios de etapa guardados que todavía no llegaron a Kommo. Clic para reintentar.">
              <CloudOff size={13} /> {unsynced.data.length} sin sincronizar con Kommo
            </button>
          )}
          <button className={`${btnPrimaryCls} h-9 ${unsynced.data?.length ? '' : 'ml-auto'}`} onClick={() => setCreating(true)}><Plus size={14} /> Nuevo lead</button>
        </div>

        {showFilters && (
          <div className="grid shrink-0 grid-cols-2 gap-3 border-b border-border bg-bg-base px-5 py-3 md:grid-cols-4 xl:grid-cols-7">
            {sel('stage', 'Etapa', stages.map((st) => [st.id, st.name]))}
            {sel('owner', 'Responsable', [['none', 'Sin asignar'], ...(team.data || []).map((m) => [m.id, m.name])])}
            {sel('service', 'Trámite', uniq(rows, 'service_label').map((v) => [v, v]))}
            {sel('country', 'País', uniq(rows, 'country').map((v) => [v, v]))}
            {sel('city', 'Ciudad', uniq(rows, 'city').map((v) => [v, v]))}
            {sel('source', 'Origen', uniq(rows, 'lead_source').map((v) => [v, v]))}
            {sel('tag', 'Etiqueta', (tags.data || []).map((t) => [t.id, t.name]))}
            <div className="col-span-full flex items-center gap-4 text-[13px] text-text-secondary">
              <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={f.reply} onChange={setFilter('reply')} /> Sin responder</label>
              <label className="inline-flex items-center gap-1.5"><input type="checkbox" checked={f.mine} onChange={setFilter('mine')} /> Solo míos</label>
              {activeFilters > 0 && <button className="ml-auto text-xs text-brand-primary hover:underline" onClick={() => setF(EMPTY_FILTERS)}>Limpiar filtros</button>}
            </div>
          </div>
        )}

        {selected.size > 0 && (
          <div className="flex shrink-0 items-center gap-2 border-b border-border bg-brand-primary-light px-5 py-2 text-[13px]">
            <span className="font-medium text-brand-primary">{selected.size} seleccionados</span>
            <select className={`${selectCls} ml-3 !w-44`} value="" disabled={busy} onChange={(e) => bulkStage(e.target.value)}>
              <option value="">Cambiar etapa</option>
              {stages.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
            <select className={`${selectCls} !w-44`} value="" disabled={busy} onChange={(e) => bulkOwner(e.target.value)}>
              <option value="">Asignar responsable</option>
              <option value="none">Sin asignar</option>
              {(team.data || []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <select className={`${selectCls} !w-44`} value="" disabled={busy} onChange={(e) => bulkTag(e.target.value)}>
              <option value="">Agregar etiqueta</option>
              {(tags.data || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button className="ml-auto text-xs text-text-muted hover:text-text-primary" onClick={() => setSelected(new Set())}>Cancelar</button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead className="sticky top-0 z-10 bg-bg-surface shadow-[inset_0_-1px_0_var(--color-border)]">
              <tr>
                <th className="w-10 pl-5"><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Seleccionar todos" /></th>
                <Th k="name" sort={sort} onSort={toggleSort}>Nombre</Th>
                <Th k="stage" sort={sort} onSort={toggleSort}>Etapa</Th>
                <Th>Trámite</Th>
                <Th>Responsable</Th>
                <Th k="value" sort={sort} onSort={toggleSort} className="text-right">Valor</Th>
                <Th k="inbound" sort={sort} onSort={toggleSort} className="pr-5 text-right">Último mensaje</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} onClick={() => setOpenId(l.id)}
                  className={`group h-11 cursor-pointer border-b border-border ${openId === l.id || selected.has(l.id) ? 'bg-brand-primary-light' : 'hover:bg-bg-base'}`}>
                  <td className="pl-5" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggle(l.id)} aria-label={`Seleccionar ${l.name}`} />
                  </td>
                  <td className="px-2">
                    <span className="font-medium text-text-primary">{l.name || 'Sin nombre'}</span>
                    {l.needs_reply && <span title="Mensaje sin responder" className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-success align-middle" />}
                  </td>
                  <td className="px-2"><StageLabel name={l.stage_name} color={stageColor(stageById[l.stage_id])} /></td>
                  <td className="px-2 text-text-secondary">{l.service_label || '—'}</td>
                  <td className="px-2 text-text-secondary">{teamById[l.assigned_to] || '—'}</td>
                  <td className="px-2 text-right tabular-nums text-text-primary">{money(l.value) || '—'}</td>
                  <td className="whitespace-nowrap px-2 pr-5 text-right text-text-muted">{relTime(l.last_inbound_at)}</td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={7} className="p-12 text-center text-sm text-text-muted">No hay leads con estos filtros.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {open && <LeadCard key={open.id} lead={open} onClose={() => setOpenId(null)} onOpenClient={onNavigateToClient} />}
      {creating && (
        <NewLeadModal onClose={() => setCreating(false)} stages={stages} team={team.data || []}
          onCreated={(id) => { qc.invalidateQueries({ queryKey: KEYS.leads }); setOpenId(id); }} />
      )}
    </div>
  );
}

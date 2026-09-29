import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowUp, ArrowDown, Trash2, Plus, Link2 } from 'lucide-react';
import { useCrmData, KEYS } from '../useCrm';
import { updateStage, createStage, deleteStage, setEntryStage, createTag, renameTag, deleteTag, getOrgSetting, setOrgSetting } from '../services/crmService';
import { PageHeader, Loading, ErrorText } from '../ui';
import { inputCls, btnCls, btnPrimaryCls } from '../format';

const KIND = { open: 'Abierta', won: 'Ganado', lost: 'Perdido' };

function Card({ title, description, children }) {
  return (
    <section className="rounded-lg border border-border bg-bg-surface">
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-text-muted">{description}</p>}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function useSaver() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const save = async (fn, ok, keys = [KEYS.pipelines, KEYS.leads]) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
      keys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
    } catch (err) {
      toast.error(err.message || 'No se pudo guardar (¿tienes permisos de administrador?)');
    } finally {
      setBusy(false);
    }
  };
  return [save, busy];
}

function Pipelines() {
  const { pipelines, leads } = useCrmData();
  const [save, busy] = useSaver();
  const [newStage, setNewStage] = useState({});
  const count = (stageId) => (leads.data || []).filter((l) => l.stage_id === stageId).length;

  if (pipelines.isLoading) return <Loading />;
  if (pipelines.error) return <ErrorText error={pipelines.error} what="los embudos" />;

  return (pipelines.data || []).map((p) => {
    const stages = p.stages;
    const swap = (i, j) => save(async () => {
      await updateStage(stages[i].id, { position: stages[j].position });
      await updateStage(stages[j].id, { position: stages[i].position });
    });
    const add = () => {
      const name = (newStage[p.id] || '').trim();
      if (!name) return;
      const lastOpen = stages.filter((s) => s.kind === 'open').at(-1);
      save(async () => {
        await createStage(p.id, { name, position: (lastOpen?.position ?? 0) + 1 });
        setNewStage((s) => ({ ...s, [p.id]: '' }));
      }, 'Etapa creada');
    };
    return (
      <Card key={p.id} title={`Embudo ${p.name}`} description="Etapas de los leads. Las etapas marcadas “Kommo” están enlazadas con Kommo y n8n: se pueden renombrar y reordenar, pero no borrar.">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-text-muted">
              <th className="w-16 pb-2 font-medium">Orden</th>
              <th className="w-10 pb-2 font-medium">Color</th>
              <th className="pb-2 font-medium">Nombre</th>
              <th className="w-28 pb-2 font-medium">Tipo</th>
              <th className="w-20 pb-2 text-center font-medium">Entrada</th>
              <th className="w-16 pb-2 text-right font-medium">Leads</th>
              <th className="w-10 pb-2" />
            </tr>
          </thead>
          <tbody>
            {stages.map((s, i) => (
              <tr key={s.id} className="border-t border-border">
                <td className="py-1.5">
                  <button className="rounded p-1 text-text-muted hover:bg-bg-elevated disabled:opacity-30" disabled={busy || i === 0} onClick={() => swap(i, i - 1)} aria-label="Subir"><ArrowUp size={13} /></button>
                  <button className="rounded p-1 text-text-muted hover:bg-bg-elevated disabled:opacity-30" disabled={busy || i === stages.length - 1} onClick={() => swap(i, i + 1)} aria-label="Bajar"><ArrowDown size={13} /></button>
                </td>
                <td>
                  <input type="color" className="h-6 w-7 cursor-pointer rounded border border-border bg-transparent" value={s.color || '#1e3a8a'}
                    onChange={(e) => save(() => updateStage(s.id, { color: e.target.value }))} aria-label="Color" />
                </td>
                <td className="pr-2">
                  <div className="flex items-center gap-1.5">
                    <input className={inputCls} defaultValue={s.name} onBlur={(e) => e.target.value.trim() && e.target.value !== s.name && save(() => updateStage(s.id, { name: e.target.value.trim() }), 'Etapa renombrada')} />
                    {s.kommo_status_id && <span className="shrink-0 rounded bg-bg-elevated px-1.5 py-0.5 text-[10px] text-text-muted" title={`status ${s.kommo_status_id}`}>Kommo</span>}
                  </div>
                </td>
                <td>
                  <select className="h-8 w-full rounded-md border border-border bg-bg-surface px-1.5 text-[13px] text-text-primary" value={s.kind} disabled={busy}
                    onChange={(e) => save(() => updateStage(s.id, { kind: e.target.value }))}>
                    {Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </td>
                <td className="text-center">
                  <input type="radio" name={`entry-${p.id}`} checked={!!s.is_entry} disabled={busy || s.kind !== 'open'}
                    onChange={() => save(() => setEntryStage(p.id, s.id), `Los leads nuevos entran en “${s.name}”`)} title="Etapa donde nacen los leads creados en el panel" />
                </td>
                <td className="text-right tabular-nums text-text-secondary">{count(s.id)}</td>
                <td className="text-right">
                  {!s.kommo_status_id && (
                    <button className="rounded p-1 text-text-muted hover:bg-danger-bg hover:text-danger disabled:opacity-30" disabled={busy || count(s.id) > 0}
                      title={count(s.id) > 0 ? 'Mueve primero sus leads a otra etapa' : 'Borrar etapa'}
                      onClick={() => window.confirm(`¿Borrar la etapa “${s.name}”?`) && save(() => deleteStage(s.id), 'Etapa borrada')}>
                      <Trash2 size={13} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex gap-2">
          <input className={`${inputCls} max-w-xs flex-1`} placeholder="Nueva etapa" value={newStage[p.id] || ''} onChange={(e) => setNewStage((st) => ({ ...st, [p.id]: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && add()} />
          <button className={btnCls} onClick={add} disabled={busy || !(newStage[p.id] || '').trim()}><Plus size={13} /> Agregar etapa</button>
        </div>
        <p className="mt-2 text-[11px] text-text-muted">Los leads que se muevan a una etapa creada aquí (sin “Kommo”) quedan solo en el panel: Kommo no se actualiza.</p>
      </Card>
    );
  });
}

function Tags() {
  const { tags } = useCrmData();
  const [save, busy] = useSaver();
  const [name, setName] = useState('');
  const keys = [KEYS.tags, KEYS.leadTags];
  const add = () => name.trim() && save(async () => { await createTag(name); setName(''); }, 'Etiqueta creada', keys);
  return (
    <Card title="Etiquetas" description="Se usan en Leads y Conversaciones para agrupar leads (ej.: RNM, Argentina, Urgente).">
      <div className="flex flex-wrap gap-1.5">
        {(tags.data || []).map((t) => (
          <span key={t.id} className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-base pl-2 pr-1 text-[13px]">
            <input className="w-24 bg-transparent py-1 text-text-primary outline-none" defaultValue={t.name}
              onBlur={(e) => e.target.value.trim() && e.target.value !== t.name && save(() => renameTag(t.id, e.target.value), 'Etiqueta renombrada', keys)} />
            <button className="rounded p-0.5 text-text-muted hover:text-danger" disabled={busy} aria-label={`Borrar ${t.name}`}
              onClick={() => window.confirm(`¿Borrar la etiqueta “${t.name}”? Se quita de todos los leads.`) && save(() => deleteTag(t.id), 'Etiqueta borrada', keys)}>
              <Trash2 size={12} />
            </button>
          </span>
        ))}
        {tags.data?.length === 0 && <p className="text-xs text-text-muted">Todavía no hay etiquetas.</p>}
      </div>
      <div className="mt-3 flex gap-2">
        <input className={`${inputCls} max-w-xs flex-1`} placeholder="Nueva etiqueta" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className={btnCls} onClick={add} disabled={busy || !name.trim()}><Plus size={13} /> Crear</button>
      </div>
    </Card>
  );
}

function Integrations() {
  const current = useQuery({ queryKey: KEYS.kommoUrl, queryFn: () => getOrgSetting('kommo_base_url') });
  const [save, busy] = useSaver();
  const [url, setUrl] = useState(null);
  const value = url ?? (typeof current.data === 'string' ? current.data : '');
  return (
    <Card title="Integraciones" description="Supabase es la fuente principal del CRM. Kommo se mantiene sincronizado mientras exista la integración.">
      <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-text-muted">Cuenta de Kommo</label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link2 size={13} className="absolute left-2.5 top-2.5 text-text-muted" />
          <input className={`${inputCls} !pl-8`} placeholder="https://tuempresa.kommo.com" value={value} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <button className={btnPrimaryCls} disabled={busy || !/^https:\/\/[\w.-]+$/.test(value.trim().replace(/\/+$/, ''))}
          onClick={() => save(() => setOrgSetting('kommo_base_url', value.trim().replace(/\/+$/, '')), 'Cuenta de Kommo guardada', [KEYS.kommoUrl])}>
          Guardar
        </button>
      </div>
      <p className="mt-2 text-[11px] text-text-muted">
        Se usa para los enlaces “Ver en Kommo” y para sincronizar los cambios de etapa. El token de Kommo y el de WhatsApp viven solo en los secretos de Supabase, nunca en el navegador.
      </p>
    </Card>
  );
}

export default function ConfigView() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader title="Configuración" />
      <div className="min-h-0 flex-1 overflow-y-auto bg-bg-base">
        <div className="mx-auto flex max-w-4xl flex-col gap-4 px-6 py-5">
          <Pipelines />
          <Tags />
          <Integrations />
        </div>
      </div>
    </div>
  );
}

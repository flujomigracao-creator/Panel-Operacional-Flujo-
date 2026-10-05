import React, { useState } from 'react';
import { CheckCircle2, Archive, Link2, Send, Loader2, ImageOff, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import * as cr from '../../services/creativesService';

const ESTADO_COLOR = {
  draft: 'bg-slate-500/15 text-slate-400',
  approved: 'bg-emerald-500/15 text-emerald-400',
  published: 'bg-sky-500/15 text-sky-400',
  archived: 'bg-chrome-bg-raised text-chrome-text-muted',
};

const ASPECTO = { '1:1': 'aspect-square', '4:5': 'aspect-[4/5]', '9:16': 'aspect-[9/16]' };

function Dato({ label, valor }) {
  return (
    <div className="rounded-md bg-chrome-bg px-2 py-1">
      <p className="text-[9px] uppercase tracking-wide text-chrome-text-muted">{label}</p>
      <p className="text-xs font-semibold text-chrome-text-active">{valor}</p>
    </div>
  );
}

export default function CreativeCard({ creativo: c, imagenUrl, anuncios, conjuntos, seleccionado, onSeleccion, onCambio, onPropuesta }) {
  const [busy, setBusy] = useState(false);
  const [vincular, setVincular] = useState(false);
  const [adId, setAdId] = useState('');
  const [adsetId, setAdsetId] = useState('');
  const [publicar, setPublicar] = useState(false);
  const [regenerar, setRegenerar] = useState(false);
  const [cambio, setCambio] = useState({ variable: 'estilo', estilo: 'ilustracion', hook: '', prompt: '' });

  const tieneDatos = c.ad_id && c.impresiones != null;
  // Un anuncio solo se puede ligar a un creativo: se ofrecen los que aún no tienen uno.
  const adsLibres = anuncios.filter(a => !a.vinculado);

  const ejecutar = async (fn, ok) => {
    setBusy(true);
    try {
      const r = await fn();
      if (ok) toast.success(ok);
      return r;
    } catch (e) {
      toast.error(e.message || 'No se pudo completar la acción');
    } finally {
      setBusy(false);
    }
  };

  const cambiarEstado = async (status) => {
    await ejecutar(() => cr.actualizarCreativo(c.id, { status }), status === 'approved' ? 'Creativo aprobado' : 'Estado actualizado');
    onCambio();
  };

  const vincularAnuncio = async () => {
    if (!adId) return;
    const r = await ejecutar(() => cr.actualizarCreativo(c.id, { ad_id: adId }), 'Anuncio vinculado');
    if (r) { setVincular(false); onCambio(); }
  };

  // Regenerar = versión NUEVA (v2, v3…) cambiando UNA variable declarada. La imagen anterior se conserva.
  const regenerarVariante = async () => {
    const body = { from_creative_id: c.id, changed_variable: cambio.variable };
    if (cambio.variable === 'estilo') body.style = cambio.estilo;
    if (cambio.variable === 'hook') body.hook = cambio.hook;
    // Concepto y composición no se pueden deducir: el usuario escribe el prompt nuevo.
    if (['concepto', 'composicion'].includes(cambio.variable)) body.prompt = cambio.prompt;
    const r = await ejecutar(() => cr.regenerarCreativo(body), 'Nueva versión generada; la anterior se conserva');
    if (r) { setRegenerar(false); onCambio(); }
  };

  const pedirPublicacion = async () => {
    if (!adsetId) return;
    const r = await ejecutar(() => cr.proponerPublicacion(c.id, adsetId));
    if (r?.propuesta) { setPublicar(false); onPropuesta(r.propuesta); toast.success('Propuesta creada: confírmala para publicar'); }
  };

  return (
    <div className={`flex flex-col overflow-hidden rounded-xl border bg-chrome-bg-raised ${seleccionado ? 'border-brand-primary' : 'border-chrome-border'}`}>
      <div className={`relative w-full ${ASPECTO[c.format] || 'aspect-square'} max-h-64 bg-chrome-bg`}>
        {imagenUrl
          ? <img src={imagenUrl} alt={c.headline || c.service} className="h-full w-full object-cover" loading="lazy" />
          : <div className="flex h-full items-center justify-center text-chrome-text-muted"><ImageOff size={24} /></div>}
        <label className="absolute left-2 top-2 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
          <input type="checkbox" checked={seleccionado} onChange={e => onSeleccion(c.id, e.target.checked)} /> Comparar
        </label>
        <span className={`absolute right-2 top-2 rounded px-1.5 py-0.5 text-[10px] font-semibold ${ESTADO_COLOR[c.status]}`}>{cr.ESTADO_LABEL[c.status]}</span>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div>
          <p className="text-sm font-semibold text-chrome-text-active">{c.headline || 'Sin titular'}</p>
          <p className="mt-0.5 text-[11px] text-chrome-text-muted">
            {cr.CONCEPTOS[c.concept] || c.concept || 'Sin concepto'} · {cr.FORMATO_LABEL[c.format]} · prompt v{c.prompt_version ?? '—'}
          </p>
          <p className="text-[11px] text-chrome-text-muted">
            Versión v{c.version ?? 1}{c.changed_variable ? ` · cambió: ${cr.VARIABLES_CAMBIO[c.changed_variable] || c.changed_variable}` : ''}{c.model ? ` · ${c.model}` : ''}
          </p>
        </div>

        {tieneDatos ? (
          <div className="grid grid-cols-3 gap-1.5">
            <Dato label="Conversac." valor={cr.formatear(c.conversaciones, 'int')} />
            <Dato label="Clientes" valor={cr.formatear(c.clientes_pagaron, 'int')} />
            <Dato label="Costo/cliente" valor={cr.formatear(c.costo_por_cliente, 'brl')} />
            <Dato label="Costo/conv." valor={cr.formatear(c.costo_por_conversacion, 'brl')} />
            <Dato label="CTR" valor={cr.formatear(c.ctr, 'pct')} />
            <Dato label="Ingresos" valor={cr.formatear(c.ingresos, 'brl')} />
          </div>
        ) : (
          <p className="rounded-md bg-chrome-bg px-2 py-1.5 text-[11px] text-chrome-text-muted">
            {c.ad_id ? 'Anuncio vinculado: aún sin métricas en Supabase.' : 'Sin anuncio de Meta vinculado: todavía no hay resultados.'}
          </p>
        )}

        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          {c.status === 'draft' && (
            <button disabled={busy} onClick={() => cambiarEstado('approved')} className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
              <CheckCircle2 size={12} /> Aprobar
            </button>
          )}
          {c.status === 'approved' && !c.ad_id && (
            <button disabled={busy} onClick={() => setPublicar(p => !p)} className="inline-flex items-center gap-1 rounded-md bg-brand-primary px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50">
              <Send size={12} /> Publicar en Meta
            </button>
          )}
          {!c.ad_id && c.status !== 'archived' && (
            <button disabled={busy} onClick={() => setVincular(v => !v)} className="inline-flex items-center gap-1 rounded-md border border-chrome-border px-2 py-1 text-[11px] text-chrome-text hover:bg-chrome-bg disabled:opacity-50">
              <Link2 size={12} /> Vincular anuncio
            </button>
          )}
          {c.status !== 'archived' && !c.ad_id && (
            <button disabled={busy} onClick={() => cambiarEstado('archived')} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-chrome-text-muted hover:bg-chrome-bg disabled:opacity-50">
              <Archive size={12} /> Archivar
            </button>
          )}
          {c.image_path && c.status !== 'archived' && (
            <button disabled={busy} onClick={() => setRegenerar(v => !v)} className="inline-flex items-center gap-1 rounded-md border border-chrome-border px-2 py-1 text-[11px] text-chrome-text hover:bg-chrome-bg disabled:opacity-50">
              <RefreshCw size={12} /> Regenerar variante
            </button>
          )}
          {busy && <Loader2 size={14} className="animate-spin text-chrome-text-muted" />}
        </div>

        {regenerar && (
          <div className="space-y-1.5 rounded-md border border-chrome-border p-2">
            <p className="text-[11px] text-chrome-text-muted">Se crea una versión nueva (v{(c.version ?? 1) + 1}+). Cambia UNA sola variable para saber qué produjo la diferencia.</p>
            <select value={cambio.variable} onChange={e => setCambio({ ...cambio, variable: e.target.value })} className="w-full rounded border border-chrome-border bg-chrome-bg px-2 py-1 text-xs text-chrome-text-active">
              {Object.entries(cr.VARIABLES_CAMBIO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            {cambio.variable === 'estilo' && (
              <select value={cambio.estilo} onChange={e => setCambio({ ...cambio, estilo: e.target.value })} className="w-full rounded border border-chrome-border bg-chrome-bg px-2 py-1 text-xs text-chrome-text-active">
                {Object.entries(cr.ESTILOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            )}
            {cambio.variable === 'hook' && (
              <input value={cambio.hook} onChange={e => setCambio({ ...cambio, hook: e.target.value })} placeholder="Nuevo hook" className="w-full rounded border border-chrome-border bg-chrome-bg px-2 py-1 text-xs text-chrome-text-active" />
            )}
            {['concepto', 'composicion'].includes(cambio.variable) && (
              <textarea rows={4} value={cambio.prompt} onChange={e => setCambio({ ...cambio, prompt: e.target.value })} placeholder="Prompt nuevo (obligatorio para este cambio)" className="w-full rounded border border-chrome-border bg-chrome-bg px-2 py-1 font-mono text-xs text-chrome-text-active" />
            )}
            <button disabled={busy || (cambio.variable === 'hook' && !cambio.hook.trim()) || (['concepto', 'composicion'].includes(cambio.variable) && !cambio.prompt.trim())} onClick={regenerarVariante} className="rounded-md bg-brand-primary px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50">
              {busy ? 'Generando…' : 'Generar nueva versión'}
            </button>
          </div>
        )}

        {vincular && (
          <div className="space-y-1.5 rounded-md border border-chrome-border p-2">
            <p className="text-[11px] text-chrome-text-muted">Solo anuncios reales sincronizados desde Meta.</p>
            <select value={adId} onChange={e => setAdId(e.target.value)} className="w-full rounded border border-chrome-border bg-chrome-bg px-2 py-1 text-xs text-chrome-text-active">
              <option value="">Elige un anuncio…</option>
              {adsLibres.map(a => <option key={a.entity_id} value={a.entity_id}>{a.name || a.entity_id}</option>)}
            </select>
            <button disabled={!adId || busy} onClick={vincularAnuncio} className="rounded-md bg-brand-primary px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50">Vincular</button>
          </div>
        )}

        {publicar && (
          <div className="space-y-1.5 rounded-md border border-chrome-border p-2">
            <p className="text-[11px] text-chrome-text-muted">Se crea una propuesta; nada se publica hasta que la confirmes. El anuncio nace en pausa.</p>
            <select value={adsetId} onChange={e => setAdsetId(e.target.value)} className="w-full rounded border border-chrome-border bg-chrome-bg px-2 py-1 text-xs text-chrome-text-active">
              <option value="">Conjunto de anuncios de destino…</option>
              {conjuntos.map(a => <option key={a.entity_id} value={a.entity_id}>{a.name || a.entity_id}</option>)}
            </select>
            <button disabled={!adsetId || busy} onClick={pedirPublicacion} className="rounded-md bg-brand-primary px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50">Crear propuesta</button>
          </div>
        )}
      </div>
    </div>
  );
}

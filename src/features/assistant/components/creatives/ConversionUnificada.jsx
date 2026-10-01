import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, Search, ExternalLink, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import * as cr from '../../services/creativesService';

const BADGE = {
  anuncio: 'bg-emerald-500/15 text-emerald-400',
  meta_declarado: 'bg-amber-500/15 text-amber-400',
  sin_origen: 'bg-chrome-bg text-chrome-text-muted',
};
const ORIGEN_LABEL = { anuncio: 'Anuncio', meta_declarado: 'Meta (sin anuncio)', sin_origen: 'Sin origen' };
const th = 'px-2 py-2 text-left text-[10px] uppercase tracking-wide text-chrome-text-muted';
const td = 'px-2 py-2 align-top';
const campo = 'rounded border border-chrome-border bg-chrome-bg px-2 py-1 text-xs text-chrome-text-active';

/** Todo en un solo lugar: qué imagen/prompt convierte, de dónde viene cada cliente y qué tendencias aprendió el agente. */
export default function ConversionUnificada({ creativos, prompts, imagenes }) {
  const [origen, setOrigen] = useState([]);
  const [cobertura, setCobertura] = useState(null);
  const [tendencias, setTendencias] = useState([]);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState('todos');
  const [buscando, setBuscando] = useState(false);
  const [tServicio, setTServicio] = useState('');
  const [tTema, setTTema] = useState('');

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const [o, c, t] = await Promise.all([cr.listarOrigenLeads(), cr.leerCobertura(), cr.listarTendencias()]);
      setOrigen(o); setCobertura(c); setTendencias(t);
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const filas = useMemo(() => cr.unirConversion(creativos, prompts), [creativos, prompts]);
  const resumen = useMemo(() => cr.resumenCobertura(cobertura), [cobertura]);
  const leads = useMemo(() => origen.filter(l => (
    filtro === 'cerrados' ? (l.ganado || Number(l.pagos) > 0) : filtro === 'anuncio' ? l.origen === 'anuncio' : true)), [origen, filtro]);

  const buscar = async () => {
    setBuscando(true);
    try {
      const r = await cr.buscarTendencias({ service: tServicio || undefined, tema: tTema || undefined });
      toast.success(`${r.tendencias.length} tendencias guardadas con sus fuentes`);
      await cargar();
    } catch (e) { toast.error(e.message); } finally { setBuscando(false); }
  };

  return (
    <div className="space-y-5">
      {error && <p className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">No se pudo cargar: {error}</p>}

      <div className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${resumen.estado === 'esperando' ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' : 'border-chrome-border bg-chrome-bg-raised text-chrome-text'}`}>
        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
        <p>{resumen.texto}</p>
      </div>

      <section className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wider text-chrome-text-active">Qué imagen y qué prompt convierten</h3>
        <p className="text-[11px] text-chrome-text-muted">Ordenado por clientes que pagaron y luego por conversaciones. “—” = sin dato (no es cero).</p>
        <div className="overflow-x-auto rounded-xl border border-chrome-border bg-chrome-bg-raised">
          <table className="w-full text-xs text-chrome-text">
            <thead><tr>
              <th className={th} /><th className={th}>Creativo</th><th className={th}>Prompt</th><th className={th}>Impres.</th><th className={th}>Conv.</th>
              <th className={th}>Leads</th><th className={th}>Clientes</th><th className={th}>Costo/cliente</th><th className={th}>Ingresos</th>
            </tr></thead>
            <tbody>
              {filas.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-chrome-text-muted">Aún no hay creativos.</td></tr>}
              {filas.map(c => (
                <tr key={c.id} className="border-t border-chrome-border">
                  <td className={td}>{imagenes[c.image_path] && <img src={imagenes[c.image_path]} alt="" className="h-12 w-12 rounded object-cover" />}</td>
                  <td className={td}>
                    <p className="font-medium text-chrome-text-active">{c.headline || 'Sin titular'}</p>
                    <p className="text-[10px] text-chrome-text-muted">{c.service} · {cr.FORMATO_LABEL[c.format]} · v{c.version ?? 1}{c.ad_id ? '' : ' · sin anuncio'}</p>
                  </td>
                  <td className={td}>{c.prompt_nombre ? `${c.prompt_nombre} · v${c.prompt_version ?? '—'}` : '—'}</td>
                  <td className={td}>{cr.formatear(c.impresiones, 'int')}</td>
                  <td className={td}>{cr.formatear(c.conversaciones, 'int')}</td>
                  <td className={td}>{cr.formatear(c.leads, 'int')}</td>
                  <td className={`${td} font-semibold`}>{cr.formatear(c.clientes_pagaron, 'int')}</td>
                  <td className={td}>{cr.formatear(c.costo_por_cliente, 'brl')}</td>
                  <td className={td}>{cr.formatear(c.ingresos, 'brl')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-chrome-text-active">De dónde viene cada cliente de Nora</h3>
          <div className="flex gap-1">
            {[['todos', 'Todos'], ['cerrados', 'Cerrados / pagaron'], ['anuncio', 'Con anuncio']].map(([k, l]) => (
              <button key={k} onClick={() => setFiltro(k)} className={`rounded-md px-2 py-1 text-[11px] ${filtro === k ? 'bg-brand-primary text-white' : 'bg-chrome-bg-raised text-chrome-text-muted'}`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="max-h-96 overflow-auto rounded-xl border border-chrome-border bg-chrome-bg-raised">
          <table className="w-full text-xs text-chrome-text">
            <thead className="sticky top-0 bg-chrome-bg-raised"><tr>
              <th className={th}>Lead</th><th className={th}>Trámite</th><th className={th}>Etapa</th><th className={th}>Origen</th>
              <th className={th}>Anuncio / campaña</th><th className={th}>Creativo · prompt</th><th className={th}>Pagos</th>
            </tr></thead>
            <tbody>
              {leads.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-chrome-text-muted">Sin leads para este filtro.</td></tr>}
              {leads.map(l => (
                <tr key={l.lead_id} className="border-t border-chrome-border">
                  <td className={td}>{l.nombre || '—'}</td>
                  <td className={td}>{l.tramite_texto || '—'}</td>
                  <td className={td}>{l.etapa_nombre || '—'}{l.ganado ? ' ✓' : ''}</td>
                  <td className={td}><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${BADGE[l.origen]}`}>{ORIGEN_LABEL[l.origen]}</span></td>
                  <td className={td}>{l.origen === 'anuncio' ? <>{l.ad_name || l.ad_id}<br /><span className="text-[10px] text-chrome-text-muted">{l.campaign_name || ''}</span></> : '—'}</td>
                  <td className={td}>{l.creative_headline ? <>{l.creative_headline} v{l.creative_version}<br /><span className="text-[10px] text-chrome-text-muted">{l.prompt_name} v{l.prompt_version}</span></> : '—'}</td>
                  <td className={td}>{Number(l.pagos) > 0 ? `${l.pagos} · ${cr.formatear(l.ingresos, 'brl')}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-chrome-text-active"><TrendingUp size={14} /> Tendencias que aprendió el agente</h3>
        <p className="text-[11px] text-chrome-text-muted">Búsqueda web real con fuentes. Son hipótesis para probar en experimentos, no evidencia del negocio.</p>
        <div className="flex flex-wrap items-center gap-2">
          <select className={campo} value={tServicio} onChange={e => setTServicio(e.target.value)}>
            <option value="">Todos los servicios</option>{cr.SERVICIOS.map(s => <option key={s}>{s}</option>)}
          </select>
          <input className={`${campo} w-64`} placeholder="Tema opcional (ej. urgencia en citas PF)" value={tTema} onChange={e => setTTema(e.target.value)} />
          <button disabled={buscando} onClick={buscar} className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
            {buscando ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} {buscando ? 'Buscando…' : 'Buscar tendencias'}
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
          {tendencias.length === 0 && <p className="text-xs text-chrome-text-muted">Todavía no hay tendencias guardadas.</p>}
          {tendencias.map(t => (
            <div key={t.id} className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-3">
              <p className="text-xs font-semibold text-chrome-text-active">{t.topic}{t.service ? ` · ${t.service}` : ''}</p>
              <p className="mt-1 whitespace-pre-line text-[11px] text-chrome-text">{t.summary}</p>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
                {(t.sources || []).slice(0, 3).map(f => (
                  <a key={f.url} href={f.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-[10px] text-sky-400 hover:underline">
                    <ExternalLink size={9} /> {(f.titulo || new URL(f.url).hostname).slice(0, 40)}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

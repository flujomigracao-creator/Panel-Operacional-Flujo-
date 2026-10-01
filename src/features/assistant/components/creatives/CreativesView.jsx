import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Image as ImageIcon, BookText, GitCompare, RefreshCw } from 'lucide-react';
import * as cr from '../../services/creativesService';
import { executeProposal, cancelProposal } from '../../services/assistantService';
import ProposalCard from '../ProposalCard';
import CreativeCard from './CreativeCard';
import CreativeCreator from './CreativeCreator';
import PromptLibrary from './PromptLibrary';
import CreativeComparer from './CreativeComparer';
import { LoadingSpinner } from '@/shared/components/ui/LoadingSpinner';

const ORDENES = [
  { key: 'reciente', label: 'Más recientes' },
  { key: 'ctr', label: 'CTR' },
  { key: 'conversaciones', label: 'Conversaciones' },
  { key: 'costo_por_conversacion', label: 'Costo/conversación' },
  { key: 'clientes_pagaron', label: 'Clientes' },
  { key: 'costo_por_cliente', label: 'Costo/cliente' },
  { key: 'ingresos', label: 'Ingresos' },
];

const sel = 'rounded border border-chrome-border bg-chrome-bg px-2 py-1 text-xs text-chrome-text-active';

export default function CreativesView() {
  const [sub, setSub] = useState('galeria');
  const [creativos, setCreativos] = useState([]);
  const [prompts, setPrompts] = useState([]);
  const [meta, setMeta] = useState({ anuncios: [], conjuntos: [] });
  const [imagenes, setImagenes] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [seleccion, setSeleccion] = useState([]);
  const [propuesta, setPropuesta] = useState(null);
  const [f, setF] = useState({ servicio: '', formato: '', concepto: '', orden: 'reciente' });

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const [c, p, m] = await Promise.all([cr.listarCreativos(), cr.listarPrompts(), cr.listarEntidadesMeta()]);
      setCreativos(c);
      setPrompts(p);
      setMeta(m);
      setImagenes(await cr.urlsDeImagenes(c.map(x => x.image_path)));
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const anuncios = useMemo(() => {
    const usados = new Set(creativos.map(c => c.ad_id).filter(Boolean));
    return meta.anuncios.map(a => ({ ...a, vinculado: usados.has(a.entity_id) }));
  }, [meta.anuncios, creativos]);

  const visibles = useMemo(() => {
    const lista = creativos.filter(c => c.status !== 'archived'
      && (!f.servicio || c.service === f.servicio)
      && (!f.formato || c.format === f.formato)
      && (!f.concepto || c.concept === f.concepto));
    if (f.orden === 'reciente') return lista;
    const menorEsMejor = f.orden.startsWith('costo_');
    // Los creativos sin dato en esa métrica van al final: no se les inventa un valor.
    return [...lista].sort((a, b) => {
      const x = a[f.orden]; const y = b[f.orden];
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return menorEsMejor ? x - y : y - x;
    });
  }, [creativos, f]);

  const porServicio = useMemo(() => {
    const grupos = {};
    visibles.forEach(c => { (grupos[c.service] ||= []).push(c); });
    return Object.entries(grupos);
  }, [visibles]);

  const marcar = (id, on) => setSeleccion(s => (on ? [...new Set([...s, id])].slice(-4) : s.filter(x => x !== id)));
  const confirmar = async (id) => { const r = await executeProposal(id); setPropuesta(r.propuesta); await cargar(); };
  const cancelar = async (id) => { const r = await cancelProposal(id); setPropuesta(r.propuesta); };

  const subs = [
    { key: 'galeria', label: `Creativos (${creativos.filter(c => c.status !== 'archived').length})`, icon: ImageIcon },
    { key: 'crear', label: 'Crear creativo', icon: Plus },
    { key: 'prompts', label: `Biblioteca de prompts (${prompts.length})`, icon: BookText },
    { key: 'comparar', label: `Comparar (${seleccion.length})`, icon: GitCompare },
  ];

  if (cargando) return <div className="flex justify-center p-10"><LoadingSpinner /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {subs.map(s => (
          <button key={s.key} onClick={() => setSub(s.key)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${sub === s.key ? 'bg-brand-primary text-white' : 'bg-chrome-bg-raised text-chrome-text-muted hover:text-chrome-text'}`}>
            <s.icon size={13} /> {s.label}
          </button>
        ))}
        <button onClick={cargar} title="Actualizar" className="ml-auto rounded-md p-1.5 text-chrome-text-muted hover:text-chrome-text"><RefreshCw size={14} /></button>
      </div>

      {error && <p className="rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">No se pudieron cargar los creativos: {error}</p>}

      {propuesta && (
        <ProposalCard proposal={propuesta} onConfirm={confirmar} onCancel={cancelar} />
      )}

      {sub === 'galeria' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <select className={sel} value={f.servicio} onChange={e => setF({ ...f, servicio: e.target.value })}>
              <option value="">Todos los servicios</option>{cr.SERVICIOS.map(s => <option key={s}>{s}</option>)}
            </select>
            <select className={sel} value={f.formato} onChange={e => setF({ ...f, formato: e.target.value })}>
              <option value="">Todos los formatos</option>{cr.FORMATOS.map(x => <option key={x} value={x}>{cr.FORMATO_LABEL[x]}</option>)}
            </select>
            <select className={sel} value={f.concepto} onChange={e => setF({ ...f, concepto: e.target.value })}>
              <option value="">Todos los conceptos</option>{Object.entries(cr.CONCEPTOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <select className={sel} value={f.orden} onChange={e => setF({ ...f, orden: e.target.value })}>
              {ORDENES.map(o => <option key={o.key} value={o.key}>Ordenar: {o.label}</option>)}
            </select>
          </div>

          <p className="text-[11px] text-chrome-text-muted">
            Leads y clientes cuentan solo conversaciones atribuidas por referido de anuncio (meta_ads_referidos). Un 0 puede significar “sin atribución todavía”, no necesariamente “sin ventas”.
          </p>

          {porServicio.length === 0 ? (
            <div className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-8 text-center text-xs text-chrome-text-muted">
              Todavía no hay creativos{creativos.length ? ' con esos filtros' : ''}. Crea el primero en “Crear creativo”.
            </div>
          ) : porServicio.map(([servicio, lista]) => (
            <section key={servicio} className="space-y-2">
              <h3 className="border-b border-chrome-border pb-1 text-xs font-bold uppercase tracking-wider text-chrome-text-active">{servicio}</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {lista.map(c => (
                  <CreativeCard key={c.id} creativo={c} imagenUrl={imagenes[c.image_path]} anuncios={anuncios} conjuntos={meta.conjuntos}
                    seleccionado={seleccion.includes(c.id)} onSeleccion={marcar} onCambio={cargar} onPropuesta={setPropuesta} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {sub === 'crear' && <CreativeCreator prompts={prompts} onCreado={() => { cargar(); setSub('galeria'); }} />}
      {sub === 'prompts' && <PromptLibrary prompts={prompts} onCambio={cargar} />}
      {sub === 'comparar' && (
        <CreativeComparer creativos={creativos} seleccion={seleccion} imagenes={imagenes}
          onQuitar={id => marcar(id, false)} onPropuesta={p => { setPropuesta(p); setSub('galeria'); }} />
      )}
    </div>
  );
}

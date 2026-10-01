import React, { useState } from 'react';
import { Sparkles, Loader2, ImagePlus, Plus, Wand2 } from 'lucide-react';
import toast from 'react-hot-toast';
import * as cr from '../../services/creativesService';

const VACIO = { concept: 'mensaje_directo', hook: '', headline: '', primary_text: '', cta: 'Enviar mensaje', visual_concept: '', prompt: '', prompt_id: '' };

const campo = 'w-full rounded border border-chrome-border bg-chrome-bg px-2 py-1.5 text-xs text-chrome-text-active';

function ConceptoEditable({ c, i, servicio, formato, objetivo, prompts, onChange, onListo }) {
  const [busy, setBusy] = useState(false);
  const [archivo, setArchivo] = useState(null);
  const set = (k, v) => onChange(i, { ...c, [k]: v });
  const delServicio = prompts.filter(p => p.service === servicio && p.status === 'active');

  const base = () => ({ service: servicio, format: formato, objective: objetivo || undefined, ...c, prompt_id: c.prompt_id || undefined, prompt: c.prompt || undefined });

  const generar = async () => {
    setBusy(true);
    try {
      await cr.generarCreativo(base());
      toast.success('Imagen generada y guardada como borrador');
      onListo(i);
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  const subir = async () => {
    if (!archivo) return;
    setBusy(true);
    try {
      await cr.subirCreativo({ ...base(), image_base64: await cr.archivoABase64(archivo), mime: archivo.type });
      toast.success('Creativo subido como borrador');
      onListo(i);
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-2 rounded-xl border border-chrome-border bg-chrome-bg-raised p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="space-y-0.5 text-[10px] uppercase text-chrome-text-muted">Concepto
          <select className={campo} value={c.concept} onChange={e => set('concept', e.target.value)}>
            {Object.entries(cr.CONCEPTOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="space-y-0.5 text-[10px] uppercase text-chrome-text-muted">Prompt de la biblioteca
          <select className={campo} value={c.prompt_id} onChange={e => {
            const p = delServicio.find(x => x.id === e.target.value);
            onChange(i, { ...c, prompt_id: e.target.value, prompt: p ? p.prompt : c.prompt, concept: p?.concept || c.concept });
          }}>
            <option value="">Prompt nuevo (se guardará en la biblioteca)</option>
            {delServicio.map(p => <option key={p.id} value={p.id}>{p.name} · v{p.version}</option>)}
          </select>
        </label>
        <label className="space-y-0.5 text-[10px] uppercase text-chrome-text-muted">Hook
          <input className={campo} value={c.hook} onChange={e => set('hook', e.target.value)} />
        </label>
        <label className="space-y-0.5 text-[10px] uppercase text-chrome-text-muted">Titular (≤ 40)
          <input className={campo} maxLength={40} value={c.headline} onChange={e => set('headline', e.target.value)} />
        </label>
      </div>
      <label className="block space-y-0.5 text-[10px] uppercase text-chrome-text-muted">Texto principal
        <textarea rows={2} className={campo} value={c.primary_text} onChange={e => set('primary_text', e.target.value)} />
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="space-y-0.5 text-[10px] uppercase text-chrome-text-muted">CTA
          <input className={campo} value={c.cta} onChange={e => set('cta', e.target.value)} />
        </label>
        <label className="space-y-0.5 text-[10px] uppercase text-chrome-text-muted">Escena visual
          <input className={campo} value={c.visual_concept} onChange={e => set('visual_concept', e.target.value)} />
        </label>
      </div>
      <label className="block space-y-0.5 text-[10px] uppercase text-chrome-text-muted">Prompt de imagen (vacío = se arma con la identidad de marca)
        <textarea rows={3} className={`${campo} font-mono`} value={c.prompt} onChange={e => set('prompt', e.target.value)} />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={busy} onClick={generar} className="inline-flex items-center gap-1.5 rounded-md bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />} Generar imagen
        </button>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-chrome-border px-3 py-1.5 text-xs text-chrome-text hover:bg-chrome-bg">
          <ImagePlus size={13} /> {archivo ? archivo.name : 'Subir imagen propia'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => setArchivo(e.target.files?.[0] || null)} />
        </label>
        {archivo && (
          <button disabled={busy} onClick={subir} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Guardar subida</button>
        )}
      </div>
    </div>
  );
}

export default function CreativeCreator({ prompts, onCreado }) {
  const [servicio, setServicio] = useState(cr.SERVICIOS[0]);
  const [formato, setFormato] = useState('1:1');
  const [objetivo, setObjetivo] = useState('');
  const [cantidad, setCantidad] = useState(3);
  const [conceptos, setConceptos] = useState([]);
  const [pensando, setPensando] = useState(false);
  const [aviso, setAviso] = useState(null);

  const pedirConceptos = async () => {
    setPensando(true);
    setAviso(null);
    try {
      const r = await cr.proponerConceptos({ service: servicio, objective: objetivo || undefined, cantidad });
      setConceptos(r.conceptos.map(c => ({ ...VACIO, ...c })));
      setAviso(r.basado_en_datos
        ? 'Conceptos propuestos usando aprendizajes y resultados reales de este servicio.'
        : 'Aún no hay historial de resultados para este servicio: son hipótesis nuevas, no conclusiones basadas en datos.');
    } catch (e) { toast.error(e.message); } finally { setPensando(false); }
  };

  const completo = (i) => { setConceptos(cs => cs.filter((_, j) => j !== i)); onCreado(); };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-chrome-border bg-chrome-bg-raised p-3 sm:grid-cols-5">
        <label className="space-y-0.5 text-[10px] uppercase text-chrome-text-muted">Servicio
          <select className={campo} value={servicio} onChange={e => setServicio(e.target.value)}>{cr.SERVICIOS.map(s => <option key={s}>{s}</option>)}</select>
        </label>
        <label className="space-y-0.5 text-[10px] uppercase text-chrome-text-muted">Formato
          <select className={campo} value={formato} onChange={e => setFormato(e.target.value)}>{cr.FORMATOS.map(f => <option key={f} value={f}>{cr.FORMATO_LABEL[f]}</option>)}</select>
        </label>
        <label className="space-y-0.5 text-[10px] uppercase text-chrome-text-muted">Objetivo
          <input className={campo} placeholder="Conversaciones" value={objetivo} onChange={e => setObjetivo(e.target.value)} />
        </label>
        <label className="space-y-0.5 text-[10px] uppercase text-chrome-text-muted">Conceptos
          <select className={campo} value={cantidad} onChange={e => setCantidad(Number(e.target.value))}>{[1, 2, 3, 4, 5].map(n => <option key={n}>{n}</option>)}</select>
        </label>
        <div className="flex items-end gap-2">
          <button disabled={pensando} onClick={pedirConceptos} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
            {pensando ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Generar conceptos
          </button>
        </div>
      </div>

      {aviso && <p className="text-[11px] text-chrome-text-muted">{aviso}</p>}

      <div className="space-y-3">
        {conceptos.map((c, i) => (
          <ConceptoEditable key={i} i={i} c={c} servicio={servicio} formato={formato} objetivo={objetivo} prompts={prompts}
            onChange={(idx, nuevo) => setConceptos(cs => cs.map((x, j) => (j === idx ? nuevo : x)))} onListo={completo} />
        ))}
      </div>

      <button onClick={() => setConceptos(cs => [...cs, { ...VACIO }])} className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-chrome-border px-3 py-1.5 text-xs text-chrome-text hover:bg-chrome-bg-raised">
        <Plus size={13} /> Añadir concepto manual
      </button>
    </div>
  );
}

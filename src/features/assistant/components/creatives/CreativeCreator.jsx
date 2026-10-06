import React, { useEffect, useState } from 'react';
import { Sparkles, Loader2, ImagePlus, Plus, Wand2, FileText, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import * as cr from '../../services/creativesService';

const VACIO = {
  concept: 'mensaje_directo', hook: '', headline: '', primary_text: '', cta: 'Enviar mensaje', visual_concept: '',
  prompt: '', prompt_id: '', style: 'minimalista_corporativo', concept_id: '',
};

const campo = 'w-full rounded border border-chrome-border bg-chrome-bg px-2 py-1.5 text-xs text-chrome-text-active';
const etiqueta = 'space-y-0.5 text-[10px] uppercase text-chrome-text-muted';

function ConceptoEditable({ c, i, ctx, prompts, onChange, onListo }) {
  const [busy, setBusy] = useState(null); // 'prompt' | 'imagen' | 'subir'
  const [archivo, setArchivo] = useState(null);
  const set = (k, v) => onChange(i, { ...c, [k]: v });
  const delServicio = prompts.filter(p => p.service === ctx.service && p.status === 'active');

  const datos = () => ({
    service: ctx.service, format: ctx.format, objective: ctx.objective, audience: ctx.audience || undefined, language: ctx.language,
    con_persona: ctx.con_persona || undefined, persona_pose: ctx.con_persona ? ctx.persona_pose : undefined,
    ...c, prompt_id: c.prompt_id || undefined, prompt: c.prompt || undefined, concept_id: c.concept_id || undefined,
  });

  const proponerPrompt = async () => {
    setBusy('prompt');
    try {
      const r = await cr.generarPrompt({ ...datos(), prompt: undefined, prompt_id: undefined });
      onChange(i, { ...c, prompt: r.prompt, prompt_id: '' });
      toast.success('Prompt generado: revísalo y edítalo antes de crear la imagen');
    } catch (e) { toast.error(e.message); } finally { setBusy(null); }
  };

  const generar = async () => {
    setBusy('imagen');
    try {
      await cr.generarCreativo(datos());
      toast.success('Imagen generada y guardada como borrador');
      onListo(i);
    } catch (e) { toast.error(e.message); } finally { setBusy(null); }
  };

  const subir = async () => {
    if (!archivo) return;
    setBusy('subir');
    try {
      await cr.subirCreativo({ ...datos(), image_base64: await cr.archivoABase64(archivo), mime: archivo.type });
      toast.success('Creativo subido como borrador');
      onListo(i);
    } catch (e) { toast.error(e.message); } finally { setBusy(null); }
  };

  return (
    <div className="space-y-2 rounded-xl border border-chrome-border bg-chrome-bg-raised p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className={etiqueta}>Concepto
          <select className={campo} value={c.concept} onChange={e => set('concept', e.target.value)}>
            {Object.entries(cr.CONCEPTOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className={etiqueta}>Estilo visual
          <select className={campo} value={c.style} onChange={e => set('style', e.target.value)}>
            {Object.entries(cr.ESTILOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className={etiqueta}>Prompt de la biblioteca
          <select className={campo} value={c.prompt_id} onChange={e => {
            const p = delServicio.find(x => x.id === e.target.value);
            onChange(i, { ...c, prompt_id: e.target.value, prompt: p ? p.prompt : c.prompt, concept: p?.concept || c.concept });
          }}>
            <option value="">Prompt nuevo (se guarda en la biblioteca)</option>
            {delServicio.map(p => <option key={p.id} value={p.id}>{p.name} · v{p.version}</option>)}
          </select>
        </label>
        <label className={etiqueta}>Hook
          <input className={campo} value={c.hook} onChange={e => set('hook', e.target.value)} />
        </label>
        <label className={etiqueta}>Titular (≤ 40)
          <input className={campo} maxLength={40} value={c.headline} onChange={e => set('headline', e.target.value)} />
        </label>
        <label className={etiqueta}>CTA
          <input className={campo} value={c.cta} onChange={e => set('cta', e.target.value)} />
        </label>
      </div>
      <label className={`block ${etiqueta}`}>Texto principal
        <textarea rows={2} className={campo} value={c.primary_text} onChange={e => set('primary_text', e.target.value)} />
      </label>
      <label className={`block ${etiqueta}`}>Escena visual
        <input className={campo} value={c.visual_concept} onChange={e => set('visual_concept', e.target.value)} />
      </label>

      <label className={`block ${etiqueta}`}>
        Prompt de imagen (se muestra antes de generar; vacío = se arma con la identidad de marca)
        <textarea rows={5} className={`${campo} font-mono`} value={c.prompt} onChange={e => set('prompt', e.target.value)} />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <button disabled={!!busy} onClick={proponerPrompt} className="inline-flex items-center gap-1.5 rounded-md border border-indigo-500/40 bg-indigo-500/10 px-3 py-1.5 text-xs font-semibold text-indigo-400 hover:bg-indigo-500/20 disabled:opacity-50">
          {busy === 'prompt' ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />} Generar prompt con IA
        </button>
        <button disabled={!!busy} onClick={generar} className="inline-flex items-center gap-1.5 rounded-md bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
          {busy === 'imagen' ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />} {busy === 'imagen' ? 'Generando…' : 'Generar imagen'}
        </button>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-chrome-border px-3 py-1.5 text-xs text-chrome-text hover:bg-chrome-bg">
          <ImagePlus size={13} /> {archivo ? archivo.name : 'Subir imagen propia'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => setArchivo(e.target.files?.[0] || null)} />
        </label>
        {archivo && (
          <button disabled={!!busy} onClick={subir} className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Guardar subida</button>
        )}
      </div>
    </div>
  );
}

// "Aparezco yo": fotos de referencia de la persona + pose. Las imágenes se generan como ilustración usando esas fotos.
function PanelPersona({ ctx, set }) {
  const [refs, setRefs] = useState([]);
  const [busy, setBusy] = useState(false);
  const cargar = () => cr.listarReferencias().then(r => setRefs(r.referencias || [])).catch(() => setRefs([]));
  useEffect(() => { cargar(); }, []);

  const subir = async (e) => {
    const archivos = [...(e.target.files || [])];
    e.target.value = '';
    if (!archivos.length) return;
    setBusy(true);
    try {
      let r;
      for (const f of archivos) r = await cr.subirReferencia({ image_base64: await cr.archivoABase64(f), mime: f.type });
      setRefs(r?.referencias || []);
      toast.success('Foto(s) de referencia guardada(s)');
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  const borrar = async (path) => {
    setBusy(true);
    try { const r = await cr.borrarReferencia(path); setRefs(r.referencias || []); } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-2 rounded-xl border border-chrome-border bg-chrome-bg-raised p-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-xs font-semibold text-chrome-text-active">
          <input type="checkbox" checked={!!ctx.con_persona} disabled={!refs.length}
            onChange={e => set('con_persona', e.target.checked)} />
          Aparezco yo (ilustración con mi cara, sonriendo y dando la bienvenida)
        </label>
        {ctx.con_persona && (
          <select className={`${campo} w-auto`} value={ctx.persona_pose} onChange={e => set('persona_pose', e.target.value)}>
            {Object.entries(cr.POSES_PERSONA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        )}
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-chrome-border px-3 py-1.5 text-xs text-chrome-text hover:bg-chrome-bg">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />} Subir fotos de referencia
          <input type="file" multiple accept="image/png,image/jpeg,image/webp" className="hidden" disabled={busy} onChange={subir} />
        </label>
      </div>
      {!refs.length && <p className="text-[11px] text-chrome-text-muted">Sube 1 a 5 fotos tuyas (de frente, con buena luz) para activar la opción.</p>}
      {!!refs.length && (
        <div className="flex flex-wrap gap-2">
          {refs.map(r => (
            <div key={r.path} className="relative">
              {r.url && <img src={r.url} alt="Referencia" className="h-16 w-12 rounded object-cover" />}
              <button disabled={busy} onClick={() => borrar(r.path)} title="Quitar" className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1 text-[10px] leading-4 text-white">×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CreativeCreator({ prompts, onCreado }) {
  const [ctx, setCtx] = useState({ service: cr.SERVICIOS[0], format: '1:1', objective: 'conversaciones', audience: '', language: 'es', con_persona: false, persona_pose: 'pared' });
  const [cantidad, setCantidad] = useState(3);
  const [conceptos, setConceptos] = useState([]);
  const [pensando, setPensando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [config, setConfig] = useState(null);
  const set = (k, v) => setCtx(c => ({ ...c, [k]: v }));

  useEffect(() => { cr.configCreativos().then(setConfig).catch(() => setConfig({ openai_configurado: null })); }, []);

  const pedirConceptos = async () => {
    setPensando(true);
    setAviso(null);
    try {
      const r = await cr.proponerConceptos({ service: ctx.service, objective: cr.OBJETIVOS[ctx.objective], audience: ctx.audience || undefined, cantidad });
      setConceptos(r.conceptos.map(c => ({ ...VACIO, ...c })));
      setAviso(r.basado_en_datos
        ? 'Conceptos propuestos usando aprendizajes y resultados reales de este servicio.'
        : 'Aún no hay historial de resultados para este servicio: son hipótesis nuevas, no conclusiones basadas en datos.');
    } catch (e) { toast.error(e.message); } finally { setPensando(false); }
  };

  const completo = (i) => { setConceptos(cs => cs.filter((_, j) => j !== i)); onCreado(); };

  return (
    <div className="space-y-4">
      {config && config.openai_configurado === false && (
        <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-400">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          Falta el secreto OPENAI_API_KEY en Supabase (Edge Functions → Secrets): no se pueden generar conceptos, prompts ni imágenes. Puedes subir imágenes propias mientras tanto.
        </p>
      )}
      {config?.openai_configurado && (
        <p className="text-[11px] text-chrome-text-muted">OpenAI conectado · imagen: {config.modelo_imagen} · texto: {config.modelo_texto}</p>
      )}

      <div className="grid grid-cols-2 gap-2 rounded-xl border border-chrome-border bg-chrome-bg-raised p-3 sm:grid-cols-3 lg:grid-cols-6">
        <label className={etiqueta}>Servicio
          <select className={campo} value={ctx.service} onChange={e => set('service', e.target.value)}>{cr.SERVICIOS.map(s => <option key={s}>{s}</option>)}</select>
        </label>
        <label className={etiqueta}>Objetivo
          <select className={campo} value={ctx.objective} onChange={e => set('objective', e.target.value)}>{Object.entries(cr.OBJETIVOS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <label className={etiqueta}>Formato
          <select className={campo} value={ctx.format} onChange={e => set('format', e.target.value)}>{cr.FORMATOS.map(f => <option key={f} value={f}>{cr.FORMATO_LABEL[f]}</option>)}</select>
        </label>
        <label className={etiqueta}>Idioma
          <select className={campo} value={ctx.language} onChange={e => set('language', e.target.value)}>{Object.entries(cr.IDIOMAS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <label className={`${etiqueta} col-span-2 sm:col-span-2 lg:col-span-1`}>Público
          <input className={campo} placeholder="Extranjeros recién llegados" value={ctx.audience} onChange={e => set('audience', e.target.value)} />
        </label>
        <div className="flex items-end gap-2">
          <select className={`${campo} w-16`} value={cantidad} onChange={e => setCantidad(Number(e.target.value))} title="Cantidad de conceptos">{[1, 2, 3, 4, 5].map(n => <option key={n}>{n}</option>)}</select>
          <button disabled={pensando} onClick={pedirConceptos} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
            {pensando ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Conceptos IA
          </button>
        </div>
      </div>

      <PanelPersona ctx={ctx} set={set} />

      {aviso && <p className="text-[11px] text-chrome-text-muted">{aviso}</p>}

      <div className="space-y-3">
        {conceptos.map((c, i) => (
          <ConceptoEditable key={c.concept_id || i} i={i} c={c} ctx={ctx} prompts={prompts}
            onChange={(idx, nuevo) => setConceptos(cs => cs.map((x, j) => (j === idx ? nuevo : x)))} onListo={completo} />
        ))}
      </div>

      <button onClick={() => setConceptos(cs => [...cs, { ...VACIO }])} className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-chrome-border px-3 py-1.5 text-xs text-chrome-text hover:bg-chrome-bg-raised">
        <Plus size={13} /> Añadir concepto manual
      </button>
    </div>
  );
}

import React, { useState } from 'react';
import { FlaskConical, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import * as cr from '../../services/creativesService';

const VARIABLES = ['imagen', 'hook', 'copy', 'composición'];
const campo = 'w-full rounded border border-chrome-border bg-chrome-bg px-2 py-1.5 text-xs text-chrome-text-active';

export default function CreativeComparer({ creativos, seleccion, imagenes, onQuitar, onPropuesta }) {
  const elegidos = seleccion.map(id => creativos.find(c => c.id === id)).filter(Boolean).slice(0, 4);
  const [hipotesis, setHipotesis] = useState('');
  const [variable, setVariable] = useState('imagen');
  const [presupuesto, setPresupuesto] = useState('');
  const [busy, setBusy] = useState(false);

  if (elegidos.length < 2) {
    return (
      <div className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-8 text-center text-xs text-chrome-text-muted">
        Marca “Comparar” en 2 a 4 creativos de la galería para verlos lado a lado (A vs B vs C vs D).
      </div>
    );
  }

  const letras = ['A', 'B', 'C', 'D'];
  const servicios = new Set(elegidos.map(c => c.service));
  const mezcla = servicios.size > 1;
  const sinAprobar = elegidos.some(c => !['approved', 'published'].includes(c.status));

  const crear = async () => {
    setBusy(true);
    try {
      const r = await cr.crearExperimento({
        hypothesis: hipotesis, variable_tested: variable, creative_ids: elegidos.map(c => c.id), daily_budget: Number(presupuesto),
      });
      if (r.propuesta) { onPropuesta(r.propuesta); toast.success('Propuesta de experimento creada: confírmala para crearlo en Meta (en pausa)'); }
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-xl border border-chrome-border bg-chrome-bg-raised">
        <table className="w-full text-xs text-chrome-text">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left text-[10px] uppercase text-chrome-text-muted">Métrica</th>
              {elegidos.map((c, i) => (
                <th key={c.id} className="px-3 py-2 text-left align-bottom">
                  {imagenes[c.image_path] && <img src={imagenes[c.image_path]} alt="" className="mb-1 h-16 w-16 rounded object-cover" />}
                  <p className="text-xs font-bold text-chrome-text-active">{letras[i]}{i === 0 ? ' · Control' : ''}</p>
                  <p className="max-w-[10rem] truncate text-[10px] font-normal text-chrome-text-muted">{c.headline || cr.CONCEPTOS[c.concept]}</p>
                  <button onClick={() => onQuitar(c.id)} className="text-[10px] font-normal text-chrome-text-muted underline">quitar</button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cr.METRICAS.map(m => {
              const valores = elegidos.map(c => c[m.key]);
              const mejores = cr.mejoresIndices(valores, m.mejor);
              return (
                <tr key={m.key} className="border-t border-chrome-border">
                  <td className="px-3 py-2 text-chrome-text-muted">{m.label}</td>
                  {valores.map((v, i) => (
                    <td key={i} className={`px-3 py-2 font-semibold ${mejores.includes(i) ? 'text-emerald-400' : 'text-chrome-text-active'}`}>{cr.formatear(v, m.fmt)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-chrome-text-muted">
        Todo sale de Supabase/Meta. “—” significa sin datos (anuncio sin vincular o sin métricas), no cero. El verde solo marca diferencias; no es un ganador declarado.
      </p>

      <div className="space-y-2 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-indigo-400"><FlaskConical size={14} /> Convertir en experimento</p>
        <p className="text-[11px] text-chrome-text-muted">El primero es el Control. Un experimento cambia UNA variable para saber qué produjo el cambio.</p>
        {mezcla && <p className="text-[11px] text-amber-400">Estos creativos son de servicios distintos; un experimento compara un solo servicio.</p>}
        {sinAprobar && <p className="text-[11px] text-amber-400">Todos los creativos deben estar aprobados.</p>}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="space-y-0.5 text-[10px] uppercase text-chrome-text-muted sm:col-span-3">Hipótesis
            <textarea rows={2} className={campo} placeholder="Ej.: un enfoque visual más directo genera más conversaciones con la misma oferta" value={hipotesis} onChange={e => setHipotesis(e.target.value)} />
          </label>
          <label className="space-y-0.5 text-[10px] uppercase text-chrome-text-muted">Variable que cambia
            <select className={campo} value={variable} onChange={e => setVariable(e.target.value)}>{VARIABLES.map(v => <option key={v}>{v}</option>)}</select>
          </label>
          <label className="space-y-0.5 text-[10px] uppercase text-chrome-text-muted">Presupuesto diario (BRL)
            <input type="number" min="1" className={campo} value={presupuesto} onChange={e => setPresupuesto(e.target.value)} />
          </label>
          <div className="flex items-end">
            <button disabled={busy || mezcla || sinAprobar || !hipotesis.trim() || !(Number(presupuesto) > 0)} onClick={crear}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <FlaskConical size={13} />} Crear propuesta
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

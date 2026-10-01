import React, { useState } from 'react';
import { ChevronDown, ChevronRight, GitBranch, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import * as cr from '../../services/creativesService';

function Fila({ p, onGuardado }) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState(p.prompt);
  const [busy, setBusy] = useState(false);
  const cambiado = texto.trim() !== p.prompt.trim();

  const nuevaVersion = async () => {
    setBusy(true);
    try {
      await cr.guardarPrompt({ service: p.service, concept: p.concept, prompt: texto, prompt_id: p.id });
      toast.success('Nueva versión guardada; la anterior se conserva');
      onGuardado();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <tr className="cursor-pointer border-t border-chrome-border hover:bg-chrome-bg" onClick={() => setAbierto(a => !a)}>
        <td className="px-2 py-2">{abierto ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</td>
        <td className="px-2 py-2 font-medium text-chrome-text-active">{p.name}</td>
        <td className="px-2 py-2">{p.service}</td>
        <td className="px-2 py-2">{cr.CONCEPTOS[p.concept] || p.concept || '—'}</td>
        <td className="px-2 py-2 text-right">v{p.version}</td>
        <td className="px-2 py-2 text-right">{cr.formatear(p.creativos_generados, 'int')}</td>
        <td className="px-2 py-2 text-right">{cr.formatear(p.impresiones, 'int')}</td>
        <td className="px-2 py-2 text-right">{cr.formatear(p.conversaciones, 'int')}</td>
        <td className="px-2 py-2 text-right">{cr.formatear(p.leads, 'int')}</td>
        <td className="px-2 py-2 text-right">{cr.formatear(p.clientes, 'int')}</td>
        <td className="px-2 py-2 text-right">{cr.formatear(p.costo_por_cliente, 'brl')}</td>
        <td className="px-2 py-2 text-right">{cr.formatear(p.ingresos, 'brl')}</td>
      </tr>
      {abierto && (
        <tr className="border-t border-chrome-border bg-chrome-bg">
          <td colSpan={12} className="space-y-2 p-3">
            <textarea rows={5} value={texto} onChange={e => setTexto(e.target.value)} className="w-full rounded border border-chrome-border bg-chrome-bg-raised p-2 font-mono text-xs text-chrome-text-active" />
            <button disabled={!cambiado || busy} onClick={nuevaVersion} className="inline-flex items-center gap-1.5 rounded-md bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              {busy ? <Loader2 size={13} className="animate-spin" /> : <GitBranch size={13} />} Guardar como nueva versión
            </button>
          </td>
        </tr>
      )}
    </>
  );
}

export default function PromptLibrary({ prompts, onCambio }) {
  const [servicio, setServicio] = useState('');
  const lista = prompts.filter(p => !servicio || p.service === servicio);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-chrome-text-muted">
          Resultados agregados de los anuncios hechos con cada prompt. Vacío (—) = sin datos todavía.
        </p>
        <select value={servicio} onChange={e => setServicio(e.target.value)} className="rounded border border-chrome-border bg-chrome-bg px-2 py-1 text-xs text-chrome-text-active">
          <option value="">Todos los servicios</option>
          {cr.SERVICIOS.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>
      {lista.length === 0 ? (
        <div className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-8 text-center text-xs text-chrome-text-muted">
          La biblioteca se llena sola: cada creativo que generes guarda su prompt y su versión.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-chrome-border bg-chrome-bg-raised">
          <table className="w-full text-xs text-chrome-text">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wide text-chrome-text-muted">
                <th /><th className="px-2 py-2">Nombre</th><th className="px-2 py-2">Servicio</th><th className="px-2 py-2">Concepto</th>
                <th className="px-2 py-2 text-right">Versión</th><th className="px-2 py-2 text-right">Creativos</th><th className="px-2 py-2 text-right">Impres.</th>
                <th className="px-2 py-2 text-right">Conv.</th><th className="px-2 py-2 text-right">Leads</th><th className="px-2 py-2 text-right">Clientes</th>
                <th className="px-2 py-2 text-right">Costo/cliente</th><th className="px-2 py-2 text-right">Ingresos</th>
              </tr>
            </thead>
            <tbody>{lista.map(p => <Fila key={p.id} p={p} onGuardado={onCambio} />)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

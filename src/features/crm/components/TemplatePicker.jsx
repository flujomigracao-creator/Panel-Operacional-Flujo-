import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FileText, Loader2 } from 'lucide-react';
import { listWhatsappTemplates } from '../services/crmService';
import { inputCls } from '../format';

/** Reemplaza {{1}}, {{2}}… del cuerpo con los valores escritos (lo que verá el cliente). */
export const rellenarPlantilla = (cuerpo, valores) => String(cuerpo || '').replace(/\{\{(\d+)\}\}/g, (_, n) => valores[Number(n) - 1] || `{{${n}}}`);

/** Selector de plantillas aprobadas por Meta: única forma de abrir una conversación o escribir pasadas 24 h. */
export default function TemplatePicker({ onSend }) {
  const { data, isLoading, error } = useQuery({ queryKey: ['whatsapp', 'plantillas'], queryFn: listWhatsappTemplates, staleTime: 5 * 60_000 });
  const [sel, setSel] = useState(null);
  const [valores, setValores] = useState([]);
  const [enviando, setEnviando] = useState(false);

  const elegir = (key) => {
    const t = (data || []).find((x) => `${x.nombre}|${x.idioma}` === key) || null;
    setSel(t);
    setValores(t ? Array(t.variables).fill('') : []);
  };
  const completa = sel && valores.every((v) => v.trim());
  const texto = sel ? rellenarPlantilla(sel.cuerpo, valores) : '';

  const enviar = async () => {
    setEnviando(true);
    try {
      await onSend({ nombre: sel.nombre, idioma: sel.idioma, parametros: valores.map((v) => v.trim()), texto });
      toast.success('Plantilla enviada');
      setSel(null); setValores([]);
    } catch (err) {
      toast.error(err.message || 'No se pudo enviar la plantilla');
    } finally { setEnviando(false); }
  };

  if (isLoading) return <p className="flex items-center gap-2 p-3 text-xs text-text-muted"><Loader2 size={13} className="animate-spin" /> Cargando plantillas de Meta…</p>;
  if (error) return <p className="p-3 text-xs text-danger">No se pudieron cargar las plantillas: {error.message}</p>;
  if (!data?.length) return <p className="p-3 text-xs text-text-muted">No hay plantillas aprobadas por Meta en la cuenta de WhatsApp. Créalas y espera su aprobación en el Administrador de WhatsApp.</p>;

  return (
    <div className="space-y-2 p-3">
      <p className="text-[11px] text-text-muted">Una plantilla permite abrir una conversación nueva o escribir cuando pasaron más de 24 h del último mensaje del cliente.</p>
      <select className={inputCls} value={sel ? `${sel.nombre}|${sel.idioma}` : ''} onChange={(e) => elegir(e.target.value)}>
        <option value="">Elegir plantilla…</option>
        {data.map((t) => <option key={`${t.nombre}|${t.idioma}`} value={`${t.nombre}|${t.idioma}`}>{t.nombre} · {t.idioma} · {t.categoria}</option>)}
      </select>
      {sel && (
        <>
          {valores.map((v, i) => (
            <input key={i} className={inputCls} placeholder={`Variable {{${i + 1}}}`} value={v} onChange={(e) => setValores((p) => p.map((x, j) => (j === i ? e.target.value : x)))} />
          ))}
          <p className="whitespace-pre-line rounded-md bg-bg-elevated p-2 text-[12px] text-text-primary">{texto}</p>
          <button className="inline-flex items-center gap-1.5 rounded-md bg-brand-primary px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50" disabled={!completa || enviando} onClick={enviar}>
            {enviando ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />} Enviar plantilla
          </button>
        </>
      )}
    </div>
  );
}

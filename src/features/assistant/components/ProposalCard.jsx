import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, Check, CheckCircle2, Loader2, X, XCircle } from 'lucide-react';
import AdsProposalDetail from './AdsProposalDetail';

const TIPO_LABEL = {
  cambiar_etapa: 'Cambiar etapa',
  cambiar_estado_tramite: 'Cambiar estado',
  revisar_documento: 'Revisar documento',
  crear_tarea: 'Nueva tarea',
  cerrar_tarea: 'Cerrar tarea',
  guardar_datos: 'Guardar datos',
  crear_servicio: 'Nuevo trámite',
  lista_documentos: 'Lista de documentos',
  respuesta_estandar: 'Respuesta estándar',
  actualizar_lead_kommo: 'Actualizar Kommo',
  generar_documento: 'Generar documento',
  relacionar_clientes: 'Relacionar clientes',
  agregar_participante: 'Agregar persona al trámite',
  ads_cambiar_estado_campana: 'Meta Ads — Cambiar estado',
  ads_cambiar_presupuesto_campana: 'Meta Ads — Presupuesto',
  ads_cambiar_presupuesto_adset: 'Meta Ads — Presupuesto del conjunto',
  ads_crear_campana: 'Meta Ads — Nueva Campaña',
  ads_experimento_v4: 'Motor Científico V4 — Experimento de Campaña',
  ads_publicar_creativo: 'Meta Ads — Publicar creativo',
};

// Tabla de datos encontrados (extracción de la conversación): el usuario elige qué guardar.
function FilasDatos({ filas, seleccion, setSeleccion, disabled }) {
  return (
    <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-chrome-border">
      <table className="w-full text-xs">
        <tbody>
          {filas.map((f, i) => (
            <tr key={i} className={`border-b border-chrome-border last:border-0 ${f.conflicto ? 'bg-amber-500/5' : ''}`}>
              <td className="w-6 px-2 py-1.5 align-top">
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={seleccion.includes(i)}
                  onChange={e => setSeleccion(s => (e.target.checked ? [...s, i] : s.filter(x => x !== i)))}
                />
              </td>
              <td className="px-1 py-1.5 align-top">
                <p className="text-chrome-text-muted">{f.label || f.campo}</p>
                <p className="font-medium text-chrome-text-active">{f.valor}</p>
                {f.conflicto && (
                  <p className="mt-0.5 flex items-center gap-1 text-amber-400"><AlertTriangle size={11} /> Ya guardado: {f.actual}</p>
                )}
                {f.fuente && <p className="mt-0.5 italic text-chrome-text-muted">“{f.fuente}”</p>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Acción propuesta por el asistente: solo se ejecuta al tocar Confirmar. */
export default function ProposalCard({ proposal, onConfirm, onCancel }) {
  const filas = proposal.payload?.filas || [];
  const multi = proposal.tipo === 'guardar_datos' && filas.length > 1;
  const [seleccion, setSeleccion] = useState(() => filas.map((f, i) => (f.seleccionado ? i : -1)).filter(i => i >= 0));
  const [busy, setBusy] = useState(false);
  const pending = proposal.status === 'pending';

  const confirmar = async () => {
    setBusy(true);
    try {
      await onConfirm(proposal.id, multi ? seleccion : undefined);
      toast.success('Hecho');
    } catch (err) {
      toast.error(err.message || 'No se pudo ejecutar');
    } finally {
      setBusy(false);
    }
  };

  const cancelar = async () => {
    setBusy(true);
    try { await onCancel(proposal.id); } finally { setBusy(false); }
  };

  const result = proposal.result || {};
  return (
    <div className={`mt-2 rounded-lg border p-3 ${pending ? 'border-brand-primary/60 bg-brand-primary/10' : 'border-chrome-border bg-chrome-bg-raised'}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-chrome-text-muted">{TIPO_LABEL[proposal.tipo] || proposal.tipo}</p>
      <p className="mt-0.5 text-sm text-chrome-text-active">{proposal.resumen}</p>

      {proposal.tipo?.startsWith('ads_') && (
        <AdsProposalDetail proposal={proposal} />
      )}

      {proposal.tipo === 'lista_documentos' && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-chrome-text">
          {(proposal.payload?.items || []).map((it, i) => (
            <li key={i}>{it.tipo === 'foto' ? '📷' : '✍️'} {it.texto_cliente}{it.obligatorio === false ? ' (opcional)' : ''}</li>
          ))}
        </ul>
      )}

      {multi && <FilasDatos filas={filas} seleccion={seleccion} setSeleccion={setSeleccion} disabled={!pending || busy} />}

      {pending ? (
        <div className="mt-3 flex gap-2">
          <button
            onClick={confirmar}
            disabled={busy || (multi && !seleccion.length)}
            className="inline-flex items-center gap-1.5 rounded-md bg-chrome-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-chrome-accent-hover disabled:opacity-50"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            Confirmar{multi ? ` (${seleccion.length})` : ''}
          </button>
          <button onClick={cancelar} disabled={busy} className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs text-chrome-text hover:bg-chrome-bg-raised disabled:opacity-50">
            <X size={13} /> Cancelar
          </button>
        </div>
      ) : (
        <p className={`mt-2 flex items-center gap-1 text-xs ${proposal.status === 'executed' ? 'text-green-400' : proposal.status === 'failed' ? 'text-red-400' : 'text-chrome-text-muted'}`}>
          {proposal.status === 'executed' && <><CheckCircle2 size={13} /> Hecho{result.guardados?.length ? `: ${result.guardados.join(', ')}` : ''}{result.nota ? ` — ${result.nota}` : ''}</>}
          {proposal.status === 'failed' && <><XCircle size={13} /> No se pudo: {result.error}</>}
          {proposal.status === 'cancelled' && 'Cancelada'}
        </p>
      )}
    </div>
  );
}

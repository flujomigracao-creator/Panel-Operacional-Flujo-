import React, { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Bot, Check, GraduationCap, Send, Trash2, X } from 'lucide-react';
import { useAuth } from '@features/auth/context/AuthContext';
import { hablarConEntrenador, guardarReglaNora, ensenarANora, enviarMensajeLead } from '../services/comercialService';

// Mismas claves que usa NoraAprendizajes (no se importan de ahí para no crear una dependencia circular).
export const REGLAS_KEY = ['nora_reglas'];
const APRENDIZAJES_KEY = ['nora_aprendizajes'];

const TIPOS = { regla: 'Regla fija', leccion: 'Lección' };

// Algo que Nora propone guardar: el dueño lo puede corregir, cambiar de tipo, guardar o descartar.
function Propuesta({ propuesta, kommoLeadId }) {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();
  const [texto, setTexto] = useState(propuesta.texto);
  const [tipo, setTipo] = useState(propuesta.tipo);
  const [estado, setEstado] = useState('nueva');

  const guardar = async () => {
    setEstado('guardando');
    try {
      if (tipo === 'regla') await guardarReglaNora(texto, userProfile?.id, kommoLeadId);
      else await ensenarANora(texto, 'leccion', userProfile?.id, 'entrenador', kommoLeadId);
      queryClient.invalidateQueries({ queryKey: tipo === 'regla' ? REGLAS_KEY : APRENDIZAJES_KEY });
      setEstado('guardada');
      toast.success('Nora ya lo aprendió');
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'No se pudo guardar.');
      setEstado('nueva');
    }
  };

  if (estado === 'descartada') return null;
  if (estado === 'guardada') {
    return (
      <div className="flex items-start gap-1.5 rounded-md border border-green-600/40 bg-green-600/10 px-2.5 py-2 text-xs text-chrome-text-active">
        <Check size={13} className="mt-0.5 shrink-0 text-green-400" />
        <span><b>{TIPOS[tipo]} guardada:</b> {texto}</span>
      </div>
    );
  }
  return (
    <div className="rounded-md border border-chrome-border bg-chrome-bg p-2">
      <div className="mb-1.5 flex gap-1.5 text-[11px]">
        {Object.entries(TIPOS).map(([v, l]) => (
          <button key={v} onClick={() => setTipo(v)}
            className={`rounded-full px-2 py-0.5 ${tipo === v ? 'bg-brand-primary text-white' : 'bg-chrome-bg-raised text-chrome-text'}`}>{l}</button>
        ))}
      </div>
      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={Math.min(5, Math.max(2, Math.ceil(texto.length / 60)))}
        className="w-full resize-y rounded border border-chrome-border bg-chrome-bg-raised p-1.5 text-xs text-chrome-text-active outline-none focus:border-brand-primary" />
      <div className="mt-1.5 flex justify-end gap-1.5">
        <button onClick={() => setEstado('descartada')} className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-red-400 hover:bg-red-500/10">
          <Trash2 size={11} /> Descartar
        </button>
        <button onClick={guardar} disabled={estado === 'guardando' || texto.trim().length < 10}
          className="inline-flex items-center gap-1 rounded bg-green-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-green-500 disabled:opacity-50">
          <Check size={11} /> Guardar
        </button>
      </div>
    </div>
  );
}

// Mensaje que Nora redactó para el cliente: se revisa y se manda desde acá.
function MensajeCliente({ texto: inicial, lead, onEnviado }) {
  const [texto, setTexto] = useState(inicial);
  const [estado, setEstado] = useState('nuevo');
  if (estado === 'enviado') {
    return <p className="flex items-center gap-1 text-xs text-green-400"><Check size={12} /> Enviado al cliente</p>;
  }
  const enviar = async () => {
    setEstado('enviando');
    try {
      await enviarMensajeLead(lead.kommo_lead_id, texto.trim());
      setEstado('enviado');
      toast.success('Mensaje enviado');
      onEnviado?.();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'No se pudo enviar.');
      setEstado('nuevo');
    }
  };
  return (
    <div className="rounded-md border border-sky-500/40 bg-sky-500/5 p-2">
      <p className="mb-1 text-[11px] text-sky-300">Respuesta para {lead.nombre || 'el cliente'}</p>
      <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={Math.min(6, Math.max(2, Math.ceil(texto.length / 60)))}
        className="w-full resize-y rounded border border-chrome-border bg-chrome-bg-raised p-1.5 text-xs text-chrome-text-active outline-none focus:border-brand-primary" />
      <div className="mt-1.5 flex justify-end">
        <button onClick={enviar} disabled={estado === 'enviando' || !texto.trim() || !lead.telefono}
          className="inline-flex items-center gap-1 rounded bg-sky-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-sky-500 disabled:opacity-50">
          <Send size={11} /> Enviar al cliente
        </button>
      </div>
    </div>
  );
}

/**
 * Chat para enseñarle a Nora. Con `lead`, Nora mira esa conversación (y por qué se pausó);
 * sin lead es una charla general. Nada se guarda ni se envía sin que el dueño lo confirme.
 */
export default function NoraEntrenador({ lead = null, onClose, onReactivar, onMensajeEnviado }) {
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const finRef = useRef(null);

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [mensajes, pensando]);

  const enviar = async () => {
    const t = texto.trim();
    if (!t || pensando) return;
    const nuevos = [...mensajes, { role: 'dueno', content: t }];
    setMensajes(nuevos);
    setTexto('');
    setPensando(true);
    try {
      const r = await hablarConEntrenador(nuevos.map(({ role, content }) => ({ role, content })), lead?.kommo_lead_id ?? null);
      setMensajes((m) => [...m, {
        role: 'nora',
        content: r.respuesta,
        propuestas: r.propuestas || [],
        mensajeCliente: lead ? r.mensaje_para_cliente : '',
        reactivar: Boolean(lead?.atendente_pausado && r.reactivar_nora),
      }]);
    } catch (err) {
      console.error(err);
      toast.error(err.message);
      setMensajes((m) => m.slice(0, -1));
      setTexto(t);
    } finally {
      setPensando(false);
    }
  };

  const sugerencia = lead
    ? (lead.atendente_pausado ? '¿Por qué paraste con este cliente?' : 'Mirá esta conversación: acá tenías que responder…')
    : 'Ej: Cuando un cliente pregunta si puede trabajar con el protocolo de refugio, decile que sí…';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center justify-between border-b border-chrome-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <GraduationCap size={16} className="text-brand-primary" />
          <div>
            <h3 className="text-sm font-semibold text-chrome-text-active">Enseñarle a Nora</h3>
            <p className="text-[11px] text-chrome-text-muted">{lead ? 'Ella está viendo esta conversación' : 'Charla general'}</p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="Cerrar entrenador" className="rounded-md p-1 text-chrome-text hover:bg-chrome-bg-raised hover:text-chrome-text-active"><X size={16} /></button>
        )}
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {mensajes.length === 0 && (
          <div className="rounded-lg bg-chrome-bg-raised p-3 text-xs text-chrome-text-muted">
            Contale a Nora qué pasó y cómo se responde en ese caso. Ella te propone lo que va a aprender
            (reglas fijas o lecciones) y, si hay un cliente esperando, te redacta la respuesta. Vos decidís qué se guarda y qué se envía.
          </div>
        )}
        {mensajes.map((m, i) => (
          m.role === 'dueno' ? (
            <div key={i} className="ml-8 rounded-lg bg-brand-primary/20 px-3 py-2 text-sm text-chrome-text-active whitespace-pre-wrap">{m.content}</div>
          ) : (
            <div key={i} className="mr-4 space-y-2">
              <div className="flex gap-2">
                <Bot size={16} className="mt-1 shrink-0 text-green-400" />
                <div className="rounded-lg bg-chrome-bg-raised px-3 py-2 text-sm text-chrome-text-active whitespace-pre-wrap">{m.content}</div>
              </div>
              {m.propuestas?.length > 0 && (
                <div className="ml-6 space-y-1.5">
                  <p className="text-[11px] text-chrome-text-muted">Lo que voy a aprender (revisalo y guardá lo que esté bien):</p>
                  {m.propuestas.map((p, j) => <Propuesta key={j} propuesta={p} kommoLeadId={lead?.kommo_lead_id ?? null} />)}
                </div>
              )}
              {m.mensajeCliente && lead && (
                <div className="ml-6"><MensajeCliente texto={m.mensajeCliente} lead={lead} onEnviado={onMensajeEnviado} /></div>
              )}
              {m.reactivar && lead?.atendente_pausado && onReactivar && (
                <div className="ml-6">
                  <button onClick={onReactivar} className="inline-flex items-center gap-1 rounded bg-green-600 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-green-500">
                    <Bot size={12} /> Reactivar a Nora con este cliente
                  </button>
                </div>
              )}
            </div>
          )
        ))}
        {pensando && <p className="flex items-center gap-2 text-xs text-chrome-text-muted"><Bot size={14} className="animate-pulse text-green-400" /> Nora está pensando…</p>}
        <div ref={finRef} />
      </div>

      <div className="border-t border-chrome-border p-2.5">
        <div className="flex items-end gap-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar(); } }}
            rows={2}
            placeholder={sugerencia}
            className="flex-1 resize-none rounded-md border border-chrome-border bg-chrome-bg-raised p-2 text-sm text-chrome-text-active outline-none focus:border-brand-primary"
          />
          <button onClick={enviar} disabled={pensando || !texto.trim()} aria-label="Enviar a Nora"
            className="rounded-md bg-brand-primary p-2 text-white disabled:opacity-50"><Send size={16} /></button>
        </div>
      </div>
    </div>
  );
}

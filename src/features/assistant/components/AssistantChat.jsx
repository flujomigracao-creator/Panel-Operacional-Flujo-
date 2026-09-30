import React, { useEffect, useRef, useState } from 'react';
import { History, Loader2, MessageSquarePlus, Send, Sparkles, X } from 'lucide-react';
import { useAssistant } from '../context/AssistantContext';
import MessageContent from './MessageContent';
import ProposalCard from './ProposalCard';

const ATAJOS_GENERALES = [
  '¿Qué tengo pendiente hoy?',
  '¿Cómo van las campañas de Meta Ads esta semana?',
  '¿Qué trámites llevan más de 5 días parados?',
  '¿Cuánto cobré este mes?',
];

const ATAJOS_INTELIGENCIA = [
  'Analiza mis campañas de esta semana y dime dónde optimizar',
  'Compara esta semana con la anterior en Meta Ads',
  '¿Qué campaña tiene el mejor costo por conversación?',
  '¿Cuántos leads atendió Nora y cuántos terminaron pagando?',
  'Detecta fugas de gasto en mis anuncios activos',
];

const ATAJOS_CLIENTE = [
  'Resume la conversación de este cliente',
  'Extrae los datos de la conversación de este cliente',
  'Revisa si a sus datos les falta algo o no coinciden',
  'Redacta el próximo mensaje para este cliente',
  '¿Qué documentos le faltan y por qué se rechazó alguno?',
];

function HistoryList({ onPick, onClose, list }) {
  const [items, setItems] = useState(null);
  useEffect(() => { list().then(setItems).catch(() => setItems([])); }, [list]);
  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-chrome-text-muted">Conversaciones</p>
        <button onClick={onClose} className="text-xs text-sky-400 hover:underline">Volver</button>
      </div>
      {items === null && <p className="text-sm text-chrome-text-muted">Cargando…</p>}
      {items?.length === 0 && <p className="text-sm text-chrome-text-muted">Todavía no hay conversaciones.</p>}
      <ul className="space-y-1">
        {items?.map(c => (
          <li key={c.id}>
            <button onClick={() => onPick(c.id)} className="w-full rounded-md px-2 py-2 text-left hover:bg-chrome-bg-raised">
              <p className="truncate text-sm text-chrome-text-active">{c.title || 'Conversación'}</p>
              <p className="text-[11px] text-chrome-text-muted">{new Date(c.updated_at).toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Asistente IA del panel: botón flotante + ventana de chat. Consulta y resume
 * sin pedir permiso; cualquier cambio llega como tarjeta con Confirmar.
 */
export default function AssistantChat({ onNavigateToClient }) {
  const { open, setOpen, messages, loading, send, confirm, cancel, newConversation, openConversation, listConversations, contexto } = useAssistant();
  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length, loading, open]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);

  const submit = (text) => {
    const t = (text ?? input).trim();
    if (!t) return;
    setInput('');
    send(t);
  };

  const abrirCliente = (id, name) => { onNavigateToClient?.(id, name); };
  const atajos = contexto.client_id
    ? ATAJOS_CLIENTE
    : contexto.vista === 'intelligence'
    ? ATAJOS_INTELIGENCIA
    : ATAJOS_GENERALES;
  const soloSaludo = messages.length <= 1;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-brand-primary text-white shadow-lg transition-transform hover:scale-105"
        title="Asistente IA"
        aria-label="Abrir asistente"
      >
        <Sparkles size={22} />
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex h-[min(680px,calc(100vh-40px))] w-[min(440px,calc(100vw-24px))] flex-col overflow-hidden rounded-2xl border border-chrome-border bg-chrome-bg shadow-2xl">
      <header className="flex items-center gap-2 border-b border-chrome-border px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-primary text-white"><Sparkles size={16} /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-chrome-text-active">Asistente</p>
          <p className="truncate text-[11px] text-chrome-text-muted">{contexto.client_id ? 'Trabajando con el cliente abierto' : 'Consulta, resume y deja acciones para confirmar'}</p>
        </div>
        <button onClick={() => setShowHistory(h => !h)} className="rounded-md p-1.5 text-chrome-text hover:bg-chrome-bg-raised hover:text-chrome-text-active" title="Historial"><History size={16} /></button>
        <button onClick={() => { newConversation(); setShowHistory(false); }} className="rounded-md p-1.5 text-chrome-text hover:bg-chrome-bg-raised hover:text-chrome-text-active" title="Nueva conversación"><MessageSquarePlus size={16} /></button>
        <button onClick={() => setOpen(false)} className="rounded-md p-1.5 text-chrome-text hover:bg-chrome-bg-raised hover:text-chrome-text-active" title="Cerrar"><X size={16} /></button>
      </header>

      {showHistory ? (
        <HistoryList list={listConversations} onClose={() => setShowHistory(false)} onPick={async (id) => { await openConversation(id); setShowHistory(false); }} />
      ) : (
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {messages.map(m => (
            <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : ''}>
              {m.role === 'user' ? (
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-brand-primary px-3 py-2 text-sm text-white">{m.content}</div>
              ) : (
                <div className={`max-w-[95%] ${m.error ? 'text-red-400' : 'text-chrome-text'}`}>
                  <MessageContent text={m.content} onOpenClient={abrirCliente} />
                  {m.propuestas?.map(p => <ProposalCard key={p.id} proposal={p} onConfirm={confirm} onCancel={cancel} />)}
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-chrome-text-muted"><Loader2 size={14} className="animate-spin" /> Pensando…</div>
          )}
          {soloSaludo && !loading && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {atajos.map(a => (
                <button key={a} onClick={() => submit(a)} className="rounded-full border border-chrome-border px-3 py-1 text-xs text-chrome-text hover:bg-chrome-bg-raised hover:text-chrome-text-active">{a}</button>
              ))}
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}

      {!showHistory && (
        <div className="border-t border-chrome-border p-3">
          {!soloSaludo && contexto.client_id && (
            <div className="mb-2 flex gap-1.5 overflow-x-auto">
              {ATAJOS_CLIENTE.slice(0, 3).map(a => (
                <button key={a} onClick={() => submit(a)} disabled={loading} className="shrink-0 rounded-full border border-chrome-border px-2.5 py-0.5 text-[11px] text-chrome-text hover:bg-chrome-bg-raised disabled:opacity-50">{a}</button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
              placeholder="Escribe… (Enter envía, Shift+Enter salto de línea)"
              className="max-h-32 min-h-[40px] flex-1 resize-none rounded-xl border border-chrome-border bg-chrome-bg-raised px-3 py-2 text-sm text-chrome-text-active outline-none placeholder:text-chrome-text-muted focus:border-brand-primary"
            />
            <button onClick={() => submit()} disabled={loading || !input.trim()} className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-primary text-white disabled:opacity-40" aria-label="Enviar">
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

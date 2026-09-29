import React from 'react';
import { StickyNote, Bot, User, Zap } from 'lucide-react';
import { Attachment } from '@features/clients/components/ClientDetailView';

// Burbuja de mensaje de WhatsApp (entrante, operador, Nora o automático) o nota interna (__note).
const time = (iso) => new Date(iso).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });

const STATUS_TEXT = { sent: '✓', delivered: '✓✓', read: '✓✓ Leído' };

export default function MessageBubble({ m }) {
  if (m.__note) {
    return (
      <div className="flex justify-center">
        <div className="max-w-[80%] rounded-md border border-warning-border bg-warning-bg px-3 py-1.5 text-[13px] text-text-primary">
          <p className="mb-0.5 flex items-center gap-1 text-[11px] font-medium text-warning"><StickyNote size={11} /> Nota interna · {m.author}</p>
          <p className="whitespace-pre-wrap break-words">{m.content}</p>
          <p className="mt-0.5 text-right text-[10px] text-text-muted">{time(m.created_at)}</p>
        </div>
      </div>
    );
  }
  const inbound = m.direction === 'inbound';
  const status = m.metadata?.estado_envio;
  const kind = inbound ? 'in' : m.sender_type === 'ai' ? 'ai' : m.sender_type === 'system' ? 'system' : 'agent';
  const styles = {
    in: 'rounded-bl-sm border border-border bg-bg-surface text-text-primary',
    agent: 'rounded-br-sm bg-brand-primary text-white',
    ai: 'rounded-br-sm border border-brand-primary/20 bg-brand-primary-light text-text-primary',
    system: 'rounded-br-sm border border-border bg-bg-elevated text-text-secondary',
  };
  return (
    <div className={`flex ${inbound ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[72%] rounded-lg px-3 py-1.5 text-[13px] ${styles[kind]}`}>
        {!inbound && (
          <p className={`mb-0.5 flex items-center gap-1 text-[11px] font-medium ${kind === 'agent' ? 'text-white/80' : kind === 'ai' ? 'text-brand-primary' : 'text-text-muted'}`}>
            {kind === 'ai' ? <Bot size={11} /> : kind === 'system' ? <Zap size={11} /> : <User size={11} />}
            {kind === 'ai' ? 'Nora' : kind === 'system' ? 'Mensaje automático' : m.author_name || 'Equipo'}
          </p>
        )}
        {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
        {(m.message_attachments || []).map((a) => <Attachment key={a.id} attachment={a} />)}
        <p className={`mt-0.5 text-right text-[10px] ${kind === 'agent' ? 'text-white/70' : 'text-text-muted'}`}>
          {time(m.created_at)}
          {!inbound && STATUS_TEXT[status] && ` · ${STATUS_TEXT[status]}`}
        </p>
        {!inbound && status === 'failed' && (
          <p className="mt-1 rounded bg-danger px-2 py-0.5 text-[11px] text-white">No se entregó{m.metadata?.error_envio ? `: ${m.metadata.error_envio}` : ''}</p>
        )}
      </div>
    </div>
  );
}


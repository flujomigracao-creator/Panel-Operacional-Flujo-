import React from 'react';
import { Sparkles, X, Send, Loader2 } from 'lucide-react';

export default function ClientViewAiChat({
  isOpen,
  onClose,
  messages,
  input,
  onInputChange,
  onSend,
  isLoading,
  crmContext,
}) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: '400px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--color-bg-base)',
        borderLeft: '1px solid var(--color-border)',
        boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.45)',
        zIndex: 100,
        overflow: 'hidden'
      }}
    >
      <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-primary)' }}>
          <Sparkles size={20} />
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Asistente IA</h2>
        </div>
        <button className="btn btn-ghost" style={{ padding: '0.5rem' }} onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
              {msg.role === 'user' ? 'Tú' : 'IA'}
            </div>
            <div style={{
              background: msg.role === 'user' ? 'var(--color-primary)' : 'var(--color-bg-elevated)',
              color: msg.role === 'user' ? 'white' : 'var(--color-text-primary)',
              padding: '0.75rem 1rem', borderRadius: 'var(--radius-lg)', borderBottomRightRadius: msg.role === 'user' ? 0 : 'var(--radius-lg)', borderBottomLeftRadius: msg.role === 'assistant' ? 0 : 'var(--radius-lg)',
              fontSize: '0.875rem', lineHeight: 1.5, whiteSpace: 'pre-wrap'
            }}>
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div style={{ alignSelf: 'flex-start', background: 'var(--color-bg-elevated)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-lg)', borderBottomLeftRadius: 0, display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <Loader2 size={16} className="animate-spin" color="var(--color-primary)" />
            <span style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>Pensando...</span>
          </div>
        )}
      </div>

      <div style={{ padding: '1.5rem', borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-base)' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <textarea
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
            placeholder="Pregunta algo sobre el cliente..."
            style={{ flex: 1, resize: 'none', height: '42px', minHeight: '42px', padding: '0.5rem 1rem', borderRadius: 'var(--radius-full)' }}
            disabled={isLoading}
          />
          <button className="btn btn-primary" onClick={onSend} disabled={isLoading || !input.trim()} style={{ width: '42px', height: '42px', padding: 0, borderRadius: '50%', flexShrink: 0 }}>
            <Send size={18} />
          </button>
        </div>
        <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', textAlign: 'center', marginTop: '0.5rem' }}>
          La IA tiene contexto de la BD y CRM. {crmContext ? '✅ CRM Listo' : '⏳ Cargando CRM...'}
        </div>
      </div>
    </div>
  );
}

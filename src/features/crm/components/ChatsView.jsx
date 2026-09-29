import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Search, StickyNote, Bot, User, ExternalLink } from 'lucide-react';
import { useAuth } from '@features/auth/context/AuthContext';
import { useOrganization } from '@/context/OrganizationContext';
import { ReplyBox, Attachment } from '@features/clients/components/ClientDetailView';
import { useCrmData } from '../useCrm';
import { getConversations, getConversationMessages, getLeadEvents, sendText, sendFile, addNote, CONVERSATIONS_LIMIT } from '../services/crmService';
import LeadPanel from './LeadPanel';
import { Avatar } from '../ui';
import { relTime, normalize, inputCls } from '../format';

const previewOf = (m) => {
  if (!m) return 'Sin mensajes';
  const body = m.content || ({ image: '📷 Foto', audio: '🎤 Audio', document: '📎 Documento', video: '🎥 Video' }[m.message_type]) || '…';
  return `${m.direction === 'outbound' ? 'Tú: ' : ''}${body}`;
};

function Bubble({ m }) {
  if (m.__note) {
    return (
      <div className="flex justify-center">
        <div className="max-w-[80%] rounded-md border border-warning-border bg-warning-bg px-3 py-1.5 text-[13px] text-text-primary">
          <p className="mb-0.5 flex items-center gap-1 text-[11px] text-warning"><StickyNote size={11} /> Nota interna</p>
          <p className="whitespace-pre-wrap break-words">{m.content}</p>
          <p className="mt-0.5 text-right text-[10px] text-text-muted">{new Date(m.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</p>
        </div>
      </div>
    );
  }
  const inbound = m.direction === 'inbound';
  const status = m.metadata?.estado_envio;
  return (
    <div className={`flex ${inbound ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[75%] rounded-lg px-3 py-1.5 text-[13px] ${inbound ? 'bg-bg-elevated text-text-primary' : 'bg-brand-primary text-white'}`}>
        {!inbound && (
          <p className="mb-0.5 flex items-center gap-1 text-[11px] opacity-80">
            {m.sender_type === 'ai' ? <Bot size={11} /> : <User size={11} />}{m.author_name || (m.sender_type === 'ai' ? 'Nora' : 'Equipo')}
          </p>
        )}
        {m.content && <p className="whitespace-pre-wrap break-words">{m.content}</p>}
        {(m.message_attachments || []).map((a) => <Attachment key={a.id} attachment={a} />)}
        <p className={`mt-0.5 text-right text-[10px] ${inbound ? 'text-text-muted' : 'opacity-70'}`}>
          {new Date(m.created_at).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
          {!inbound && status === 'read' && ' · Leído'}
          {!inbound && status === 'delivered' && ' · Entregado'}
        </p>
        {!inbound && status === 'failed' && <p className="mt-1 rounded bg-danger px-2 py-0.5 text-[11px] text-white">No se entregó{m.metadata?.error_envio ? `: ${m.metadata.error_envio}` : ''}</p>}
      </div>
    </div>
  );
}

function Thread({ conv, leadIds, lead }) {
  const qc = useQueryClient();
  const { userId } = useAuth();
  const { organization } = useOrganization();
  const [mode, setMode] = useState('reply');
  const [note, setNote] = useState('');
  const [find, setFind] = useState('');
  const endRef = useRef(null);

  const messages = useQuery({ queryKey: ['crm', 'messages', conv.id], queryFn: () => getConversationMessages(conv.id), refetchInterval: 10_000 });
  const events = useQuery({ queryKey: ['crm', 'notes', leadIds.join(',')], queryFn: () => getLeadEvents(leadIds, 100), enabled: leadIds.length > 0 });

  const items = useMemo(() => {
    const notes = (events.data || []).filter((e) => e.event_type === 'note').map((e) => ({ id: `n-${e.id}`, __note: true, content: e.metadata?.text, created_at: e.created_at }));
    return [...(messages.data || []), ...notes].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }, [messages.data, events.data]);
  const shown = find.trim() ? items.filter((m) => normalize(m.content).includes(normalize(find))) : items;

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [conv.id, shown.length]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['crm', 'messages', conv.id] });
    qc.invalidateQueries({ queryKey: ['crm', 'conversations'] });
  };

  const saveNote = async () => {
    if (!note.trim() || !lead) return;
    try {
      await addNote(organization.id, lead.id, note, userId);
      setNote('');
      qc.invalidateQueries({ queryKey: ['crm', 'notes'] });
    } catch (err) {
      toast.error(err.message || 'No se pudo guardar la nota');
    }
  };

  const days = shown.map((m) => new Date(m.created_at).toDateString());
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        <Search size={13} className="text-text-muted" />
        <input className="w-full bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-muted" placeholder="Buscar en la conversación…" value={find} onChange={(e) => setFind(e.target.value)} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-3">
        {messages.isLoading && <p className="text-sm text-text-muted">Cargando…</p>}
        {!messages.isLoading && shown.length === 0 && <p className="text-sm text-text-muted">{find ? 'Sin resultados.' : 'Todavía no hay mensajes.'}</p>}
        {shown.map((m, i) => {
          const head = i === 0 || days[i] !== days[i - 1];
          return (
            <React.Fragment key={m.id}>
              {head && <p className="my-1 text-center text-[11px] uppercase tracking-wide text-text-muted">{new Date(m.created_at).toLocaleDateString('es', { day: '2-digit', month: 'short' })}</p>}
              <Bubble m={m} />
            </React.Fragment>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="border-t border-border p-2">
        <div className="mb-1 flex gap-1 text-xs">
          {[['reply', 'Responder'], ['note', 'Nota interna']].map(([k, label]) => (
            <button key={k} disabled={k === 'note' && !lead} onClick={() => setMode(k)} className={`rounded px-2 py-0.5 ${mode === k ? 'bg-bg-elevated font-medium text-text-primary' : 'text-text-muted hover:text-text-primary'} disabled:opacity-40`}>{label}</button>
          ))}
        </div>
        {mode === 'reply' ? (
          <ReplyBox
            onSend={async (text) => { await sendText(conv.client_id, text); refresh(); }}
            onSendFile={async (file, caption) => { await sendFile(organization.id, conv.client_id, file, caption); refresh(); }}
          />
        ) : (
          <div className="flex gap-2">
            <textarea className={inputCls} rows={2} placeholder="Nota solo para el equipo (no se envía al cliente)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="self-end rounded-md bg-warning px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50" onClick={saveNote} disabled={!note.trim()}>Guardar</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatsView({ onNavigateToClient, initialClientId = null }) {
  const { leads, teamById } = useCrmData();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | unread | mine
  const { userId } = useAuth();
  const [selectedId, setSelectedId] = useState(null);

  const convs = useQuery({ queryKey: ['crm', 'conversations'], queryFn: getConversations, refetchInterval: 15_000 });

  // Un contacto puede tener varios leads: se toma el más reciente como el "activo" del panel.
  const leadsByClient = useMemo(() => {
    const m = {};
    for (const l of leads.data || []) if (l.client_id) (m[l.client_id] ||= []).push(l);
    return m;
  }, [leads.data]);

  const list = useMemo(() => {
    const q = normalize(search).trim();
    return (convs.data || []).filter((c) => {
      const ls = leadsByClient[c.client_id] || [];
      if (filter === 'unread' && !ls.some((l) => l.needs_reply)) return false;
      if (filter === 'mine' && !ls.some((l) => l.assigned_to === userId) && c.clients?.assigned_to !== userId) return false;
      return !q || normalize(`${c.clients?.full_name} ${c.clients?.phone} ${c.last?.content}`).includes(q);
    });
  }, [convs.data, search, filter, leadsByClient, userId]);

  // Si se llegó desde un lead/contacto, se abre su conversación mientras no se elija otra.
  const activeId = selectedId ?? (initialClientId ? (convs.data || []).find((c) => c.client_id === initialClientId)?.id ?? null : null);

  const conv = (convs.data || []).find((c) => c.id === activeId);
  const convLeads = conv ? leadsByClient[conv.client_id] || [] : [];
  const activeLead = convLeads[0] || null;

  return (
    <div className="flex h-full min-h-0 flex-1">
      <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-bg-surface">
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search size={13} className="absolute left-2 top-2 text-text-muted" />
            <input className={`${inputCls} !pl-7`} placeholder="Buscar conversación…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="mt-1.5 flex gap-1 text-xs">
            {[['all', 'Todas'], ['unread', 'Sin responder'], ['mine', 'Mías']].map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)} className={`rounded px-2 py-0.5 ${filter === k ? 'bg-bg-elevated font-medium text-text-primary' : 'text-text-muted hover:text-text-primary'}`}>{label}</button>
            ))}
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {convs.isLoading && <li className="p-4 text-sm text-text-muted">Cargando…</li>}
          {convs.error && <li className="p-4 text-sm text-danger">{convs.error.message}</li>}
          {list.map((c) => {
            const ls = leadsByClient[c.client_id] || [];
            const unread = ls.some((l) => l.needs_reply);
            return (
              <li key={c.id}>
                <button onClick={() => setSelectedId(c.id)} className={`flex w-full items-start gap-2 border-b border-border px-3 py-2 text-left hover:bg-bg-elevated ${activeId === c.id ? 'bg-bg-elevated' : ''}`}>
                  <Avatar name={c.clients?.full_name} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1">
                      <span className={`truncate text-[13px] ${unread ? 'font-semibold' : 'font-medium'} text-text-primary`}>{c.clients?.full_name || c.clients?.phone || 'Sin nombre'}</span>
                      <span className="ml-auto shrink-0 text-[10px] text-text-muted">{relTime(c.last_message_at)}</span>
                    </div>
                    <p className="truncate text-xs text-text-muted">{previewOf(c.last)}</p>
                    <p className="truncate text-[11px] text-text-muted">{ls[0]?.service_label || ''}{ls[0]?.stage_name ? ` · ${ls[0].stage_name}` : ''}</p>
                  </div>
                  {unread && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-success" title="Sin responder" />}
                </button>
              </li>
            );
          })}
          {!convs.isLoading && list.length === 0 && <li className="p-4 text-sm text-text-muted">No hay conversaciones.</li>}
          {(convs.data || []).length >= CONVERSATIONS_LIMIT && <li className="p-2 text-center text-[11px] text-text-muted">Mostrando las {CONVERSATIONS_LIMIT} más recientes.</li>}
        </ul>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-bg-base">
        {conv ? (
          <>
            <header className="flex items-center gap-2 border-b border-border bg-bg-surface px-3 py-2">
              <Avatar name={conv.clients?.full_name} size={28} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text-primary">{conv.clients?.full_name || 'Sin nombre'}</p>
                <p className="truncate text-xs text-text-muted">{conv.clients?.phone || ''}{activeLead?.assigned_to ? ` · ${teamById[activeLead.assigned_to] || ''}` : ''}</p>
              </div>
              <button className="ml-auto inline-flex items-center gap-1 text-xs text-brand-primary hover:underline" onClick={() => onNavigateToClient?.(conv.client_id, conv.clients?.full_name)}>Ficha <ExternalLink size={11} /></button>
            </header>
            <Thread key={conv.id} conv={conv} lead={activeLead} leadIds={convLeads.map((l) => l.id)} />
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-text-muted">Elige una conversación</div>
        )}
      </section>

      {conv && activeLead && <LeadPanel key={activeLead.id} lead={activeLead} onOpenClient={onNavigateToClient} />}
      {conv && !activeLead && (
        <aside className="w-72 shrink-0 border-l border-border bg-bg-surface p-4 text-sm text-text-muted">
          Este contacto todavía no tiene un lead. Créalo desde <b>Leads → Nuevo lead</b> con su teléfono y quedará vinculado.
        </aside>
      )}
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Search, MessagesSquare } from 'lucide-react';
import { useAuth } from '@features/auth/context/AuthContext';
import { ReplyBox } from '@features/clients/components/ClientDetailView';
import { useCrmData, KEYS } from '../useCrm';
import { getConversations, getConversationMessages, getLeadEvents, sendText, sendFile, addNote, getTramites, CONVERSATIONS_LIMIT } from '../services/crmService';
import ClientOpsPanel from './ClientOpsPanel';
import MessageBubble from './MessageBubble';
import { clock, normalize, inputCls, chipCls } from '../format';

const TYPE_LABEL = { image: '📷 Foto', audio: '🎤 Audio', document: '📎 Documento', video: '🎥 Video', location: '📍 Ubicación' };

function preview(c) {
  if (!c.last_at) return 'Sin mensajes';
  const body = c.last_content || TYPE_LABEL[c.last_type] || '…';
  if (c.last_direction !== 'outbound') return body;
  return `${c.last_sender === 'ai' ? 'Nora' : c.last_sender === 'system' ? 'Auto' : 'Tú'}: ${body}`;
}

function Thread({ conv, leads, lead, teamById }) {
  const qc = useQueryClient();
  const { userId } = useAuth();
  const [mode, setMode] = useState('reply');
  const [note, setNote] = useState('');
  const [find, setFind] = useState('');
  const endRef = useRef(null);
  const leadIds = leads.map((l) => l.id);

  const messages = useQuery({ queryKey: ['crm', 'messages', conv.id], queryFn: () => getConversationMessages(conv.id), refetchInterval: 10_000 });
  const events = useQuery({ queryKey: [...KEYS.events, 'notes', leadIds.join(',')], queryFn: () => getLeadEvents(leadIds, 100), enabled: leadIds.length > 0 });

  const items = useMemo(() => {
    const notes = (events.data || []).filter((e) => e.event_type === 'note')
      .map((e) => ({ id: `n-${e.id}`, __note: true, content: e.metadata?.text, created_at: e.created_at, author: teamById[e.actor_id] || 'Equipo' }));
    return [...(messages.data || []), ...notes].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }, [messages.data, events.data, teamById]);
  const shown = find.trim() ? items.filter((m) => normalize(m.content).includes(normalize(find))) : items;
  const days = shown.map((m) => new Date(m.created_at).toDateString());

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [conv.id, shown.length]);

  // Si el contacto tiene un lead de Kommo, se responde "por el lead": así queda marcado como atendido
  // y Nora no vuelve a contestar el mismo mensaje. Si no, por el contacto.
  const to = lead?.external_id ? { kommoLeadId: lead.external_id } : conv.client_id ? { clientId: conv.client_id } : { kommoLeadId: conv.kommo_lead_id };
  const canSend = Boolean(to.clientId || to.kommoLeadId);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['crm', 'messages', conv.id] });
    qc.invalidateQueries({ queryKey: KEYS.conversations });
    qc.invalidateQueries({ queryKey: KEYS.unreadCount });
    qc.invalidateQueries({ queryKey: KEYS.leads });
  };

  const saveNote = async () => {
    if (!note.trim() || !lead) return;
    try {
      await addNote(lead.id, note, userId);
      setNote('');
      qc.invalidateQueries({ queryKey: KEYS.events });
    } catch (err) {
      toast.error(err.message || 'No se pudo guardar la nota');
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-border bg-bg-surface px-4 py-1.5">
        <Search size={13} className="text-text-muted" />
        <input className="w-full bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-muted" placeholder="Buscar en esta conversación…" value={find} onChange={(e) => setFind(e.target.value)} />
        {find && <span className="shrink-0 text-[11px] text-text-muted">{shown.length} resultado(s)</span>}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto bg-bg-base px-6 py-4">
        {messages.isLoading && <p className="text-sm text-text-muted">Cargando…</p>}
        {messages.error && <p className="text-sm text-danger">{messages.error.message}</p>}
        {!messages.isLoading && shown.length === 0 && <p className="text-sm text-text-muted">{find ? 'Sin resultados.' : 'Todavía no hay mensajes.'}</p>}
        {shown.map((m, i) => (
          <React.Fragment key={m.id}>
            {(i === 0 || days[i] !== days[i - 1]) && (
              <p className="my-2 self-center rounded-full bg-bg-elevated px-2.5 py-0.5 text-[11px] text-text-muted">
                {new Date(m.created_at).toLocaleDateString('es', { weekday: 'short', day: '2-digit', month: 'short' })}
              </p>
            )}
            <MessageBubble m={m} />
          </React.Fragment>
        ))}
        <div ref={endRef} />
      </div>
      <div className="border-t border-border bg-bg-surface">
        <div className="flex gap-1 px-3 pt-2 text-xs">
          {[['reply', 'Responder por WhatsApp'], ['note', 'Nota interna']].map(([k, label]) => (
            <button key={k} disabled={k === 'note' && !lead} onClick={() => setMode(k)}
              className={`rounded px-2 py-1 ${mode === k ? (k === 'note' ? 'bg-warning-bg font-medium text-warning' : 'bg-brand-primary-light font-medium text-brand-primary') : 'text-text-muted hover:text-text-primary'} disabled:opacity-40`}>
              {label}
            </button>
          ))}
        </div>
        {mode === 'reply' ? (
          canSend ? (
            <ReplyBox
              placeholder="Escribir mensaje… (Enter envía, Shift+Enter nueva línea)"
              onSend={async (text) => { await sendText(to, text); refresh(); }}
              onSendFile={async (file, caption) => { await sendFile(to, file, caption); refresh(); }}
            />
          ) : (
            <p className="p-3 text-xs text-text-muted">Esta conversación no tiene contacto ni lead para responder.</p>
          )
        ) : (
          <div className="flex gap-2 p-3">
            <textarea className={`${inputCls} resize-none`} rows={2} placeholder="Nota solo para el equipo (no se envía al cliente)" value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="self-end rounded-md bg-warning px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50" onClick={saveNote} disabled={!note.trim()}>Guardar</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatsView({ onNavigateToClient, onOpenTramite, initialClientId = null }) {
  const { leads, teamById } = useCrmData();
  const { userId } = useAuth();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all'); // all | unread | mine
  const [selectedId, setSelectedId] = useState(null);

  const convs = useQuery({ queryKey: KEYS.conversations, queryFn: getConversations, refetchInterval: 15_000 });
  const tramites = useQuery({ queryKey: ['crm', 'tramites'], queryFn: getTramites, staleTime: 60_000 });
  // Trámite que se muestra junto a cada conversación: el trámite en curso del cliente o, si no tiene, el del lead.
  const tramiteByClient = useMemo(() => {
    const m = {};
    for (const t of tramites.data || []) if (['pending', 'in_progress', 'on_hold'].includes(t.status)) m[t.client_id] ||= t.services?.name;
    return m;
  }, [tramites.data]);
  const serviceOf = (c, l) => (c.client_id && tramiteByClient[c.client_id]) || l?.service_label || null;

  // Leads de cada conversación: por contacto (client_id) o, si todavía no hay contacto, por el contacto de Kommo.
  const leadsFor = useMemo(() => {
    const byClient = {};
    const byKommo = {};
    for (const l of leads.data || []) {
      if (l.client_id) (byClient[l.client_id] ||= []).push(l);
      if (l.external_contact_id) (byKommo[l.external_contact_id] ||= []).push(l);
    }
    const rank = (l) => (l.stage_kind === 'open' ? 0 : 1);
    return (c) => {
      const list = (c.client_id && byClient[c.client_id]) || (c.kommo_contact_id && byKommo[c.kommo_contact_id]) || [];
      return list.slice().sort((a, b) => rank(a) - rank(b) || new Date(b.updated_at) - new Date(a.updated_at));
    };
  }, [leads.data]);

  const list = useMemo(() => {
    const q = normalize(search).trim();
    return (convs.data || []).filter((c) => {
      if (filter === 'unread' && !(c.unread_count > 0)) return false;
      if (filter === 'mine' && !leadsFor(c).some((l) => l.assigned_to === userId) && c.client_assigned_to !== userId) return false;
      return !q || normalize(`${c.display_name} ${c.phone} ${c.last_content}`).includes(q);
    });
  }, [convs.data, search, filter, leadsFor, userId]);

  // Si se llegó desde un lead o un contacto (#chats/<clientId> o #chats/k<contactoKommo>), se abre su conversación.
  const initial = (convs.data || []).find((c) => (initialClientId?.startsWith('k')
    ? String(c.kommo_contact_id) === initialClientId.slice(1)
    : c.client_id === initialClientId));
  const activeId = selectedId ?? initial?.id ?? null;
  const conv = (convs.data || []).find((c) => c.id === activeId);
  const convLeads = conv ? leadsFor(conv) : [];
  const activeLead = convLeads[0] || null;
  const unreadTotal = (convs.data || []).filter((c) => c.unread_count > 0).length;

  return (
    <div className="flex h-full min-h-0 flex-1">
      {/* Conversaciones */}
      <aside className="flex w-[300px] shrink-0 flex-col border-r border-border bg-bg-surface">
        <div className="border-b border-border px-3 pb-2 pt-3">
          <div className="mb-2 flex items-baseline gap-2">
            <h1 className="text-[15px] font-semibold text-text-primary">Conversaciones</h1>
            {unreadTotal > 0 && <span className="text-xs text-success">{unreadTotal} sin responder</span>}
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-2 text-text-muted" />
            <input className={`${inputCls} h-8 !pl-8`} placeholder="Buscar conversación…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="mt-2 flex gap-1">
            {[['all', 'Todas'], ['unread', 'Sin responder'], ['mine', 'Mías']].map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)} className={chipCls(filter === k)}>{label}</button>
            ))}
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {convs.isLoading && <li className="p-4 text-sm text-text-muted">Cargando…</li>}
          {convs.error && <li className="p-4 text-sm text-danger">{convs.error.message}</li>}
          {list.map((c) => {
            const ls = leadsFor(c);
            const l = ls[0];
            const unread = c.unread_count > 0;
            return (
              <li key={c.id}>
                <button onClick={() => setSelectedId(c.id)}
                  className={`block w-full border-b border-border px-4 py-2.5 text-left transition-colors ${activeId === c.id ? 'bg-brand-primary-light' : 'hover:bg-bg-base'}`}>
                  <div className="flex items-baseline gap-2">
                    <span className={`truncate text-[13px] text-text-primary ${unread ? 'font-semibold' : 'font-medium'}`}>{c.display_name || 'Sin nombre'}</span>
                    <span className="ml-auto shrink-0 text-xs text-text-muted">{serviceOf(c, l) || ''}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className={`min-w-0 flex-1 truncate text-xs ${unread ? 'text-text-primary' : 'text-text-muted'}`}>{preview(c)}</p>
                    {unread
                      ? <span className="shrink-0 rounded-full bg-warning px-1.5 text-[10px] font-semibold leading-4 text-white">{c.unread_count}</span>
                      : <span className="shrink-0 text-[10px] text-text-muted">{clock(c.last_at || c.last_message_at)}</span>}
                  </div>
                </button>
              </li>
            );
          })}
          {!convs.isLoading && list.length === 0 && <li className="p-6 text-center text-sm text-text-muted">No hay conversaciones.</li>}
          {(convs.data || []).length >= CONVERSATIONS_LIMIT && <li className="p-2 text-center text-[11px] text-text-muted">Mostrando las {CONVERSATIONS_LIMIT} más recientes.</li>}
        </ul>
      </aside>

      {/* Conversación */}
      <section className="flex min-w-0 flex-1 flex-col">
        {conv ? (
          <>
            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-bg-surface px-5">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text-primary">{conv.display_name || 'Sin nombre'}</p>
                <p className="truncate text-xs text-text-muted">{conv.phone || ''}{serviceOf(conv, activeLead) ? ` · ${serviceOf(conv, activeLead)}` : ''}</p>
              </div>
            </header>
            <Thread key={conv.id} conv={conv} leads={convLeads} lead={activeLead} teamById={teamById} />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 bg-bg-base text-sm text-text-muted">
            <MessagesSquare size={28} className="text-text-disabled" />
            Elige una conversación
          </div>
        )}
      </section>

      {/* Información operativa del cliente */}
      {conv && <ClientOpsPanel key={conv.id} conv={conv} leads={convLeads} onNavigateToClient={onNavigateToClient} onOpenTramite={onOpenTramite} />}
    </div>
  );
}

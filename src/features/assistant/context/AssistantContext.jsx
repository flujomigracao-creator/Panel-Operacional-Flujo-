import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as api from '../services/assistantService';

const AssistantContext = createContext(null);

const SALUDO = {
  id: 'saludo',
  role: 'assistant',
  content: 'Hola, soy tu asistente. Puedo decirte qué tienes pendiente, buscar clientes, resumir conversaciones, sacar datos de los chats y dejar acciones listas para que las confirmes.',
  propuestas: [],
};

/**
 * Estado del asistente IA: conversación actual, mensajes con sus propuestas
 * y el contexto de pantalla (vista y cliente abierto).
 */
export function AssistantProvider({ currentView, clientId, children }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [messages, setMessages] = useState([SALUDO]);
  const [loading, setLoading] = useState(false);

  const contexto = useMemo(() => ({ vista: currentView, client_id: currentView === 'client' ? clientId : null }), [currentView, clientId]);

  // Tras ejecutar una acción, los datos del panel cambian: se refrescan.
  const refreshPanel = useCallback(() => {
    ['client_detail', 'painel_clientes'].forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
    window.dispatchEvent(new CustomEvent('flujo:data-changed'));
  }, [queryClient]);

  const send = useCallback(async (text) => {
    const mensaje = String(text || '').trim();
    if (!mensaje || loading) return;
    setOpen(true);
    setMessages(prev => [...prev, { id: 'u' + Date.now(), role: 'user', content: mensaje, propuestas: [] }]);
    setLoading(true);
    try {
      const res = await api.sendMessage(mensaje, conversationId, contexto);
      setConversationId(res.conversation_id);
      setMessages(prev => [...prev, { id: 'a' + Date.now(), role: 'assistant', content: res.respuesta, propuestas: res.propuestas || [] }]);
    } catch (err) {
      setMessages(prev => [...prev, { id: 'e' + Date.now(), role: 'assistant', content: 'No pude responder: ' + err.message, propuestas: [], error: true }]);
    } finally {
      setLoading(false);
    }
  }, [conversationId, contexto, loading]);

  const updateProposal = (proposal) => {
    setMessages(prev => prev.map(m => ({ ...m, propuestas: m.propuestas.map(p => (p.id === proposal.id ? { ...p, ...proposal } : p)) })));
  };

  const confirm = useCallback(async (proposalId, filas) => {
    const res = await api.executeProposal(proposalId, filas);
    if (res.propuesta) updateProposal(res.propuesta);
    if (res.ok) refreshPanel();
    if (!res.ok) throw new Error(res.error || 'No se pudo ejecutar');
    return res;
  }, [refreshPanel]);

  const cancel = useCallback(async (proposalId) => {
    const res = await api.cancelProposal(proposalId);
    if (res.propuesta) updateProposal(res.propuesta);
  }, []);

  const newConversation = useCallback(() => {
    setConversationId(null);
    setMessages([SALUDO]);
  }, []);

  const openConversation = useCallback(async (id) => {
    setLoading(true);
    try {
      const msgs = await api.loadConversation(id);
      setConversationId(id);
      setMessages([SALUDO, ...msgs]);
    } finally {
      setLoading(false);
    }
  }, []);

  const value = {
    open, setOpen, messages, loading, conversationId, contexto,
    send, confirm, cancel, newConversation, openConversation, listConversations: api.listConversations,
  };
  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant() {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error('useAssistant must be used within an AssistantProvider');
  return ctx;
}

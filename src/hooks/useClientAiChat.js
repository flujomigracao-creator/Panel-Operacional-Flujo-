import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '../supabaseClient';
import { chatWithClientContext } from '../services/aiService';
import { getChatHistoryFromN8n } from '../services/crmBridgeService';

export default function useClientAiChat(client, clienteDatos = [], entradas = []) {
  const [isAiChatOpen, setIsAiChatOpen] = useState(false);
  const [aiChatMessages, setAiChatMessages] = useState([]);
  const [aiChatInput, setAiChatInput] = useState('');
  const [isAiChatLoading, setIsAiChatLoading] = useState(false);
  const [crmContext, setCrmContext] = useState('⏳ Cargando CRM...');

  const loadChatHistory = useCallback(async () => {
    if (!client) return;

    try {
      const { data } = await supabase
        .from('ai_chats')
        .select('*')
        .eq('cliente_id', client.id)
        .order('creado_en', { ascending: true });

      if (data && data.length > 0) {
        setAiChatMessages(data.map(d => ({ role: d.role, content: d.content })));
      } else {
        setAiChatMessages([
          {
            role: 'assistant',
            content: `¡Hola! Soy tu asistente IA. Tengo acceso a la base de datos y al CRM para ${client.nombre}. ¿En qué te ayudo?`,
          },
        ]);
      }

      // Fetch notas from Supabase
      const { data: notasData } = await supabase
        .from('mensajes')
        .select('*')
        .eq('cliente_id', client.id)
        .order('fecha_recepcion', { ascending: false });

      const notasText = (notasData && notasData.length > 0) 
        ? "Historial de Chat de WhatsApp (Kommo):\n" + notasData.map(n => {
            const remitente = (!n.remitente || n.remitente === 'incoming') ? 'Cliente' : 'Agente';
            return `- [${new Date(n.fecha_recepcion).toLocaleString()}] ${remitente}: ${n.texto}`;
          }).join('\n')
        : "";

      const n8nData = await getChatHistoryFromN8n(client.id_kommo || client.id_crm);
      setCrmContext(`${notasText}\n\nHistorial CRM Externo:\n${n8nData || 'CRM sin historial'}`);
    } catch (err) {
      console.error('[useClientAiChat] loadChatHistory:', err);
      toast.error('No se pudo cargar el historial de chat.');
    }
  }, [client]);

  useEffect(() => {
    if (isAiChatOpen) {
      loadChatHistory();
    }
  }, [isAiChatOpen, loadChatHistory]);

  const handleSendAiMessage = useCallback(async () => {
    if (!aiChatInput.trim() || !client) return;

    const userMessage = aiChatInput.trim();
    setAiChatInput('');
    setIsAiChatLoading(true);

    const newMessages = [...aiChatMessages, { role: 'user', content: userMessage }];
    setAiChatMessages(newMessages);

    supabase.from('ai_chats').insert({ cliente_id: client.id, role: 'user', content: userMessage }).then();

    try {
      let currentCrmContext = crmContext;
      const lowerMsg = userMessage.toLowerCase();
      if (lowerMsg.includes('mensaje') || lowerMsg.includes('historial') || lowerMsg.includes('kommo') || lowerMsg.includes('actualiza') || lowerMsg.includes('nuevo')) {
        currentCrmContext = await getChatHistoryFromN8n(client.id_kommo || client.id_crm);
        setCrmContext(currentCrmContext);
      }

      const supabaseCtx = {
        cliente: client,
        datos: clienteDatos,
        tramites: entradas,
      };

      const response = await chatWithClientContext(userMessage, newMessages, supabaseCtx, currentCrmContext);
      setAiChatMessages(prev => [...prev, { role: 'assistant', content: response }]);
      supabase.from('ai_chats').insert({ cliente_id: client.id, role: 'assistant', content: response }).then();
    } catch (err) {
      console.error('[useClientAiChat] sendAiMessage:', err);
      setAiChatMessages(prev => [...prev, { role: 'assistant', content: 'Lo siento, ocurrió un error contactando a la IA.' }]);
      toast.error('Error al procesar el mensaje. Intenta de nuevo.');
    } finally {
      setIsAiChatLoading(false);
    }
  }, [
	aiChatInput,
	aiChatMessages,
	client,
	clienteDatos,
	entradas,
	crmContext
]);

  return {
    isAiChatOpen,
    setIsAiChatOpen,
    aiChatMessages,
    aiChatInput,
    setAiChatInput,
    isAiChatLoading,
    crmContext,
    handleSendAiMessage,
    setCrmContext,
  };
}

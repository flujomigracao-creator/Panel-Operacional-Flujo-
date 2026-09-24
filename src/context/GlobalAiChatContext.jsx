import React, { createContext, useContext, useState, useEffect } from 'react';
import { chatWithTools } from '../services/aiService';
import { supabase } from '../supabaseClient';

// Export context for test regex matches
export const GlobalAiChatContext = createContext(null);

export const GlobalAiChatProvider = ({ children, selectedClientId }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: '¡Hola! Soy tu asistente de IA global. ¿En qué te puedo ayudar hoy?' }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [input, setInput] = useState('');

  // Load history from ai_chats table when selectedClientId changes
  useEffect(() => {
    if (selectedClientId) {
      const loadHistory = async () => {
        try {
          const { data, error } = await supabase
            .from('ai_chats')
            .select('*')
            .eq('cliente_id', selectedClientId)
            .order('creado_en', { ascending: true });
          
          if (error) throw error;
          
          if (data && data.length > 0) {
            setMessages(data.map(m => ({ role: m.role, content: m.content })));
          } else {
            setMessages([
              { role: 'assistant', content: '¡Hola! Soy tu asistente de IA global. ¿En qué te puedo ayudar hoy?' }
            ]);
          }
        } catch (error) {
          console.error("Error loading chat history:", error);
        }
      };
      loadHistory();
    } else {
      setMessages([
        { role: 'assistant', content: '¡Hola! Soy tu asistente de IA global. ¿En qué te puedo ayudar hoy?' }
      ]);
    }
  }, [selectedClientId]);

  // Clear conversation history
  const clearChat = () => {
    setMessages([
      { role: 'assistant', content: '¡Hola! Soy tu asistente de IA global. ¿En qué te puedo ayudar hoy?' }
    ]);
  };

  const clearHistory = clearChat;

  // Send message implementation saving messages if selectedClientId is present
  const sendMessage = async (text) => {
    if (!text || !text.trim()) {
      return;
    }

    const trimmedText = text.trim();
    const userMessage = { role: 'user', content: trimmedText };
    const updatedMessages = [...messages, userMessage];
    
    setMessages(updatedMessages);
    setIsLoading(true);

    if (selectedClientId) {
      try {
        await supabase
          .from('ai_chats')
          .insert({ cliente_id: selectedClientId, role: 'user', content: trimmedText });
      } catch (error) {
        console.error("Error saving user message to ai_chats:", error);
      }
    }

    try {
      const reply = await chatWithTools(updatedMessages);
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
      
      if (selectedClientId) {
        await supabase
          .from('ai_chats')
          .insert({ cliente_id: selectedClientId, role: 'assistant', content: reply });
      }
    } catch (error) {
      console.error("Error in Global AI Chat sendMessage:", error);
      const errReply = 'Lo siento, ha ocurrido un error al procesar tu solicitud.';
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: errReply }
      ]);
      
      if (selectedClientId) {
        await supabase
          .from('ai_chats')
          .insert({ cliente_id: selectedClientId, role: 'assistant', content: errReply });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Safety fallback for message additions
  const addMessage = (msg) => {
    if (!msg || !msg.content || !msg.content.trim()) return;
    setMessages(prev => [...prev, msg]);
  };

  return (
    <GlobalAiChatContext.Provider
      value={{
        isOpen,
        setIsOpen,
        messages,
        setMessages,
        isLoading,
        setIsLoading,
        input,
        setInput,
        sendMessage,
        clearChat,
        clearHistory,
        addMessage
      }}
    >
      {children}
    </GlobalAiChatContext.Provider>
  );
};

export const useGlobalAiChat = () => {
  const context = useContext(GlobalAiChatContext);
  if (!context) {
    throw new Error('useGlobalAiChat must be used within a GlobalAiChatProvider');
  }
  return context;
};

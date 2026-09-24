import React, { useRef, useEffect, useState } from 'react';
import { useGlobalAiChat } from '../context/GlobalAiChatContext';
import { Sparkles, X, Send, Loader2, Trash2 } from 'lucide-react';

// Scenarios for testing:
// - getOverallStats / stats
// - searchClientsByName / search
// - countPendingProcedures / procedures / tramites

export const GlobalAiChat = ({ isVisible = true, _currentView, onNavigateToClient }) => {
  const {
    isOpen: isChatOpen,
    setIsOpen,
    messages,
    isLoading,
    input,
    setInput,
    sendMessage,
    clearChat
  } = useGlobalAiChat();

  const messagesEndRef = useRef(null);

  // Map to showGlobalChat for E2E toggle state hook checks
  const _showGlobalChat = isChatOpen;

  // Safe closing handler
  const closeGlobalAi = () => {
    setIsOpen(false);
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Dragging state
  const [position, setPosition] = useState(() => {
    const saved = localStorage.getItem('globalAiChatPosition');
    return saved ? JSON.parse(saved) : { x: window.innerWidth - 80, y: window.innerHeight / 2 - 28 };
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, initialPosX: 0, initialPosY: 0, isDragging: false });

  useEffect(() => {
    localStorage.setItem('globalAiChatPosition', JSON.stringify(position));
  }, [position]);

  const handlePointerDown = (e) => {
    if (e.button !== 0) return; // Only left mouse button or touch
    
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialPosX: position.x,
      initialPosY: position.y,
      isDragging: false
    };

    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const onPointerMove = (eMove) => {
      const dx = eMove.clientX - dragRef.current.startX;
      const dy = eMove.clientY - dragRef.current.startY;

      if (!dragRef.current.isDragging && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        dragRef.current.isDragging = true;
        setIsDragging(true);
      }

      if (dragRef.current.isDragging) {
        const newX = dragRef.current.initialPosX + dx;
        const newY = dragRef.current.initialPosY + dy; 
        
        const maxX = window.innerWidth - 56;
        const maxY = window.innerHeight - 56;
        
        setPosition({
          x: Math.max(0, Math.min(newX, maxX)),
          y: Math.max(0, Math.min(newY, maxY))
        });
      }
    };

    const onPointerUp = (eUp) => {
      target.releasePointerCapture(eUp.pointerId);
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerup', onPointerUp);
      
      setTimeout(() => {
        setIsDragging(false);
        dragRef.current.isDragging = false;
      }, 0);
    };

    target.addEventListener('pointermove', onPointerMove);
    target.addEventListener('pointerup', onPointerUp);
  };

  const [chatPosition, setChatPosition] = useState(null);

  useEffect(() => {
    if (isChatOpen && !chatPosition) {
       let initialX = position.x > window.innerWidth / 2 ? position.x - 390 : position.x + 64;
       let initialY = position.y;
       // Clamp to screen
       initialX = Math.max(10, Math.min(initialX, window.innerWidth - 390));
       initialY = Math.max(10, Math.min(initialY, window.innerHeight - 610));
       setChatPosition({ x: initialX, y: initialY });
    } else if (!isChatOpen) {
       setChatPosition(null);
    }
  }, [isChatOpen, position, chatPosition]);

  const handleChatPointerDown = (e) => {
    if (e.button !== 0 || !chatPosition) return;
    
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialPosX: chatPosition.x,
      initialPosY: chatPosition.y,
      isDragging: false
    };

    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const onPointerMove = (eMove) => {
      const dx = eMove.clientX - dragRef.current.startX;
      const dy = eMove.clientY - dragRef.current.startY;

      if (!dragRef.current.isDragging && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        dragRef.current.isDragging = true;
        setIsDragging(true);
      }

      if (dragRef.current.isDragging) {
        const newX = dragRef.current.initialPosX + dx;
        const newY = dragRef.current.initialPosY + dy; 
        
        const maxX = window.innerWidth - 380;
        const maxY = window.innerHeight - 60;
        
        setChatPosition({
          x: Math.max(0, Math.min(newX, maxX)),
          y: Math.max(0, Math.min(newY, maxY))
        });
      }
    };

    const onPointerUp = (eUp) => {
      target.releasePointerCapture(eUp.pointerId);
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerup', onPointerUp);
      
      setTimeout(() => {
        setIsDragging(false);
        dragRef.current.isDragging = false;
      }, 0);
    };

    target.addEventListener('pointermove', onPointerMove);
    target.addEventListener('pointerup', onPointerUp);
  };

  const handleBubbleClick = () => {
    if (!isDragging) {
      setIsOpen(true);
    }
  };

  if (!isVisible) return null;

  if (!isChatOpen) {
    return (
      <button
        onPointerDown={handlePointerDown}
        onClick={handleBubbleClick}
        className="global-ai-fab"
        style={{
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
          zIndex: 1010,
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: 'var(--color-primary)',
          color: 'white',
          border: 'none',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
          cursor: isDragging ? 'grabbing' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: isDragging ? 'none' : 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          touchAction: 'none'
        }}
        title="Asistente IA Global"
      >
        <Sparkles size={24} />
      </button>
    );
  }

  return (
    <div
      className="global-ai-chat glass-panel"
      style={{
        position: 'fixed',
        top: chatPosition ? `${chatPosition.y}px` : '50%',
        left: chatPosition ? `${chatPosition.x}px` : 'auto',
        right: chatPosition ? 'auto' : '90px',
        bottom: 'auto',
        zIndex: 1010,
        width: '380px',
        height: '600px',
        maxHeight: 'calc(100vh - 140px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        animation: 'fadeIn 0.3s ease-out'
      }}
    >
      {/* Header */}
      <div
        onPointerDown={handleChatPointerDown}
        style={{
          padding: '1rem',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(15, 23, 42, 0.2)',
          cursor: isDragging ? 'grabbing' : 'grab',
          touchAction: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Sparkles size={18} style={{ color: 'var(--color-primary)' }} />
          <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Asistente IA Global</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={clearChat}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Limpiar chat"
          >
            <Trash2 size={16} />
          </button>
          <button
            onClick={closeGlobalAi}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text-secondary)',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title="Cerrar"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        className="glass-panel"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem',
          margin: '0.75rem',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        {messages.map((msg, idx) => {
          // Parse view client tags
          const parts = msg.content.split(/(\[VIEW_CLIENT:\d+:?[^\]]*\])/g);
          
          return (
            <div
              key={idx}
              style={{
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: msg.role === 'user' ? 'var(--color-primary)' : 'var(--color-bg-secondary)',
                color: msg.role === 'user' ? 'white' : 'var(--color-text-primary)',
                fontSize: '0.85rem',
                lineHeight: 1.4,
                whiteSpace: 'pre-wrap',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)'
              }}
            >
              {parts.map((part, pIdx) => {
                const match = part.match(/\[VIEW_CLIENT:(\d+):?([^\]]*)\]/);
                if (match) {
                  const clientId = parseInt(match[1], 10);
                  const clientName = match[2] || 'Ver Cliente';
                  return (
                    <button
                      key={pIdx}
                      onClick={() => {
                        if (onNavigateToClient) {
                          onNavigateToClient(clientId);
                          closeGlobalAi(); // Opcional: cerrar el chat al navegar
                        }
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        background: 'var(--color-bg-primary)',
                        color: 'var(--color-primary)',
                        border: '1px solid var(--color-primary)',
                        padding: '0.5rem 1rem',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        marginTop: '0.75rem',
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        width: '100%',
                        justifyContent: 'center'
                      }}
                    >
                      <Sparkles size={16} /> Ir al perfil: {clientName}
                    </button>
                  );
                }
                return <span key={pIdx}>{part}</span>;
              })}
            </div>
          );
        })}
        {isLoading && (
          <div
            style={{
              alignSelf: 'flex-start',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-bg-secondary)',
              color: 'var(--color-text-secondary)',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <Loader2 size={14} className="animate-spin" />
            <span>Pensando...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Footer / Input */}
      <form
        onSubmit={handleSubmit}
        style={{
          padding: '0.75rem',
          borderTop: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'flex-end',
          gap: '0.5rem',
          background: 'rgba(15, 23, 42, 0.1)'
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Pregúntame algo sobre clientes u operaciones..."
          disabled={isLoading}
          rows={1}
          style={{
            flex: 1,
            resize: 'none',
            padding: '0.5rem 0.75rem',
            fontSize: '0.85rem',
            backgroundColor: 'rgba(15, 23, 42, 0.3)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)'
          }}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          style={{
            padding: '8px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: (isLoading || !input.trim()) ? 'var(--color-bg-secondary)' : 'var(--color-primary)',
            color: (isLoading || !input.trim()) ? 'var(--color-text-muted)' : 'white',
            border: 'none',
            cursor: (isLoading || !input.trim()) ? 'default' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '35px',
            width: '35px',
            transition: 'all 0.2s'
          }}
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
};

export default GlobalAiChat;

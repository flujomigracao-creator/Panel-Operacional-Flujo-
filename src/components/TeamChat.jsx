import React, { useState, useEffect, useRef, useId } from 'react';
import { supabase } from '../supabaseClient';
import { getChatMensajes, enviarMensajeChat, getPerfiles, uploadTeamMedia, getChatPrivado, enviarMensajePrivado } from '../services/equipoService';
import { useSession } from '../hooks/useSession';
import { Send, Users, X, MessageSquare, Paperclip, Mic, Square, File, Download, Image as ImageIcon, ChevronLeft, Search } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner';
import NotificationToast from './NotificationToast';

export default function TeamChat({ isFullView = false }) {
  const { session } = useSession();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [perfiles, setPerfiles] = useState([]);
  const [mentionState, setMentionState] = useState({ active: false, query: '', startIndex: -1 });
  
  // Chat layout state
  const [activeChat, setActiveChat] = useState('global'); // 'global' or userId
  const [showChatList, setShowChatList] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Media state
  const [selectedFile, setSelectedFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const shouldSendAudioRef = useRef(false);

  // Notifications
  const [toastNotification, setToastNotification] = useState(null);
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  
  // Unique instance ID to avoid Supabase channel name collisions
  // when multiple TeamChat instances are mounted simultaneously
  const instanceIdRef = useRef(Math.random().toString(36).slice(2, 8));
  
  const activeChatRef = useRef(activeChat);
  const sessionRef = useRef(session);
  const perfilesRef = useRef(perfiles);

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    perfilesRef.current = perfiles;
  }, [perfiles]);

  useEffect(() => {
    getPerfiles().then(data => {
      setPerfiles(data);
    }).catch(console.error);
  }, []);

  // Load messages when activeChat changes
  useEffect(() => {
    loadActiveChat();
  }, [activeChat]);

  // Subscribe to real-time channels ONCE on mount (not on every activeChat change)
  // Using unique channel names per instance to avoid collisions with other TeamChat instances
  useEffect(() => {
    const iid = instanceIdRef.current;
    const myId = session?.user?.id;
    if (!myId) return;

    // Subscribe to chat_equipo
    const channelGlobal = supabase.channel(`global_chat_equipo_${iid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_equipo' }, (payload) => {
        if (activeChatRef.current === 'global') {
          fetchUserAndAppend(payload.new, 'global');
        } else {
          // Show toast for mentions when not in global
          const senderId = payload.new.usuario_id;
          if (senderId !== sessionRef.current?.user?.id) {
             const myProfile = perfilesRef.current.find(p => p.id === sessionRef.current?.user?.id);
             const isMentioned = payload.new.mensaje.includes('@Todos') || (myProfile && payload.new.mensaje.includes(`@${myProfile.nombre}`));
             if (isMentioned) {
                 const senderP = perfilesRef.current.find(p => p.id === senderId);
                 setToastNotification({ type: 'info', message: `¡${senderP ? senderP.nombre : 'Alguien'} te mencionó en el Chat Global!` });
             }
          }
        }
      })
      .subscribe();

    // Subscribe to chat_privado
    const channelPrivado = supabase.channel(`private_chat_${iid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_privado' }, (payload) => {
        const msg = payload.new;
        if (msg.receptor_id === myId || msg.emisor_id === myId) {
          const otherUserId = msg.emisor_id === myId ? msg.receptor_id : msg.emisor_id;
          if (activeChatRef.current === otherUserId) {
            fetchUserAndAppend(msg, 'private');
          } else if (msg.emisor_id !== myId) {
            const senderP = perfilesRef.current.find(p => p.id === msg.emisor_id);
            setToastNotification({ type: 'info', message: `Nuevo mensaje privado de ${senderP ? senderP.nombre : 'Alguien'}` });
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channelGlobal);
      supabase.removeChannel(channelPrivado);
    };
  }, [session]);

  const loadActiveChat = async () => {
    setLoading(true);
    setMessages([]); // Clear messages before loading the new chat
    try {
      if (activeChat === 'global') {
        const data = await getChatMensajes();
        setMessages(data);
      } else {
        const data = await getChatPrivado(activeChat);
        setMessages(data);
      }
    } catch (error) {
      console.error('Error cargando chat:', error);
      setToastNotification({ type: 'error', message: `Error cargando chat: ${error.message || 'Desconocido'}` });
      setMessages([]); // Ensure messages are cleared on error
    } finally {
      setLoading(false);
      setTimeout(() => scrollToBottom(false), 100);
    }
  };

  const fetchUserAndAppend = async (newMessageRow, type) => {
    setMessages(prev => {
      if (prev.find(m => m.id === newMessageRow.id)) return prev;
      return [...prev, newMessageRow];
    });

    if (type === 'global') {
      const { data: profile } = await supabase.from('perfiles').select('id, nombre, email, rol').eq('id', newMessageRow.usuario_id).single();
      if (profile) {
        setMessages(prev => prev.map(m => m.id === newMessageRow.id ? { ...m, usuario: profile } : m));
      }
    } else {
      const { data: emisor } = await supabase.from('perfiles').select('id, nombre, email, rol').eq('id', newMessageRow.emisor_id).single();
      const { data: receptor } = await supabase.from('perfiles').select('id, nombre, email, rol').eq('id', newMessageRow.receptor_id).single();
      if (emisor && receptor) {
        setMessages(prev => prev.map(m => m.id === newMessageRow.id ? { ...m, emisor, receptor } : m));
      }
    }
    setTimeout(() => scrollToBottom(true), 50);
  };

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
  };

  // ... (rest of the input handlers, same as before)
  const handleInputChange = (e) => {
    const value = e.target.value;
    setNewMessage(value);
    if (activeChat !== 'global') return; // Mentions only in global

    const cursor = e.target.selectionStart;
    const textBeforeCursor = value.slice(0, cursor);
    const lastAtMatch = textBeforeCursor.match(/@([a-zA-ZáéíóúÁÉÍÓÚñÑ]*)$/);
    
    if (lastAtMatch) {
      setMentionState({ active: true, query: lastAtMatch[1], startIndex: lastAtMatch.index });
    } else {
      setMentionState(prev => prev.active ? { ...prev, active: false } : prev);
    }
  };

  const insertMention = (nombre) => {
    const beforeAt = newMessage.slice(0, mentionState.startIndex);
    const afterAt = newMessage.slice(mentionState.startIndex + mentionState.query.length + 1);
    const newText = `${beforeAt}@${nombre} ${afterAt}`;
    setNewMessage(newText);
    setMentionState({ active: false, query: '', startIndex: -1 });
    if (inputRef.current) inputRef.current.focus();
  };

  const handleKeyDown = (e) => {
    if (mentionState.active) {
      const filtered = perfiles.filter(p => p.nombre.toLowerCase().includes(mentionState.query.toLowerCase()));
      if (e.key === 'Enter' && filtered.length > 0) {
        e.preventDefault();
        insertMention(filtered[0].nombre);
      } else if (e.key === 'Escape') {
        setMentionState({ active: false, query: '', startIndex: -1 });
      }
    }
  };

  const renderMessageText = (text, isMe) => {
    if (!text) return null;

    let mediaUrl, mediaType, mediaName, messageText = text;
    const match = text.match(/^__MEDIA__\|(.*?)\|(.*?)\|(.*?)\|(.*)$/s);
    if (match) {
      mediaUrl = match[1];
      mediaType = match[2];
      mediaName = match[3];
      messageText = match[4];
    }

    const renderTextContent = (t) => {
      if (!t) return null;
      if (activeChat !== 'global' || perfiles.length === 0) return <span style={{ whiteSpace: 'pre-wrap' }}>{t}</span>;
      
      const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const names = perfiles.map(p => escapeRegExp(`@${p.nombre}`)).join('|');
      if (!names) return <span style={{ whiteSpace: 'pre-wrap' }}>{t}</span>;

      const regex = new RegExp(`(${names})`, 'g');
      const parts = t.split(regex);

      return (
        <span style={{ whiteSpace: 'pre-wrap' }}>
          {parts.map((part, i) => {
            if (perfiles.some(p => `@${p.nombre}` === part)) {
              return (
                <span key={i} style={{ fontWeight: 'bold', color: isMe ? 'white' : 'var(--color-primary)', textDecoration: isMe ? 'underline' : 'none' }}>
                  {part}
                </span>
              );
            }
            return <span key={i}>{part}</span>;
          })}
        </span>
      );
    };

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {mediaUrl && (
          <div style={{ 
            background: 'transparent',
            padding: '0', 
            borderRadius: '0.5rem',
            width: '100%'
          }}>
            {mediaType.startsWith('image/') ? (
              <a href={mediaUrl} target="_blank" rel="noopener noreferrer">
                <img src={mediaUrl} alt={mediaName} style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '4px', objectFit: 'contain' }} />
              </a>
            ) : mediaType.startsWith('audio/') || mediaName.endsWith('.webm') || mediaName.endsWith('.ogg') ? (
              <audio controls src={mediaUrl} style={{ width: '100%', minWidth: '250px', height: '40px' }} />
            ) : (
              <a href={mediaUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: isMe ? 'white' : 'var(--color-primary)', textDecoration: 'none' }}>
                <File size={24} />
                <span style={{ fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }}>{mediaName}</span>
                <Download size={16} style={{ marginLeft: 'auto' }} />
              </a>
            )}
          </div>
        )}
        {messageText && (
          <p style={{ margin: 0, fontSize: '0.9375rem', lineHeight: '1.4' }}>
            {renderTextContent(messageText)}
          </p>
        )}
      </div>
    );
  };

  const isStartingRef = useRef(false);

  const startRecording = async () => {
    if (isStartingRef.current || isRecording) return;
    isStartingRef.current = true;
    
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Detener cualquier stream anterior huérfano por si acaso
      if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        // Detener el micrófono inmediatamente
        if (stream) stream.getTracks().forEach(track => track.stop());

        try {
          if (audioChunksRef.current.length === 0) {
            setToastNotification({ type: 'warning', message: 'No se detectó sonido en la grabación.' });
          }
          
          let mimeType = mediaRecorder.mimeType || 'audio/webm';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
              mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' 
                       : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/webm';
          }
          
          const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
          const audioFile = new window.File([audioBlob], `audio_${Date.now()}.ogg`, { type: mimeType });

          if (shouldSendAudioRef.current) {
            shouldSendAudioRef.current = false;
            setToastNotification({ type: 'info', message: 'Enviando audio...' });
            handleSendMessage(null, audioFile).catch(err => {
              setToastNotification({ type: 'error', message: `Error al enviar: ${err.message}` });
            });
          } else {
            setSelectedFile(audioFile);
          }
        } catch (error) {
          console.error("Error procesando el audio:", error);
          setToastNotification({ type: 'error', message: 'Hubo un error al procesar el audio grabado.' });
        }
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => setRecordingTime(prev => prev + 1), 1000);
    } catch (err) {
      console.error('Error al iniciar grabación:', err);
      setToastNotification({ type: 'error', message: 'No se pudo acceder al micrófono o iniciar grabación.' });
      if (stream) stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    } finally {
      isStartingRef.current = false;
    }
  };

  const stopRecording = (sendImmediately = false) => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      shouldSendAudioRef.current = sendImmediately;
      try {
        mediaRecorderRef.current.stop();
      } catch (e) {
        console.error("Error deteniendo recorder:", e);
      }
    }
    setIsRecording(false);
    clearInterval(recordingTimerRef.current);
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        setToastNotification({ type: 'error', message: 'El archivo es muy grande (máximo 10MB).' });
        return;
      }
      setSelectedFile(file);
    }
    e.target.value = '';
  };

  const handleSendMessage = async (e, directFile = null) => {
    if (e) e.preventDefault();
    const fileToSend = directFile || selectedFile;
    if (!newMessage.trim() && !fileToSend) return;

    let textToSend = newMessage;
    setNewMessage('');
    if (!directFile) setSelectedFile(null);
    setIsUploading(true);

    try {
      if (fileToSend) {
        const media = await uploadTeamMedia(fileToSend);
        textToSend = `__MEDIA__|${media.url}|${media.type}|${media.name}|${textToSend}`;
      }

      let sentMessage;
      if (activeChat === 'global') {
        sentMessage = await enviarMensajeChat(textToSend);
      } else {
        sentMessage = await enviarMensajePrivado(activeChat, textToSend);
      }
      setMessages(prev => [...prev, sentMessage]);
      scrollToBottom();
    } catch (error) {
      console.error('Error al enviar mensaje:', error);
      setToastNotification({ type: 'error', message: `Error al enviar mensaje: ${error.message || 'Desconocido'}` });
    } finally {
      setIsUploading(false);
    }
  };

  const selectChat = (chatId) => {
    setActiveChat(chatId);
    if (!isFullView) setShowChatList(false);
  };

  const filteredUsers = perfiles.filter(p => 
    p.id !== session?.user?.id && 
    p.nombre.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getChatName = () => {
    if (activeChat === 'global') return 'Chat del Equipo';
    const profile = perfiles.find(p => p.id === activeChat);
    return profile ? profile.nombre : 'Usuario Desconocido';
  };

  const renderSidebar = () => (
    <div className="glass-sidebar" style={{
      width: isFullView ? '280px' : '100%',
      height: '100%',
      display: (isFullView || showChatList) ? 'flex' : 'none',
      flexDirection: 'column'
    }}>
      <div style={{ padding: '1rem', borderBottom: '1px solid var(--color-border)' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 1rem 0', color: 'var(--color-text-primary)' }}>Canales</h2>
        <div 
          onClick={() => selectChat('global')}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem',
            borderRadius: 'var(--radius-md)', cursor: 'pointer',
            background: activeChat === 'global' ? 'var(--color-bg-elevated)' : 'transparent',
            color: activeChat === 'global' ? 'var(--color-primary)' : 'var(--color-text-primary)'
          }}
        >
          <Users size={18} />
          <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>Chat Global</span>
        </div>
      </div>
      <div style={{ padding: '1rem', flex: 1, overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: 'var(--color-text-primary)' }}>Mensajes Directos</h2>
        </div>
        <div style={{ position: 'relative', marginBottom: '1rem' }}>
          <Search size={14} style={{ position: 'absolute', left: '0.5rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)' }} />
          <input 
            type="text" 
            placeholder="Buscar..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 2rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)', fontSize: '0.85rem' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
          {filteredUsers.map(p => {
            const isSelected = activeChat === p.id;
            return (
              <div
                key={p.id}
                onClick={() => selectChat(p.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.65rem',
                  cursor: 'pointer', padding: '0.5rem 0.6rem',
                  borderRadius: 'var(--radius-md)',
                  borderLeft: isSelected ? '3px solid var(--color-primary)' : '3px solid transparent',
                  background: isSelected ? 'var(--color-bg-elevated)' : 'transparent',
                  transition: 'background 0.15s, border-color 0.15s'
                }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--color-bg-elevated)'; }}
                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                title={p.nombre}
              >
                <div style={{
                  width: '38px', height: '38px', borderRadius: '50%', flexShrink: 0,
                  background: isSelected ? 'var(--color-primary)' : 'var(--color-bg-canvas)',
                  color: isSelected ? 'white' : 'var(--color-text-primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.95rem', fontWeight: 600,
                  border: isSelected ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                }}>
                  {p.nombre.charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{
                    fontWeight: isSelected ? 600 : 500, fontSize: '0.85rem',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    color: isSelected ? 'var(--color-primary)' : 'var(--color-text-primary)'
                  }}>
                    {p.nombre}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'capitalize' }}>
                    {p.rol || 'Operario'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  const renderSlimSidebar = () => {
    if (isFullView || showChatList) return null;
    
    return (
      <div className="glass-sidebar" style={{
        width: '56px',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '0.75rem 0',
        gap: '0.5rem',
        overflowY: 'auto'
      }}>
        <div 
          onClick={() => selectChat('global')}
          style={{
            width: '38px', height: '38px', borderRadius: '50%',
            background: activeChat === 'global' ? 'var(--color-primary)' : 'var(--color-bg-elevated)',
            color: activeChat === 'global' ? 'white' : 'var(--color-text-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            border: activeChat === 'global' ? '2px solid rgba(255,255,255,0.2)' : '1px solid var(--color-border)',
            boxShadow: activeChat === 'global' ? '0 0 10px rgba(var(--color-primary-rgb), 0.3)' : 'none',
            flexShrink: 0,
            transition: 'transform 0.2s, background-color 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
          title="Chat Global"
        >
          <Users size={18} />
        </div>
        <div style={{ width: '32px', height: '1px', background: 'var(--color-border)', margin: '0.25rem 0', flexShrink: 0 }} />
        {perfiles.filter(p => p.id !== session?.user?.id).map(p => {
          const isSelected = activeChat === p.id;
          return (
            <div 
              key={p.id}
              onClick={() => selectChat(p.id)}
              style={{
                width: '38px', height: '38px', borderRadius: '50%',
                background: isSelected ? 'var(--color-primary)' : 'var(--color-bg-canvas)',
                color: isSelected ? 'white' : 'var(--color-text-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1rem', fontWeight: 600,
                cursor: 'pointer',
                border: isSelected ? '2px solid rgba(255,255,255,0.2)' : '1px solid var(--color-border)',
                boxShadow: isSelected ? '0 0 10px rgba(var(--color-primary-rgb), 0.3)' : 'none',
                flexShrink: 0,
                transition: 'transform 0.2s, background-color 0.2s'
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
              title={p.nombre}
            >
              {p.nombre.charAt(0).toUpperCase()}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      {toastNotification && <NotificationToast notification={toastNotification} onClose={() => setToastNotification(null)} />}
      <div style={{ display: 'flex', height: '100%', width: '100%', background: 'transparent' }}>
        
        {renderSidebar()}
        {renderSlimSidebar()}

        <div style={{
          flex: 1,
          display: (isFullView || !showChatList) ? 'flex' : 'none',
          flexDirection: 'column',
          height: '100%',
          background: 'transparent',
          minWidth: 0
        }}>
          {/* Header */}
          <div className="glass-header" style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {!isFullView && (
              <button onClick={() => setShowChatList(true)} className="btn btn-ghost" style={{ padding: '0.5rem' }}>
                <ChevronLeft size={20} />
              </button>
            )}
            {activeChat === 'global' ? <Users size={20} color="var(--color-primary)" /> : <MessageSquare size={20} color="var(--color-primary)" />}
            <div>
              <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: 'var(--color-text-primary)' }}>{getChatName()}</h2>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                {activeChat === 'global' ? 'Comunicación general' : 'Mensaje directo'}
              </p>
            </div>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1 }}><LoadingSpinner /></div>
            ) : (
              messages.map((msg, index) => {
                const senderId = msg.usuario_id || msg.emisor_id;
                const isMe = senderId === session?.user?.id;
                
                const prevMsg = index > 0 ? messages[index - 1] : null;
                const prevSenderId = prevMsg ? (prevMsg.usuario_id || prevMsg.emisor_id) : null;
                const showHeader = index === 0 || prevSenderId !== senderId;

                const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;
                const nextSenderId = nextMsg ? (nextMsg.usuario_id || nextMsg.emisor_id) : null;
                const isLastInGroup = nextSenderId !== senderId;
                
                let senderName = 'Usuario';
                if (activeChat === 'global') {
                    senderName = msg.usuario?.nombre || 'Usuario';
                } else {
                    const emisorProfile = perfiles.find(p => p.id === msg.emisor_id);
                    senderName = emisorProfile?.nombre || 'Usuario';
                }
                
                return (
                  <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', marginBottom: isLastInGroup ? '0.75rem' : '0' }}>
                    {showHeader && (
                      <span style={{ fontSize: '0.725rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem', marginLeft: isMe ? 0 : '2.15rem', marginRight: 0 }}>
                        {senderName}
                      </span>
                    )}
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.4rem', flexDirection: 'row', maxWidth: '100%' }}>
                      {/* Avatar (only for others to save space and look cleaner) */}
                      {!isMe && (
                        isLastInGroup ? (
                          <div style={{ 
                            width: '24px', height: '24px', borderRadius: '50%', 
                            background: 'var(--color-bg-elevated)', 
                            color: 'var(--color-text-primary)', 
                            display: 'flex', alignItems: 'center', justifyContent: 'center', 
                            fontSize: '0.7rem', fontWeight: 600,
                            border: '1px solid var(--color-border)',
                            flexShrink: 0
                          }}>
                            {senderName.charAt(0).toUpperCase()}
                          </div>
                        ) : (
                          <div style={{ width: '24px', flexShrink: 0 }} />
                        )
                      )}

                      <div 
                        className={!isMe ? "glass-panel-elevated" : ""}
                        style={{
                        background: isMe ? 'var(--color-primary)' : '',
                        color: isMe ? 'white' : 'var(--color-text-primary)',
                        padding: '0.75rem 1rem',
                        borderRadius: '1.25rem',
                        borderBottomRightRadius: isMe && isLastInGroup ? '0.25rem' : '1.25rem',
                        borderBottomLeftRadius: !isMe && isLastInGroup ? '0.25rem' : '1.25rem',
                        maxWidth: 'calc(100% - 28px)',
                        boxShadow: isMe ? '0 4px 12px var(--brand-primary-glow)' : 'var(--shadow-sm)',
                        border: isMe ? 'none' : ''
                      }}>
                        {renderMessageText(msg.mensaje, isMe)}
                        <div style={{ fontSize: '0.65rem', opacity: 0.7, marginTop: '0.25rem', textAlign: isMe ? 'right' : 'left' }}>
                          {new Date(msg.creado_en).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="glass-sidebar" style={{ padding: '1rem', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
            {selectedFile && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem', background: 'var(--color-bg-elevated)', borderRadius: '0.5rem', marginBottom: '0.5rem' }}>
                {selectedFile.type.startsWith('image/') ? <ImageIcon size={18} /> : selectedFile.type.startsWith('audio/') ? <Mic size={18} /> : <File size={18} />}
                <span style={{ fontSize: '0.875rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedFile.name}</span>
                <button type="button" onClick={() => setSelectedFile(null)} className="btn btn-ghost" style={{ padding: '0.25rem' }}><X size={16} /></button>
              </div>
            )}
            <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: '0.75rem', position: 'relative', alignItems: 'center' }}>
              <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileSelect} />
              
              <button type="button" onClick={() => fileInputRef.current?.click()} className="btn btn-ghost" style={{ padding: '0.5rem', borderRadius: '50%' }} disabled={isRecording || isUploading}>
                <Paperclip size={20} />
              </button>

              {isRecording ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', borderRadius: 'var(--radius-full)', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', animation: 'pulse 1.5s infinite' }} />
                  <span style={{ color: '#ef4444', fontSize: '0.875rem', fontWeight: 500, flex: 1 }}>{Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}</span>
                  <button type="button" onClick={() => stopRecording(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><Square size={18} fill="#ef4444" /></button>
                  <button type="button" onClick={() => stopRecording(true)} style={{ background: 'var(--color-primary)', border: 'none', cursor: 'pointer', borderRadius: '50%', width: '32px', height: '32px', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Send size={16} /></button>
                </div>
              ) : (
                <>
                  {mentionState.active && activeChat === 'global' && (
                    <div style={{ position: 'absolute', bottom: '100%', left: 0, width: '100%', background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: '0.5rem', maxHeight: '200px', overflowY: 'auto', zIndex: 10, marginBottom: '0.5rem' }}>
                      {perfiles.filter(p => p.nombre.toLowerCase().includes(mentionState.query.toLowerCase())).map((p, idx) => (
                        <div key={p.id} onClick={() => insertMention(p.nombre)} style={{ padding: '0.5rem 1rem', cursor: 'pointer', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '0.5rem', background: idx === 0 ? 'var(--color-bg-surface)' : 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.background = 'var(--color-bg-surface)'} onMouseLeave={(e) => { if(idx !== 0) e.currentTarget.style.background = 'transparent'; }}>
                          <span style={{ fontSize: '0.875rem' }}>{p.nombre}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <input
                    ref={inputRef}
                    type="text"
                    value={newMessage}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder={activeChat === 'global' ? "Mensaje global... (@ para mencionar)" : `Mensaje privado a ${getChatName()}...`}
                    style={{ flex: 1, padding: '0.75rem 1rem', borderRadius: 'var(--radius-full)', border: '1px solid var(--color-border)', background: 'var(--color-bg-elevated)', color: 'var(--color-text-primary)', outline: 'none', fontSize: '0.875rem' }}
                    disabled={isUploading}
                  />
                  {(!newMessage.trim() && !selectedFile) ? (
                    <button type="button" onClick={startRecording} className="btn btn-ghost" style={{ padding: '0.5rem', borderRadius: '50%' }} disabled={isUploading}><Mic size={20} /></button>
                  ) : (
                    <button type="submit" className="btn btn-primary" style={{ borderRadius: '50%', width: '42px', height: '42px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} disabled={isUploading}>
                      {isUploading ? <LoadingSpinner size="sm" color="white" /> : <Send size={18} />}
                    </button>
                  )}
                </>
              )}
            </form>
          </div>
        </div>
      </div>
    </>
  );
}

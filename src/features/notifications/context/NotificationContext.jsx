import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../shared/config/supabaseClient';
import { useAuth } from '../../auth/context/AuthContext';

const NotificationContext = createContext(null);

// Filas de `notifications` con la forma que ya pinta el Header (mensaje, cliente_id, creado_en).
const toNotificacion = (row) => ({
  id: row.id,
  mensaje: row.body ? `${row.title} — ${row.body}` : row.title,
  cliente_id: row.recipient_client_id || row.data?.client_id || null,
  creado_en: row.created_at,
});

export const NotificationProvider = ({ children }) => {
  const { userId } = useAuth();
  const [notificaciones, setNotificaciones] = useState([]);
  const [showNotifMenu, setShowNotifMenu] = useState(false);

  // Fetch initial notifications (solo con sesión: RLS no deja leerlas antes del login)
  useEffect(() => {
    if (!userId) {
      setNotificaciones([]);
      return;
    }
    const fetchNotifs = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('id, title, body, data, recipient_client_id, created_at')
        .is('read_at', null)
        .is('recipient_client_id', null)
        .order('created_at', { ascending: false })
        .limit(20);
      if (data) setNotificaciones(data.map(toNotificacion));
    };
    fetchNotifs();

    // Subscribe to new notifications in real-time
    const channel = supabase
      .channel('global_notifs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
        if (payload.new.recipient_client_id) return;
        setNotificaciones(prev => [toNotificacion(payload.new), ...prev]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const markNotifAsRead = useCallback(async (id) => {
    // 1. Remove from UI
    setNotificaciones(prev => prev.filter(n => n.id !== id));
    // 2. Mark in DB
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
    // 3. Close menu
    setShowNotifMenu(false);
  }, []);

  const toggleNotifMenu = useCallback(() => {
    setShowNotifMenu(prev => !prev);
  }, []);

  const closeNotifMenu = useCallback(() => {
    setShowNotifMenu(false);
  }, []);

  const value = {
    notificaciones,
    showNotifMenu,
    markNotifAsRead,
    toggleNotifMenu,
    closeNotifMenu,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export default NotificationContext;

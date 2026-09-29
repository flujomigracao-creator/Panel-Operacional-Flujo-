import { useState, useEffect, useCallback } from 'react';

/**
 * useNavigation — Maneja navegación SPA basada en hash.
 * Lee el hash inicial, sincroniza cambios de state → hash y
 * escucha back/forward del navegador.
 * @param {boolean} isReady  Si es false no sincroniza (p.ej. si no hay sesión).
 */
export const useNavigation = (isReady = true) => {
    const [currentView, setCurrentView] = useState(() => {
        const hash = window.location.hash;
        if (hash.startsWith('#client/')) return 'client';
        if (hash === '#hoy') return 'today';
        if (hash === '#laboratorio') return 'lab';
        if (hash === '#finanzas') return 'finance';
        if (hash === '#clients') return 'clients';
        if (hash.startsWith('#comercial')) return 'comercial';
        if (hash === '#dashboard') return 'dashboard';
        if (hash === '#leads') return 'leads';
        if (hash === '#funis') return 'funil';
        if (hash.startsWith('#chats')) return 'chats';
        if (hash === '#team-chat') return 'team-chat';
        if (hash === '#team-management') return 'team-management';
        if (hash === '#settings') return 'settings';
        if (hash === '#directory') return 'directory';
        
        const saved = localStorage.getItem('app_currentView');
        if (saved) return saved;
        return 'lab'; // Default view
    });

    // Lead de Comercial abierto (kommo_lead_id), para poder llegar directo desde Hoy: #comercial/<id>.
    const [comercialLeadId, setComercialLeadId] = useState(() => {
        const m = window.location.hash.match(/^#comercial\/(\d+)/);
        return m ? Number(m[1]) : null;
    });

    // Conversación abierta al llegar a Chats (client id), p. ej. desde el panel de un lead: #chats/<clientId>.
    const [chatClientId, setChatClientId] = useState(() => {
        const m = window.location.hash.match(/^#chats\/([\w-]+)/);
        return m ? m[1] : null;
    });

    const [selectedClientId, setSelectedClientId] = useState(() => {
        const hash = window.location.hash;
        // Los ids de clients son UUID: se manejan como texto.
        if (hash.startsWith('#client/')) {
            const idStr = hash.replace('#client/', '');
            return idStr || null;
        }
        return localStorage.getItem('app_selectedClientId') || null;
    });

    // Sync state → URL hash & localStorage
    useEffect(() => {
        if (!isReady) return;
        localStorage.setItem('app_currentView', currentView);
        if (selectedClientId) {
            localStorage.setItem('app_selectedClientId', selectedClientId);
        } else {
            localStorage.removeItem('app_selectedClientId');
        }

        if (currentView === 'client' && selectedClientId) {
            window.location.hash = `client/${selectedClientId}`;
        } else if (currentView === 'today') {
            window.location.hash = 'hoy';
        } else if (currentView === 'lab') {
            window.location.hash = 'laboratorio';
        } else if (currentView === 'finance') {
            window.location.hash = 'finanzas';
        } else if (currentView === 'clients') {
            window.location.hash = 'clients';
        } else if (currentView === 'comercial') {
            window.location.hash = comercialLeadId ? `comercial/${comercialLeadId}` : 'comercial';
        } else if (currentView === 'dashboard') {
            window.location.hash = 'dashboard';
        } else if (currentView === 'leads') {
            window.location.hash = 'leads';
        } else if (currentView === 'funil') {
            window.location.hash = 'funis';
        } else if (currentView === 'chats') {
            window.location.hash = chatClientId ? `chats/${chatClientId}` : 'chats';
        } else if (currentView === 'team-chat') {
            window.location.hash = 'team-chat';
        } else if (currentView === 'team-management') {
            window.location.hash = 'team-management';
        } else if (currentView === 'settings') {
            window.location.hash = 'settings';
        } else if (currentView === 'directory') {
            window.location.hash = 'directory';
        } else {
            window.location.hash = 'laboratorio';
        }
    }, [currentView, selectedClientId, comercialLeadId, chatClientId, isReady]);

    // Listen to browser Back/Forward buttons and manual hash changes
    useEffect(() => {
        const handleHashChange = () => {
            if (!isReady) return;
            const hash = window.location.hash;
            if (hash.startsWith('#client/')) {
                setCurrentView('client');
                const idStr = hash.replace('#client/', '');
                setSelectedClientId(idStr || null);
            } else if (hash === '#hoy') {
                setCurrentView('today');
                setSelectedClientId(null);
            } else if (hash === '#laboratorio') {
                setCurrentView('lab');
                setSelectedClientId(null);
            } else if (hash === '#finanzas') {
                setCurrentView('finance');
                setSelectedClientId(null);
            } else if (hash === '#clients') {
                setCurrentView('clients');
                setSelectedClientId(null);
            } else if (hash.startsWith('#comercial')) {
                const m = hash.match(/^#comercial\/(\d+)/);
                setCurrentView('comercial');
                setComercialLeadId(m ? Number(m[1]) : null);
                setSelectedClientId(null);
            } else if (hash === '#dashboard') {
                setCurrentView('dashboard');
                setSelectedClientId(null);
            } else if (hash === '#leads') {
                setCurrentView('leads');
                setSelectedClientId(null);
            } else if (hash === '#funis') {
                setCurrentView('funil');
                setSelectedClientId(null);
            } else if (hash.startsWith('#chats')) {
                const m = hash.match(/^#chats\/([\w-]+)/);
                setCurrentView('chats');
                setChatClientId(m ? m[1] : null);
                setSelectedClientId(null);
            } else if (hash === '#team-chat') {
                setCurrentView('team-chat');
                setSelectedClientId(null);
            } else if (hash === '#team-management') {
                setCurrentView('team-management');
                setSelectedClientId(null);
            } else if (hash === '#settings') {
                setCurrentView('settings');
                setSelectedClientId(null);
            } else if (hash === '#directory') {
                setCurrentView('directory');
                setSelectedClientId(null);
            } else {
                setCurrentView('lab');
                setSelectedClientId(null);
            }
        };
        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, [isReady]);

    const navigateToClient = useCallback((clientId) => {
        setSelectedClientId(clientId);
        setCurrentView('client');
    }, []);

    const navigateToHome = useCallback(() => {
        setSelectedClientId(null);
        setCurrentView('lab');
    }, []);

    const navigateToLab = useCallback(() => {
        setSelectedClientId(null);
        setCurrentView('lab');
    }, []);

    const navigateToFinance = useCallback(() => {
        setSelectedClientId(null);
        setCurrentView('finance');
    }, []);

    const navigateToToday = useCallback(() => {
        setSelectedClientId(null);
        setCurrentView('today');
    }, []);

    const navigateToDashboard = useCallback(() => {
        setSelectedClientId(null);
        setCurrentView('dashboard');
    }, []);

    const navigateToClientsList = useCallback(() => {
        setSelectedClientId(null);
        setCurrentView('clients');
    }, []);

    // leadId (opcional) abre ese lead al llegar; null lo cierra.
    const navigateToComercial = useCallback((leadId = null) => {
        setSelectedClientId(null);
        setComercialLeadId(typeof leadId === 'number' || typeof leadId === 'string' ? Number(leadId) || null : null);
        setCurrentView('comercial');
    }, []);

    const navigateToLeads = useCallback(() => {
        setSelectedClientId(null);
        setCurrentView('leads');
    }, []);

    const navigateToFunil = useCallback(() => {
        setSelectedClientId(null);
        setCurrentView('funil');
    }, []);

    // clientId (opcional) abre esa conversación al llegar.
    const navigateToChats = useCallback((clientId = null) => {
        setSelectedClientId(null);
        setChatClientId(typeof clientId === 'string' ? clientId : null);
        setCurrentView('chats');
    }, []);

    const navigateToTeamChat = useCallback(() => {
        setSelectedClientId(null);
        setCurrentView('team-chat');
    }, []);

    const navigateToTeamManagement = useCallback(() => {
        setSelectedClientId(null);
        setCurrentView('team-management');
    }, []);

    const navigateToSettings = useCallback(() => {
        setSelectedClientId(null);
        setCurrentView('settings');
    }, []);

    const navigateToDirectory = useCallback(() => {
        setSelectedClientId(null);
        setCurrentView('directory');
    }, []);

    return {
        currentView,
        selectedClientId,
        comercialLeadId,
        chatClientId,
        navigateToLeads,
        navigateToFunil,
        navigateToChats,
        navigateToClient,
        navigateToHome,
        navigateToToday,
        navigateToLab,
        navigateToFinance,
        navigateToDashboard,
        navigateToClientsList,
        navigateToComercial,
        navigateToTeamChat,
        navigateToTeamManagement,
        navigateToSettings,
        navigateToDirectory,
    };
};
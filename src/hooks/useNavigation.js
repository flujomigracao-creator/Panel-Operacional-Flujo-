import { useState, useEffect, useCallback } from 'react';

/**
 * useNavigation — Maneja navegación SPA basada en hash.
 * Lee el hash inicial, sincroniza cambios de state → hash y
 * escucha back/forward del navegador.
 * @param {boolean} isReady  Si es false no sincroniza (p.ej. si no hay sesión).
 */
// Vistas sin parámetros: hash ↔ vista.
const SIMPLE_VIEWS = {
    inicio: 'home',
    tramites: 'tramites',
    documentos: 'documentos',
    configuracion: 'configuracion',
    equipo: 'equipo',
    publicaciones: 'publicaciones',
    comentarios: 'comentarios',
};
const HASH_OF_VIEW = Object.fromEntries(Object.entries(SIMPLE_VIEWS).map(([h, v]) => [v, h]));

export const useNavigation = (isReady = true) => {
    const [currentView, setCurrentView] = useState(() => {
        const hash = window.location.hash;
        if (hash.startsWith('#client/')) return 'client';
        if (SIMPLE_VIEWS[hash.slice(1)]) return SIMPLE_VIEWS[hash.slice(1)];
        if (hash === '#hoy') return 'today';
        if (hash === '#inteligencia') return 'intelligence';
        if (hash === '#laboratorio') return 'lab';
        if (hash === '#finanzas') return 'finance';
        if (hash === '#clients') return 'clients';
        if (hash.startsWith('#comercial')) return 'comercial';
        if (hash === '#dashboard') return 'dashboard';
        if (hash === '#leads') return 'leads';
        if (hash.startsWith('#chats')) return 'chats';
        if (hash.startsWith('#tramite/')) return 'tramite';
        if (hash === '#team-chat') return 'team-chat';
        if (hash === '#team-management') return 'team-management';
        if (hash === '#settings') return 'settings';
        if (hash === '#directory') return 'directory';
        
        const saved = localStorage.getItem('app_currentView');
        if (saved) return saved;
        return 'home'; // Default view
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

    // Trámite abierto (client_services.id): #tramite/<id>.
    const [tramiteId, setTramiteId] = useState(() => {
        const m = window.location.hash.match(/^#tramite\/([\w-]+)/);
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
        } else if (HASH_OF_VIEW[currentView]) {
            window.location.hash = HASH_OF_VIEW[currentView];
        } else if (currentView === 'today') {
            window.location.hash = 'hoy';
        } else if (currentView === 'intelligence') {
            window.location.hash = 'inteligencia';
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
        } else if (currentView === 'tramite' && tramiteId) {
            window.location.hash = `tramite/${tramiteId}`;
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
            window.location.hash = 'inicio';
        }
    }, [currentView, selectedClientId, comercialLeadId, chatClientId, tramiteId, isReady]);

    // Listen to browser Back/Forward buttons and manual hash changes
    useEffect(() => {
        const handleHashChange = () => {
            if (!isReady) return;
            const hash = window.location.hash;
            if (hash.startsWith('#client/')) {
                setCurrentView('client');
                const idStr = hash.replace('#client/', '');
                setSelectedClientId(idStr || null);
            } else if (SIMPLE_VIEWS[hash.slice(1)]) {
                setCurrentView(SIMPLE_VIEWS[hash.slice(1)]);
                setSelectedClientId(null);
            } else if (hash === '#hoy') {
                setCurrentView('today');
                setSelectedClientId(null);
            } else if (hash === '#inteligencia') {
                setCurrentView('intelligence');
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
            } else if (hash.startsWith('#tramite/')) {
                setCurrentView('tramite');
                setTramiteId(hash.replace('#tramite/', '') || null);
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
                setCurrentView('home');
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
        setCurrentView('home');
    }, []);

    // Navegación genérica para las vistas sin parámetros (Inicio, Trámites, Documentos…).
    const navigateTo = useCallback((view) => {
        setSelectedClientId(null);
        setCurrentView(view);
    }, []);

    const navigateToIntelligence = useCallback(() => {
        setSelectedClientId(null);
        setCurrentView('intelligence');
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

    // clientId (opcional) abre esa conversación al llegar.
    const navigateToChats = useCallback((clientId = null) => {
        setSelectedClientId(null);
        setChatClientId(typeof clientId === 'string' ? clientId : null);
        setCurrentView('chats');
    }, []);

    const navigateToTramite = useCallback((id) => {
        setSelectedClientId(null);
        setTramiteId(id);
        setCurrentView('tramite');
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
        tramiteId,
        navigateToTramite,
        navigateToLeads,
        navigateToChats,
        navigateToClient,
        navigateToHome,
        navigateTo,
        navigateToIntelligence,
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
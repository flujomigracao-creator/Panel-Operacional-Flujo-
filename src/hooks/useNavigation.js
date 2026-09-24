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
        if (hash === '#clients') return 'clients';
        if (hash === '#dashboard') return 'dashboard';
        if (hash === '#team-chat') return 'team-chat';
        if (hash === '#team-management') return 'team-management';
        if (hash === '#settings') return 'settings';
        if (hash === '#directory') return 'directory';
        
        const saved = localStorage.getItem('app_currentView');
        if (saved) return saved;
        return 'today'; // Default view
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
        } else if (currentView === 'clients') {
            window.location.hash = 'clients';
        } else if (currentView === 'dashboard') {
            window.location.hash = 'dashboard';
        } else if (currentView === 'team-chat') {
            window.location.hash = 'team-chat';
        } else if (currentView === 'team-management') {
            window.location.hash = 'team-management';
        } else if (currentView === 'settings') {
            window.location.hash = 'settings';
        } else if (currentView === 'directory') {
            window.location.hash = 'directory';
        } else {
            window.location.hash = 'hoy';
        }
    }, [currentView, selectedClientId, isReady]);

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
            } else if (hash === '#clients') {
                setCurrentView('clients');
                setSelectedClientId(null);
            } else if (hash === '#dashboard') {
                setCurrentView('dashboard');
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
                setCurrentView('today');
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
        setCurrentView('today');
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
        navigateToClient,
        navigateToHome,
        navigateToToday,
        navigateToDashboard,
        navigateToClientsList,
        navigateToTeamChat,
        navigateToTeamManagement,
        navigateToSettings,
        navigateToDirectory,
    };
};
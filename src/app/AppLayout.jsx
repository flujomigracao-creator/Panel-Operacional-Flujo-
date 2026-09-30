import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import {
  MessageSquare,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
// DashboardView NO es lazy a propósito: es la vista con la que arranca
// prácticamente toda sesión, así que separarla en su propio chunk solo
// suma una descarga extra (y su spinner de Suspense) antes de mostrar algo
// útil. Las demás vistas sí valen la pena como lazy porque una sesión
// puede no visitarlas nunca.
import DashboardView from '../components/dashboard/DashboardView';
// Hoy es la vista de inicio: tampoco es lazy por la misma razón.
import TodayView from '@features/today/components/TodayView';
// Laboratorio: centro de control de la operación automática (vista de inicio).
import LabView from '@features/lab/components/LabView';
// Finanzas: no es lazy porque el objetivo es que el usuario la revise a diario.
import FinanceView from '@features/finance/components/FinanceView';
// Inicio del CRM (centro de operaciones): es la vista con la que arranca la sesión.
import HomeView from '@features/crm/components/HomeView';

// Vistas que todavía leen el esquema anterior (clientes, entradas, perfiles…).
// Se reactivan una por una a medida que se migran al modelo de FLUJO
// (clients, client_services, documents, messages, tasks).
export const MIGRATED_VIEWS = new Set(['home', 'lab', 'today', 'clients', 'client', 'finance', 'comercial', 'leads', 'chats', 'tramites', 'documentos', 'configuracion', 'equipo', 'tramite', 'intelligence']);

// Navigation
import Sidebar from '../navigation/components/Sidebar';
import Header from '../navigation/components/Header';
import { useNavigation } from '../hooks/useNavigation';
import { useSearch } from '../hooks/useSearch';
import useRecentClients from '../hooks/useRecentClients';
import { supabase } from '../supabaseClient';
import { syncKommoOutbox } from '@features/crm/services/crmService';

// Auth
import { useAuth } from '../features/auth/context/AuthContext';
import LoginForm from '../features/auth/components/LoginForm';
import SetPasswordForm from '../features/auth/components/SetPasswordForm';
import { LoadingSpinner } from '../shared/components/ui/LoadingSpinner';

// AI Chat
import { AssistantProvider } from '@features/assistant/context/AssistantContext';
import AssistantChat from '@features/assistant/components/AssistantChat';
import { GlobalBotListener } from '../components/GlobalBotListener';
import { GlobalAgendamientoListener } from '../components/GlobalAgendamientoListener';
import { GlobalDocumentoUnicoListener } from '../components/GlobalDocumentoUnicoListener';
import AvisoConexiones from '@features/comercial/components/AvisoConexiones';

// Views

const ContactView = lazy(() => import('@features/crm/components/ContactView'));
const IntelligenceCenterView = lazy(() => import('@features/assistant/components/IntelligenceCenterView'));
const ClientsView = lazy(() => import('@features/clients/components/ClientsView'));
const LeadsView = lazy(() => import('@features/crm/components/LeadsView'));
const ChatsView = lazy(() => import('@features/crm/components/ChatsView'));
const TramitesView = lazy(() => import('@features/crm/components/TramitesView'));
const TramiteView = lazy(() => import('@features/crm/components/TramiteView'));
const DocumentosView = lazy(() => import('@features/crm/components/DocumentosView'));
const ConfigView = lazy(() => import('@features/crm/components/ConfigView'));
const TeamView = lazy(() => import('@features/crm/components/TeamView'));
const ComercialView = lazy(() => import('@features/comercial/components/ComercialView'));
const NewClientWizard = lazy(() => import('../components/newClientWizard/NewClientWizard'));
const TeamChat = lazy(() => import('../components/TeamChat'));
const TeamManagement = lazy(() => import('../components/TeamManagement'));
const SettingsView = lazy(() => import('../components/SettingsView'));
const DirectoryView = lazy(() => import('../components/directory/DirectoryView'));


import '../App.css';

/**
 * AppLayout — Layout principal de la aplicación autenticada.
 * Orquesta: Sidebar + Header + Main Content + Global Chat Slider.
 * Toda la lógica de estado fue delegada a contexts y hooks.
 */
export default function AppLayout() {
  const { loading, userProfile, isAuthenticated, authError } = useAuth();

  // --- Navigation ---
  const {
    currentView,
    selectedClientId,
    comercialLeadId,
    chatClientId,
    tramiteId,
    navigateToTramite,
    navigateToChats,
    navigateToClient,
    navigateToHome,
    navigateTo,
    navigateToIntelligence,
    navigateToToday,
    navigateToClientsList,
    navigateToComercial,
  } = useNavigation(isAuthenticated);
  const isReady = (view) => MIGRATED_VIEWS.has(view);

  // --- Recent clients (accesos rápidos al enfocar la búsqueda vacía) ---
  const { recentClients, addRecentClient } = useRecentClients();
  const navigateToClientTracked = useCallback((clientId, clientName) => {
    navigateToClient(clientId);
    if (clientName) {
      addRecentClient({ id: clientId, nombre: clientName });
    } else {
      supabase.from('clients').select('id, full_name').eq('id', clientId).maybeSingle()
        .then(({ data }) => { if (data?.full_name) addRecentClient({ id: data.id, nombre: data.full_name }); });
    }
  }, [navigateToClient, addRecentClient]);

  // Navegación del menú: las vistas con parámetros se abren "limpias" (sin lead/conversación elegidos).
  const navigate = useCallback((view) => {
    if (view === 'clients') navigateToClientsList();
    else if (view === 'chats') navigateToChats();
    else if (view === 'comercial') navigateToComercial();
    else navigateTo(view);
  }, [navigateTo, navigateToClientsList, navigateToChats, navigateToComercial]);

  // Abre el chat de un lead o de un contacto. Sin contacto todavía, se busca por el contacto de Kommo (k<id>).
  const openChat = useCallback((target) => {
    if (target && typeof target === 'object') {
      navigateToChats(target.client_id || (target.external_contact_id ? `k${target.external_contact_id}` : null));
    } else {
      navigateToChats(target || null);
    }
  }, [navigateToChats]);

  // Cambios de etapa de trámites hechos por automatizaciones (n8n, pagos): mientras el panel está
  // abierto se envían a Kommo cada minuto. Los del propio panel se envían al momento.
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const tick = () => { if (document.visibilityState === 'visible') syncKommoOutbox().catch(() => {}); };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [isAuthenticated]);

  // --- Sidebar ---
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isGlobalTeamChatOpen, setIsGlobalTeamChatOpen] = useState(false);

  // Automatically close sidebar on client view
  // La barra lateral es angosta (estilo Kommo): queda visible también en la ficha del contacto.
  useEffect(() => {
    setIsSidebarOpen(true);
  }, [currentView]);

  // --- Search ---
  // Only 'dashboard' and 'clients' filter in place; every other view
  // needs to jump to the client list so the search actually shows results.
  const onSearchStart = useCallback(() => {
    if (currentView !== 'dashboard' && currentView !== 'clients' && currentView !== 'leads') {
      navigateToClientsList();
    }
  }, [currentView, navigateToClientsList]);

  const { globalSearch, setGlobalSearch, handleSearchChange } = useSearch(onSearchStart);

  // --- New Client Modal ---
  const [isNewClientModalOpen, setIsNewClientModalOpen] = useState(false);

  // --- Invitación / recuperación de contraseña ---
  // El link de invite-team-member (o un futuro "olvidé mi contraseña") deja
  // a Supabase Auth con una sesión válida pero sin contraseña puesta —
  // detectamos el ?type=invite/recovery del hash antes de que se limpie.
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(() => {
    const hash = window.location.hash;
    return hash.includes('type=invite') || hash.includes('type=recovery');
  });

  // --- Loading State ---
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: 'var(--color-text-primary)' }}>
        <LoadingSpinner size="lg" />
      </div>
    );
  }


  // --- Not Authenticated ---
  // Herramienta interna de una sola empresa: no hay landing pública ni
  // alta de cuenta autoservicio, solo login (las cuentas las crea un
  // admin desde Equipo).
  if (!isAuthenticated) {
    return <LoginForm initialError={authError} />;
  }

  if (needsPasswordSetup) {
    return <SetPasswordForm onDone={() => setNeedsPasswordSetup(false)} />;
  }

  // --- Main Layout ---
  return (
    <AssistantProvider currentView={currentView} clientId={selectedClientId}>
      <div className="app-layout" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>

        {/* Sidebar */}
        <Sidebar
          currentView={currentView}
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
          onNavigate={navigate}
        />

        {/* Main Content Area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'transparent', overflow: 'hidden' }}>

          {/* Header */}
          <Header
            currentView={currentView}
            isSidebarOpen={isSidebarOpen}
            setIsSidebarOpen={setIsSidebarOpen}
            navigateToHome={navigateToHome}
            navigateToSettings={() => navigateTo('configuracion')}
            globalSearch={globalSearch}
            handleSearchChange={handleSearchChange}
            onClearSearch={() => setGlobalSearch('')}
            onNavigateToClient={navigateToClientTracked}
            recentClients={recentClients}
            onNewClient={isReady('new-client') ? () => setIsNewClientModalOpen(true) : undefined}
          />

          <AvisoConexiones onVerComercial={isReady('comercial') ? () => navigateToComercial() : undefined} />

          {/* Main Content */}
          <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: currentView === 'client' ? 'hidden' : 'auto' }}>
            <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><LoadingSpinner size="lg" /></div>}>

              {(currentView === 'home' || !isReady(currentView)) && (
                <HomeView onNavigate={navigate} onOpenChat={openChat} onNavigateToClient={navigateToClientTracked} onOpenTramite={navigateToTramite} />
              )}
              {currentView === 'lab' && (
                <LabView onNavigateToClient={isReady('client') ? navigateToClientTracked : undefined} onOpenToday={navigateToToday} />
              )}
              {currentView === 'intelligence' && isReady('intelligence') && (
                <IntelligenceCenterView />
              )}
              {currentView === 'today' && (
                <TodayView onNavigateToClient={isReady('client') ? navigateToClientTracked : undefined} onOpenLead={navigateToComercial} />
              )}
              {currentView === 'finance' && isReady('finance') && <FinanceView />}
              {currentView === 'dashboard' && isReady('dashboard') && <DashboardView navigateToClientsList={navigateToClientsList} />}
              {currentView === 'client' && isReady('client') && <ContactView key={selectedClientId} clientId={selectedClientId} onBack={navigateToClientsList} onNavigateToClient={navigateToClientTracked} onOpenChat={openChat} onOpenTramite={navigateToTramite} />}
              {currentView === 'clients' && isReady('clients') && <ClientsView searchQuery={globalSearch} onNavigateToClient={navigateToClientTracked} />}
              {currentView === 'leads' && <LeadsView searchQuery={globalSearch} onNavigateToClient={navigateToClientTracked} onOpenChat={openChat} />}
              {currentView === 'chats' && <ChatsView key={chatClientId || 'chats'} initialClientId={chatClientId} onNavigateToClient={navigateToClientTracked} onOpenTramite={navigateToTramite} />}
              {currentView === 'tramites' && <TramitesView onOpenTramite={navigateToTramite} />}
              {currentView === 'tramite' && <TramiteView key={tramiteId} tramiteId={tramiteId} onBack={() => navigate('tramites')} onNavigateToClient={navigateToClientTracked} onOpenChat={openChat} />}
              {currentView === 'documentos' && <DocumentosView onNavigateToClient={navigateToClientTracked} />}
              {currentView === 'configuracion' && <ConfigView />}
              {currentView === 'equipo' && <TeamView />}
              {currentView === 'comercial' && isReady('comercial') && <ComercialView leadAbiertoKommoId={comercialLeadId} onAbrirLead={navigateToComercial} />}
              {currentView === 'team-chat' && isReady('team-chat') && <TeamChat isFullView={true} />}
              {currentView === 'team-management' && isReady('team-management') && <TeamManagement userProfile={userProfile} />}
              {currentView === 'settings' && isReady('settings') && <SettingsView userProfile={userProfile} />}
              {currentView === 'directory' && isReady('directory') && <DirectoryView />}

            </Suspense>
          </main>
        </div>

        {/* Global Team Chat Slider (only if not in full-screen team chat view) */}
        {isReady('team-chat') && currentView !== 'team-chat' && (
          <>
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              width: isGlobalTeamChatOpen ? '380px' : '0px',
              minWidth: isGlobalTeamChatOpen ? '380px' : '0px',
              overflow: 'hidden',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              flexShrink: 0,
              position: 'relative',
              background: 'var(--color-bg-canvas)',
              borderLeft: isGlobalTeamChatOpen ? '1px solid var(--color-border)' : 'none',
              zIndex: 100
            }}>
              <div style={{ height: '100%', width: '380px' }}>
                <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><LoadingSpinner /></div>}>
                  <TeamChat isFullView={false} />
                </Suspense>
              </div>
            </div>

            {/* Toggle del Chat de Equipo */}
            <button
              onClick={() => setIsGlobalTeamChatOpen(!isGlobalTeamChatOpen)}
              style={{
                position: 'absolute',
                right: isGlobalTeamChatOpen ? '380px' : '0px',
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 101,
                width: '28px',
                height: '72px',
                borderRadius: '8px 0 0 8px',
                background: 'var(--color-primary)',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                boxShadow: '-2px 0 8px rgba(0,0,0,0.15)',
                transition: 'right 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
              title={isGlobalTeamChatOpen ? 'Ocultar chat de equipo' : 'Mostrar chat de equipo'}
            >
              <MessageSquare size={14} />
              {isGlobalTeamChatOpen ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
            </button>
          </>
        )}

        {/* New Client Wizard */}
        <Suspense fallback={null}>
          {isNewClientModalOpen && (
            <NewClientWizard
              onClose={() => setIsNewClientModalOpen(false)}
              onClientCreated={(client) => {
                setIsNewClientModalOpen(false);
                navigateToClientTracked(client.id, client.nombre);
              }}
            />
          )}
        </Suspense>

        {/* Listeners globales leen tablas del esquema anterior: se reactivan
            cuando se migren sus dominios (mensajes, agendamientos). */}
        {isReady('listeners') && (
          <>
            <GlobalBotListener />
            <GlobalAgendamientoListener />
            <GlobalDocumentoUnicoListener />
          </>
        )}
        <AssistantChat onNavigateToClient={navigateToClientTracked} />
      </div>
    </AssistantProvider>
  );
}

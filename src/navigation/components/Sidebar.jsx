import React from 'react';
import {
  MessageSquare,
  Shield,
  X,
  LogOut,
  BookOpen,
  BarChart3,
  ListTodo,
  FlaskConical,
  Landmark,
  Kanban,
  Home,
  Inbox,
  Contact,
  Target,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '../../features/auth/context/AuthContext';
import { useOrganization } from '../../context/OrganizationContext';

const orgInitials = (name) => {
  const clean = String(name || '').trim();
  if (!clean) return '··';
  const parts = clean.split(/\s+/);
  return parts.length > 1
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : clean.substring(0, 2).toUpperCase();
};

export default function Sidebar({ currentView, isSidebarOpen, setIsSidebarOpen, navigateToToday, navigateToLab, navigateToFinance, navigateToDashboard, navigateToClientsList, navigateToComercial, navigateToLeads, navigateToFunil, navigateToChats, navigateToTeamChat, navigateToTeamManagement, navigateToDirectory, isViewReady = () => true }) {
  const { userProfile, logout, isAdmin } = useAuth();
  const { organizationName, logoUrl } = useOrganization();

  return (
    <aside
      className={cn(
        'flex flex-col bg-chrome-bg transition-all duration-200 overflow-hidden',
        isSidebarOpen ? 'w-[76px] opacity-100' : 'w-0 opacity-0'
      )}
    >
      {/* Logo */}
      <div className="flex min-w-[76px] flex-col items-center gap-2 px-2 py-5">
        <div
          className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg bg-chrome-accent text-sm font-bold text-white"
          title={organizationName}
        >
          {logoUrl ? (
            <img src={logoUrl} alt={organizationName} className="h-full w-full object-contain" />
          ) : (
            orgInitials(organizationName)
          )}
        </div>
        {currentView === 'client' && (
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="inline-flex items-center justify-center rounded-md p-1 text-chrome-text hover:text-chrome-text-active"
            aria-label="Cerrar menú"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex min-w-[76px] flex-1 flex-col items-center gap-1 overflow-y-auto px-2">
        <SidebarButton icon={<Home size={18} />} label="Inicio" active={currentView === 'lab'} onClick={navigateToLab} />
        {isViewReady('leads') && <SidebarButton icon={<Target size={18} />} label="Leads" active={currentView === 'leads'} onClick={navigateToLeads} />}
        {isViewReady('clients') && <SidebarButton icon={<Contact size={18} />} label="Contactos" active={currentView === 'clients' || currentView === 'client'} onClick={navigateToClientsList} />}
        {isViewReady('chats') && <SidebarButton icon={<Inbox size={18} />} label="Chats" active={currentView === 'chats'} onClick={() => navigateToChats()} />}
        {isViewReady('funil') && <SidebarButton icon={<Kanban size={18} />} label="Funis" active={currentView === 'funil'} onClick={navigateToFunil} />}
        <SidebarButton icon={<ListTodo size={18} />} label="Tareas" active={currentView === 'today'} onClick={navigateToToday} />
        <SidebarButton icon={<Landmark size={18} />} label="Finanzas" active={currentView === 'finance'} onClick={navigateToFinance} />
        <div className="my-1 h-px w-8 bg-chrome-border" />
        {isViewReady('dashboard') && (
          <SidebarButton icon={<BarChart3 size={18} />} label="Dashboard" active={currentView === 'dashboard'} onClick={navigateToDashboard} />
        )}
        {isViewReady('comercial') && (
          <SidebarButton icon={<FlaskConical size={18} />} label="Nora" active={currentView === 'comercial'} onClick={navigateToComercial} />
        )}
        {isViewReady('team-chat') && (
          <SidebarButton icon={<MessageSquare size={18} />} label="Equipo" active={currentView === 'team-chat'} onClick={navigateToTeamChat} />
        )}
        {isViewReady('directory') && (
          <SidebarButton icon={<BookOpen size={18} />} label="Directorio" active={currentView === 'directory'} onClick={navigateToDirectory} />
        )}
        {isAdmin && isViewReady('team-management') && (
          <SidebarButton icon={<Shield size={18} />} label="Admin" active={currentView === 'team-management'} onClick={navigateToTeamManagement} />
        )}
      </nav>

      {/* User Profile Footer */}
      <div className="flex min-w-[76px] flex-col items-center gap-2 border-t border-chrome-border px-2 py-4">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full bg-chrome-bg-active text-xs font-semibold text-chrome-text-active"
          title={userProfile ? userProfile.nombre : 'Cargando...'}
        >
          {userProfile ? userProfile.nombre.substring(0, 2).toUpperCase() : 'US'}
        </div>
        <button
          onClick={logout}
          className="inline-flex items-center justify-center rounded-md p-1.5 text-chrome-text transition-colors hover:bg-chrome-bg-active hover:text-chrome-text-active"
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}

// Internal helper component for sidebar buttons — icon-only, label is a hover tooltip.
function SidebarButton({ icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'flex w-14 flex-col items-center gap-0.5 rounded-lg py-1.5 transition-colors duration-150',
        active ? 'bg-chrome-bg-active text-chrome-text-active' : 'text-chrome-text hover:bg-chrome-bg-raised hover:text-chrome-text-active'
      )}
    >
      {icon}
      <span className="text-[9px] leading-none">{label}</span>
    </button>
  );
}

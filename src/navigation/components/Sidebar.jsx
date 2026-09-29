import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Home,
  Target,
  Contact,
  MessagesSquare,
  Kanban,
  ListTodo,
  FolderKanban,
  FileText,
  Landmark,
  Bot,
  Users,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '../../features/auth/context/AuthContext';
import { useOrganization } from '../../context/OrganizationContext';
import { getUnreadConversationsCount } from '@features/crm/services/crmService';

const orgInitials = (name) => {
  const clean = String(name || '').trim();
  if (!clean) return '··';
  const parts = clean.split(/\s+/);
  return parts.length > 1
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : clean.substring(0, 2).toUpperCase();
};

// Secciones del menú. `views` marca qué vistas dejan activo el ítem (p. ej. la ficha de un contacto).
const SECTIONS = [
  [
    { view: 'home', label: 'Inicio', icon: Home },
  ],
  [
    { view: 'leads', label: 'Leads', icon: Target },
    { view: 'clients', label: 'Contactos', icon: Contact, views: ['clients', 'client'] },
    { view: 'chats', label: 'Chats', icon: MessagesSquare, badge: 'chats' },
    { view: 'funil', label: 'Funis', icon: Kanban },
    { view: 'today', label: 'Tareas', icon: ListTodo },
  ],
  [
    { view: 'tramites', label: 'Trámites', icon: FolderKanban },
    { view: 'documentos', label: 'Documentos', icon: FileText },
    { view: 'finance', label: 'Finanzas', icon: Landmark },
  ],
  [
    { view: 'comercial', label: 'Nora', icon: Bot, views: ['comercial', 'lab'] },
  ],
  [
    { view: 'equipo', label: 'Equipo', icon: Users },
    { view: 'configuracion', label: 'Configuración', icon: Settings },
  ],
];

const COLLAPSED_KEY = 'sidebar_collapsed';

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

export default function Sidebar({ currentView, isSidebarOpen, setIsSidebarOpen, onNavigate }) {
  const { userProfile, logout } = useAuth();
  const { organizationName, logoUrl } = useOrganization();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const unread = useQuery({ queryKey: ['crm', 'unread_count'], queryFn: getUnreadConversationsCount, refetchInterval: 30_000 });
  const badges = { chats: unread.data || 0 };

  const toggle = () => {
    setCollapsed((c) => {
      try { localStorage.setItem(COLLAPSED_KEY, c ? '0' : '1'); } catch { /* sin storage */ }
      return !c;
    });
  };

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col overflow-hidden border-r border-chrome-border bg-chrome-bg transition-[width] duration-200',
        !isSidebarOpen ? 'w-0 border-r-0' : collapsed ? 'w-[60px]' : 'w-[212px]'
      )}
    >
      {/* Marca */}
      <div className={cn('flex h-[52px] shrink-0 items-center gap-2.5 border-b border-chrome-border', collapsed ? 'justify-center px-2' : 'px-3.5')}>
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-brand-primary text-[11px] font-bold text-white"
          title={organizationName}
        >
          {logoUrl ? <img src={logoUrl} alt={organizationName} className="h-full w-full object-contain" /> : orgInitials(organizationName)}
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-semibold text-chrome-text-active">{organizationName}</p>
            <p className="text-[10px] uppercase tracking-wider text-brand-accent">CRM</p>
          </div>
        )}
        {currentView === 'client' && !collapsed && (
          <button onClick={() => setIsSidebarOpen(false)} className="rounded p-1 text-chrome-text hover:text-chrome-text-active" aria-label="Cerrar menú">
            <X size={15} />
          </button>
        )}
      </div>

      {/* Navegación */}
      <nav className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden px-2 py-2">
        {SECTIONS.map((items, i) => (
          <div key={i} className={cn('flex flex-col gap-px', i > 0 && 'mt-2 border-t border-chrome-border pt-2')}>
            {items.map((item) => (
              <NavItem
                key={item.view}
                item={item}
                collapsed={collapsed}
                active={(item.views || [item.view]).includes(currentView)}
                badge={item.badge ? badges[item.badge] : 0}
                onClick={() => onNavigate(item.view)}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* Usuario */}
      <div className={cn('flex shrink-0 items-center gap-2 border-t border-chrome-border py-2.5', collapsed ? 'flex-col px-2' : 'px-3')}>
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-chrome-bg-raised text-[11px] font-semibold text-chrome-text-active"
          title={userProfile?.nombre || ''}
        >
          {userProfile?.nombre ? userProfile.nombre.substring(0, 2).toUpperCase() : '··'}
        </div>
        {!collapsed && <span className="min-w-0 flex-1 truncate text-xs text-chrome-text">{userProfile?.nombre}</span>}
        <button onClick={toggle} className="rounded p-1.5 text-chrome-text hover:bg-chrome-bg-raised hover:text-chrome-text-active" title={collapsed ? 'Expandir menú' : 'Contraer menú'} aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}>
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
        <button onClick={logout} className="rounded p-1.5 text-chrome-text hover:bg-chrome-bg-raised hover:text-chrome-text-active" title="Cerrar sesión" aria-label="Cerrar sesión">
          <LogOut size={15} />
        </button>
      </div>
    </aside>
  );
}

function NavItem({ item, collapsed, active, badge, onClick }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      title={collapsed ? item.label : undefined}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex h-8 w-full items-center gap-2.5 rounded-md text-[13px] transition-colors',
        collapsed ? 'justify-center' : 'px-2.5',
        active
          ? 'bg-chrome-bg-active font-medium text-brand-primary [[data-theme=dark]_&]:text-chrome-text-active'
          : 'text-chrome-text hover:bg-chrome-bg-raised hover:text-chrome-text-active'
      )}
    >
      {active && <span className="absolute left-0 top-1.5 h-5 w-[3px] rounded-r bg-brand-primary" />}
      <Icon size={16} className="shrink-0" />
      {!collapsed && <span className="flex-1 truncate text-left">{item.label}</span>}
      {badge > 0 && (
        <span className={cn(
          'rounded-full bg-success px-1.5 text-[10px] font-semibold leading-4 text-white',
          collapsed && 'absolute right-0.5 top-0.5 px-1 text-[9px]'
        )}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

import React from 'react';
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
    { view: 'configuracion', label: 'Ajustes', icon: Settings },
  ],
];

export default function Sidebar({ currentView, isSidebarOpen, onNavigate }) {
  const { userProfile, logout } = useAuth();
  const { organizationName, logoUrl } = useOrganization();
  const unread = useQuery({ queryKey: ['crm', 'unread_count'], queryFn: getUnreadConversationsCount, refetchInterval: 30_000 });
  const badges = { chats: unread.data || 0 };

  // Barra estilo Kommo: oscura, angosta, ícono arriba y nombre abajo. Siempre del mismo color (no cambia con el tema).
  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col overflow-hidden bg-[#1b2a47] text-white transition-[width] duration-200',
        isSidebarOpen ? 'w-[76px]' : 'w-0'
      )}
    >
      <div className="flex shrink-0 flex-col items-center gap-1 pb-2 pt-3">
        <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-white/15 text-[12px] font-bold" title={organizationName}>
          {logoUrl ? <img src={logoUrl} alt={organizationName} className="h-full w-full object-contain" /> : orgInitials(organizationName)}
        </div>
      </div>

      <nav className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden">
        {SECTIONS.map((items, i) => (
          <div key={i} className={cn('flex flex-col', i > 0 && 'mt-1 border-t border-white/10 pt-1')}>
            {items.map((item) => (
              <NavItem
                key={item.view}
                item={item}
                active={(item.views || [item.view]).includes(currentView)}
                badge={item.badge ? badges[item.badge] : 0}
                onClick={() => onNavigate(item.view)}
              />
            ))}
          </div>
        ))}
      </nav>

      <div className="flex shrink-0 flex-col items-center gap-1.5 border-t border-white/10 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-[11px] font-semibold" title={userProfile?.nombre || ''}>
          {userProfile?.nombre ? userProfile.nombre.substring(0, 2).toUpperCase() : '··'}
        </div>
        <button onClick={logout} className="rounded p-1 text-white/50 hover:text-white" title="Cerrar sesión" aria-label="Cerrar sesión">
          <LogOut size={14} />
        </button>
      </div>
    </aside>
  );
}

function NavItem({ item, active, badge, onClick }) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      aria-label={item.label}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex w-full flex-col items-center gap-1 py-2 text-[10px] leading-none transition-colors',
        active ? 'bg-white/12 text-white' : 'text-white/55 hover:bg-white/5 hover:text-white'
      )}
    >
      {active && <span className="absolute left-0 top-0 h-full w-[3px] bg-[#4c8dff]" />}
      <Icon size={20} strokeWidth={1.7} />
      <span className="max-w-[70px] truncate">{item.label}</span>
      {badge > 0 && (
        <span className="absolute right-3 top-1 min-w-[16px] rounded-full bg-[#ff5a5f] px-1 text-center text-[9px] font-semibold leading-4 text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

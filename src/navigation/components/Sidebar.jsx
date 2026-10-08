import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Home,
  Sparkles,
  FolderKanban,
  Contact,
  FileText,
  ListTodo,
  MessagesSquare,
  Landmark,
  Target,
  Megaphone,
  MessageCircle,
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

// Menú de trabajo: primero la operación, después lo comercial, Nora y la configuración.
// `views` marca qué vistas dejan activo el ítem (p. ej. la ficha de un contacto o de un trámite).
const SECTIONS = [
  {
    items: [
      { view: 'home', label: 'Inicio', icon: Home },
      { view: 'intelligence', label: 'Inteligencia', icon: Sparkles },
      { view: 'tramites', label: 'Trámites', icon: FolderKanban, views: ['tramites', 'tramite'] },
      { view: 'clients', label: 'Clientes', icon: Contact, views: ['clients', 'client'] },
      { view: 'documentos', label: 'Documentos', icon: FileText },
      { view: 'today', label: 'Tareas', icon: ListTodo },
      { view: 'chats', label: 'Conversaciones', icon: MessagesSquare, badge: 'chats' },
      { view: 'finance', label: 'Finanzas', icon: Landmark },
    ],
  },
  {
    title: 'Comercial',
    items: [
      { view: 'leads', label: 'Leads', icon: Target },
      { view: 'publicaciones', label: 'Publicaciones', icon: Megaphone },
      { view: 'comentarios', label: 'Comentarios', icon: MessageCircle },
    ],
  },
  {
    items: [{ view: 'comercial', label: 'Nora', icon: Bot, views: ['comercial', 'lab'] }],
  },
  {
    items: [
      { view: 'equipo', label: 'Equipo', icon: Users },
      { view: 'configuracion', label: 'Configuración', icon: Settings },
    ],
  },
];

export default function Sidebar({ currentView, isSidebarOpen, onNavigate }) {
  const { userProfile, logout } = useAuth();
  const { organizationName, logoUrl } = useOrganization();
  const unread = useQuery({ queryKey: ['crm', 'unread_count'], queryFn: getUnreadConversationsCount, refetchInterval: 30_000 });
  const badges = { chats: unread.data || 0 };

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col overflow-hidden border-r border-chrome-border bg-chrome-bg transition-[width] duration-200',
        isSidebarOpen ? 'w-[200px]' : 'w-0 border-r-0'
      )}
    >
      <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-chrome-border px-4">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-brand-primary text-[11px] font-bold text-white" title={organizationName}>
          {logoUrl ? <img src={logoUrl} alt={organizationName} className="h-full w-full object-contain" /> : orgInitials(organizationName)}
        </div>
        <p className="min-w-0 truncate text-[13px] font-semibold text-chrome-text-active">{organizationName}</p>
      </div>

      <nav className="flex flex-1 flex-col overflow-y-auto px-2 py-2">
        {SECTIONS.map((section, i) => (
          <div key={i} className={cn('flex flex-col gap-px', i > 0 && 'mt-2 border-t border-chrome-border pt-2')}>
            {section.title && <p className="px-2.5 pb-1 text-[10px] font-medium uppercase tracking-wider text-chrome-text-muted">{section.title}</p>}
            {section.items.map((item) => (
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

      <div className="flex shrink-0 items-center gap-2 border-t border-chrome-border px-3 py-2.5">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-chrome-bg-raised text-[11px] font-semibold text-chrome-text-active">
          {userProfile?.nombre ? userProfile.nombre.substring(0, 2).toUpperCase() : '··'}
        </div>
        <span className="min-w-0 flex-1 truncate text-xs text-chrome-text">{userProfile?.nombre}</span>
        <button onClick={logout} className="rounded p-1.5 text-chrome-text hover:bg-chrome-bg-raised hover:text-chrome-text-active" title="Cerrar sesión" aria-label="Cerrar sesión">
          <LogOut size={15} />
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
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors',
        active ? 'bg-brand-primary-light font-medium text-brand-primary' : 'text-chrome-text hover:bg-chrome-bg-raised hover:text-chrome-text-active'
      )}
    >
      <Icon size={17} strokeWidth={1.8} className="shrink-0" />
      <span className="flex-1 truncate text-left">{item.label}</span>
      {badge > 0 && <span className="rounded-full bg-warning px-1.5 text-[10px] font-semibold leading-4 text-white">{badge > 99 ? '99+' : badge}</span>}
    </button>
  );
}

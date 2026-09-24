import React, { useState } from 'react';
import {
  Search,
  Bell,
  Sun,
  Moon,
  ArrowLeft,
  Settings,
  Menu,
  Plus,
  X,
  Clock,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useNotifications } from '../../features/notifications/context/NotificationContext';
import Button from '../../components/ui/Button';

export default function Header({ currentView, isSidebarOpen, setIsSidebarOpen, navigateToHome, navigateToSettings, globalSearch, handleSearchChange, onClearSearch, onNavigateToClient, recentClients = [], onNewClient }) {
  const { theme, toggleTheme } = useTheme();
  const { notificaciones, showNotifMenu, toggleNotifMenu, markNotifAsRead } = useNotifications();
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const showRecents = isSearchFocused && !globalSearch && recentClients.length > 0;

  return (
    <header className="flex h-[70px] shrink-0 items-center justify-between gap-4 bg-chrome-bg px-6" style={{ zIndex: 10 }}>
      {/* Left: Back button (when in client view) */}
      <div className="flex flex-1 items-center gap-3">
        {currentView === 'client' && !isSidebarOpen && (
          <button onClick={() => setIsSidebarOpen(true)} className="inline-flex items-center justify-center rounded-md p-2 text-chrome-text hover:text-chrome-text-active" aria-label="Abrir menú">
            <Menu size={20} />
          </button>
        )}
        {currentView === 'client' && !isSidebarOpen && (
          <button onClick={navigateToHome} title="Volver hacia atrás" aria-label="Volver hacia atrás" className="inline-flex items-center justify-center rounded-md p-2 text-chrome-text hover:text-chrome-text-active">
            <ArrowLeft size={18} />
          </button>
        )}
      </div>

      {/* Center: Search */}
      <div className="relative flex flex-1 justify-center">
        <div className="flex w-full max-w-[400px] items-center gap-2 rounded-full border border-chrome-border bg-chrome-bg-raised px-4 py-2">
          <Search size={18} className="shrink-0 text-chrome-text" />
          <input
            type="text"
            placeholder="Buscar por cliente, CPF, email..."
            value={globalSearch}
            onChange={handleSearchChange}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            className="w-full bg-transparent text-sm text-chrome-text-active outline-none placeholder:text-chrome-text"
          />
          {globalSearch && (
            <button onClick={onClearSearch} className="shrink-0 text-chrome-text hover:text-chrome-text-active" aria-label="Limpiar búsqueda">
              <X size={15} />
            </button>
          )}
        </div>

        {showRecents && (
          <div className="absolute top-full z-[100] mt-1 w-full max-w-[400px] overflow-hidden rounded-md border border-border bg-bg-surface shadow-lg">
            <div className="border-b border-border px-3 py-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
              Últimos clientes buscados
            </div>
            {recentClients.map((c) => (
              <button
                key={c.id}
                type="button"
                // onMouseDown (no onClick) para que el handler corra antes de que
                // el blur del input cierre el dropdown y se pierda el click.
                onMouseDown={(e) => {
                  e.preventDefault();
                  onNavigateToClient(c.id, c.nombre);
                  setIsSearchFocused(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary hover:bg-bg-elevated"
              >
                <Clock size={14} className="shrink-0 text-text-muted" />
                <span className="truncate">{c.nombre}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Right: Actions */}
      <div className="flex flex-1 items-center justify-end gap-2">
        <button
          onClick={toggleTheme}
          className="inline-flex items-center justify-center rounded-md p-2 text-chrome-text hover:text-chrome-text-active"
          title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        >
          {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            className="relative inline-flex items-center justify-center rounded-md p-2 text-chrome-text hover:text-chrome-text-active"
            aria-label="Notificaciones"
            onClick={toggleNotifMenu}
          >
            <Bell size={20} />
            {notificaciones.length > 0 && (
              <span className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[0.65rem] font-bold text-white">
                {notificaciones.length > 9 ? '9+' : notificaciones.length}
              </span>
            )}
          </button>

          {showNotifMenu && (
            <div className="absolute right-0 top-full z-[100] flex max-h-[400px] w-80 flex-col overflow-y-auto rounded-md border border-border bg-bg-surface shadow-lg">
              <div className="border-b border-border p-4 font-semibold text-text-primary">
                Notificaciones
              </div>
              {notificaciones.length === 0 ? (
                <div className="p-8 text-center text-sm text-text-secondary">
                  No tienes notificaciones nuevas
                </div>
              ) : (
                notificaciones.map(n => {
                  const isUrgent = n.mensaje.includes('🚨');
                  return (
                    <div
                      key={n.id}
                      className="flex cursor-pointer flex-col gap-2 border-b border-border p-4"
                      style={{
                        background: isUrgent ? 'rgba(239, 68, 68, 0.1)' : 'var(--color-bg-elevated)',
                        borderLeft: isUrgent ? '4px solid var(--color-danger)' : 'none',
                      }}
                      onClick={() => {
                        markNotifAsRead(n.id);
                        if (n.cliente_id && onNavigateToClient) {
                          onNavigateToClient(n.cliente_id);
                        }
                      }}
                    >
                      <span className={isUrgent ? 'text-sm font-semibold text-danger' : 'text-sm text-text-primary'}>{n.mensaje}</span>
                      <span className="text-xs text-text-muted">
                        {new Date(n.creado_en).toLocaleString()}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        <button
          onClick={navigateToSettings}
          className="inline-flex items-center justify-center rounded-md p-2 hover:text-chrome-text-active"
          style={{ color: currentView === 'settings' ? 'var(--chrome-accent)' : 'var(--chrome-text)' }}
          aria-label="Configuración"
        >
          <Settings size={20} />
        </button>

        {onNewClient && (
          <Button variant="primary" size="sm" onClick={onNewClient} className="ml-2">
            <Plus size={16} /> Nuevo cliente
          </Button>
        )}
      </div>
    </header>
  );
}

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from '../context/ThemeContext';
import { AuthProvider } from '../features/auth/context/AuthContext';
import { OrganizationProvider } from '../context/OrganizationContext';
import { NotificationProvider } from '../features/notifications/context/NotificationContext';
import { ErrorBoundary } from '../shared/components/ui/ErrorBoundary';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});

/**
 * AppProviders — Composición centralizada de todos los providers de la app.
 * Orden de anidamiento (de exterior a interior):
 *  1. QueryClientProvider (cache de datos)
 *  2. ThemeProvider (tema visual)
 *  3. AuthProvider (sesión + perfil)
 *  4. OrganizationProvider (config/branding de la empresa)
 *  5. NotificationProvider (notificaciones en tiempo real)
 *  6. ErrorBoundary (captura de errores global)
 */
export default function AppProviders({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <OrganizationProvider>
            <NotificationProvider>
              <ErrorBoundary>
                {children}
                <Toaster position="top-right" />
              </ErrorBoundary>
            </NotificationProvider>
          </OrganizationProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}


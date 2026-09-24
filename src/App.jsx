/**
 * App.jsx — Punto de entrada principal de la aplicación.
 * 
 * Responsabilidad ÚNICA: componer AppProviders + AppLayout.
 * Toda la lógica fue delegada a:
 *   - AuthContext       → sesión y perfil de usuario
 *   - NotificationContext → notificaciones en tiempo real
 *   - AppLayout         → estructura visual (sidebar + header + main)
 *   - useNavigation     → routing basado en hash
 */
import AppProviders from './app/AppProviders';
import AppLayout from './app/AppLayout';

function App() {
  return (
    <AppProviders>
      <AppLayout />
    </AppProviders>
  );
}

export default App;

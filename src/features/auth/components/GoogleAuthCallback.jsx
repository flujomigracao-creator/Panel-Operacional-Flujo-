import { useEffect, useState } from 'react';
import { supabase } from '../../../shared/config/supabaseClient';

/**
 * GoogleAuthCallback — Se renderiza SOLO en el popup de autenticación de Google.
 * Estrategia: parsear manualmente el hash de la URL porque Supabase puede
 * ignorar los tokens de Google cuando ya existe una sesión de email en localStorage.
 */
export default function GoogleAuthCallback() {
  const [status, setStatus] = useState('Procesando...');
  const [debugInfo, setDebugInfo] = useState('');
  const [isError, setIsError] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function processCallback() {
      try {
        // ── Paso 1: Loguear URL completa para diagnóstico ──
        const href = window.location.href;
        const hash = window.location.hash;
        const search = window.location.search;
        console.log('[Callback] URL:', href);
        console.log('[Callback] Hash:', hash);
        console.log('[Callback] Search:', search);
        setDebugInfo(`hash: ${hash ? 'sí' : 'no'} | search: ${search}`);

        // ── Paso 2: Intentar leer provider_token directo del hash ──
        // Supabase hosted redirige con: #access_token=...&provider_token=...
        let providerToken = null;
        let accessToken = null;
        let refreshToken = null;

        if (hash && hash.length > 1) {
          const hashParams = new URLSearchParams(hash.replace(/^#/, ''));
          providerToken = hashParams.get('provider_token');
          accessToken = hashParams.get('access_token');
          refreshToken = hashParams.get('refresh_token');
          console.log('[Callback] provider_token from hash:', !!providerToken);
          console.log('[Callback] access_token from hash:', !!accessToken);
        }

        // ── Paso 3: Si hay access_token pero no provider_token, hacer setSession ──
        if (!providerToken && accessToken && refreshToken) {
          console.log('[Callback] Trying setSession...');
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          console.log('[Callback] setSession result - provider_token:', !!data?.session?.provider_token, 'error:', error?.message);
          if (data?.session?.provider_token) {
            providerToken = data.session.provider_token;
          }
        }

        // ── Paso 4: Si hay code en la URL (PKCE), intercambiarlo ──
        const codeParam = new URLSearchParams(search).get('code');
        if (!providerToken && codeParam) {
          console.log('[Callback] PKCE code found, exchanging...');
          setStatus('Intercambiando código de autorización...');
          const { data, error } = await supabase.auth.exchangeCodeForSession(codeParam);
          console.log('[Callback] exchangeCode result - provider_token:', !!data?.session?.provider_token, 'error:', error?.message);
          if (data?.session?.provider_token) {
            providerToken = data.session.provider_token;
          }
        }

        // ── Paso 5: Esperar onAuthStateChange como último recurso ──
        if (!providerToken) {
          console.log('[Callback] Waiting for onAuthStateChange...');
          setStatus('Esperando autorización de Google...');
          providerToken = await new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(null), 10000);
            const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
              console.log('[Callback] Auth event:', event, 'provider_token:', !!session?.provider_token);
              if (session?.provider_token) {
                clearTimeout(timeout);
                subscription.unsubscribe();
                resolve(session.provider_token);
              }
            });
          });
        }

        if (cancelled) return;

        // ── Paso 6: Guardar token y cerrar ──
        if (providerToken) {
          console.log('[Callback] ✓ Token obtained! Saving and closing...');
          localStorage.setItem('google_provider_token', providerToken);
          // Restaurar sesión de email si había un backup
          const backup = localStorage.getItem('email_session_backup');
          if (backup) {
            try {
              const { access_token, refresh_token } = JSON.parse(backup);
              await supabase.auth.setSession({ access_token, refresh_token });
              localStorage.removeItem('email_session_backup');
            } catch (e) {
              console.warn('[Callback] Could not restore email session:', e);
            }
          }
          setIsSuccess(true);
          setStatus('¡Listo! Cerrando ventana...');
          setTimeout(() => { if (!cancelled) window.close(); }, 1200);
        } else {
          console.error('[Callback] No provider_token obtained after all attempts');
          setStatus('Error: No se recibió el token de Google. Puede que necesites agregar la URL de callback en Supabase → Authentication → URL Configuration.');
          setIsError(true);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[Callback] Exception:', err);
          setStatus(`Error: ${err.message}`);
          setIsError(true);
        }
      }
    }

    processCallback();
    return () => { cancelled = true; };
  }, []);

  const bgColor = isError ? '#450a0a' : isSuccess ? '#052e16' : '#0f172a';
  const iconBg = isError ? '#ef4444' : isSuccess ? '#10b981' : '#3b82f6';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100vh',
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      background: bgColor, color: '#fff', gap: 16, padding: 24,
      textAlign: 'center',
    }}>
      <div style={{
        width: 72, height: 72, borderRadius: '50%', background: iconBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {isError ? <span style={{ fontSize: 36 }}>✗</span>
          : isSuccess ? <span style={{ fontSize: 36 }}>✓</span>
          : <div style={{
              width: 36, height: 36,
              border: '4px solid rgba(255,255,255,0.3)',
              borderTop: '4px solid white', borderRadius: '50%',
              animation: 'spin 0.8s linear infinite',
            }} />}
      </div>
      <h2 style={{ margin: 0, fontSize: 20 }}>
        {isError ? 'Error de conexión' : isSuccess ? '¡Conectado con Google!' : 'Conectando...'}
      </h2>
      <p style={{ margin: 0, color: '#cbd5e1', fontSize: 13, maxWidth: 360 }}>{status}</p>
      {debugInfo && <p style={{ margin: 0, color: '#64748b', fontSize: 11 }}>{debugInfo}</p>}
      {isError && (
        <button onClick={() => window.close()} style={{
          marginTop: 8, padding: '10px 24px', borderRadius: 8,
          background: '#ef4444', color: '#fff', border: 'none',
          cursor: 'pointer', fontSize: 14, fontWeight: 600,
        }}>Cerrar ventana</button>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

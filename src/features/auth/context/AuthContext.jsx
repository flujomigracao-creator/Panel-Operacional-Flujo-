import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../../shared/config/supabaseClient';

const AuthContext = createContext(null);

const PROFILE_MISSING_MESSAGE = 'Tu perfil o tu organización ya no existen. Contacta a tu administrador.';

// Roles de organization_members (FLUJO) -> roles que ya usa el resto del panel.
const ROLE_MAP = { owner: 'admin_plus', admin: 'admin', operator: 'operador', viewer: 'lector' };

// El perfil vive en `profiles` y la pertenencia/rol en `organization_members`;
// se devuelven con la forma que el panel ya consume (nombre, rol, avatar_url).
const loadProfile = async (userId) => {
  const [{ data: profile, error: profileError }, { data: member, error: memberError }] = await Promise.all([
    supabase.from('profiles').select('id, email, full_name, avatar_url').eq('id', userId).maybeSingle(),
    supabase.from('organization_members').select('organization_id, role').eq('user_id', userId).limit(1).maybeSingle(),
  ]);
  const error = profileError || memberError;
  if (error || !profile || !member) return { data: null, error };
  return {
    data: {
      id: profile.id,
      email: profile.email,
      nombre: profile.full_name || profile.email || 'Usuario',
      avatar_url: profile.avatar_url,
      rol: ROLE_MAP[member.role] || 'lector',
      organization_id: member.organization_id,
    },
    error: null,
  };
};

export const AuthProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userProfile, setUserProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [authError, setAuthError] = useState(null);

  // Busca el perfil del usuario. Si no existe (ej. su organización fue
  // eliminada — perfiles cae en cascada pero auth.users no se toca a
  // propósito, ver migración 032), la sesión de Supabase Auth por sí sola
  // seguiría dejándolo "entrar": se cierra la sesión acá para que una
  // cuenta sin organización no pueda quedarse ni volver a loguearse.
  // authError queda seteado para que la UI muestre por qué, en vez de
  // devolver silenciosamente a la pantalla de login sin explicación.
  const fetchProfile = useCallback(async (userId) => {
    setProfileLoading(true);
    const { data, error } = await loadProfile(userId);
    if (error || !data) {
      if (error) {
        console.error('Error fetching user profile:', error);
      }
      await supabase.auth.signOut();
      setUserProfile(null);
      setAuthError(PROFILE_MISSING_MESSAGE);
      setProfileLoading(false);
      return null;
    }
    setUserProfile(data);
    setProfileLoading(false);
    return data;
  }, []);

  // Supabase re-emite sesión (mismo access_token) en más casos de los que
  // parece: sync entre pestañas vía el evento `storage`, y al recuperar
  // visibilidad de la pestaña. Cada re-emisión traía un objeto `session`
  // nuevo aunque nada hubiera cambiado, y como bastantes componentes usan
  // `session` directo como dependencia de efecto (TeamChat, ClientEmail...),
  // cada uno se re-disparaba — se sentía como que la vista entera se
  // "actualizaba sola" cada vez que volvías de otra pestaña. Ahora solo se
  // genera un objeto nuevo cuando el access_token realmente cambió.
  const lastAccessTokenRef = useRef(undefined);

  // Get initial session & subscribe to auth changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      lastAccessTokenRef.current = session?.access_token ?? null;
      setSession(session);
      // Guardar provider_token si existe desde el inicio
      if (session?.provider_token) {
        localStorage.setItem('google_provider_token', session.provider_token);
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const newToken = session?.access_token ?? null;
      if (session?.provider_token) {
        localStorage.setItem('google_provider_token', session.provider_token);
      }
      if (newToken === lastAccessTokenRef.current) {
        return; // Sesión funcionalmente igual — no propagar un objeto nuevo.
      }
      lastAccessTokenRef.current = newToken;
      setSession(session);

      if (!session) {
        setUserProfile(null);
        localStorage.removeItem('google_provider_token');
      }
    });

    // Escuchar cambios en localStorage de otras ventanas (el popup)
    const handleStorage = (e) => {
      if (e.key === 'google_provider_token' && e.newValue) {
        // El popup guardó el token — notificar a los componentes que lo necesiten
        window.dispatchEvent(new CustomEvent('google_token_ready'));
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  // Fetch user profile when session is available. Guard extra (además de la
  // deduplicación de arriba) por si algún evento futuro vuelve a colar un
  // `session` nuevo para el mismo usuario — evita repetir el fetch del perfil
  // y el parpadeo de loading que eso producía.
  const lastProfileFetchUserIdRef = useRef(null);
  useEffect(() => {
    if (session) {
      if (lastProfileFetchUserIdRef.current !== session.user.id) {
        lastProfileFetchUserIdRef.current = session.user.id;
        fetchProfile(session.user.id);
      }
    } else {
      lastProfileFetchUserIdRef.current = null;
    }
  }, [session, fetchProfile]);

  const login = useCallback(async (email, password) => {
    setAuthError(null);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const profile = await fetchProfile(data.user.id);
    if (!profile) {
      throw new Error(PROFILE_MISSING_MESSAGE);
    }
  }, [fetchProfile]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const loginWithGoogle = useCallback(async () => {
    setAuthError(null);

    // URL de callback: vuelve a la misma página con ?google_callback=true
    // main.jsx detecta este param y renderiza solo GoogleAuthCallback
    const callbackUrl = `${window.location.origin}${window.location.pathname}?google_callback=true`;

    const options = {
      scopes: 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send',
      redirectTo: callbackUrl,
      skipBrowserRedirect: true,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    };

    try {
      // Guardar sesión actual de email como backup para restaurarla en el popup
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (currentSession?.access_token) {
        localStorage.setItem('email_session_backup', JSON.stringify({
          access_token: currentSession.access_token,
          refresh_token: currentSession.refresh_token,
        }));
      }

      // Siempre usamos signInWithOAuth para asegurarnos de obtener el provider_token
      // (linkIdentity no devuelve provider_token de forma confiable)
      const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options });
      if (error) throw error;
      const authUrl = data?.url;
      if (!authUrl) throw new Error('No se obtuvo URL de autenticación de Google.');

      // Abrir popup solo cuando ya tenemos la URL real de Google
      const width = 520;
      const height = 660;
      const left = Math.round(window.screenX + (window.outerWidth - width) / 2);
      const top = Math.round(window.screenY + (window.outerHeight - height) / 2);
      window.open(authUrl, 'googleAuthPopup', `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no`);

    } catch (err) {
      console.error('[Auth] loginWithGoogle error:', err);
      localStorage.removeItem('email_session_backup');
      setAuthError(err.message);
      throw err;
    }
  }, []);

  const value = {
    session,
    loading: loading || (!!session && profileLoading),
    userProfile,
    login,
    loginWithGoogle,
    logout,
    authError,
    isAuthenticated: !!session && !!userProfile,
    isAdmin: userProfile?.rol === 'admin' || userProfile?.rol === 'admin_plus',
    userId: session?.user?.id || null,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;

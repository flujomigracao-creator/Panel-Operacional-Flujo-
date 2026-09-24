import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';

export const useSession = () => {
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    // Supabase re-emite sesión (mismo access_token) en más casos de los que
    // parece — ej. al recuperar visibilidad de la pestaña. Sin este guard,
    // cada re-emisión generaba un objeto `session` nuevo aunque nada hubiera
    // cambiado, y cualquier efecto que dependa de `session` (ver TeamChat,
    // que resuscribe sus canales realtime) se volvía a disparar — se sentía
    // como que la vista se "actualizaba sola" al volver de otra pestaña.
    const lastAccessTokenRef = useRef(undefined);

    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            lastAccessTokenRef.current = session?.access_token ?? null;
            setSession(session);
            setLoading(false);
        });

        // Subscribe to auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            const newToken = session?.access_token ?? null;
            if (newToken === lastAccessTokenRef.current) return;
            lastAccessTokenRef.current = newToken;
            setSession(session);
        });

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    return { session, loading };
};
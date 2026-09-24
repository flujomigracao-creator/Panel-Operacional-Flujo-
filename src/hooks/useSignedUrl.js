import { useState, useEffect } from 'react';
import { supabase } from '../shared/config/supabaseClient';

/**
 * Hook para obtener una Signed URL temporal de Supabase Storage.
 * @param {string} path - Ruta relativa del archivo en el bucket (ej. org_id/cliente_id/archivo.jpg)
 * @param {number} expiresIn - Segundos antes de que expire la URL (por defecto 300 = 5 mins)
 * @param {string} bucket - Bucket de Storage (por defecto 'documentos_operacionales')
 * @returns {{ signedUrl: string|null, loading: boolean, error: string|null }}
 */
export function useSignedUrl(path, expiresIn = 300, bucket = 'documentos_operacionales') {
  const [signedUrl, setSignedUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchSignedUrl() {
      if (!path) {
        setSignedUrl(null);
        return;
      }

      // Si por alguna razón la BD todavía tiene un enlace http (ej. no se migró),
      // retornamos el enlace http directo (aunque fallará si el bucket ya es privado).
      if (path.startsWith('http')) {
        setSignedUrl(path);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const { data, error: urlError } = await supabase.storage
          .from(bucket)
          .createSignedUrl(path, expiresIn);

        if (urlError) throw urlError;
        
        if (isMounted) {
          setSignedUrl(data.signedUrl);
        }
      } catch (err) {
        if (isMounted) {
          console.error('[useSignedUrl] Error fetching signed URL:', err);
          setError(err.message);
          setSignedUrl(null);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchSignedUrl();

    return () => {
      isMounted = false;
    };
  }, [path, expiresIn, bucket]);

  return { signedUrl, loading, error };
}

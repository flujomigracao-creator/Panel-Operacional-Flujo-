import React from 'react';
import { useSignedUrl } from '../hooks/useSignedUrl';

/**
 * Componente para mostrar imágenes desde el Storage privado usando Signed URLs.
 * Maneja automáticamente la obtención de la URL y los estados de carga/error.
 */
export function SignedImage({ path, alt, className, style, onError, loading = "lazy" }) {
  const { signedUrl, loading: isLoading, error } = useSignedUrl(path, 3600); // 1 hora de expiración

  if (isLoading) {
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-raised)' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>...</span>
      </div>
    );
  }

  if (error || !signedUrl) {
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-raised)' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Error</span>
      </div>
    );
  }

  return (
    <img
      src={signedUrl}
      alt={alt}
      className={className}
      style={style}
      loading={loading}
      onError={onError}
    />
  );
}

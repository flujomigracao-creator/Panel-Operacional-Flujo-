import React, { useState } from 'react';
import { supabase } from '../../../shared/config/supabaseClient';
import { BrandLogoText } from '../../../components/ui/BrandLogo';

// Se muestra cuando el usuario llega desde un link de invitación/recuperación
// de Supabase Auth (?type=invite / ?type=recovery en el hash de la URL) — ese
// link ya lo deja "logueado" con un token temporal, pero nunca le pide
// contraseña. Sin esta pantalla, entraba directo al panel sin poder volver a
// loguearse después.
export default function SetPasswordForm({ onDone }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      // Limpiar el ?type=invite/recovery del hash para no volver a mostrar
      // este formulario si se recarga la página.
      window.history.replaceState(null, '', window.location.pathname);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100vh', background: 'var(--color-bg-canvas)', paddingTop: '10vh' }}>
      <div style={{ position: 'absolute', top: 24, left: 24 }}>
        <BrandLogoText href="/" />
      </div>

      <div style={{ width: '100%', maxWidth: '360px', padding: '0 1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, textAlign: 'center', marginBottom: '0.5rem', color: 'var(--color-text-primary)', letterSpacing: '-0.025em' }}>
          Elegí tu contraseña
        </h1>
        <p style={{ fontSize: '0.875rem', textAlign: 'center', marginBottom: '2rem', color: 'var(--color-text-secondary)' }}>
          Esta va a ser tu contraseña para entrar de ahora en más.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {error && <div style={{ color: 'var(--color-error)', fontSize: '0.875rem', textAlign: 'center' }}>{error}</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-primary)' }}>Nueva contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
              style={{ padding: '0.625rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', fontSize: '0.875rem' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-primary)' }}>Repetir contraseña</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              style={{ padding: '0.625rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', fontSize: '0.875rem' }}
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={saving} style={{ marginTop: '0.5rem', padding: '0.75rem', fontWeight: 500, width: '100%', justifyContent: 'center' }}>
            {saving ? 'Guardando...' : 'Guardar y entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}

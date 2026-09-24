import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { BrandLogoText } from '../../../components/ui/BrandLogo';

export default function LoginForm({ initialError = null }) {
  const { login, loginWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialError);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100vh', background: 'var(--color-bg-canvas)', paddingTop: '10vh' }}>
      
      {/* Logo Area */}
      <div style={{ position: 'absolute', top: 24, left: 24 }}>
        <BrandLogoText href="/" />
      </div>

      <div style={{ width: '100%', maxWidth: '360px', padding: '0 1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, textAlign: 'center', marginBottom: '2rem', color: 'var(--color-text-primary)', letterSpacing: '-0.025em' }}>
          Iniciar Sesión
        </h1>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {error && <div style={{ color: 'var(--color-error)', fontSize: '0.875rem', textAlign: 'center' }}>{error}</div>}
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-primary)' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={{ padding: '0.625rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', fontSize: '0.875rem', transition: 'border-color 0.15s' }}
              onFocus={(e) => e.target.style.borderColor = 'var(--color-primary)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--color-text-primary)' }}>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{ padding: '0.625rem 0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', fontSize: '0.875rem', transition: 'border-color 0.15s' }}
              onFocus={(e) => e.target.style.borderColor = 'var(--color-primary)'}
              onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ marginTop: '0.5rem', padding: '0.75rem', fontWeight: 500, width: '100%', justifyContent: 'center' }}>
            Entrar
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', margin: '1rem 0' }}>
            <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--color-border)' }}></div>
            <span style={{ padding: '0 1rem', fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>O</span>
            <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--color-border)' }}></div>
          </div>

          <button 
            type="button" 
            onClick={async () => {
              try {
                await loginWithGoogle();
              } catch (err) {
                setError(err.message);
              }
            }}
            style={{ 
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', 
              width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-md)', 
              border: '1px solid var(--color-border)', backgroundColor: '#fff', 
              color: '#3c4043', fontWeight: 500, fontSize: '0.875rem', cursor: 'pointer',
              transition: 'background-color 0.2s, box-shadow 0.2s'
            }}
            onMouseOver={(e) => { e.currentTarget.style.backgroundColor = '#f8f9fa'; e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15)'; }}
            onMouseOut={(e) => { e.currentTarget.style.backgroundColor = '#fff'; e.currentTarget.style.boxShadow = 'none'; }}
          >
            <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ width: '18px', height: '18px' }}>
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
              <path fill="none" d="M0 0h48v48H0z"></path>
            </svg>
            Continuar con Google
          </button>
        </form>
      </div>
    </div>
  );
}

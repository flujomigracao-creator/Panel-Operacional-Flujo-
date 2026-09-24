import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import GoogleAuthCallback from './features/auth/components/GoogleAuthCallback.jsx'

// Si esta ventana es el popup de callback de Google auth, renderizamos
// solo la página de callback (no la app completa) para evitar conflictos
const IS_GOOGLE_CALLBACK = window.location.search.includes('google_callback=true');

// Cada deploy reemplaza los archivos de dist/assets con hashes nuevos y borra
// los viejos. Una pestaña que quedó abierta desde antes del deploy todavía
// referencia esos hashes viejos, y al navegar a una vista que carga su chunk
// recién en ese momento (lazy()), el import() falla con 404 — Vite emite
// 'vite:preloadError' para este caso exacto. Recargamos una sola vez (el flag
// en sessionStorage evita loop si el archivo realmente no existe más).
window.addEventListener('vite:preloadError', () => {
  if (!sessionStorage.getItem('reloaded-after-preload-error')) {
    sessionStorage.setItem('reloaded-after-preload-error', '1');
    window.location.reload();
  }
});

// Parche global para evitar errores de React con Google Translate
// Cuando Google Translate modifica el DOM (ej. con etiquetas <font>), React pierde la referencia
// y lanza NotFoundError al intentar remover el nodo original.
if (typeof Node === 'function' && Node.prototype) {
  const originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function(child) {
    if (child.parentNode !== this) {
      if (console) {
        console.warn('DOM patched: Cannot remove a child from a different parent. Likely caused by a translation extension.', child, this);
      }
      return child;
    }
    return originalRemoveChild.apply(this, arguments);
  };
  
  const originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function(newNode, referenceNode) {
    if (referenceNode && referenceNode.parentNode !== this) {
      if (console) {
        console.warn('DOM patched: Cannot insert before a reference node from a different parent.', referenceNode, this);
      }
      return newNode;
    }
    return originalInsertBefore.apply(this, arguments);
  };
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {IS_GOOGLE_CALLBACK ? <GoogleAuthCallback /> : <App />}
  </StrictMode>,
)

// Si llegamos hasta acá es que el bundle actual cargó bien — liberar el flag
// para que un preloadError de un futuro deploy también dispare su propio reload.
sessionStorage.removeItem('reloaded-after-preload-error');

import { useState, useCallback } from 'react';

const STORAGE_KEY = 'pcbr_recent_clients';
const MAX_RECENTS = 5;

const readRecents = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/**
 * useRecentClients — Recuerda los últimos clientes a los que se navegó
 * (localStorage, por navegador — no por usuario) para mostrarlos como
 * accesos rápidos al enfocar la barra de búsqueda vacía.
 */
export default function useRecentClients() {
  const [recentClients, setRecentClients] = useState(readRecents);

  const addRecentClient = useCallback((client) => {
    if (!client?.id || !client?.nombre) return;
    setRecentClients((prev) => {
      const filtered = prev.filter((c) => c.id !== client.id);
      const next = [{ id: client.id, nombre: client.nombre }, ...filtered].slice(0, MAX_RECENTS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { recentClients, addRecentClient };
}

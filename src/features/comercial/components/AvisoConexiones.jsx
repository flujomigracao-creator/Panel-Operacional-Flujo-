import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { getEstadoConexiones } from '../services/comercialService';

// Aviso en todo el panel cuando algo de lo que usa Nora está caído (Kommo, n8n, WhatsApp) o hay clientes sin respuesta.
export default function AvisoConexiones({ onVerComercial }) {
  const { data } = useQuery({
    queryKey: ['estado_conexiones'],
    queryFn: getEstadoConexiones,
    refetchInterval: 3 * 60 * 1000,
    staleTime: 60 * 1000,
  });
  if (!data || data.ok || !data.problemas?.length) return null;
  return (
    <div className="flex items-start gap-2 border-b border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-200">
      <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-400" />
      <ul className="flex-1 space-y-0.5">
        {data.problemas.map((p) => (
          <li key={p.servicio}>
            <b>{p.servicio}:</b> {p.motivo}
            {p.servicio === 'Nora' && onVerComercial && (
              <button onClick={onVerComercial} className="ml-2 underline hover:text-red-100">Ver en Comercial</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

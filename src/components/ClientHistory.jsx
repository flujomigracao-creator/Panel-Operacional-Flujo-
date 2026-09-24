import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { getHistorialCliente } from '../services/equipoService';
import { Clock, User } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner';

export default function ClientHistory({ clientId }) {
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (clientId) {
      loadHistory();

      // Suscribirse a nuevos cambios en tiempo real
      const channel = supabase
        .channel(`public:historial_clientes:cliente_id=eq.${clientId}`)
        .on(
          'postgres_changes',
          { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'historial_clientes',
            filter: `cliente_id=eq.${clientId}`
          },
          (payload) => {
            fetchUserAndAppend(payload.new);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [clientId]);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const data = await getHistorialCliente(clientId);
      setHistorial(data);
    } catch (error) {
      console.error('Error cargando historial:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUserAndAppend = async (newRow) => {
    const { data: profile } = await supabase
      .from('perfiles')
      .select('id, nombre, email, rol')
      .eq('id', newRow.usuario_id)
      .single();

    if (profile) {
      newRow.usuario = profile;
    }

    setHistorial(prev => {
      // Evitar duplicados
      if (prev.find(h => h.id === newRow.id)) return prev;
      return [newRow, ...prev]; // Los más nuevos arriba
    });
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><LoadingSpinner /></div>;

  if (historial.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--color-text-secondary)' }}>
        <Clock size={48} style={{ opacity: 0.2, margin: '0 auto 1rem auto' }} />
        <p>No hay historial de cambios registrados para este cliente.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <h3 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Clock size={18} /> Historial de Cambios
      </h3>
      
      <div style={{ position: 'relative', marginLeft: '1rem', borderLeft: '2px solid var(--color-border)' }}>
        {historial.map((item, index) => (
          <div key={item.id} style={{ position: 'relative', paddingLeft: '1.5rem', paddingBottom: index === historial.length - 1 ? '0' : '1.5rem' }}>
            <div style={{ 
              position: 'absolute', 
              left: '-7px', 
              top: '0', 
              width: '12px', 
              height: '12px', 
              borderRadius: '50%', 
              background: 'var(--color-primary)',
              border: '2px solid var(--color-bg-surface)'
            }} />
            
            <div style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 600, color: 'var(--color-text-primary)', fontSize: '0.875rem' }}>
                  {item.accion.replace(/_/g, ' ')}
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  {new Date(item.creado_en).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>
              <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                {item.descripcion}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                <User size={12} />
                <span>{item.usuario?.nombre || 'Usuario Desconocido'}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

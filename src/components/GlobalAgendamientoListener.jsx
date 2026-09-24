import React, { useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import toast from 'react-hot-toast';
import { updateEntradaEstado, updateEntradaDatosPersonalizados } from '../services/tramitesService';

export const GlobalAgendamientoListener = () => {
  const processedRef = useRef(new Set());

  useEffect(() => {
    console.log('[GlobalAgendamientoListener] Iniciando escucha de agendamentos_confirmados...');

    const channel = supabase
      .channel('agendamientos_listener')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'agendamentos_confirmados' }, async (payload) => {
        const agendamento = payload.new;
        
        if (!agendamento || !agendamento.requerimento) return;
        
        if (processedRef.current.has(agendamento.id)) return;
        processedRef.current.add(agendamento.id);

        try {
          // Buscar a qué entrada corresponde este requerimiento
          const { data: pendiente } = await supabase
            .from('agendamientos_pendientes')
            .select('entrada_id')
            .eq('requerimento', agendamento.requerimento)
            .order('creado_em', { ascending: false })
            .limit(1)
            .single();

          if (!pendiente || !pendiente.entrada_id) {
            console.warn('[GlobalAgendamientoListener] No se encontró entrada_id para el requerimiento', agendamento.requerimento);
            return;
          }

          const entrada_id = pendiente.entrada_id;
          console.log(`[GlobalAgendamientoListener] Nuevo agendamiento confirmado: req=${agendamento.requerimento}, entrada_id=${entrada_id}`);
          
          // Actualizar la entrada a 'completada'
          await updateEntradaEstado(entrada_id, 'completada');
          
          // Guardar información del protocolo en datos_personalizados
          const { data: entrada } = await supabase
            .from('entradas')
            .select('datos_personalizados')
            .eq('id', entrada_id)
            .single();
            
          const dp = entrada?.datos_personalizados || {};
          dp.protocolo = agendamento.protocolo || dp.protocolo;
          dp.sede_confirmada = agendamento.sede || dp.sede_confirmada;
          
          await updateEntradaDatosPersonalizados(entrada_id, dp);

          toast.success(`¡Agendamiento confirmado para el trámite #${entrada_id}! Sede: ${agendamento.sede}`, {
            duration: 5000,
            icon: '📅'
          });

        } catch (error) {
          console.error('[GlobalAgendamientoListener] Error procesando confirmación:', error);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return null;
};

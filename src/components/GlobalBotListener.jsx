import React, { useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { analyzeMessageUrgency, chat } from '../services/aiService';
import { getConfiguracionBot } from '../services/botService';
import { useOrganization } from '../context/OrganizationContext';

const DEFAULT_CONFIG = {
  bot_activo: false,
  horario_inicio: '09:00:00',
  horario_fin: '18:00:00',
  dias_laborales: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
  zona_horaria: 'America/Sao_Paulo',
  template_respuesta: 'Hola {nombre}, en breve el equipo de {org} se pondrá en contacto.',
  template_fuera_horario: 'Nuestro horario de atención es de {inicio} a {fin}.',
  umbral_spam: 3,
  ventana_spam_minutos: 60,
  cooldown_respuesta_segundos: 60,
  prompt_ai: '',
};

// ¿Estamos fuera del horario/días laborales configurados por el usuario?
const isOutsideWorkingHours = (config) => {
  const now = new Date();
  const zonaHoraria = config.zona_horaria || DEFAULT_CONFIG.zona_horaria;

  // 'short' weekday in 'en-US' yields exactly 'Mon'..'Sun', matching dias_laborales' format.
  const dayCode = now.toLocaleDateString('en-US', { timeZone: zonaHoraria, weekday: 'short' });
  const diasLaborales = config.dias_laborales || DEFAULT_CONFIG.dias_laborales;
  if (!diasLaborales.includes(dayCode)) return true;

  const horaActual = now.toLocaleTimeString('en-GB', { hour12: false, timeZone: zonaHoraria });
  const inicio = config.horario_inicio || DEFAULT_CONFIG.horario_inicio;
  const fin = config.horario_fin || DEFAULT_CONFIG.horario_fin;
  return horaActual < inicio || horaActual >= fin;
};

const fillTemplate = (template, values) => {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value ?? ''), template || '');
};

export const GlobalBotListener = () => {
  const { organizationName } = useOrganization();
  // Use a ref to prevent double-processing of the same message
  const processedMessageIds = useRef(new Set());
  const timeouts = useRef({});
  const lastAutoReplyTimestamp = useRef({});
  const configRef = useRef(DEFAULT_CONFIG);

  // Mantener la configuración del bot al día (se recarga si cambia de organización
  // o si el usuario la actualiza desde Configuración > WhatsApp & Bot y recarga la app).
  useEffect(() => {
    let active = true;
    getConfiguracionBot()
      .then((data) => { if (active && data) configRef.current = { ...DEFAULT_CONFIG, ...data }; })
      .catch((err) => console.error('[GlobalBotListener] Error loading configuracion_bot:', err));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    console.log('[GlobalBotListener] Iniciando escucha de mensajes entrantes...');

    const channel = supabase
      .channel('bot_listener')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes' }, (payload) => {
        const newMessage = payload.new;

        // Solo reaccionamos a mensajes entrantes
        if (!newMessage || (newMessage.remitente && newMessage.remitente !== 'incoming')) {
          return;
        }

        // Evitar procesar el mismo mensaje dos veces en un corto periodo
        if (processedMessageIds.current.has(newMessage.id)) return;
        processedMessageIds.current.add(newMessage.id);

        const cliId = newMessage.cliente_id || newMessage.telefono;
        if (!cliId) return;

        // Cancelar el timeout anterior si el cliente envía varios mensajes rápido
        if (timeouts.current[cliId]) {
          clearTimeout(timeouts.current[cliId]);
        }

        // Debounce: Esperar 2 segundos después del último mensaje para procesar
        timeouts.current[cliId] = setTimeout(async () => {
          const config = configRef.current;
          try {
            // Verificar si ya enviamos auto-respuesta recientemente (cooldown configurable)
            const cooldownMs = (config.cooldown_respuesta_segundos ?? DEFAULT_CONFIG.cooldown_respuesta_segundos) * 1000;
            const lastReply = lastAutoReplyTimestamp.current[cliId];
            if (lastReply && Date.now() - lastReply < cooldownMs) {
              return;
            }

            // 1. Analizar urgencia con IA
            let isUrgent = false;
          let summary = null;
          if (newMessage.texto) {
            const urgencyResult = await analyzeMessageUrgency(newMessage.texto);
            isUrgent = urgencyResult.isUrgent;
            summary = urgencyResult.summary;
          }

          // 2. Obtener los datos del cliente para ver si bot_activo es true
          let query = supabase.from('clientes').select('id, nombre, bot_activo, telefono, id_kommo');

          if (newMessage.cliente_id) {
            if (newMessage.cliente_id > 1000000) {
              query = query.eq('id_kommo', newMessage.cliente_id);
            } else {
              query = query.eq('id', newMessage.cliente_id);
            }
          } else if (newMessage.telefono) {
            const cleanPhone = newMessage.telefono.replace(/\D/g, '');
            query = query.ilike('telefono', `%${cleanPhone}%`);
          } else {
            return;
          }

          const { data: clientesArr, error: cliError } = await query.limit(1);
          const cliente = clientesArr && clientesArr.length > 0 ? clientesArr[0] : null;

          if (cliError || !cliente) return;

          // Consultar los últimos 15 mensajes para contar cuántos seguidos mandó el cliente y buscar el último nuestro
          const { data: historial } = await supabase
            .from('mensajes')
            .select('remitente, texto, fecha_recepcion')
            .eq('cliente_id', cliente.id)
            .order('fecha_recepcion', { ascending: false })
            .limit(15);

          let consecutiveIncoming = 0;
          let lastOutgoingTime = null;

          if (historial) {
            for (const msg of historial) {
              // Puede venir null o incoming para los mensajes del cliente
              if (msg.remitente === 'incoming' || !msg.remitente) {
                consecutiveIncoming++;
              } else {
                if (!lastOutgoingTime) {
                  lastOutgoingTime = new Date(msg.fecha_recepcion).getTime();
                }
                break; // Encontramos un mensaje nuestro, cortamos la racha
              }
            }
          }

          const offHours = isOutsideWorkingHours(config);
          const ventanaSpamMs = (config.ventana_spam_minutos ?? DEFAULT_CONFIG.ventana_spam_minutos) * 60 * 1000;
          const umbralSpam = config.umbral_spam ?? DEFAULT_CONFIG.umbral_spam;
          const isOurLastMessageOld = !lastOutgoingTime || (Date.now() - lastOutgoingTime > ventanaSpamMs);
          const isSpamming = consecutiveIncoming >= umbralSpam && isOurLastMessageOld; // Solo responde si pasó la ventana configurada desde nuestra última respuesta

          // 3. Crear notificación global (roja si es urgente)
          // SOLO mandamos alerta si es URGENTE o si cumple la regla de spam,
          // para no inundar de alertas al equipo con cada mensaje normal.
          if (isUrgent || isSpamming) {
            let notifMsg = '';
            if (isUrgent) {
              notifMsg = `🚨 [URGENTE] ${cliente.nombre || 'Cliente'}: ${summary}`;
            } else if (isSpamming) {
              notifMsg = `El cliente ${cliente.nombre} ha enviado ${umbralSpam} mensajes sin respuesta. Se generó una mega alerta en el chat de equipo.`;
            }

            if (notifMsg) {
              await supabase.from('notificaciones_equipo').insert({
                cliente_id: cliente.id,
                mensaje: notifMsg
              });
            }
          }

          // 4. Acciones automáticas (Bot o Mega Alerta)
          if (isSpamming && !cliente.bot_activo) {
            // El bot no está activo, pero el cliente hizo spam -> MEGA ALERTA AL CHAT
            console.log(`[GlobalBotListener] Mega Alerta activada para ${cliente.nombre}`);
            try {
              const recentTexts = historial
                .filter(m => m.remitente === 'incoming' || !m.remitente)
                .map(m => m.texto)
                .filter(Boolean)
                .reverse()
                .join(' | ');

              const prompt = `Eres un asistente de servicio al cliente de ${organizationName}. El cliente acaba de enviar estos mensajes cortos seguidos: "${recentTexts}".
Haz un resumen MUY BREVE de 1 o 2 oraciones de lo que el cliente quiere para alertar al equipo de soporte.`;

              const aiResponse = await chat([{ role: 'user', content: prompt }], 0.5);
              const aiSummary = (aiResponse && aiResponse.trim().length > 0) ? aiResponse : 'El cliente necesita atención inmediata.';

              const alertMessage = `@Todos 🚨 MEGA ALERTA: El cliente *${cliente.nombre || 'Desconocido'}* (+${cliente.telefono || ''}) acaba de enviar ${umbralSpam} mensajes seguidos.\n*Contexto:* ${aiSummary}`;

              const sessionResponse = await supabase.auth.getSession();
              const userId = sessionResponse.data?.session?.user?.id;

              if (userId) {
                await supabase.from('chat_equipo').insert({
                  usuario_id: userId,
                  mensaje: alertMessage
                });
                console.log('[GlobalBotListener] Mega alerta enviada al chat de equipo.');
                lastAutoReplyTimestamp.current[cliId] = Date.now();
              } else {
                console.warn('[GlobalBotListener] No se pudo enviar mega alerta porque no hay sesión activa.');
              }
            } catch (e) {
              console.error('[GlobalBotListener] Error generando mega alerta:', e);
            }
          } else if (cliente.bot_activo) {
            // El bot está encendido (Copiloto) -> AUTO RESPONDER AL CLIENTE
            let autoReplyText;

            if (offHours) {
              autoReplyText = fillTemplate(config.template_fuera_horario || DEFAULT_CONFIG.template_fuera_horario, {
                inicio: config.horario_inicio,
                fin: config.horario_fin,
              });
            } else if (config.prompt_ai) {
              try {
                const mensajesFormateados = (historial || []).slice().reverse().map(m => ({
                  role: (m.remitente === 'incoming' || !m.remitente) ? 'user' : 'assistant',
                  content: m.texto,
                })).filter(m => m.content);
                const aiReply = await chat([{ role: 'system', content: config.prompt_ai }, ...mensajesFormateados], 0.7);
                autoReplyText = (aiReply && aiReply.trim()) || fillTemplate(config.template_respuesta || DEFAULT_CONFIG.template_respuesta, { nombre: cliente.nombre, org: organizationName });
              } catch (aiErr) {
                console.error('[GlobalBotListener] Error generando respuesta con IA, uso plantilla:', aiErr);
                autoReplyText = fillTemplate(config.template_respuesta || DEFAULT_CONFIG.template_respuesta, { nombre: cliente.nombre, org: organizationName });
              }
            } else {
              autoReplyText = fillTemplate(config.template_respuesta || DEFAULT_CONFIG.template_respuesta, { nombre: cliente.nombre, org: organizationName });
            }

            console.log(`[GlobalBotListener] Auto-respuesta activada para ${cliente.nombre} (Bot ON, ${offHours ? 'fuera de horario' : 'en horario'})`);

            const { data, error } = await supabase.functions.invoke('enviar-whatsapp', {
              body: { cliente_id: cliente.id, texto: autoReplyText }
            });

            if (!error && !data?.error) {
              console.log('[GlobalBotListener] Auto-respuesta enviada con éxito.');
              lastAutoReplyTimestamp.current[cliId] = Date.now();
            } else {
              console.error('[GlobalBotListener] Error enviando auto-respuesta:', error || data?.error);
            }
          }

        } catch (err) {
          console.error('[GlobalBotListener] Error:', err);
        }
        }, 1500); // 1.5 seconds debounce
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return null; // Componente invisible
};

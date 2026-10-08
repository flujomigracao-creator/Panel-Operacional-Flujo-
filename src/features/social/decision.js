// Lógica de decisión del bot de comentarios (Facebook e Instagram). Es la MISMA que usa el workflow de n8n
// «Comentarios Meta - Moderar y Responder» (nodo «Decidir»): cualquier cambio aquí se copia allí.
// Sin React ni Supabase: se prueba con node --test.
//
// Principio: borrar a un cliente real es peor que dejar pasar un insulto. Solo se borra lo malo con confianza alta;
// lo dudoso y las quejas legítimas las atiende una persona (tarea en «Hoy»).

export const UMBRAL_BORRAR = 0.95;
export const UMBRAL_RESPONDER = 0.8;
export const CLASES = ['elogio', 'interes', 'queja_legitima', 'malo', 'neutro'];

export const WHATSAPP_LINK = 'https://wa.me/5548984553306';
export const WHATSAPP_NUMERO = '+55 48 98455-3306';

/** Normaliza la respuesta del clasificador; cualquier cosa rara se convierte en «neutro» sin confianza (no actúa). */
export function leerClasificacion(contenido) {
  let r;
  try { r = typeof contenido === 'string' ? JSON.parse(contenido) : contenido; } catch { r = null; }
  const clase = r && CLASES.includes(r.clase) ? r.clase : null;
  const confianza = r && Number.isFinite(Number(r.confianza)) ? Math.min(1, Math.max(0, Number(r.confianza))) : 0;
  if (!clase) return { clase: 'neutro', confianza: 0, motivo: 'respuesta del clasificador no válida', valida: false };
  return { clase, confianza, motivo: String((r && r.motivo) || '').slice(0, 300), valida: true };
}

/**
 * @param {{clase:string, confianza:number}} c   clasificación
 * @param {{activo?:boolean, borrar?:boolean}} cfg  interruptores del panel (por defecto activo y con borrado)
 * @param {boolean} esRespuesta  el comentario responde a otro comentario (no a la publicación)
 * @returns {{accion:'borrar'|'responder'|'tarea'|'ninguna', estado:'procesado'|'omitido', porque:string}}
 */
export function decidir(c, cfg = {}, esRespuesta = false) {
  const activo = cfg.activo !== false;
  const puedeBorrar = cfg.borrar !== false;
  if (!activo) return { accion: 'ninguna', estado: 'omitido', porque: 'bot apagado desde el panel' };
  if (c.clase === 'malo') {
    if (c.confianza >= UMBRAL_BORRAR && puedeBorrar) return { accion: 'borrar', estado: 'procesado', porque: 'malo con confianza alta' };
    return { accion: 'tarea', estado: 'procesado', porque: puedeBorrar ? 'malo con confianza insuficiente: decide una persona' : 'borrado desactivado: decide una persona' };
  }
  if (c.clase === 'queja_legitima') return { accion: 'tarea', estado: 'procesado', porque: 'queja legítima: la atiende una persona' };
  if (c.clase === 'elogio' || c.clase === 'interes') {
    // Responder a quien contesta a nuestra respuesta crearía una conversación infinita: solo se responde a comentarios de primer nivel.
    if (esRespuesta) return { accion: 'ninguna', estado: 'procesado', porque: 'es una respuesta a otro comentario: no se contesta' };
    if (c.confianza >= UMBRAL_RESPONDER) return { accion: 'responder', estado: 'procesado', porque: 'comentario positivo o con interés' };
    return { accion: 'ninguna', estado: 'procesado', porque: 'confianza insuficiente para responder' };
  }
  return { accion: 'ninguna', estado: 'procesado', porque: 'sin contenido que atender' };
}

const RESPUESTAS_PUBLICAS = [
  '¡Gracias por escribirnos! 🙌 Te enviamos un mensaje por privado, ¿te llegó?',
  '¡Hola! Gracias por tu comentario 💬 Te acabamos de escribir por privado, ¿lo recibiste?',
  '¡Gracias! Te enviamos un mensaje por privado con la información. ¿Te llegó? 📩',
  'Gracias por comentar 🙏 Revisa tus mensajes: te escribimos por privado. ¿Te llegó?',
];

/** Variante estable por comentario: evita publicar siempre el mismo texto (Meta lo trata como spam). */
export function respuestaPublica(commentId) {
  let h = 0;
  for (const ch of String(commentId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return RESPUESTAS_PUBLICAS[h % RESPUESTAS_PUBLICAS.length];
}

/** Mensaje privado con el enlace y el número de WhatsApp. */
export function mensajePrivado(nombre, plataforma) {
  const primero = String(nombre || '').trim().split(/\s+/)[0];
  const saludo = primero ? `Hola ${primero} 👋` : 'Hola 👋';
  const origen = plataforma === 'instagram' ? 'Instagram' : 'Facebook';
  const enlace = `${WHATSAPP_LINK}?text=${encodeURIComponent(`Hola, te escribo desde ${origen}`)}`;
  return `${saludo} Gracias por tu comentario. Somos Flujo de Migração y ayudamos con trámites en Brasil: CPF, RNM, refugio, residencia y agendamientos en la Policía Federal.\n\nEscríbenos directo por WhatsApp 👉 ${enlace}\nNúmero: ${WHATSAPP_NUMERO}\n\nAllí te atendemos.`;
}

/** Extrae los comentarios nuevos del cuerpo que envía el webhook de Meta (Facebook «feed» e Instagram «comments»). */
export function extraerComentarios(cuerpo) {
  const out = [];
  for (const entry of (cuerpo && cuerpo.entry) || []) {
    const cuentaId = String(entry.id || '');
    for (const ch of entry.changes || []) {
      const v = ch.value || {};
      if (cuerpo.object === 'page' && ch.field === 'feed' && v.item === 'comment' && v.verb === 'add' && v.comment_id) {
        if (String(v.from && v.from.id) === cuentaId) continue; // nuestros propios comentarios
        out.push({
          plataforma: 'facebook', cuenta_id: cuentaId, comment_id: String(v.comment_id), post_id: String(v.post_id || ''),
          autor_id: String((v.from && v.from.id) || ''), autor_nombre: String((v.from && v.from.name) || ''),
          texto: String(v.message || ''), es_respuesta: !!v.parent_id && String(v.parent_id) !== String(v.post_id),
        });
      } else if (cuerpo.object === 'instagram' && ch.field === 'comments' && v.id) {
        if (String(v.from && v.from.id) === cuentaId) continue;
        out.push({
          plataforma: 'instagram', cuenta_id: cuentaId, comment_id: String(v.id), post_id: String((v.media && v.media.id) || ''),
          autor_id: String((v.from && v.from.id) || ''), autor_nombre: String((v.from && v.from.username) || ''),
          texto: String(v.text || ''), es_respuesta: !!v.parent_id,
        });
      }
    }
  }
  return out;
}

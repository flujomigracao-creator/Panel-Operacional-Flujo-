// Envío por WhatsApp Cloud API de las respuestas del atendente IA de Comercial (lo llama n8n con la service role).
// POST { kommo_lead_id, mensaje, audio_path?, extra_texto?, lista_tramites?, fase? }
//   lista_tramites: manda además los trámites (comercial_audios_pitch.en_lista) como botones para que el cliente elija.
//   audio_path: audio ya subido a `chat-media` (.ogg = nota de voz; si falla, se manda el texto).
//   extra_texto: segundo mensaje de texto (ej. la clave PIX cuando el cliente quiere pagar).
//   submenu: 'agendamiento' → botones RNM/refugio (ids motivo:<enum>); 'agendamiento_rnm' / 'agendamiento_refugio' → solo
//            la vía (el cliente ya dijo cuál); 'residencia' → vía (ids variante:<familiar|mercosur>).
//   datos_pago: manda la plantilla de PIX de Kommo con el valor (o monto_pix si se acordó otro, ej. la mitad) y la plantilla de datos.
//   solo_datos: manda solo la plantilla de datos (plan "empezar y pagar al final") y avisa que se espera la documentación.
//   idioma: 'pt' | 'es' para los textos fijos.
//   plantilla_kommo_id: manda como texto una plantilla de Kommo (kommo_plantillas), después del mensaje principal.
//   plantilla: { nombre, idioma, parametros, texto } → manda una plantilla aprobada de Meta (fuera de la ventana de 24 h).
//   texto_previo: texto que se manda antes que todo (ej. presentación de Nora si el cliente arrancó pidiendo un trámite).
//   solo_escribiendo: no manda nada; marca como leído el último mensaje del cliente y muestra "escribiendo…".
// Respeta `comercial_leads.atendente_pausado`: si el lead está pausado no manda nada.
// Entre un mensaje y el siguiente muestra "escribiendo…" y hace una pausa corta, como una persona.
// Teléfonos +55 00… (DDD inexistente) son clientes simulados para probar a Nora: no se manda nada a WhatsApp.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'chat-media';
const GRAPH = 'https://graph.facebook.com/v23.0';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function telefonoDestino(raw: string): string {
  const digitos = String(raw || '').replace(/\D/g, '');
  if (!digitos) return '';
  if (String(raw).trim().startsWith('+') || digitos.length > 11) return digitos;
  return '55' + digitos;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const clave = (req.headers.get('apikey') || req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  // Solo claves con permisos de administrador (service role / secret key): la API de admin de Auth rechaza cualquier otra.
  const esServicio = clave === serviceKey || (clave.length > 20 && (await fetch(`${url}/auth/v1/admin/users?per_page=1`, {
    headers: { apikey: clave, Authorization: `Bearer ${clave}` },
  })).ok);
  if (!esServicio) return json({ error: 'Solo para uso interno' }, 403);

  const admin = createClient(url, serviceKey);
  const token = (Deno.env.get('WHATSAPP_TOKEN') || '').trim();
  const phoneNumberId = (Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '').trim();
  if (!token || !phoneNumberId) return json({ error: 'Faltan WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID' }, 500);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  const kommoLeadId = Number(body.kommo_lead_id);
  const mensaje = String(body.mensaje || '').trim();
  const audioPath = body.audio_path ? String(body.audio_path).replace(/^chat-media\//, '') : null;
  const extra = body.extra_texto ? String(body.extra_texto).trim() : '';
  // WhatsApp solo muestra el audio como nota de voz (con onda y foto) si es OGG/Opus y se envía con `voice: true`;
  // si no, llega como archivo de audio con ícono de auriculares.
  const esOgg = /\.(ogg|opus)$/i.test(audioPath || '');
  const audioMime = esOgg ? 'audio/ogg; codecs=opus' : 'audio/mpeg';
  if (!kommoLeadId || (!mensaje && !audioPath && !body.lista_tramites && !body.submenu && !body.datos_pago && !body.solo_datos && !body.solo_escribiendo && !body.plantilla)) return json({ error: 'Falta kommo_lead_id y mensaje o audio' }, 400);

  const { data: lead } = await admin
    .from('comercial_leads')
    .select('kommo_lead_id, kommo_contact_id, telefono, atendente_pausado')
    .eq('kommo_lead_id', kommoLeadId)
    .maybeSingle();
  if (!lead) return json({ error: 'Lead no encontrado' }, 404);
  if (lead.atendente_pausado) return json({ ok: true, omitido: 'atendente pausado para este lead' });

  const to = telefonoDestino(lead.telefono || '');
  if (!to) return json({ error: 'El lead no tiene teléfono' }, 422);
  const { data: resol } = await admin.rpc('whatsapp_resolver_lead', { p_telefono: to });
  const chatId = `wa:${resol?.telefono_chave || to}`;
  // Clientes simulados para probar a Nora (DDD 00, no existe en Brasil): se registra todo como si se enviara,
  // pero no se llama a WhatsApp.
  const simulado = to.startsWith('5500');

  // "Escribiendo…": la Cloud API lo muestra sobre el último mensaje recibido (y lo marca como leído) hasta
  // 25 s o hasta que llega nuestro mensaje. No existe un indicador de "grabando audio".
  const { data: ultimoRecibido } = await admin
    .from('messages')
    .select('external_message_id')
    .eq('kommo_lead_id', kommoLeadId)
    .eq('direction', 'inbound')
    .like('external_message_id', 'wamid.%')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const escribiendo = async () => {
    if (simulado || !ultimoRecibido?.external_message_id) return;
    await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', status: 'read', message_id: ultimoRecibido.external_message_id, typing_indicator: { type: 'text' } }),
    }).catch((e) => console.error('escribiendo', e));
  };
  if (body.solo_escribiendo) {
    await escribiendo();
    return json({ ok: true, escribiendo: Boolean(ultimoRecibido?.external_message_id) });
  }

  let primerEnvio = true;
  const enviar = async (payload: Record<string, unknown>) => {
    if (!primerEnvio && !simulado) {
      const texto = String((payload as any)?.text?.body || (payload as any)?.interactive?.body?.text || '');
      await escribiendo();
      await new Promise((ok) => setTimeout(ok, Math.min(3500, 1000 + texto.length * 12)));
    }
    primerEnvio = false;
    if (simulado) return `wamid.SIM${crypto.randomUUID()}`;
    const r = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, ...payload }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d?.error?.message || `WhatsApp Cloud API ${r.status}`);
    return d?.messages?.[0]?.id as string;
  };

  const registrar = (wamid: string, texto: string | null, conAudio: boolean) =>
    admin.rpc('registrar_mensagem_kommo', {
      p_message_id: wamid,
      p_direction: 'outbound',
      p_chat_id: chatId,
      p_contact_id: lead.kommo_contact_id || null,
      p_lead_id: kommoLeadId,
      p_text: texto,
      p_origin: 'whatsapp_cloud_api',
      p_author_name: 'Nora (IA)',
      p_author_type: 'bot',
      p_attachment_type: conAudio ? 'audio' : null,
      p_attachment_name: conAudio ? audioPath!.split('/').pop() : null,
      p_storage_path: conAudio ? audioPath : null,
      p_mime_type: conAudio ? audioMime : null,
      p_raw: { fase: body.fase || null, origen: 'atendente_comercial' },
    });

  // Las plantillas vienen de Kommo (kommo_plantillas): se reemplazan sus variables y el **negrita** de Kommo
  // se pasa al *negrita* de WhatsApp.
  const reales = (v: number) => `R$ ${Number.isInteger(Number(v)) ? Number(v).toFixed(0) : Number(v).toFixed(2).replace('.', ',')}`;
  const completarPlantilla = (texto: string, nombre: string, precio: number | null) => {
    const primerNombre = /^[+\d\s]*$/.test(nombre || '') ? '' : String(nombre).trim().split(/\s+/)[0];
    return String(texto || '')
      .replace(/\{\{\s*lead\.price\s*\}\}/g, precio ? reales(precio) : '')
      .replace(/\{\{\s*contact\.first_name\s*\}\}/g, primerNombre || 'Listo')
      .replace(/\{\{[^}]*\}\}/g, '')
      .replace(/\*\*/g, '*')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };

  const enviados: string[] = [];
  try {
    // Plantilla aprobada por Meta (única forma de escribirle pasadas 24 h de su último mensaje).
    // plantilla: { nombre, idioma, parametros: [..], texto } — texto es como se ve, para guardarlo en la conversación.
    if (body.plantilla?.nombre) {
      const p = body.plantilla;
      const wamid = await enviar({
        type: 'template',
        template: {
          name: p.nombre,
          language: { code: p.idioma || 'es' },
          components: (p.parametros || []).length
            ? [{ type: 'body', parameters: p.parametros.map((t: string) => ({ type: 'text', text: String(t) })) }]
            : [],
        },
      });
      await registrar(wamid, p.texto || `[Plantilla ${p.nombre}]`, false);
      return json({ ok: true, enviados: [wamid] });
    }
    if (body.texto_previo) {
      const previo = String(body.texto_previo).trim();
      const wamid = await enviar({ type: 'text', text: { body: previo } });
      await registrar(wamid, previo, false);
      enviados.push(wamid);
    }
    let audioEnviado = false;
    if (audioPath && simulado) {
      const wamid = await enviar({ type: 'audio' });
      await registrar(wamid, mensaje || null, true);
      enviados.push(wamid);
      audioEnviado = true;
    } else if (audioPath) {
      try {
        const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(audioPath);
        if (dlErr || !blob) throw new Error(dlErr?.message || 'no se pudo leer el audio');
        const form = new FormData();
        form.append('messaging_product', 'whatsapp');
        form.append('file', new Blob([await blob.arrayBuffer()], { type: esOgg ? 'audio/ogg' : 'audio/mpeg' }), esOgg ? 'audio.ogg' : 'audio.mp3');
        const up = await fetch(`${GRAPH}/${phoneNumberId}/media`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
        const upData = await up.json().catch(() => ({}));
        if (!up.ok) throw new Error(upData?.error?.message || `Media API ${up.status}`);
        const wamid = await enviar({ type: 'audio', audio: esOgg ? { id: upData.id, voice: true } : { id: upData.id } });
        await registrar(wamid, mensaje || null, true);
        enviados.push(wamid);
        audioEnviado = true;
      } catch (err) {
        console.error('audio falló, se manda texto', err);
      }
    }
    if (!audioEnviado && mensaje) {
      const wamid = await enviar({ type: 'text', text: { body: mensaje } });
      await registrar(wamid, mensaje, false);
      enviados.push(wamid);
    }
    if (extra) {
      const wamid = await enviar({ type: 'text', text: { body: extra } });
      await registrar(wamid, extra, false);
      enviados.push(wamid);
    }
    // Plantilla de Kommo por id (ej. 2644 "Datos Iniciales del Cliente"), tal como la escribió el dueño.
    if (body.plantilla_kommo_id) {
      // contenido_local(_pt): texto que el dueño ajustó en el panel; la sincronización con Kommo no lo pisa.
      const { data: pk } = await admin.from('kommo_plantillas').select('contenido, contenido_local, contenido_local_pt').eq('id', Number(body.plantilla_kommo_id)).maybeSingle();
      const original = (body.idioma === 'pt' && pk?.contenido_local_pt) || pk?.contenido_local || pk?.contenido;
      const texto = original ? completarPlantilla(original, '', null) : '';
      if (texto) {
        const wamid = await enviar({ type: 'text', text: { body: texto } });
        await registrar(wamid, texto, false);
        enviados.push(wamid);
      }
    }
    // Cierre: plantilla de PIX con el valor (o el monto acordado, ej. la mitad) y, enseguida, la lista de datos del
    // trámite (plantillas de Kommo). Con solo_datos (plan "pagar al final") se manda solo la lista, sin PIX.
    if (body.datos_pago || body.solo_datos) {
      const { data: d } = await admin.rpc('comercial_datos_para_lead', { p_kommo_lead_id: kommoLeadId });
      const monto = body.monto_pix ? Number(body.monto_pix) : d?.precio;
      if (!body.solo_datos) {
        const pix = d?.pix
          ? completarPlantilla(d.pix, d?.nombre, monto)
          : `Para realizar el pago, la clave PIX (CNPJ) es 69.093.014/0001-01${monto ? ` — valor ${reales(monto)}` : ''}. Después de pagar, envíanos el comprobante por aquí.`;
        const w1 = await enviar({ type: 'text', text: { body: pix } });
        await registrar(w1, pix, false);
        enviados.push(w1);
      }
      const datos = d?.datos
        ? completarPlantilla(d.datos, d?.nombre, d?.precio)
        : body.solo_datos
          ? 'Enseguida el equipo operacional te pide los datos y documentos para arrancar tu trámite.'
          : 'Apenas nos mandes el comprobante, el equipo operacional te pide los datos y documentos para arrancar tu trámite.';
      const w2 = await enviar({ type: 'text', text: { body: datos } });
      await registrar(w2, datos, false);
      enviados.push(w2);
      // Plan "pagar al final": el trámite ya pasó a Operacional, solo falta que el cliente mande lo de la lista.
      if (body.solo_datos) {
        const espera = body.idioma === 'pt'
          ? 'Seu trâmite já passou para a nossa equipe operacional ✅ Ficamos aguardando a sua documentação para começar.'
          : 'Su trámite ya pasó a nuestro equipo operacional ✅ Quedamos esperando su documentación para empezar.';
        const w3 = await enviar({ type: 'text', text: { body: espera } });
        await registrar(w3, espera, false);
        enviados.push(w3);
      }
    }
    if (body.lista_tramites) {
      const { data: tramites } = await admin
        .from('comercial_audios_pitch')
        .select('tramite_enum_id, tramite_nombre, precio')
        .eq('en_lista', true)
        .order('orden', { ascending: true });
      // Botones a la vista (no lista desplegable). WhatsApp: máximo 3 botones por mensaje y 20 caracteres por título,
      // así que van en grupos de 3, un mensaje por grupo.
      const botones = (tramites || []).map((t: any) => ({ id: `tramite:${t.tramite_enum_id}`, title: String(t.tramite_nombre).slice(0, 20) }));
      const grupos: { id: string; title: string }[][] = [];
      for (let i = 0; i < botones.length; i += 3) grupos.push(botones.slice(i, i + 3));
      for (let i = 0; i < grupos.length; i++) {
        const cuerpo = i === 0 ? (body.idioma === 'pt' ? 'Escolha o serviço que você precisa:' : 'Elija el trámite que necesita:') : (body.idioma === 'pt' ? 'Ou:' : 'O:');
        const wamid = await enviar({
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: cuerpo },
            action: { buttons: grupos[i].map((b) => ({ type: 'reply', reply: b })) },
          },
        });
        await registrar(wamid, `${cuerpo}\n${grupos[i].map((b) => `[${b.title}]`).join(' ')}`, false);
        enviados.push(wamid);
      }
    }
    // Después de la propuesta: botones para precisar el trámite (agendamiento: para qué es; residencia: por qué vía).
    const SUBMENUS: Record<string, { cuerpo: string; opciones: { id: string; title: string }[] }[]> = {
      agendamiento: [
        { cuerpo: body.idioma === 'pt' ? 'Para que é o agendamento?' : '¿Para qué es el agendamiento?', opciones: [{ id: 'motivo:165690', title: 'RNM (1ª vía)' }, { id: 'motivo:165692', title: 'RNM (2ª vía)' }] },
        { cuerpo: body.idioma === 'pt' ? 'Ou é para refúgio?' : '¿O es para refugio?', opciones: [{ id: 'motivo:166572', title: 'Refugio (1ª vez)' }, { id: 'motivo:166574', title: 'Refugio (renovación)' }] },
      ],
      // El cliente ya dijo si era para RNM o para refugio: solo falta precisar cuál.
      agendamiento_rnm: [
        { cuerpo: body.idioma === 'pt' ? 'É a primeira via do RNM ou a segunda?' : '¿Es la primera vía del RNM o la segunda?', opciones: [{ id: 'motivo:165690', title: 'RNM (1ª vía)' }, { id: 'motivo:165692', title: 'RNM (2ª vía)' }] },
      ],
      agendamiento_refugio: [
        { cuerpo: body.idioma === 'pt' ? 'É a primeira vez ou a renovação do refúgio?' : '¿Es la primera vez o una renovación del refugio?', opciones: [{ id: 'motivo:166572', title: 'Refugio (1ª vez)' }, { id: 'motivo:166574', title: 'Refugio (renovación)' }] },
      ],
      residencia: [
        { cuerpo: body.idioma === 'pt' ? 'Por qual via é a sua residência permanente?' : '¿Por qué vía es su residencia permanente?', opciones: [{ id: 'variante:familiar', title: 'Reunión familiar' }, { id: 'variante:mercosur', title: 'Acuerdo Mercosur' }] },
      ],
    };
    if (body.submenu && SUBMENUS[body.submenu]) {
      const preguntas = SUBMENUS[body.submenu];
      for (const p of preguntas) {
        const wamid = await enviar({
          type: 'interactive',
          interactive: { type: 'button', body: { text: p.cuerpo }, action: { buttons: p.opciones.map((b) => ({ type: 'reply', reply: b })) } },
        });
        await registrar(wamid, `${p.cuerpo}\n${p.opciones.map((b) => `[${b.title}]`).join(' ')}`, false);
        enviados.push(wamid);
      }
    }
  } catch (err) {
    return json({ ok: false, error: String((err as Error).message || err), enviados }, 502);
  }

  return json({ ok: true, enviados });
});

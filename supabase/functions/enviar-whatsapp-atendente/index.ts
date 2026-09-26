// Envío por WhatsApp Cloud API de las respuestas del atendente IA de Comercial (lo llama n8n con la service role).
// POST { kommo_lead_id, mensaje, audio_path?, extra_texto?, lista_tramites?, fase? }
//   lista_tramites: manda además la lista interactiva de trámites (comercial_audios_pitch.en_lista) para que el cliente elija.
//   audio_path: mp3 ya subido a `chat-media` (se manda como nota de voz; si falla, se manda el texto).
//   extra_texto: segundo mensaje de texto (ej. la clave PIX cuando el cliente quiere pagar).
// Respeta `comercial_leads.atendente_pausado`: si el lead está pausado no manda nada.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'chat-media';
const GRAPH = 'https://graph.facebook.com/v21.0';

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
  // WhatsApp solo muestra el audio como nota de voz (con onda y foto) si es OGG/Opus; el MP3 llega como archivo.
  const esOgg = /\.(ogg|opus)$/i.test(audioPath || '');
  const audioMime = esOgg ? 'audio/ogg' : 'audio/mpeg';
  if (!kommoLeadId || (!mensaje && !audioPath && !body.lista_tramites)) return json({ error: 'Falta kommo_lead_id y mensaje o audio' }, 400);

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

  const enviar = async (payload: Record<string, unknown>) => {
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

  const enviados: string[] = [];
  try {
    let audioEnviado = false;
    if (audioPath) {
      try {
        const { data: blob, error: dlErr } = await admin.storage.from(BUCKET).download(audioPath);
        if (dlErr || !blob) throw new Error(dlErr?.message || 'no se pudo leer el audio');
        const form = new FormData();
        form.append('messaging_product', 'whatsapp');
        form.append('file', new Blob([await blob.arrayBuffer()], { type: audioMime }), esOgg ? 'audio.ogg' : 'audio.mp3');
        const up = await fetch(`${GRAPH}/${phoneNumberId}/media`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
        const upData = await up.json().catch(() => ({}));
        if (!up.ok) throw new Error(upData?.error?.message || `Media API ${up.status}`);
        const wamid = await enviar({ type: 'audio', audio: { id: upData.id } });
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
    if (body.lista_tramites) {
      const { data: tramites } = await admin
        .from('comercial_audios_pitch')
        .select('tramite_enum_id, tramite_nombre, precio')
        .eq('en_lista', true)
        .order('orden', { ascending: true });
      // WhatsApp: máximo 10 filas por lista, título de fila hasta 24 caracteres.
      const rows = (tramites || []).slice(0, 9).map((t: any) => ({
        id: `tramite:${t.tramite_enum_id}`,
        title: String(t.tramite_nombre).slice(0, 24),
        ...(t.precio ? { description: `R$ ${Number(t.precio).toFixed(0)}` } : {}),
      }));
      rows.push({ id: 'tramite:otro', title: 'Otro trámite', description: 'Contame qué necesitás' });
      const cuerpo = 'Para ayudarte más rápido, tocá el botón y elegí el trámite que necesitás:';
      const wamid = await enviar({
        type: 'interactive',
        interactive: { type: 'list', body: { text: cuerpo }, action: { button: 'Ver trámites', sections: [{ title: 'Trámites', rows }] } },
      });
      await registrar(wamid, `${cuerpo}\n${rows.map((r) => `• ${r.title}`).join('\n')}`, false);
      enviados.push(wamid);
    }
  } catch (err) {
    return json({ ok: false, error: String((err as Error).message || err), enviados }, 502);
  }

  return json({ ok: true, enviados });
});

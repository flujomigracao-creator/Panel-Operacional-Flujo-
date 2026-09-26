// Webhook de WhatsApp Cloud API (Meta) para el número propio, ahora que ya no pasa por Kommo.
// GET  → verificación de Meta (hub.challenge).
// POST → guarda cada mensaje entrante (texto y archivos) en `messages` con registrar_mensagem_kommo,
//        asociado al lead por teléfono. Si el número no se conoce, lo deja en `whatsapp_contactos_nuevos`
//        para que n8n cree el lead en Kommo (pipeline Comercial) y lo vincule.
// Secretos: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID; opcional WHATSAPP_APP_SECRET para validar la firma.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const ORG_ID = '00000000-0000-0000-0000-000000000001';
const BUCKET = 'chat-media';
const VERIFY_TOKEN = 'flujo-migracao-verify-2026';
const GRAPH = 'https://graph.facebook.com/v23.0';

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr', 'video/mp4': 'mp4', 'video/3gpp': '3gp', 'application/pdf': 'pdf',
};

async function firmaValida(req: Request, raw: string): Promise<boolean> {
  const secret = Deno.env.get('WHATSAPP_APP_SECRET');
  if (!secret) return true;
  const header = req.headers.get('x-hub-signature-256') || '';
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return header === `sha256=${hex}`;
}

function contenidoDe(m: any): { texto: string | null; media: any | null; tipo: string | null } {
  switch (m.type) {
    case 'text': return { texto: m.text?.body ?? null, media: null, tipo: null };
    case 'image': return { texto: m.image?.caption ?? null, media: m.image, tipo: 'image' };
    case 'audio': return { texto: null, media: m.audio, tipo: 'audio' };
    case 'video': return { texto: m.video?.caption ?? null, media: m.video, tipo: 'video' };
    case 'document': return { texto: m.document?.caption ?? null, media: m.document, tipo: 'document' };
    case 'sticker': return { texto: null, media: m.sticker, tipo: 'sticker' };
    case 'button': return { texto: m.button?.text ?? null, media: null, tipo: null };
    case 'interactive': return { texto: m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null, media: null, tipo: null };
    case 'location': {
      const l = m.location || {};
      return { texto: `Ubicación: ${l.latitude}, ${l.longitude}${l.name ? ` (${l.name})` : ''}`, media: null, tipo: null };
    }
    case 'reaction': return { texto: m.reaction?.emoji ? `Reacción: ${m.reaction.emoji}` : null, media: null, tipo: null };
    default: return { texto: `[Mensaje de tipo "${m.type}" no soportado]`, media: null, tipo: null };
  }
}

async function procesar(body: any) {
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const token = (Deno.env.get('WHATSAPP_TOKEN') || '').trim();
  const phoneNumberId = (Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '').trim();

  for (const entry of body?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {};
      if (value?.metadata?.phone_number_id && value.metadata.phone_number_id !== phoneNumberId) continue;
      const nombres: Record<string, string> = {};
      for (const c of value.contacts || []) nombres[c.wa_id] = c.profile?.name;

      // Estado de entrega de lo que mandamos (enviado / entregado / leído / falló), para verlo en el panel.
      for (const s of value.statuses || []) {
        const e = s.errors?.[0];
        const detalle = e ? [e.title, e.error_data?.details, e.code ? `(código ${e.code})` : null].filter(Boolean).join(' — ') : null;
        const { error: sErr } = await admin.rpc('whatsapp_actualizar_estado', { p_wamid: s.id, p_estado: s.status, p_error: detalle });
        if (sErr) console.error('estado', sErr.message);
        if (s.status === 'failed') console.error('envío fallido', s.id, detalle);
      }

      for (const m of value.messages || []) {
        try {
          const from = String(m.from || '').replace(/\D/g, '');
          const { data: lead } = await admin.rpc('whatsapp_resolver_lead', { p_telefono: from });
          const chave = lead?.telefono_chave || from;
          const { texto, media, tipo } = contenidoDe(m);

          // Elección de la lista de trámites que manda el atendente: se guarda en el lead antes de registrar
          // el mensaje, así el atendente pasa directo a la fase de propuesta.
          const eleccion = String(m.interactive?.button_reply?.id || m.interactive?.list_reply?.id || '');
          const enumElegido = Number(eleccion.replace(/^tramite:/, ''));
          if (eleccion.startsWith('tramite:') && enumElegido && lead?.kommo_lead_id) {
            const { error: eErr } = await admin.rpc('whatsapp_elegir_tramite', { p_kommo_lead_id: lead.kommo_lead_id, p_tramite_enum_id: enumElegido });
            if (eErr) console.error('elegir_tramite', eErr.message);
          }

          let storagePath: string | null = null;
          let mime: string | null = null;
          let fileName: string | null = null;
          if (media?.id && token) {
            const info = await fetch(`${GRAPH}/${media.id}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
            if (info?.url) {
              const archivo = await fetch(info.url, { headers: { Authorization: `Bearer ${token}` } });
              if (archivo.ok) {
                mime = (info.mime_type || archivo.headers.get('content-type') || 'application/octet-stream').split(';')[0];
                const ext = EXT[mime] || mime.split('/')[1] || 'bin';
                fileName = media.filename || `${tipo}-${m.id}.${ext}`;
                const path = `${ORG_ID}/whatsapp/${chave}/${m.id}.${ext}`;
                const { error: upErr } = await admin.storage.from(BUCKET).upload(path, await archivo.blob(), { contentType: mime, upsert: true });
                if (!upErr) storagePath = path;
                else console.error('upload', upErr.message);
              }
            }
          }

          const { error: regErr } = await admin.rpc('registrar_mensagem_kommo', {
            p_message_id: m.id,
            p_direction: 'inbound',
            p_chat_id: `wa:${chave}`,
            p_contact_id: lead?.kommo_contact_id ?? null,
            p_lead_id: lead?.kommo_lead_id ?? null,
            p_text: texto,
            p_origin: 'whatsapp_cloud_api',
            p_author_name: nombres[m.from] || null,
            p_attachment_type: tipo,
            p_attachment_name: fileName,
            p_storage_path: storagePath,
            p_mime_type: mime,
            p_created_at: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : null,
            p_raw: m,
          });
          if (regErr) console.error('registrar', regErr.message);

          if (!lead?.kommo_lead_id) {
            await admin.from('whatsapp_contactos_nuevos').upsert(
              { telefono_chave: chave, telefono: from, nombre: nombres[m.from] || null },
              { onConflict: 'telefono_chave', ignoreDuplicates: true },
            );
          }
        } catch (err) {
          console.error('mensaje', m?.id, err);
        }
      }
    }
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === 'GET') {
    const ok = url.searchParams.get('hub.mode') === 'subscribe' && url.searchParams.get('hub.verify_token') === VERIFY_TOKEN;
    return ok ? new Response(url.searchParams.get('hub.challenge') || '', { status: 200 }) : new Response('Forbidden', { status: 403 });
  }
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const raw = await req.text();
  if (!(await firmaValida(req, raw))) return new Response('Invalid signature', { status: 401 });

  let body: any;
  try { body = JSON.parse(raw); } catch { return new Response('ok', { status: 200 }); }

  // Meta reintenta si no recibe 200 rápido: se responde ya y se procesa en segundo plano.
  EdgeRuntime.waitUntil(procesar(body));
  return new Response('ok', { status: 200 });
});

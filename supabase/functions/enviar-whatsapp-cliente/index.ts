// Envía un mensaje de WhatsApp a un cliente directo por Meta Cloud API (sin pasar por Kommo/Salesbot)
// y lo deja registrado en `messages` con la misma función que usa el receptor de Kommo, para que
// aparezca en la conversación del panel igual que los mensajes que sí pasan por Kommo.
// POST { client_id | kommo_lead_id, mensaje } → texto
// POST { client_id | kommo_lead_id, storage_path, file_name, mime_type, caption? } → foto/documento/audio/video
//   (storage_path es un archivo ya subido al bucket `chat-media` por el panel)
// Secretos requeridos (Supabase → Edge Functions → Secrets): WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TOKEN.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const BUCKET = 'chat-media';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const soloDigitos = (v: string) => String(v || '').replace(/\D/g, '');

// Tipo de mensaje de WhatsApp según el mime. WhatsApp solo acepta ciertos
// sub-tipos por categoría; si Meta lo rechaza, el error vuelve tal cual al panel.
function tipoWhatsapp(mime: string): 'image' | 'document' | 'audio' | 'video' {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  return 'document';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const auth = req.headers.get('Authorization') || '';
  const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: { user: u } } = await user.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
  if (!u) return json({ error: 'No autenticado' }, 401);
  // La organización es la del usuario que envía (sin ORG_ID fijo): solo puede escribirle a sus propios clientes/leads.
  const { data: member } = await admin.from('organization_members').select('organization_id, role').eq('user_id', u.id).limit(1).maybeSingle();
  if (!member) return json({ error: 'Sin acceso a la organización' }, 403);
  const ORG_ID: string = member.organization_id;
  // El número de WhatsApp (secretos de abajo) es de una organización: solo la habilitada en
  // channel_integrations puede usarlo. Esa tabla solo la modifica el servidor, no los usuarios.
  const { data: canal } = await admin.from('channel_integrations').select('whatsapp_enabled').eq('organization_id', ORG_ID).maybeSingle();
  if (!canal?.whatsapp_enabled) return json({ error: 'WhatsApp no está habilitado para tu organización.' }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  const clientId = body.client_id;
  const kommoLeadId = body.kommo_lead_id ? Number(body.kommo_lead_id) : null;
  const mensaje = String(body.mensaje || '').trim();
  const storagePath = body.storage_path ? String(body.storage_path) : null;
  const fileName = body.file_name ? String(body.file_name) : null;
  const mimeType = body.mime_type ? String(body.mime_type) : null;
  const caption = body.caption ? String(body.caption) : undefined;
  if ((!clientId && !kommoLeadId) || (!mensaje && !storagePath)) return json({ error: 'Falta client_id o kommo_lead_id, y mensaje o archivo' }, 400);

  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID');
  const whatsappToken = Deno.env.get('WHATSAPP_TOKEN');
  if (!phoneNumberId || !whatsappToken) {
    return json({ error: 'Falta configurar WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_TOKEN en Supabase (Edge Functions → Secrets). El envío directo todavía no está activo.' }, 500);
  }

  // Destinatario: un cliente con ficha, o un lead de Comercial (que todavía no tiene ficha).
  let contactId: number | null = null;
  let telefonoCrudo = '';
  if (kommoLeadId) {
    const { data: lead, error: leadErr } = await admin
      .from('comercial_leads')
      .select('kommo_lead_id, kommo_contact_id, telefono')
      .eq('kommo_lead_id', kommoLeadId)
      .eq('organization_id', ORG_ID)
      .maybeSingle();
    if (leadErr) return json({ error: leadErr.message }, 500);
    if (!lead) return json({ error: 'Lead no encontrado' }, 404);
    contactId = lead.kommo_contact_id || null;
    telefonoCrudo = lead.telefono || '';
  } else {
    const { data: client, error: clientErr } = await admin
      .from('clients')
      .select('id, kommo_contact_id, phone, whatsapp, full_name')
      .eq('id', clientId)
      .eq('organization_id', ORG_ID)
      .maybeSingle();
    if (clientErr) return json({ error: clientErr.message }, 500);
    if (!client) return json({ error: 'Cliente no encontrado' }, 404);
    contactId = client.kommo_contact_id || null;
    telefonoCrudo = client.whatsapp || client.phone || '';
  }

  let telefono = soloDigitos(telefonoCrudo);
  if (!telefono) return json({ error: 'No tiene teléfono registrado' }, 422);
  // Solo se asume Brasil si el número no trae código de país (sin "+" y con 11 dígitos o menos).
  if (!String(telefonoCrudo).trim().startsWith('+') && telefono.length <= 11 && !telefono.startsWith('55')) telefono = '55' + telefono;

  // Si un humano respondió a un lead de Comercial, el atendente automático no vuelve a contestar ese mismo mensaje.
  const marcarLeadAtendido = async () => {
    const ahora = new Date().toISOString();
    if (kommoLeadId) await admin.from('comercial_leads').update({ last_atendido_at: ahora }).eq('organization_id', ORG_ID).eq('kommo_lead_id', kommoLeadId);
    // Respondiendo desde la ficha del contacto: cuenta como atendido para todos sus leads.
    else if (clientId) await admin.from('comercial_leads').update({ last_atendido_at: ahora }).eq('organization_id', ORG_ID).eq('client_id', clientId);
  };

  const { data: userProfile } = await admin.from('profiles').select('full_name').eq('id', u.id).maybeSingle();
  const autor = userProfile?.full_name || 'Operador (panel)';

  let wamid: string | null = null;

  if (storagePath) {
    // 1. Bajar el archivo ya subido por el panel a Storage.
    const { data: fileBlob, error: dlErr } = await admin.storage.from(BUCKET).download(storagePath);
    if (dlErr || !fileBlob) return json({ error: 'No se pudo leer el archivo subido: ' + (dlErr?.message || 'desconocido') }, 500);
    const mime = mimeType || fileBlob.type || 'application/octet-stream';
    const tipo = tipoWhatsapp(mime);

    // 2. Subirlo a Meta para obtener un media id (requerido por Cloud API).
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('file', fileBlob, fileName || 'archivo');
    const mediaRes = await fetch(`https://graph.facebook.com/v23.0/${phoneNumberId}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${whatsappToken}` },
      body: form,
    });
    const mediaData = await mediaRes.json().catch(() => ({}));
    if (!mediaRes.ok) return json({ error: mediaData?.error?.message || `WhatsApp Media API ${mediaRes.status}` }, 502);
    const mediaId = mediaData.id;

    // 3. Mandar el mensaje referenciando ese media id. Un OGG/Opus con voice:true llega como nota de voz.
    const mediaPayload: Record<string, unknown> = { id: mediaId };
    if (tipo === 'audio' && /ogg|opus/.test(mime)) mediaPayload.voice = true;
    if (caption && (tipo === 'image' || tipo === 'video' || tipo === 'document')) mediaPayload.caption = caption;
    if (tipo === 'document' && fileName) mediaPayload.filename = fileName;

    const sendRes = await fetch(`https://graph.facebook.com/v23.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${whatsappToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: telefono, type: tipo, [tipo]: mediaPayload }),
    });
    const sendData = await sendRes.json().catch(() => ({}));
    if (!sendRes.ok) return json({ error: sendData?.error?.message || `WhatsApp Cloud API ${sendRes.status}` }, 502);
    wamid = sendData?.messages?.[0]?.id || null;

    const { error: rpcErr } = await admin.rpc('registrar_mensagem_kommo', {
      p_message_id: wamid || `panel-${Date.now()}`,
      p_direction: 'outbound',
      p_contact_id: contactId,
      p_lead_id: kommoLeadId,
      p_text: caption || null,
      p_origin: 'whatsapp_cloud_api',
      p_author_name: autor,
      p_attachment_type: tipo,
      p_attachment_name: fileName,
      p_storage_path: storagePath,
      p_mime_type: mime,
    });
    await marcarLeadAtendido();
    if (rpcErr) return json({ ok: true, wamid, aviso: 'El archivo se envió pero no se pudo registrar en la conversación: ' + rpcErr.message });
    return json({ ok: true, wamid });
  }

  // Solo texto
  const metaRes = await fetch(`https://graph.facebook.com/v23.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${whatsappToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: telefono, type: 'text', text: { body: mensaje } }),
  });
  const metaData = await metaRes.json().catch(() => ({}));
  if (!metaRes.ok) return json({ error: metaData?.error?.message || `WhatsApp Cloud API ${metaRes.status}` }, 502);
  wamid = metaData?.messages?.[0]?.id || null;

  const { error: rpcErr } = await admin.rpc('registrar_mensagem_kommo', {
    p_message_id: wamid || `panel-${Date.now()}`,
    p_direction: 'outbound',
    p_contact_id: contactId,
    p_lead_id: kommoLeadId,
    p_text: mensaje,
    p_origin: 'whatsapp_cloud_api',
    p_author_name: autor,
  });
  await marcarLeadAtendido();
  if (rpcErr) return json({ ok: true, wamid, aviso: 'El mensaje se envió pero no se pudo registrar en la conversación: ' + rpcErr.message });

  return json({ ok: true, wamid });
});

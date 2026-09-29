// Canal personalizado de Kommo (Chats API / amoJo) para el número propio de WhatsApp.
//
// 1. Webhook de Kommo: un operador escribió en el chat del canal dentro de Kommo → se manda por WhatsApp Cloud API
//    y se registra en `messages` (origen 'kommo_canal_whatsapp', así no vuelve a Kommo).
//    - Directo: POST /kommo-canal/<scope_id> con la firma de Kommo en X-Signature (HMAC-SHA1 del cuerpo).
//    - Reenviado por n8n (la URL registrada en el canal es la de n8n): POST { kommo_raw_b64, signature }.
// 2. POST { action: 'flush' } → copia a Kommo los mensajes encolados en kommo_canal_outbox (los encola un trigger de
//    `messages` y lo despierta con pg_net). No recibe datos: solo procesa la cola, así que no necesita sesión.
//    Si el canal está activado pero todavía no conectado a la cuenta, lo conecta (connect → scope_id).
// 3. POST { action: 'estado' } (usuario del panel) → si el canal está activo, conectado y cuántos mensajes hay en cola.
// 4. POST { action: 'sincronizar_plantillas' } → manda a Meta las plantillas en borrador (whatsapp_plantillas), trae
//    las de Meta y las copia a Kommo como plantillas de chat. También corre sola desde el flush, una vez por hora.
//    Al mandar desde Kommo fuera de la ventana de 24 h, un texto que coincide con una plantilla aprobada sale como
//    plantilla de Meta (Kommo no manda plantillas de Meta por un canal personalizado).
//
// Secretos: KOMMO_CHANNEL_SECRET (clave del canal), KOMMO_API_TOKEN (vincular el chat al contacto),
// WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID. Dominio de Kommo: organization_settings.kommo_base_url o KOMMO_BASE_URL.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

// Datos públicos del canal "Flujo Migracao WhatsApp" (amo.ext.36958507) que registró Kommo.
const CHANNEL_ID = '8856937f-1606-4eb9-b381-f890f60df34f';
const CHANNEL_BOT_ID = '77518540-345b-4f53-a50e-504285057607';
const CHANNEL_TITLE = 'Flujo Migracao WhatsApp';
const AMOJO = 'https://amojo.kommo.com';
const GRAPH = 'https://graph.facebook.com/v23.0';
const BUCKET = 'chat-media';
const MAX_INTENTOS = 8;
const ESPERA_CONTACTO_MIN = 30; // minutos que un número nuevo espera a que n8n cree su contacto en Kommo

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const secreto = () => (Deno.env.get('KOMMO_CHANNEL_SECRET') || '').trim();
const soloDigitos = (v: unknown) => String(v ?? '').replace(/\D/g, '');

// ---------- amoJo ----------

// Firma de la Chats API: HMAC-SHA1 (clave del canal) de "MÉTODO\nContent-MD5\nContent-Type\nDate\nruta".
async function amojo(method: string, path: string, body?: unknown) {
  const raw = body === undefined ? '' : JSON.stringify(body);
  const md5 = createHash('md5').update(raw).digest('hex');
  const date = new Date().toUTCString().replace('GMT', '+0000');
  const type = 'application/json';
  const signature = createHmac('sha1', secreto()).update([method, md5, type, date, path].join('\n')).digest('hex');
  const res = await fetch(AMOJO + path, {
    method,
    headers: { Date: date, 'Content-Type': type, 'Content-MD5': md5, 'X-Signature': signature },
    body: raw || undefined,
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) throw new Error(`amoJo ${res.status}: ${String(text).slice(0, 300)}`);
  return data;
}

async function kommoBase(admin: SupabaseClient, orgId: string) {
  const { data } = await admin.from('organization_settings').select('value').eq('organization_id', orgId).eq('key', 'kommo_base_url').maybeSingle();
  return String(data?.value ?? Deno.env.get('KOMMO_BASE_URL') ?? 'https://flujomigracao.kommo.com').replace(/^"|"$/g, '').replace(/\/+$/, '');
}

async function kommoApi(admin: SupabaseClient, orgId: string, method: string, path: string, body?: unknown) {
  const token = Deno.env.get('KOMMO_API_TOKEN');
  if (!token) throw new Error('Falta KOMMO_API_TOKEN');
  const res = await fetch((await kommoBase(admin, orgId)) + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(res.status === 401 ? 'Kommo rechazó el token (401)' : `Kommo ${res.status}: ${text.slice(0, 300)}`);
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}

// Conecta el canal a la cuenta de Kommo de la organización (una vez) y guarda el scope_id.
async function asegurarConexion(admin: SupabaseClient, canal: any): Promise<string> {
  if (canal.kommo_scope_id) return canal.kommo_scope_id;
  let accountId = canal.kommo_amojo_account_id;
  if (!accountId) {
    const cuenta = await kommoApi(admin, canal.organization_id, 'GET', '/api/v4/account?with=amojo_id');
    accountId = cuenta?.amojo_id;
    if (!accountId) throw new Error('Kommo no devolvió el amojo_id de la cuenta');
  }
  const r = await amojo('POST', `/v2/origin/custom/${CHANNEL_ID}/connect`, { account_id: accountId, title: CHANNEL_TITLE, hook_api_version: 'v2' });
  const scopeId = r?.scope_id;
  if (!scopeId) throw new Error('Kommo no devolvió scope_id al conectar el canal');
  await admin.from('channel_integrations')
    .update({ kommo_amojo_account_id: accountId, kommo_scope_id: scopeId, updated_at: new Date().toISOString() })
    .eq('organization_id', canal.organization_id);
  return scopeId;
}

// ---------- Salida: WhatsApp → Kommo ----------

const idUsuario = (key: string) => `wa-${key.replace(/^wa:/, '')}`;

function usuarioCliente(dest: any) {
  return {
    id: idUsuario(dest.conversation_key),
    name: dest.nombre || `+${dest.telefono}`,
    profile: { phone: `+${dest.telefono}` },
  };
}

// Crea el chat en amoJo y lo vincula al contacto de Kommo (así los mensajes caen en su lead y no en uno nuevo).
async function asegurarChat(admin: SupabaseClient, orgId: string, scopeId: string, dest: any) {
  const { data: chat } = await admin.from('kommo_canal_chats').select('*')
    .eq('organization_id', orgId).eq('conversation_key', dest.conversation_key).maybeSingle();
  if (chat?.kommo_chat_id && (chat.vinculado_at || !dest.kommo_contact_id)) {
    if (chat.telefono !== dest.telefono && dest.telefono) {
      await admin.from('kommo_canal_chats').update({ telefono: dest.telefono, updated_at: new Date().toISOString() })
        .eq('organization_id', orgId).eq('conversation_key', dest.conversation_key);
    }
    return chat;
  }

  let chatId = chat?.kommo_chat_id;
  if (!chatId) {
    const r = await amojo('POST', `/v2/origin/custom/${scopeId}/chats`, {
      conversation_id: dest.conversation_key,
      user: usuarioCliente(dest),
    });
    chatId = r?.id;
    if (!chatId) throw new Error('amoJo no devolvió el id del chat');
  }

  let vinculado: string | null = null;
  if (dest.kommo_contact_id) {
    await kommoApi(admin, orgId, 'POST', '/api/v4/contacts/chats', [{ chat_id: chatId, contact_id: Number(dest.kommo_contact_id) }]);
    vinculado = new Date().toISOString();
  }

  const fila = {
    organization_id: orgId,
    conversation_key: dest.conversation_key,
    telefono: dest.telefono,
    nombre: dest.nombre,
    kommo_chat_id: chatId,
    kommo_contact_id: dest.kommo_contact_id ?? null,
    vinculado_at: vinculado,
    updated_at: new Date().toISOString(),
  };
  await admin.from('kommo_canal_chats').upsert(fila, { onConflict: 'organization_id,conversation_key' });
  return fila;
}

function tipoAmojo(kind: string | null, mime: string | null): string {
  const k = `${kind || ''} ${mime || ''}`;
  if (/image|picture|photo|sticker/.test(k)) return 'picture';
  if (/audio|voice/.test(k)) return 'voice';
  if (/video/.test(k)) return 'video';
  return 'file';
}

async function contenidoMensaje(admin: SupabaseClient, msg: any) {
  const adj = msg.message_attachments?.[0];
  if (!adj) {
    return { type: 'text', text: msg.content || (msg.message_type === 'text' ? '' : `[${msg.message_type}]`) };
  }
  let url: string | null = adj.source_url || null;
  if (adj.storage_path && !/^https?:\/\//.test(adj.storage_path)) {
    const { data } = await admin.storage.from(BUCKET).createSignedUrl(adj.storage_path, 7 * 24 * 3600);
    url = data?.signedUrl || url;
  } else if (/^https?:\/\//.test(adj.storage_path || '')) {
    url = adj.storage_path;
  }
  if (!url) return { type: 'text', text: msg.content || `[${adj.kind || 'archivo'} sin enlace]` };

  let size = Number(adj.size_bytes) || 0;
  if (!size) {
    const head = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) }).catch(() => null);
    size = Number(head?.headers.get('content-length')) || 0;
  }
  const type = tipoAmojo(adj.kind, adj.mime_type);
  return {
    type,
    media: url,
    file_name: adj.file_name || `${type}-${msg.id}`,
    file_size: size,
    ...(msg.content ? { text: msg.content } : {}),
  };
}

async function importarMensaje(admin: SupabaseClient, orgId: string, scopeId: string, fila: any): Promise<'sent' | 'waiting_contact' | 'skipped'> {
  const { data: msg } = await admin.from('messages')
    .select('id, direction, sender_type, message_type, content, author_name, created_at, message_attachments(storage_path, source_url, file_name, mime_type, kind, size_bytes)')
    .eq('id', fila.message_id).maybeSingle();
  if (!msg) return 'skipped';

  const { data: dest, error: dErr } = await admin.rpc('kommo_canal_destino', { p_message_id: fila.message_id });
  if (dErr) throw new Error(dErr.message);
  if (!dest || dest.error || dest.simulado) return 'skipped';

  // Número nuevo: n8n crea su lead en Kommo en un minuto; hasta entonces se espera para no crear un contacto duplicado.
  const edadMin = (Date.now() - new Date(fila.created_at).getTime()) / 60000;
  const { data: chatPrevio } = await admin.from('kommo_canal_chats').select('kommo_chat_id')
    .eq('organization_id', orgId).eq('conversation_key', dest.conversation_key).maybeSingle();
  if (!dest.kommo_contact_id && !chatPrevio?.kommo_chat_id && edadMin < ESPERA_CONTACTO_MIN) return 'waiting_contact';

  await asegurarChat(admin, orgId, scopeId, dest);
  const ms = new Date(msg.created_at).getTime();
  const cliente = usuarioCliente(dest);
  const saliente = msg.direction === 'outbound';
  const payload: Record<string, unknown> = {
    timestamp: Math.floor(ms / 1000),
    msec_timestamp: ms,
    msgid: msg.id,
    conversation_id: dest.conversation_key,
    message: await contenidoMensaje(admin, msg),
    silent: saliente, // lo que ya mandamos nosotros no genera aviso de mensaje nuevo en Kommo
  };
  if (saliente) {
    payload.sender = { id: `flujo-${msg.sender_type || 'agent'}`, ref_id: CHANNEL_BOT_ID, name: msg.author_name || 'Flujo Migração' };
    payload.receiver = cliente;
  } else {
    payload.sender = cliente;
  }
  const r = await amojo('POST', `/v2/origin/custom/${scopeId}`, { event_type: 'new_message', payload });
  await admin.from('kommo_canal_outbox').update({ kommo_msgid: r?.new_message?.msgid ?? null }).eq('id', fila.id);
  return 'sent';
}

async function vaciarCola(admin: SupabaseClient) {
  const resumen: Record<string, number> = { enviados: 0, esperando: 0, omitidos: 0, errores: 0 };
  if (!secreto()) return { ...resumen, error: 'Falta KOMMO_CHANNEL_SECRET' };

  const { data: canales } = await admin.from('channel_integrations').select('*').eq('kommo_canal_enabled', true);
  const porOrg = new Map<string, string>();
  for (const canal of canales || []) {
    try { porOrg.set(canal.organization_id, await asegurarConexion(admin, canal)); }
    catch (e) { console.error('conectar', canal.organization_id, (e as Error).message); }
  }

  for (let vuelta = 0; vuelta < 10; vuelta++) {
    const { data: filas, error } = await admin.rpc('kommo_canal_tomar', { p_limite: 20 });
    if (error) { console.error('tomar', error.message); break; }
    if (!filas?.length) break;
    for (const fila of filas) {
      const scopeId = porOrg.get(fila.organization_id);
      try {
        if (!scopeId) throw new Error('El canal de Kommo no está conectado para esta organización');
        const estado = await importarMensaje(admin, fila.organization_id, scopeId, fila);
        const ahora = new Date().toISOString();
        if (estado === 'waiting_contact') {
          resumen.esperando++;
          await admin.from('kommo_canal_outbox').update({ status: 'waiting_contact', attempts: fila.attempts - 1, locked_at: null, next_attempt_at: new Date(Date.now() + 60000).toISOString() }).eq('id', fila.id);
        } else {
          estado === 'sent' ? resumen.enviados++ : resumen.omitidos++;
          await admin.from('kommo_canal_outbox').update({ status: estado, locked_at: null, last_error: null, sent_at: estado === 'sent' ? ahora : null }).eq('id', fila.id);
        }
      } catch (e) {
        resumen.errores++;
        const msg = (e as Error).message;
        console.error('importar', fila.message_id, msg);
        const final = fila.attempts >= MAX_INTENTOS;
        await admin.from('kommo_canal_outbox').update({
          status: final ? 'failed' : 'pending',
          locked_at: null,
          last_error: msg.slice(0, 500),
          next_attempt_at: new Date(Date.now() + Math.min(2 ** fila.attempts, 60) * 60000).toISOString(),
        }).eq('id', fila.id);
      }
    }
  }
  await avisarFallidos(admin, porOrg, resumen);

  for (const canal of canales || []) {
    const ultima = canal.plantillas_sincronizadas_at ? new Date(canal.plantillas_sincronizadas_at).getTime() : 0;
    if (Date.now() - ultima < MINUTOS_ENTRE_SINCRONIZACIONES * 60000) continue;
    await sincronizarPlantillas(admin, canal.organization_id)
      .then((r) => { if (r.errores.length) console.error('plantillas', r.errores.join(' | ')); })
      .catch((e) => console.error('plantillas', (e as Error).message));
  }
  return resumen;
}

// Mensajes que WhatsApp rechazó después de copiarlos a Kommo (o de avisarle a Kommo que salieron bien):
// se marcan como fallidos en Kommo para que el equipo vea que el cliente no los recibió.
function motivoFallo(error: string | null): string {
  if (/131047/.test(error || '')) return 'No enviado: pasaron más de 24 h desde el último mensaje del cliente (WhatsApp solo permite plantillas).';
  return `No enviado por WhatsApp: ${error || 'rechazado'}`.slice(0, 200);
}

async function avisarFallidos(admin: SupabaseClient, porOrg: Map<string, string>, resumen: Record<string, number>) {
  const { data: filas } = await admin.from('kommo_canal_estados').select('id, organization_id, message_id, error, attempts')
    .eq('status', 'pending').order('created_at').limit(50);
  for (const f of filas || []) {
    const scopeId = porOrg.get(f.organization_id);
    if (!scopeId) continue;
    const marcar = (status: string, extra: Record<string, unknown> = {}) =>
      admin.from('kommo_canal_estados').update({ status, ...extra }).eq('id', f.id);

    // Escrito desde Kommo: el id es el del mensaje en Kommo. Copiado desde WhatsApp: el que devolvió Kommo al importarlo.
    const { data: msg } = await admin.from('messages').select('metadata').eq('id', f.message_id).maybeSingle();
    let msgid: string | null = msg?.metadata?.raw?.kommo_msgid || null;
    if (!msgid) {
      const { data: ob } = await admin.from('kommo_canal_outbox').select('status, kommo_msgid').eq('message_id', f.message_id).maybeSingle();
      if (!ob || ob.status === 'skipped' || ob.status === 'failed' || (ob.status === 'sent' && !ob.kommo_msgid)) { await marcar('skipped'); continue; }
      if (ob.status !== 'sent') continue; // todavía no se copió a Kommo: queda para el próximo flush
      msgid = ob.kommo_msgid;
    }
    try {
      await amojo('POST', `/v2/origin/custom/${scopeId}/${msgid}/delivery_status`, { msgid, delivery_status: -1, error_code: 905, error: motivoFallo(f.error) });
      await marcar('sent', { sent_at: new Date().toISOString(), last_error: null });
      resumen.fallidos_avisados = (resumen.fallidos_avisados || 0) + 1;
    } catch (e) {
      const intentos = f.attempts + 1;
      await marcar(intentos >= 5 ? 'failed' : 'pending', { attempts: intentos, last_error: (e as Error).message.slice(0, 500) });
    }
  }
}

// ---------- Plantillas de WhatsApp (Meta) en Kommo ----------

const MINUTOS_ENTRE_SINCRONIZACIONES = 60;
const ESTADOS_VISIBLES = ['APPROVED', 'PENDING', 'IN_APPEAL'];
const PLANTILLAS_DE_PRUEBA = ['hello_world']; // la de ejemplo que trae Meta: no se copia a Kommo

async function graph(path: string, init: RequestInit = {}) {
  const token = (Deno.env.get('WHATSAPP_TOKEN') || '').trim();
  const res = await fetch(`${GRAPH}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
    signal: AbortSignal.timeout(20000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.error_user_msg || data?.error?.message || `Meta ${res.status}`);
  return data;
}

// Cuenta de WhatsApp Business del número (WHATSAPP_WABA_ID o se busca entre las cuentas visibles para el token,
// igual que whatsapp-plantillas).
let wabaCache: string | null = null;
async function wabaId(): Promise<string> {
  const fija = (Deno.env.get('WHATSAPP_WABA_ID') || '').trim();
  if (fija) return fija;
  if (wabaCache) return wabaCache;
  const phoneId = (Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '').trim();
  const lista = async (p: string) => ((await graph(p).catch(() => ({})))?.data || []) as any[];
  const candidatos = new Set<string>();
  for (const w of await lista('me/assigned_whatsapp_business_accounts?fields=id')) candidatos.add(w.id);
  const negocios = ['1823208699030623', '1618753399606023', ...(await lista('me/businesses?fields=id')).map((n) => n.id)];
  for (const negocio of negocios) {
    for (const tipo of ['owned_whatsapp_business_accounts', 'client_whatsapp_business_accounts']) {
      for (const w of await lista(`${negocio}/${tipo}?fields=id`)) candidatos.add(w.id);
    }
  }
  for (const id of candidatos) {
    if ((await lista(`${id}/phone_numbers?fields=id`)).some((n) => n.id === phoneId)) { wabaCache = id; return id; }
  }
  throw new Error('No se encontró la cuenta de WhatsApp Business del número (configurá WHATSAPP_WABA_ID)');
}

// Contenido de la plantilla en Kommo: las variables de Meta ({{1}}…) pasan al dato de Kommo configurado en
// `variables` o quedan como [1], [2]… para completarlas a mano antes de mandar.
function contenidoKommo(p: any): string {
  const cuerpo = String(p.cuerpo).replace(/\{\{\s*(\d+)\s*\}\}/g, (_: string, n: string) => p.variables?.[n] || `[${n}]`);
  return [p.encabezado, cuerpo, p.pie].filter(Boolean).join('\n\n');
}

function botonesKommo(p: any) {
  return (p.botones || []).map((b: any) => b.type === 'URL' ? { type: 'url', text: b.text, url: b.url } : { type: 'inline', text: b.text });
}

const IDIOMAS: Record<string, string> = { es: 'ES', pt_BR: 'PT', en_US: 'EN' };
const nombreKommo = (p: any) =>
  `WhatsApp · ${p.nombre} (${IDIOMAS[p.idioma] || p.idioma})${p.estado === 'APPROVED' ? '' : ' · en aprobación'}`;

async function sincronizarPlantillas(admin: SupabaseClient, orgId: string) {
  const r = { enviadas_a_meta: 0, de_meta: 0, creadas_en_kommo: 0, actualizadas_en_kommo: 0, quitadas_de_kommo: 0, errores: [] as string[] };
  const waba = await wabaId();

  // 1. Borradores → aprobación de Meta.
  const { data: borradores } = await admin.from('whatsapp_plantillas').select('*').eq('organization_id', orgId).eq('estado', 'BORRADOR');
  for (const b of borradores || []) {
    const components: any[] = [];
    if (b.encabezado) components.push({ type: 'HEADER', format: 'TEXT', text: b.encabezado });
    components.push({ type: 'BODY', text: b.cuerpo, ...((b.ejemplos || []).length ? { example: { body_text: [b.ejemplos] } } : {}) });
    if (b.pie) components.push({ type: 'FOOTER', text: b.pie });
    if ((b.botones || []).length) {
      components.push({ type: 'BUTTONS', buttons: b.botones.map((x: any) => x.type === 'URL' ? { type: 'URL', text: x.text, url: x.url } : { type: 'QUICK_REPLY', text: x.text }) });
    }
    try {
      const res = await graph(`${waba}/message_templates`, { method: 'POST', body: JSON.stringify({ name: b.nombre, language: b.idioma, category: b.categoria || 'UTILITY', components }) });
      await admin.from('whatsapp_plantillas').update({ estado: res.status || 'PENDING', error: null, meta_actualizado_at: new Date().toISOString() })
        .eq('organization_id', orgId).eq('nombre', b.nombre).eq('idioma', b.idioma);
      r.enviadas_a_meta++;
    } catch (e) {
      const msg = (e as Error).message;
      r.errores.push(`${b.nombre}: ${msg}`);
      await admin.from('whatsapp_plantillas').update({ error: msg.slice(0, 500) }).eq('organization_id', orgId).eq('nombre', b.nombre).eq('idioma', b.idioma);
    }
  }

  // 2. Meta → copia local (no pisa variables ni el id de Kommo).
  let pagina: string | null = `${waba}/message_templates?fields=name,language,status,category,components&limit=100`;
  while (pagina) {
    const res: any = await graph(pagina);
    for (const t of res.data || []) {
      const comp = (tipo: string) => (t.components || []).find((c: any) => c.type === tipo);
      const header = comp('HEADER');
      await admin.from('whatsapp_plantillas').upsert({
        organization_id: orgId,
        nombre: t.name,
        idioma: t.language,
        estado: t.status,
        categoria: t.category,
        encabezado: header?.format === 'TEXT' ? header.text : null,
        cuerpo: comp('BODY')?.text || '',
        pie: comp('FOOTER')?.text || null,
        botones: (comp('BUTTONS')?.buttons || []).map((b: any) => ({ type: b.type, text: b.text, url: b.url })),
        error: null,
        meta_actualizado_at: new Date().toISOString(),
      }, { onConflict: 'organization_id,nombre,idioma' });
      r.de_meta++;
    }
    pagina = res.paging?.next ? res.paging.next.replace(`${GRAPH}/`, '') : null;
  }

  // 3. Copia local → plantillas de chat de Kommo.
  const { data: plantillas } = await admin.from('whatsapp_plantillas').select('*').eq('organization_id', orgId);
  for (const p of plantillas || []) {
    const visible = ESTADOS_VISIBLES.includes(p.estado) && !PLANTILLAS_DE_PRUEBA.includes(p.nombre);
    const clave = `${nombreKommo(p)}\n${contenidoKommo(p)}\n${JSON.stringify(p.botones || [])}`;
    try {
      if (!visible) {
        if (p.kommo_template_id) {
          await kommoApi(admin, orgId, 'DELETE', `/api/v4/chats/templates/${p.kommo_template_id}`).catch(() => null);
          await admin.from('whatsapp_plantillas').update({ kommo_template_id: null, kommo_contenido: null }).eq('organization_id', orgId).eq('nombre', p.nombre).eq('idioma', p.idioma);
          r.quitadas_de_kommo++;
        }
        continue;
      }
      if (p.kommo_template_id && p.kommo_contenido === clave) continue;
      const datos: Record<string, unknown> = { name: nombreKommo(p), content: contenidoKommo(p), is_editable: true };
      const botones = botonesKommo(p);
      const guardar = async (conBotones: boolean) => {
        const cuerpo = conBotones && botones.length ? { ...datos, buttons: botones } : datos;
        return p.kommo_template_id
          ? await kommoApi(admin, orgId, 'PATCH', `/api/v4/chats/templates/${p.kommo_template_id}`, cuerpo)
          : await kommoApi(admin, orgId, 'POST', '/api/v4/chats/templates', [cuerpo]);
      };
      // Si Kommo no acepta los botones, la plantilla se crea igual sin ellos.
      const res = await guardar(true).catch(async (e) => {
        if (!botones.length) throw e;
        console.error('plantilla con botones', p.nombre, (e as Error).message);
        return await guardar(false);
      });
      const id = p.kommo_template_id || res?._embedded?.chat_templates?.[0]?.id || res?._embedded?.templates?.[0]?.id || res?.id;
      if (!id) throw new Error(`Kommo no devolvió el id de la plantilla: ${JSON.stringify(res).slice(0, 200)}`);
      await admin.from('whatsapp_plantillas').update({ kommo_template_id: id, kommo_contenido: clave }).eq('organization_id', orgId).eq('nombre', p.nombre).eq('idioma', p.idioma);
      p.kommo_template_id ? r.actualizadas_en_kommo++ : r.creadas_en_kommo++;
    } catch (e) {
      r.errores.push(`${p.nombre} → Kommo: ${(e as Error).message}`);
    }
  }
  await admin.from('channel_integrations').update({ plantillas_sincronizadas_at: new Date().toISOString() }).eq('organization_id', orgId);
  return r;
}

// Texto sin formato para comparar: sin *negrita*/_cursiva_/~tachado~ y con los espacios normalizados.
const normalizar = (t: string) => String(t || '').replace(/[*_~]/g, '').replace(/\s+/g, ' ').trim();
const escaparRegex = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Si el texto es una plantilla aprobada con sus variables completadas, devuelve la plantilla y los valores en orden.
function coincidencia(p: any, texto: string): string[] | null {
  const cuerpo = normalizar(p.cuerpo);
  const numeros = [...cuerpo.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));
  const patronCuerpo = cuerpo.split(/\{\{\s*\d+\s*\}\}/).map(escaparRegex).join('(.+?)');
  const opcional = (t: string | null) => (t ? `(?:${escaparRegex(normalizar(t))}\\s*)?` : '');
  const patron = new RegExp(`^${opcional(p.encabezado)}${patronCuerpo}${p.pie ? `(?:\\s*${escaparRegex(normalizar(p.pie))})?` : ''}$`, 's');
  const m = normalizar(texto).match(patron);
  if (!m) return null;
  const valores: Record<number, string> = {};
  numeros.forEach((n, i) => { valores[n] = m[i + 1].trim(); });
  return Object.keys(valores).map(Number).sort((a, b) => a - b).map((n) => valores[n]);
}

// ¿El cliente escribió en las últimas 24 h? (fuera de esa ventana WhatsApp solo acepta plantillas aprobadas)
async function dentroDeVentana(admin: SupabaseClient, orgId: string, conversationKey: string): Promise<boolean> {
  const { data: convs } = await admin.from('conversations').select('id').eq('organization_id', orgId).eq('external_conversation_id', conversationKey);
  const ids = (convs || []).map((c: any) => c.id);
  if (!ids.length) return false;
  const { data: ultimo } = await admin.from('messages').select('created_at').in('conversation_id', ids).eq('direction', 'inbound')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return !!ultimo && Date.now() - new Date(ultimo.created_at).getTime() < 24 * 3600 * 1000;
}

// ---------- Entrada: Kommo → WhatsApp ----------

// Kommo manda el JSON con un salto de línea al final, pero firma el cuerpo sin él.
function firmaValida(raw: Uint8Array, firma: string): boolean {
  const b = new TextEncoder().encode(String(firma || '').trim().toLowerCase());
  const coincide = (bytes: Uint8Array) => {
    const a = new TextEncoder().encode(createHmac('sha1', secreto()).update(bytes).digest('hex'));
    return a.length === b.length && timingSafeEqual(a, b);
  };
  let fin = raw.length;
  while (fin > 0 && (raw[fin - 1] === 10 || raw[fin - 1] === 13)) fin--;
  return coincide(raw.subarray(0, fin)) || (fin !== raw.length && coincide(raw));
}

function tipoWhatsapp(tipo: string): 'image' | 'audio' | 'video' | 'document' {
  if (tipo === 'picture' || tipo === 'sticker') return 'image';
  if (tipo === 'voice' || tipo === 'audio') return 'audio';
  if (tipo === 'video') return 'video';
  return 'document';
}

async function estadoEntrega(scopeId: string, msgid: string, error: string | null) {
  const body = error
    ? { msgid, delivery_status: -1, error_code: 905, error: error.slice(0, 200) }
    : { msgid, delivery_status: 1 };
  await amojo('POST', `/v2/origin/custom/${scopeId}/${msgid}/delivery_status`, body)
    .catch((e) => console.error('delivery_status', msgid, (e as Error).message));
}

async function procesarEntrante(admin: SupabaseClient, scopeId: string, body: any): Promise<string> {
  const m = body?.message || {};
  const contenido = m.message || {};
  const msgid = String(contenido.id || '');
  if (!msgid) return 'sin id de mensaje';

  const { data: canal } = await admin.from('channel_integrations').select('organization_id, kommo_canal_enabled, whatsapp_enabled')
    .eq('kommo_scope_id', scopeId).maybeSingle();
  if (!canal) { console.error('scope desconocido', scopeId); return `scope desconocido: ${scopeId}`; }
  const orgId: string = canal.organization_id;

  // Una sola vez por mensaje de Kommo (Kommo reintenta si no le contestamos a tiempo).
  const { error: dupErr } = await admin.from('kommo_canal_recibidos').insert({ kommo_msgid: msgid, organization_id: orgId });
  if (dupErr) return dupErr.code === '23505' ? 'duplicado' : `no se pudo registrar: ${dupErr.message}`;

  const fallar = async (motivo: string) => {
    console.error('entrante', msgid, motivo);
    await admin.from('kommo_canal_recibidos').update({ error: motivo }).eq('kommo_msgid', msgid);
    await estadoEntrega(scopeId, msgid, motivo);
    return motivo;
  };
  if (!canal.kommo_canal_enabled || !canal.whatsapp_enabled) return fallar('El canal de WhatsApp no está activo en el panel.');

  const key = String(m.conversation?.client_id || '');
  const { data: chat } = key
    ? await admin.from('kommo_canal_chats').select('*').eq('organization_id', orgId).eq('conversation_key', key).maybeSingle()
    : { data: null };
  const telefono = soloDigitos(chat?.telefono || m.receiver?.phone || (key.startsWith('wa:') ? key.slice(3) : ''));
  if (!telefono) return fallar('No se encontró el número de WhatsApp de este chat.');
  if (telefono.startsWith('5500')) return fallar('Cliente simulado: no existe en WhatsApp.');
  const conversationKey = key.startsWith('wa:') ? key : `wa:${telefono}`;

  const phoneNumberId = (Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '').trim();
  const token = (Deno.env.get('WHATSAPP_TOKEN') || '').trim();
  if (!phoneNumberId || !token) return fallar('Faltan WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID en Supabase.');

  const tipo = String(contenido.type || 'text');
  const texto = String(contenido.text || '').trim();
  let envio: Record<string, unknown>;
  let adjunto: string | null = null;
  if (contenido.media && tipo !== 'text') {
    const t = tipoWhatsapp(tipo);
    adjunto = t;
    const media: Record<string, unknown> = { link: contenido.media };
    if (texto && t !== 'audio') media.caption = texto;
    if (t === 'document' && contenido.file_name) media.filename = contenido.file_name;
    envio = { type: t, [t]: media };
  } else if (tipo === 'location' && contenido.location) {
    envio = { type: 'location', location: { latitude: contenido.location.lat, longitude: contenido.location.lon } };
  } else {
    if (!texto) return fallar('Mensaje vacío.');
    envio = { type: 'text', text: { body: texto } };
    if (!(await dentroDeVentana(admin, orgId, conversationKey))) {
      // Fuera de las 24 h: solo sale si es una plantilla aprobada (primero la que eligió el operador en Kommo).
      const { data: plantillas } = await admin.from('whatsapp_plantillas').select('*').eq('organization_id', orgId).in('estado', ESTADOS_VISIBLES);
      const elegida = (plantillas || []).find((p: any) => p.kommo_template_id && p.kommo_template_id === Number(contenido.template?.id));
      if (elegida && elegida.estado !== 'APPROVED') return fallar(`La plantilla "${elegida.nombre}" todavía está en aprobación en Meta.`);
      let usada: any = null;
      let valores: string[] | null = null;
      for (const p of [elegida, ...(plantillas || [])].filter((x: any) => x?.estado === 'APPROVED')) {
        valores = coincidencia(p, texto);
        if (valores) { usada = p; break; }
      }
      if (!usada) {
        return fallar(elegida
          ? `El texto no coincide con la plantilla "${elegida.nombre}" (¿quedó alguna variable [1] sin completar?).`
          : 'Pasaron más de 24 h desde el último mensaje del cliente: WhatsApp solo deja mandar una plantilla aprobada ("WhatsApp · …").');
      }
      envio = {
        type: 'template',
        template: {
          name: usada.nombre,
          language: { code: usada.idioma },
          components: valores!.length ? [{ type: 'body', parameters: valores!.map((v) => ({ type: 'text', text: v })) }] : [],
        },
      };
    }
  }

  const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: telefono, ...envio }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return fallar(data?.error?.message || `WhatsApp Cloud API ${res.status}`);
  const wamid: string | null = data?.messages?.[0]?.id || null;
  await admin.from('kommo_canal_recibidos').update({ wamid }).eq('kommo_msgid', msgid);

  const { data: lead } = await admin.rpc('whatsapp_resolver_lead', { p_telefono: telefono });
  const { error: regErr } = await admin.rpc('registrar_mensagem_kommo', {
    p_message_id: wamid || `kommo-${msgid}`,
    p_direction: 'outbound',
    p_chat_id: conversationKey,
    p_contact_id: lead?.kommo_contact_id ?? chat?.kommo_contact_id ?? null,
    p_lead_id: lead?.kommo_lead_id ?? null,
    p_text: texto || null,
    p_origin: 'kommo_canal_whatsapp',
    p_author_name: m.sender?.name || 'Operador (Kommo)',
    p_author_type: 'agent',
    p_attachment_type: adjunto,
    p_attachment_url: adjunto ? contenido.media : null,
    p_attachment_name: adjunto ? (contenido.file_name || null) : null,
    p_raw: { kommo_msgid: msgid, kommo: body },
  });
  if (regErr) console.error('registrar', msgid, regErr.message);

  // Un humano respondió: el atendente automático no vuelve a contestar ese mismo mensaje.
  if (lead?.kommo_lead_id) {
    await admin.from('comercial_leads').update({ last_atendido_at: new Date().toISOString() })
      .eq('organization_id', orgId).eq('kommo_lead_id', lead.kommo_lead_id);
  }
  await estadoEntrega(scopeId, msgid, null);
  return 'enviado';
}

// ---------- HTTP ----------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const rawBytes = new Uint8Array(await req.arrayBuffer());
  let body: any = {};
  try { body = JSON.parse(new TextDecoder().decode(rawBytes) || '{}'); } catch { return json({ error: 'JSON inválido' }, 400); }

  // Webhook de Kommo, directo o reenviado por n8n con el cuerpo original en base64.
  const scopeEnRuta = new URL(req.url).pathname.split('/kommo-canal/')[1]?.split('/')[0] || '';
  const directo = !!req.headers.get('x-signature');
  if (directo || body.kommo_raw_b64) {
    if (!secreto()) return json({ error: 'Falta KOMMO_CHANNEL_SECRET' }, 500);
    const raw = directo ? rawBytes : Uint8Array.from(atob(String(body.kommo_raw_b64)), (c) => c.charCodeAt(0));
    const firma = directo ? req.headers.get('x-signature')! : String(body.signature || '');
    if (!firmaValida(raw, firma)) return json({ error: 'Firma inválida' }, 401);
    const evento = directo ? body : JSON.parse(new TextDecoder().decode(raw));
    const scopeId = decodeURIComponent(String(body.scope_id || scopeEnRuta || ''));
    // Directo desde Kommo: espera respuesta rápida, se contesta ya y se procesa en segundo plano.
    // Reenviado por n8n (que ya le contestó a Kommo): se procesa y se devuelve el resultado.
    const tarea = procesarEntrante(admin, scopeId, evento).catch((e) => { console.error('entrante', e); return `error: ${(e as Error).message}`; });
    if (directo) { EdgeRuntime.waitUntil(tarea); return json({ ok: true }); }
    return json({ ok: true, resultado: await tarea });
  }

  if (body.action === 'flush') {
    return json({ ok: true, ...(await vaciarCola(admin)) });
  }

  if (body.action === 'sincronizar_plantillas') {
    const { data: canales } = await admin.from('channel_integrations').select('organization_id').eq('kommo_canal_enabled', true);
    const resultados: Record<string, unknown> = {};
    for (const c of canales || []) {
      resultados[c.organization_id] = await sincronizarPlantillas(admin, c.organization_id).catch((e) => ({ error: (e as Error).message }));
    }
    return json({ ok: true, resultados });
  }

  if (body.action === 'estado') {
    const auth = req.headers.get('Authorization') || '';
    const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: { user: u } } = await user.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
    if (!u) return json({ error: 'No autenticado' }, 401);
    const { data: canal } = await user.from('channel_integrations').select('organization_id, kommo_canal_enabled, kommo_scope_id').maybeSingle();
    if (!canal) return json({ activo: false, conectado: false });
    const { count: enCola } = await user.from('kommo_canal_outbox').select('id', { count: 'exact', head: true }).in('status', ['pending', 'processing', 'waiting_contact']);
    const { count: fallidos } = await user.from('kommo_canal_outbox').select('id', { count: 'exact', head: true }).eq('status', 'failed');
    return json({ activo: canal.kommo_canal_enabled, conectado: !!canal.kommo_scope_id, secreto: !!secreto(), en_cola: enCola || 0, fallidos: fallidos || 0 });
  }

  return json({ error: 'Acción desconocida' }, 400);
});

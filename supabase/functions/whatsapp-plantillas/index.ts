// Plantillas de mensaje de WhatsApp (Meta): hacen falta para escribirle a un cliente pasadas 24 h de su último mensaje.
// Solo para uso interno (service role, lo llama n8n).
// POST { accion: 'crear', plantillas: [{ name, language, category, components }] }  → las manda a aprobación de Meta.
// POST { accion: 'listar' }                                                         → nombre, idioma, estado y motivo de rechazo.
// POST { accion: 'diagnostico' }                                                    → permisos del token y cuentas visibles.
// POST { accion: 'suscripcion' }                                                    → apps suscritas al webhook y estado del número.
// Secretos: WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID; WHATSAPP_WABA_ID opcional (si no está, se busca la cuenta que tiene el número).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const GRAPH = 'https://graph.facebook.com/v23.0';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const clave = (req.headers.get('apikey') || req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const esServicio = clave === serviceKey || (clave.length > 20 && (await fetch(`${url}/auth/v1/admin/users?per_page=1`, {
    headers: { apikey: clave, Authorization: `Bearer ${clave}` },
  })).ok);
  if (!esServicio) return json({ error: 'Solo para uso interno' }, 403);

  const token = (Deno.env.get('WHATSAPP_TOKEN') || '').trim();
  const phoneId = (Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '').trim();
  if (!token) return json({ error: 'Falta WHATSAPP_TOKEN' }, 500);
  const get = (p: string) => fetch(`${GRAPH}/${p}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json()).catch(() => ({}));

  // Cuentas de WhatsApp Business visibles para el token, con sus números.
  const buscarCuentas = async () => {
    const cuentas: any[] = [];
    const agregar = async (w: any, negocio: string, tipo: string) => {
      if (!w?.id || cuentas.some((c) => c.waba_id === w.id)) return;
      const nums = (await get(`${w.id}/phone_numbers?fields=id,display_phone_number`)).data || [];
      cuentas.push({ negocio, tipo, waba_id: w.id, waba: w.name, numeros: nums.map((x: any) => x.display_phone_number), es_el_de_nora: nums.some((x: any) => x.id === phoneId) });
    };
    // Usuario del sistema: sus cuentas asignadas y los negocios conocidos del dueño.
    for (const w of (await get('me/assigned_whatsapp_business_accounts?fields=id,name')).data || []) await agregar(w, 'asignada', 'assigned');
    for (const negocioId of ['1823208699030623', '1618753399606023']) {
      for (const tipo of ['owned_whatsapp_business_accounts', 'client_whatsapp_business_accounts']) {
        for (const w of (await get(`${negocioId}/${tipo}?fields=id,name`)).data || []) await agregar(w, negocioId, tipo);
      }
    }
    for (const n of (await get('me/businesses?fields=id,name')).data || []) {
      for (const tipo of ['owned_whatsapp_business_accounts', 'client_whatsapp_business_accounts']) {
        for (const w of (await get(`${n.id}/${tipo}?fields=id,name`)).data || []) await agregar(w, n.name, tipo);
      }
    }
    return cuentas;
  };
  const resolverWaba = async () => {
    const fija = (Deno.env.get('WHATSAPP_WABA_ID') || '').trim();
    if (fija) return fija;
    return (await buscarCuentas()).find((c) => c.es_el_de_nora)?.waba_id || null;
  };

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  if (body.accion === 'diagnostico') {
    const dbg = await fetch(`${GRAPH}/debug_token?input_token=${token}&access_token=${token}`).then((r) => r.json()).catch(() => ({}));
    const d = dbg?.data || {};
    const tel = await get(`${phoneId}?fields=display_phone_number,verified_name`);
    return json({
      ok: true,
      cuentas: await buscarCuentas(),
      tipo: d.type || null, valido: d.is_valid ?? null, permisos: d.scopes || [],
      numero: { display: tel.display_phone_number || null, nombre: tel.verified_name || null, error: tel.error?.message || null },
    });
  }

  const waba = await resolverWaba();
  if (!waba) return json({ ok: false, error: 'No encontré la cuenta de WhatsApp Business del número (usar accion diagnostico).' }, 404);

  // Salud del canal: ¿la app sigue suscrita a la cuenta (webhook) y el número está conectado?
  if (body.accion === 'suscripcion') {
    const apps = await get(`${waba}/subscribed_apps`);
    const tel = await get(`${phoneId}?fields=display_phone_number,verified_name,status,quality_rating,code_verification_status,platform_type,throughput,messaging_limit_tier`);
    return json({ ok: true, waba, apps: apps.data || apps.error || null, numero: tel });
  }

  if (body.accion === 'listar') {
    const r = await fetch(`${GRAPH}/${waba}/message_templates?fields=name,language,status,category,rejected_reason&limit=100`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return json({ ok: false, waba, error: d?.error?.message || `Meta ${r.status}` }, 502);
    return json({ ok: true, waba, plantillas: d.data || [] });
  }

  if (body.accion === 'crear') {
    const resultados = [];
    for (const p of body.plantillas || []) {
      const r = await fetch(`${GRAPH}/${waba}/message_templates`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
      });
      const d = await r.json().catch(() => ({}));
      resultados.push({ name: p.name, language: p.language, ok: r.ok, id: d.id || null, status: d.status || null, error: r.ok ? null : (d?.error?.error_user_msg || d?.error?.message || `Meta ${r.status}`) });
    }
    return json({ ok: true, waba, resultados });
  }

  return json({ error: 'accion debe ser crear, listar, suscripcion o diagnostico' }, 400);
});

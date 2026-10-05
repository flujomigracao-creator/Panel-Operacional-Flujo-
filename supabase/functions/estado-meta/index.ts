// Estado real de la conexión con Meta Ads, para el Centro de Inteligencia.
// POST {} → { ok, cuenta, problema, ... }. Usa META_ADS_TOKEN / META_AD_ACCOUNT_ID (solo servidor).
// Nunca devuelve ni registra el token. Distingue: token inválido, permisos, cuenta restringida,
// problema de pago y cuenta inaccesible, para no ocultar errores de Meta.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const GRAPH = 'https://graph.facebook.com/v20.0';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

// account_status de la Marketing API
const ESTADO_CUENTA: Record<number, { codigo: string; mensaje: string; bloquea: boolean }> = {
  1: { codigo: 'activa', mensaje: 'Cuenta activa.', bloquea: false },
  2: { codigo: 'deshabilitada', mensaje: 'La cuenta publicitaria está deshabilitada por Meta.', bloquea: true },
  3: { codigo: 'pago_pendiente', mensaje: 'Problema de pago: la cuenta tiene un saldo sin liquidar y no puede entregar anuncios.', bloquea: true },
  7: { codigo: 'revision_riesgo', mensaje: 'La cuenta está en revisión de riesgo de Meta.', bloquea: true },
  8: { codigo: 'liquidacion_pendiente', mensaje: 'Liquidación pendiente en la cuenta.', bloquea: true },
  9: { codigo: 'periodo_gracia', mensaje: 'La cuenta está en período de gracia por un problema de pago.', bloquea: true },
  100: { codigo: 'cierre_pendiente', mensaje: 'La cuenta tiene un cierre pendiente.', bloquea: true },
  101: { codigo: 'cerrada', mensaje: 'La cuenta publicitaria está cerrada.', bloquea: true },
  201: { codigo: 'cualquier_activa', mensaje: 'Cuenta activa.', bloquea: false },
  202: { codigo: 'cualquier_cerrada', mensaje: 'La cuenta está cerrada.', bloquea: true },
};

function clasificarError(e: any) {
  const code = e?.code, sub = e?.error_subcode, msg = e?.message || 'Error de Meta';
  let tipo = 'error_meta';
  let explicacion = msg;
  if (code === 190) { tipo = 'token_invalido'; explicacion = 'El token de Meta es inválido, expiró o fue revocado. Hay que generar uno nuevo.'; }
  else if (code === 200 || code === 10 || code === 299) { tipo = 'permisos_insuficientes'; explicacion = 'El token no tiene permisos suficientes sobre esta cuenta (ads_read / ads_management).'; }
  else if (code === 100 && /does not exist|cannot be loaded|missing permissions/i.test(msg)) { tipo = 'cuenta_no_accesible'; explicacion = 'La cuenta no existe o el token no tiene acceso a ella.'; }
  else if (code === 17 || code === 4 || code === 32 || code === 613) { tipo = 'limite_de_uso'; explicacion = 'Meta limitó temporalmente las llamadas (rate limit).'; }
  else if (code === 2635 || sub === 1359188 || /payment|billing|funding/i.test(msg)) { tipo = 'problema_de_pago'; explicacion = 'Meta rechazó la operación por un problema de facturación o pago.'; }
  return { tipo, explicacion, meta: { http_code: code ?? null, subcode: sub ?? null, mensaje: msg, fbtrace_id: e?.fbtrace_id ?? null } };
}

async function g(ruta: string, token: string) {
  const r = await fetch(`${GRAPH}/${ruta}`, { headers: { Authorization: `Bearer ${token}` } });
  const d = await r.json().catch(() => ({}));
  return { ok: r.ok && !d?.error, http: r.status, d };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const token = Deno.env.get('META_ADS_TOKEN') || Deno.env.get('FB_ACCESS_TOKEN');
  const raw = Deno.env.get('META_AD_ACCOUNT_ID') || Deno.env.get('FB_AD_ACCOUNT_ID');
  const cuentaId = raw ? (raw.startsWith('act_') ? raw : `act_${raw}`) : null;
  const config = { token_configurado: !!token, cuenta_configurada: cuentaId, page_id_configurado: !!Deno.env.get('META_PAGE_ID') };
  if (!token || !cuentaId) {
    return json({ ok: false, problema: { tipo: 'sin_credenciales', explicacion: 'Faltan META_ADS_TOKEN y/o META_AD_ACCOUNT_ID en los secretos de Supabase.' }, config });
  }

  const cuenta = await g(`${cuentaId}?fields=id,name,account_status,disable_reason,currency,timezone_name,amount_spent,balance,spend_cap,business{id,name}`, token);
  if (!cuenta.ok) return json({ ok: false, problema: clasificarError(cuenta.d?.error), config, http_status: cuenta.http });

  const estado = ESTADO_CUENTA[cuenta.d.account_status] || { codigo: 'desconocido', mensaje: `Estado de cuenta ${cuenta.d.account_status}.`, bloquea: false };

  // Lecturas de objetos (solo conteos y estados, sin métricas personales)
  const [camp, sets, ads] = await Promise.all([
    g(`${cuentaId}/campaigns?fields=id,name,status,effective_status,objective,daily_budget&limit=100`, token),
    g(`${cuentaId}/adsets?fields=id,name,status,effective_status,campaign_id&limit=100`, token),
    g(`${cuentaId}/ads?fields=id,name,status,effective_status,adset_id,creative{id}&limit=100`, token),
  ]);
  const lectura = (x: { ok: boolean; d: any; http: number }) => (x.ok ? { ok: true, total: (x.d.data || []).length, hay_mas: !!x.d.paging?.next, datos: x.d.data || [] } : { ok: false, problema: clasificarError(x.d?.error), http_status: x.http });
  const campanas = lectura(camp), conjuntos = lectura(sets), anuncios = lectura(ads);
  const porEstado = (l: any) => l.ok ? (l.datos as any[]).reduce((a, x) => { a[x.effective_status || x.status || '—'] = (a[x.effective_status || x.status || '—'] || 0) + 1; return a; }, {} as Record<string, number>) : null;

  return json({
    ok: !estado.bloquea,
    config,
    cuenta: {
      id: cuenta.d.id, nombre: cuenta.d.name, moneda: cuenta.d.currency, zona_horaria: cuenta.d.timezone_name,
      estado: estado.codigo, estado_codigo_meta: cuenta.d.account_status, motivo_bloqueo_codigo: cuenta.d.disable_reason ?? null,
      gastado_total: cuenta.d.amount_spent ?? null, saldo: cuenta.d.balance ?? null, limite_gasto: cuenta.d.spend_cap ?? null,
      negocio: cuenta.d.business?.name ?? null,
    },
    problema: estado.bloquea ? { tipo: estado.codigo, explicacion: estado.mensaje, meta: { account_status: cuenta.d.account_status, disable_reason: cuenta.d.disable_reason ?? null } } : null,
    objetos: {
      campanas: { ...campanas, datos: undefined, por_estado: porEstado(campanas) },
      conjuntos: { ...conjuntos, datos: undefined, por_estado: porEstado(conjuntos) },
      anuncios: { ...anuncios, datos: undefined, por_estado: porEstado(anuncios) },
    },
    ids: {
      campanas: campanas.ok ? campanas.datos.map((c: any) => c.id) : [],
      conjuntos: conjuntos.ok ? conjuntos.datos.map((c: any) => c.id) : [],
      anuncios: anuncios.ok ? anuncios.datos.map((c: any) => c.id) : [],
    },
  });
});

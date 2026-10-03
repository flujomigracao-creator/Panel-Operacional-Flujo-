// Crea en Meta los públicos GUARDADOS (saved audiences) de adquisición definidos en publicos_definiciones.
// Un público guardado solo es una configuración de segmentación: no gasta nada y no toca campañas ni conjuntos existentes.
// POST { accion: 'verificar' | 'crear' }   (requiere sesión del panel; verify_jwt activo)
//   verificar: resuelve en Meta los IDs de segmentación y devuelve lo que se crearía. No escribe nada.
//   crear:     crea los públicos guardados que falten y marca la definición como creado_en_meta.
// La segmentación usa solo opciones propias de Meta (ubicación, idioma, edad y el comportamiento «Expats (Cuba)» si existe).
// Si Meta no ofrece esa opción en la cuenta, el público NO se crea (nunca se sustituye por otra segmentación en silencio).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const GRAPH = 'https://graph.facebook.com/v20.0';
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const PAIS_EXPAT: Record<string, string> = { CU: 'Cuba' };

async function graph(path: string, token: string, init?: RequestInit) {
  const r = await fetch(`${GRAPH}/${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d?.error) throw new Error([d?.error?.error_user_msg, d?.error?.message].filter(Boolean).join(' — ') || `Meta ${r.status}`);
  return d;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const token = Deno.env.get('META_ADS_TOKEN') || Deno.env.get('FB_ACCESS_TOKEN');
  const cuenta = Deno.env.get('META_AD_ACCOUNT_ID') || Deno.env.get('FB_AD_ACCOUNT_ID');
  if (!token || !cuenta) return json({ error: 'Faltan META_ADS_TOKEN / META_AD_ACCOUNT_ID en los secretos de Supabase.' }, 500);
  const act = cuenta.startsWith('act_') ? cuenta : `act_${cuenta}`;

  let body: any = {};
  try { body = await req.json(); } catch { /* sin cuerpo */ }
  const crear = body.accion === 'crear';

  // Con la sesión del usuario: el RLS limita las definiciones a su organización.
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
  });
  const { data: defs, error } = await db.from('publicos_definiciones').select('*').eq('tipo', 'adquisicion').in('estado', ['borrador', 'aprobado']).order('prioridad');
  if (error) return json({ error: error.message }, 500);
  if (!defs?.length) return json({ ok: true, mensaje: 'No hay públicos de adquisición pendientes.', publicos: [] });

  // Idioma español: IDs de locale de Meta.
  let locales: number[] = [];
  try {
    const l = await graph(`search?type=adlocale&q=Spanish&limit=20`, token);
    locales = (l.data || []).filter((x: any) => /^spanish/i.test(x.name)).map((x: any) => Number(x.key));
  } catch { /* se informa abajo */ }

  const resultados: any[] = [];
  for (const def of defs) {
    const nombrePais = PAIS_EXPAT[def.pais];
    const item: any = { codigo: def.codigo, nombre: def.nombre };
    try {
      if (!nombrePais) throw new Error('País sin opción de expatriados configurada.');
      const b = await graph(`search?type=adTargetingCategory&class=behaviors&q=${encodeURIComponent(`Expats (${nombrePais})`)}&limit=20`, token);
      const op = (b.data || []).find((x: any) => new RegExp(`expats?\\s*\\(${nombrePais}\\)`, 'i').test(x.name));
      if (!op) throw new Error(`Meta no ofrece «Expats (${nombrePais})» en esta cuenta; no se crea para no usar otra segmentación.`);
      if (!locales.length) throw new Error('No se pudo resolver el idioma español en Meta.');
      const targeting = {
        geo_locations: { countries: def.ubicacion?.paises || ['BR'] },
        age_min: def.edad_min, age_max: def.edad_max,
        locales,
        flexible_spec: [{ behaviors: [{ id: op.id, name: op.name }] }],
      };
      item.segmentacion = { comportamiento: op.name, tamano_aprox: op.audience_size_lower_bound ?? null, idiomas: locales.length };
      if (!crear) {
        item.estado = 'listo para crear';
      } else {
        const creado = await graph(`${act}/saved_audiences`, token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: `Flujo · ${def.nombre}`, targeting }),
        });
        await db.from('publicos_definiciones').update({ estado: 'creado_en_meta', meta_audience_id: String(creado.id) }).eq('id', def.id);
        item.estado = 'creado'; item.meta_audience_id = creado.id;
      }
    } catch (e) {
      item.estado = 'no creado'; item.motivo = e instanceof Error ? e.message : String(e);
    }
    resultados.push(item);
  }
  return json({ ok: true, modo: crear ? 'crear' : 'verificar', publicos: resultados });
});

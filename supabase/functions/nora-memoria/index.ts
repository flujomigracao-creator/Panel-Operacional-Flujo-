// Memoria vectorial de Nora (lecciones y ejemplos aprobados en `nora_aprendizajes`), con el modelo de
// embeddings incluido en Supabase (gte-small, 384 dimensiones): no necesita claves externas.
// POST { accion: 'buscar', texto, limite? } → { resultados: [{ tipo, leccion, similitud }] }
//   Antes de buscar, calcula los vectores que falten (lecciones nuevas o editadas).
// POST { accion: 'embeber' } → calcula los vectores pendientes y devuelve cuántos.
// Solo uso interno (n8n con la clave de servicio).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const modelo = new Supabase.ai.Session('gte-small');

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const vector = async (texto: string) =>
  (await modelo.run(texto.slice(0, 2000), { mean_pool: true, normalize: true })) as number[];

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const clave = (req.headers.get('apikey') || req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const esServicio = clave === serviceKey || (clave.length > 20 && (await fetch(`${url}/auth/v1/admin/users?per_page=1`, {
    headers: { apikey: clave, Authorization: `Bearer ${clave}` },
  })).ok);
  if (!esServicio) return json({ error: 'Solo para uso interno' }, 403);

  const admin = createClient(url, serviceKey);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  const { data: pendientes } = await admin
    .from('nora_aprendizajes')
    .select('id, leccion')
    .is('embedding', null)
    .neq('estado', 'descartada')
    .limit(body.accion === 'embeber' ? 200 : 20);
  let embebidos = 0;
  for (const p of pendientes || []) {
    try {
      const e = await vector(p.leccion);
      const { error } = await admin.from('nora_aprendizajes').update({ embedding: JSON.stringify(e) }).eq('id', p.id);
      if (!error) embebidos++;
    } catch (err) {
      console.error('embeber', p.id, err);
    }
  }
  if (body.accion === 'embeber') return json({ ok: true, embebidos });

  const texto = String(body.texto || '').trim();
  if (!texto) return json({ resultados: [], embebidos });
  const { data, error } = await admin.rpc('nora_buscar_memoria', {
    p_embedding: JSON.stringify(await vector(texto)),
    p_limite: Math.min(Number(body.limite) || 6, 12),
    p_similitud_min: 0.25,
  });
  if (error) return json({ resultados: [], error: error.message, embebidos });
  return json({ resultados: data || [], embebidos });
});

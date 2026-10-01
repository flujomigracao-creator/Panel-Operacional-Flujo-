// Generación de creativos con OpenAI (conceptos, prompt e imagen) → Storage → tabla `creatives`.
// POST { accion, ... } con la sesión del usuario (JWT). La clave OPENAI_API_KEY solo vive en este backend.
//   config      → { openai_configurado, modelo_imagen, modelo_texto }
//   conceptos   → conceptos publicitarios (registrados en creative_concepts)
//   prompt      → prompt de imagen para revisar/editar antes de generar
//   generar     → imagen nueva (v1)
//   regenerar   → versión nueva a partir de un creativo, cambiando UNA variable declarada; conserva el historial
//   subir       → imagen propia (sin OpenAI)
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { ORG_ID, crearCreativo, generarPrompt, proponerConceptos, modeloImagen, modeloTexto, openaiConfigurado } from '../_shared/creative_store.ts';
import { sanearError } from '../_shared/creative_logic.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const auth = req.headers.get('Authorization') || '';
  const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: { user: u } } = await user.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
  if (!u) return json({ error: 'No autenticado' }, 401);
  const { data: member } = await admin.from('organization_members').select('role').eq('user_id', u.id).eq('organization_id', ORG_ID).maybeSingle();
  if (!member) return json({ error: 'Sin acceso a la organización' }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  try {
    switch (body.accion) {
      case 'config':
        return json({ ok: true, openai_configurado: openaiConfigurado(), modelo_imagen: openaiConfigurado() ? await modeloImagen() : null, modelo_texto: openaiConfigurado() ? await modeloTexto() : null });
      case 'conceptos': return json(await proponerConceptos(admin, u.id, body));
      case 'prompt': return json(await generarPrompt(admin, u.id, body));
      case 'generar': return json(await crearCreativo(admin, u.id, body, 'generar'));
      case 'regenerar': return json(await crearCreativo(admin, u.id, body, 'regenerar'));
      case 'subir': return json(await crearCreativo(admin, u.id, body, 'subir'));
      default: return json({ ok: false, error: 'Acción desconocida' }, 400);
    }
  } catch (e) {
    return json({ ok: false, error: sanearError(e instanceof Error ? e.message : String(e)) }, 422);
  }
});

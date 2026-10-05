// Conocimiento de Nora desde el panel (con la sesión del usuario; todo filtrado por su organización).
// Vectores con el modelo incluido en Supabase (gte-small, 384 dimensiones): no necesita claves externas.
// POST { accion: 'embeber' }                      → calcula los vectores que falten (textos nuevos o editados).
// POST { accion: 'procesar_documento', id }       → parte el documento en fragmentos y calcula sus vectores.
// POST { accion: 'probar', texto, client_id? }    → qué conocimiento usaría Nora para ese mensaje y por qué.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const MODELO = 'gte-small';
const modelo = new Supabase.ai.Session(MODELO);
const vector = async (texto: string) =>
  (await modelo.run(texto.slice(0, 2000), { mean_pool: true, normalize: true })) as number[];

// Qué se vectoriza de cada fuente. Solo lo que Nora puede llegar a usar (no lo archivado ni descartado).
const FUENTES = [
  { tabla: 'nora_respuestas_aprobadas', campos: 'id, pregunta, respuesta, tramite', filtro: (q: any) => q.neq('estado', 'archivada'),
    texto: (r: any) => [r.tramite, r.pregunta, r.respuesta].filter(Boolean).join('\n') },
  { tabla: 'nora_casos', campos: 'id, tramite, pais, ciudad, problema, resumen, solucion, resultado', filtro: (q: any) => q.neq('estado', 'archivado'),
    texto: (r: any) => [r.tramite, r.pais, r.ciudad, r.problema, r.resumen, r.solucion, r.resultado].filter(Boolean).join('\n') },
  { tabla: 'nora_memorias', campos: 'id, contenido', filtro: (q: any) => q.eq('activa', true), texto: (r: any) => r.contenido },
  { tabla: 'nora_aprendizajes', campos: 'id, leccion', filtro: (q: any) => q.neq('estado', 'descartada'), texto: (r: any) => r.leccion, sinModelo: true },
];

// Fragmentos de ~1000 caracteres respetando párrafos; cada uno lleva el título para no perder el contexto.
function fragmentar(titulo: string, contenido: string): string[] {
  const parrafos = contenido.replace(/\r/g, '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const partes: string[] = [];
  let actual = '';
  for (const p of parrafos) {
    const trozos = p.length > 1200 ? p.match(/[\s\S]{1,1000}(\s|$)/g) || [p] : [p];
    for (const t of trozos) {
      if (actual && (actual.length + t.length) > 1000) { partes.push(actual); actual = ''; }
      actual = actual ? `${actual}\n\n${t.trim()}` : t.trim();
    }
  }
  if (actual) partes.push(actual);
  return partes.map((p) => `${titulo}\n\n${p}`);
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
  const { data: member } = await admin.from('organization_members').select('organization_id').eq('user_id', u.id).limit(1).maybeSingle();
  if (!member) return json({ error: 'Sin acceso a la organización' }, 403);
  const orgId: string = member.organization_id;

  let body: any;
  try { body = await req.json(); } catch { body = {}; }

  // ── Vectores pendientes ──────────────────────────────────────────────────────────
  if (body.accion === 'embeber') {
    const inicio = Date.now();
    const hechos: Record<string, number> = {};
    for (const f of FUENTES) {
      const { data } = await f.filtro(admin.from(f.tabla).select(f.campos).eq('organization_id', orgId).is('embedding', null)).limit(60);
      hechos[f.tabla] = 0;
      for (const r of data || []) {
        if (Date.now() - inicio > 40_000) break;
        const texto = f.texto(r);
        if (!texto?.trim()) continue;
        const patch: any = { embedding: JSON.stringify(await vector(texto)) };
        if (!f.sinModelo) patch.model = MODELO;
        const { error } = await admin.from(f.tabla).update(patch).eq('id', r.id).eq('organization_id', orgId);
        if (!error) hechos[f.tabla] += 1;
      }
    }
    // Documentos que quedaron pendientes (nuevos o editados): se reprocesan enteros.
    const { data: docs } = await admin.from('knowledge_documents').select('id').eq('organization_id', orgId).eq('procesamiento', 'pendiente').limit(3);
    const documentos: string[] = [];
    for (const d of docs || []) {
      if (Date.now() - inicio > 40_000) break;
      const r = await procesar(admin, orgId, d.id);
      if (r.ok) documentos.push(d.id);
    }
    return json({ ok: true, hechos, documentos: documentos.length });
  }

  // ── Documento → fragmentos + vectores ──────────────────────────────────────────────
  if (body.accion === 'procesar_documento') {
    if (!body.id) return json({ error: 'Falta el documento' }, 400);
    const r = await procesar(admin, orgId, String(body.id));
    return json(r, r.ok ? 200 : 400);
  }

  // ── ¿Qué usaría Nora? ──────────────────────────────────────────────────────────────
  if (body.accion === 'probar') {
    const texto = String(body.texto || '').trim();
    if (!texto) return json({ error: 'Escribe el mensaje del cliente' }, 400);
    const { data, error } = await admin.rpc('nora_rag_search', {
      query_embedding: JSON.stringify(await vector(texto)),
      match_organization_id: orgId,
      match_client_id: body.client_id || null,
      match_count: 8,
    });
    if (error) return json({ error: error.message }, 500);
    const { data: reglas } = await admin.from('nora_reglas').select('id, texto, prioridad').eq('organization_id', orgId).eq('activa', true);
    const orden: Record<string, number> = { critica: 0, importante: 1, normal: 2 };
    return json({
      ok: true,
      fuentes: data || [],
      reglas: (reglas || []).sort((a: any, b: any) => (orden[a.prioridad] ?? 2) - (orden[b.prioridad] ?? 2)),
    });
  }

  return json({ error: 'Acción desconocida' }, 400);
});

async function procesar(admin: any, orgId: string, id: string) {
  const { data: doc } = await admin.from('knowledge_documents').select('id, title, content').eq('id', id).eq('organization_id', orgId).maybeSingle();
  if (!doc) return { ok: false, error: 'Documento no encontrado' };
  await admin.from('knowledge_documents').update({ procesamiento: 'procesando', procesamiento_error: null }).eq('id', id);
  try {
    const partes = fragmentar(doc.title || 'Documento', doc.content || '');
    if (!partes.length) throw new Error('El documento no tiene texto');
    await admin.from('knowledge_chunks').delete().eq('knowledge_document_id', id);
    for (let i = 0; i < partes.length; i++) {
      const { error } = await admin.from('knowledge_chunks').insert({
        organization_id: orgId, knowledge_document_id: id, chunk_index: i, content: partes[i],
        embedding: JSON.stringify(await vector(partes[i])), model: MODELO,
      });
      if (error) throw new Error(error.message);
    }
    await admin.from('knowledge_documents').update({ procesamiento: 'procesado', fragmentos: partes.length, procesado_at: new Date().toISOString() }).eq('id', id);
    return { ok: true, fragmentos: partes.length };
  } catch (err) {
    const msg = String((err as Error)?.message || err).slice(0, 300);
    await admin.from('knowledge_documents').update({ procesamiento: 'error', procesamiento_error: msg }).eq('id', id);
    return { ok: false, error: msg };
  }
}

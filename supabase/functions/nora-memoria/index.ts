// Memoria de Nora para el motor (n8n con la clave de servicio), con el modelo de embeddings incluido en
// Supabase (gte-small, 384 dimensiones): no necesita claves externas.
// POST { accion: 'buscar', texto, limite?, kommo_lead_id?, organization_id?, client_id? }
//   → { resultados: [{ tipo, leccion, similitud, fuente, id }], rag, embebidos }
//   Con la organización (explícita o la del lead) busca en todo el conocimiento administrado desde el panel,
//   en el orden de prioridad de Nora (nora_rag_search), y deja registrado qué usó en nora_fuentes_usadas.
//   Sin organización, busca solo en las lecciones aprobadas (comportamiento anterior).
//   Antes de buscar, calcula los vectores que falten (textos nuevos o editados).
// POST { accion: 'embeber' | 'embeber_rag' } → calcula los vectores pendientes.
// POST { accion: 'guardar_memoria' | 'guardar_respuesta_aprobada' | 'guardar_caso', organization_id, ... }
//   Las respuestas y los casos nuevos entran como borrador / pendiente: se aprueban en el panel.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const MODELO = 'gte-small';
const modelo = new Supabase.ai.Session(MODELO);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const vector = async (texto: string) =>
  (await modelo.run(texto.slice(0, 2000), { mean_pool: true, normalize: true })) as number[];

const embedPending = async (admin: any, table: string, id: string, text: string, conModelo = true) => {
  const e = await vector(text);
  const patch: any = { embedding: JSON.stringify(e) };
  if (conModelo) patch.model = MODELO;
  const { error } = await admin.from(table).update(patch).eq('id', id);
  if (error) throw error;
};

const embedPendingTable = async (admin: any, table: string, select: string, textFn: (row: any) => string, limit = 100, filtro?: (q: any) => any) => {
  let q = admin.from(table).select(select).is('embedding', null);
  if (filtro) q = filtro(q);
  const { data, error } = await q.limit(limit);
  if (error) throw error;
  let count = 0;
  for (const row of data || []) {
    const texto = textFn(row);
    if (!texto?.trim()) continue;
    try { await embedPending(admin, table, row.id, texto); count++; } catch (e) { console.error(table, row.id, e); }
  }
  return count;
};

const textoCaso = (r: any) => [r.tramite, r.pais, r.ciudad, r.problema, r.resumen, r.solucion, r.resultado].filter(Boolean).join('\n');

const embeberRag = async (admin: any, limit: number) => ({
  answers: await embedPendingTable(admin, 'nora_respuestas_aprobadas', 'id, pregunta, respuesta, tramite',
    (r) => [r.tramite, r.pregunta, r.respuesta].filter(Boolean).join('\n'), limit, (q) => q.neq('estado', 'archivada')),
  cases: await embedPendingTable(admin, 'nora_casos', 'id, tramite, pais, ciudad, problema, resumen, solucion, resultado',
    textoCaso, limit, (q) => q.neq('estado', 'archivado')),
  memories: await embedPendingTable(admin, 'nora_memorias', 'id, contenido', (r) => r.contenido, limit, (q) => q.eq('activa', true)),
});

// Cómo le llega cada fuente al prompt (mismo formato de siempre: tipo 'leccion' | 'ejemplo' + texto).
const PARA_PROMPT: Record<string, (r: any) => { tipo: string; leccion: string }> = {
  document: (r) => ({ tipo: 'leccion', leccion: `Información oficial de FLUJO Migração (${r.metadata?.documento || 'documento'}): ${r.content}` }),
  approved_answer: (r) => ({ tipo: 'ejemplo', leccion: r.content }),
  case: (r) => ({ tipo: 'leccion', leccion: r.content }),
  lesson: (r) => ({ tipo: r.metadata?.tipo === 'ejemplo' ? 'ejemplo' : 'leccion', leccion: r.content }),
  memory: (r) => ({ tipo: 'leccion', leccion: `Dato de este cliente (solo vale para él): ${r.content}` }),
};

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
      await embedPending(admin, 'nora_aprendizajes', p.id, p.leccion, false);
      embebidos++;
    } catch (err) {
      console.error('embeber', p.id, err);
    }
  }
  if (body.accion === 'embeber' || body.accion === 'embeber_rag') {
    const extra = await embeberRag(admin, 100);
    return json({ ok: true, embebidos, extra });
  }

  // Organización: la que manda n8n o la del lead. Nunca una fija.
  let orgId: string | null = body.organization_id || null;
  let clientId: string | null = body.client_id || null;
  const leadId = Number(body.kommo_lead_id) || null;
  if (leadId && (!orgId || !clientId)) {
    const { data: lead } = await admin.from('comercial_leads').select('organization_id, client_id').eq('kommo_lead_id', leadId).maybeSingle();
    orgId = orgId || lead?.organization_id || null;
    clientId = clientId || lead?.client_id || null;
  }

  if (body.accion === 'guardar_memoria' || body.accion === 'guardar_respuesta_aprobada' || body.accion === 'guardar_caso') {
    if (!orgId) return json({ error: 'Falta organization_id (o kommo_lead_id)' }, 400);
  }

  if (body.accion === 'guardar_memoria') {
    const contenido = String(body.contenido || '').trim();
    if (!contenido) return json({ error: 'Falta contenido' }, 400);
    if (!clientId) return json({ error: 'Una memoria siempre pertenece a un cliente (client_id)' }, 400);
    const { data, error } = await admin.from('nora_memorias').insert({
      organization_id: orgId,
      client_id: clientId,
      conversation_id: body.conversation_id || null,
      tipo: body.tipo || 'conversation_summary',
      contenido,
      metadata: body.metadata || {},
      importancia: Math.min(Math.max(Number(body.importancia) || 3, 1), 5),
    }).select('id').single();
    if (error) return json({ error: error.message }, 400);
    await embedPending(admin, 'nora_memorias', data.id, contenido);
    return json({ ok: true, id: data.id });
  }

  if (body.accion === 'guardar_respuesta_aprobada') {
    const pregunta = String(body.pregunta || '').trim();
    const respuesta = String(body.respuesta || '').trim();
    if (!pregunta || !respuesta) return json({ error: 'Falta pregunta o respuesta' }, 400);
    const { data, error } = await admin.from('nora_respuestas_aprobadas').insert({
      organization_id: orgId, pregunta, respuesta,
      tramite: body.tramite || null, idioma: body.idioma || 'es',
      tono: body.tono || 'humano', etiquetas: body.etiquetas || [],
      estado: 'borrador', fuente: 'automatica',
    }).select('id').single();
    if (error) return json({ error: error.message }, 400);
    await embedPending(admin, 'nora_respuestas_aprobadas', data.id, [body.tramite, pregunta, respuesta].filter(Boolean).join('\n'));
    return json({ ok: true, id: data.id, estado: 'borrador' });
  }

  if (body.accion === 'guardar_caso') {
    const resumen = String(body.resumen || '').trim();
    if (!resumen) return json({ error: 'Falta resumen' }, 400);
    const fila = {
      organization_id: orgId, client_id: clientId,
      kommo_lead_id: leadId, tramite: body.tramite || null,
      pais: body.pais || null, ciudad: body.ciudad || null, problema: body.problema || null, resumen,
      solucion: body.solucion || null, resultado: body.resultado || null,
      estado: 'pendiente', fuente: 'automatica',
    };
    const { data, error } = await admin.from('nora_casos').insert(fila).select('id').single();
    if (error) return json({ error: error.message }, 400);
    await embedPending(admin, 'nora_casos', data.id, textoCaso(fila));
    return json({ ok: true, id: data.id, estado: 'pendiente' });
  }

  const texto = String(body.texto || '').trim();
  if (!texto) return json({ resultados: [], embebidos, rag: [] });
  const limite = Math.min(Number(body.limite) || 6, 12);
  const qv = JSON.stringify(await vector(texto));

  if (orgId) {
    // Lo aprobado o editado recién en el panel entra en la próxima respuesta.
    try { await embeberRag(admin, 10); } catch (e) { console.error('embeber_rag', e); }
    const { data: rag, error: ragError } = await admin.rpc('nora_rag_search', {
      query_embedding: qv, match_organization_id: orgId, match_client_id: clientId, match_count: limite,
    });
    if (!ragError) {
      const resultados = (rag || []).map((r: any) => ({
        ...(PARA_PROMPT[r.source_type] || PARA_PROMPT.lesson)(r),
        similitud: r.similarity, fuente: r.source_type, id: r.source_id,
      }));
      await admin.from('nora_fuentes_usadas').insert({
        organization_id: orgId, kommo_lead_id: leadId, client_id: clientId, consulta: texto.slice(0, 1000),
        fuentes: (rag || []).map((r: any) => ({
          tipo: r.source_type, id: r.source_id, similitud: Math.round(r.similarity * 1000) / 1000,
          prioridad: r.priority, extracto: String(r.content || '').slice(0, 240), metadata: r.metadata,
        })),
      });
      return json({ resultados, rag: rag || [], embebidos });
    }
    console.error('nora_rag_search', ragError.message);
  }

  // Sin organización (o si falló la búsqueda completa): solo lecciones aprobadas, como antes.
  const { data, error } = await admin.rpc('nora_buscar_memoria', { p_embedding: qv, p_limite: limite, p_similitud_min: 0.25 });
  if (error) return json({ resultados: [], error: error.message, embebidos, rag: [] });
  return json({ resultados: data || [], rag: [], embebidos });
});

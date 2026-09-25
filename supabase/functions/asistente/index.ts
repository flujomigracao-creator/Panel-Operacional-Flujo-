// Asistente IA del panel operacional de FLUJO Migração.
// POST { accion: 'mensaje', mensaje, conversation_id?, contexto?: { vista, client_id } }
//      { accion: 'ejecutar', proposal_id, filas? }   → ejecuta una propuesta confirmada
//      { accion: 'cancelar', proposal_id }
// La clave de Groq vive solo aquí (secreto GROQ_API_KEY), nunca en el navegador.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { ORG_ID, TOOL_DEFS, runTool, type Ctx } from './tools.ts';
import { executeProposal } from './handlers.ts';

const MODEL = 'openai/gpt-oss-120b';
const MAX_VUELTAS = 6;
const HISTORIAL = 16;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SYSTEM = (contexto: any, hoy: string) => `Eres el asistente de operaciones de FLUJO Migração, una oficina de trámites migratorios en Brasil que maneja una sola persona (el dueño). Le hablas a él, en español, directo y breve.

Cómo trabajas:
- Antes de afirmar cualquier dato del negocio, consúltalo con las herramientas. Nunca inventes clientes, cifras, etapas ni documentos.
- Cuando menciones un cliente, escribe [VIEW_CLIENT:<uuid>:<nombre>] para que aparezca un botón que abre su ficha.
- Para CAMBIAR cualquier cosa usa solo las herramientas proponer_*: crean una propuesta que el dueño confirma con un botón. Nunca digas que algo ya se hizo; di que queda listo para confirmar.
- Si te piden sacar datos de la conversación de un cliente, usa extraer_datos_conversacion.
- Si te piden redactar un mensaje para un cliente, escríbelo en el idioma del cliente (mira la conversación), cordial y corto; no prometas plazos ni precios que no estén registrados.
- Responde en formato simple: listas cortas con guiones, **negritas** para lo importante. Sin tablas largas.
- Kommo es el único canal de atención: los mensajes a clientes se envían desde Kommo.

Hoy es ${hoy}. Pantalla actual del dueño: ${contexto?.vista || 'desconocida'}.${contexto?.client_id ? ` Está viendo la ficha del cliente con id ${contexto.client_id}: si pregunta "este cliente" se refiere a él.` : ''}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const auth = req.headers.get('Authorization') || '';
  const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // 1. Usuario autenticado y miembro de la organización
  const { data: { user: u } } = await user.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
  if (!u) return json({ error: 'No autenticado' }, 401);
  const { data: member } = await admin.from('organization_members').select('role').eq('user_id', u.id).eq('organization_id', ORG_ID).maybeSingle();
  if (!member) return json({ error: 'Sin acceso a la organización' }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  // 2. Ejecutar / cancelar propuestas (sin IA)
  if (body.accion === 'ejecutar' || body.accion === 'cancelar') {
    const { data: p } = await admin.from('ai_proposals').select('*').eq('id', body.proposal_id).eq('user_id', u.id).maybeSingle();
    if (!p) return json({ error: 'Propuesta no encontrada' }, 404);
    if (p.status !== 'pending') return json({ error: 'Esta propuesta ya fue ' + (p.status === 'executed' ? 'ejecutada' : p.status === 'cancelled' ? 'cancelada' : 'procesada'), propuesta: p }, 409);

    if (body.accion === 'cancelar') {
      const { data } = await admin.from('ai_proposals').update({ status: 'cancelled', executed_at: new Date().toISOString() }).eq('id', p.id).select().single();
      return json({ ok: true, propuesta: data });
    }
    try {
      const result = await executeProposal(admin, u.id, p, { filas: body.filas });
      const { data } = await admin.from('ai_proposals').update({ status: 'executed', result, executed_at: new Date().toISOString() }).eq('id', p.id).select().single();
      await admin.from('automation_runs').insert({ organization_id: ORG_ID, workflow: 'asistente', ref: p.tipo, ok: true, message: p.resumen, details: { proposal_id: p.id, result } });
      return json({ ok: true, propuesta: data });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const { data } = await admin.from('ai_proposals').update({ status: 'failed', result: { error: msg }, executed_at: new Date().toISOString() }).eq('id', p.id).select().single();
      await admin.from('automation_runs').insert({ organization_id: ORG_ID, workflow: 'asistente', ref: p.tipo, ok: false, message: msg, details: { proposal_id: p.id } });
      return json({ ok: false, error: msg, propuesta: data }, 422);
    }
  }

  if (body.accion !== 'mensaje' || !String(body.mensaje || '').trim()) return json({ error: 'Falta el mensaje' }, 400);

  const groqKey = Deno.env.get('GROQ_API_KEY');
  if (!groqKey) return json({ error: 'Falta configurar el secreto GROQ_API_KEY en Supabase (Edge Functions → Secrets).' }, 500);
  const groq = async (payload: Record<string, unknown>) => {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    if (!r.ok) throw new Error('Groq ' + r.status + ': ' + (await r.text()).slice(0, 300));
    return await r.json();
  };

  // 3. Conversación
  const contexto = body.contexto || {};
  let conversationId: string = body.conversation_id;
  if (conversationId) {
    const { data: c } = await admin.from('ai_conversations').select('id').eq('id', conversationId).eq('user_id', u.id).maybeSingle();
    if (!c) conversationId = '';
  }
  if (!conversationId) {
    const { data: c, error } = await admin.from('ai_conversations').insert({
      organization_id: ORG_ID, user_id: u.id, client_id: contexto.client_id || null,
      title: String(body.mensaje).slice(0, 80), context: contexto,
    }).select('id').single();
    if (error) return json({ error: error.message }, 500);
    conversationId = c.id;
  }

  const { data: prev } = await admin.from('ai_messages').select('role, content').eq('ai_conversation_id', conversationId).order('created_at', { ascending: false }).limit(HISTORIAL);
  const hoy = new Date().toLocaleDateString('es', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const messages: any[] = [
    { role: 'system', content: SYSTEM(contexto, hoy) },
    ...(prev || []).reverse().map((m: any) => ({ role: m.role, content: m.content })),
    { role: 'user', content: String(body.mensaje) },
  ];
  await admin.from('ai_messages').insert({ organization_id: ORG_ID, ai_conversation_id: conversationId, role: 'user', content: String(body.mensaje) });

  // 4. Ciclo de herramientas
  const ctx: Ctx = { user, admin, userId: u.id, conversationId, groq, proposals: [] };
  const usadas: { name: string; args: unknown }[] = [];
  let respuesta = '';
  let tokens = 0;
  try {
    for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
      const res = await groq({ model: MODEL, temperature: 0.2, messages, tools: TOOL_DEFS, tool_choice: 'auto' });
      tokens += res.usage?.total_tokens || 0;
      const msg = res.choices?.[0]?.message || {};
      const calls = msg.tool_calls || [];
      if (!calls.length) { respuesta = msg.content || ''; break; }
      messages.push({ role: 'assistant', content: msg.content || '', tool_calls: calls });
      for (const call of calls) {
        let args: any = {};
        try { args = JSON.parse(call.function.arguments || '{}'); } catch { /* args vacíos */ }
        usadas.push({ name: call.function.name, args });
        let out: string;
        try { out = await runTool(ctx, call.function.name, args); }
        catch (e) { out = JSON.stringify({ error: e instanceof Error ? e.message : String(e) }); }
        messages.push({ role: 'tool', tool_call_id: call.id, content: out });
      }
    }
    if (!respuesta) respuesta = ctx.proposals.length
      ? 'Dejé las acciones listas para que las confirmes.'
      : 'No pude terminar la consulta en esta vuelta. ¿Puedes precisar un poco más?';
  } catch (e) {
    respuesta = 'Hubo un problema al consultar la IA: ' + (e instanceof Error ? e.message : String(e));
  }

  await admin.from('ai_messages').insert({
    organization_id: ORG_ID, ai_conversation_id: conversationId, role: 'assistant', content: respuesta, model: MODEL, tokens,
    tool_calls: usadas.length ? usadas : null, proposal_ids: ctx.proposals.map(p => p.id),
  });
  await admin.from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);

  return json({ conversation_id: conversationId, respuesta, propuestas: ctx.proposals, herramientas: usadas.map(x => x.name) });
});

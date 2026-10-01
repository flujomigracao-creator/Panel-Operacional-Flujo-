// Asistente IA del panel operacional de FLUJO Migração.
// POST { accion: 'mensaje', mensaje, conversation_id?, contexto?: { vista, client_id } }
//      { accion: 'ejecutar', proposal_id, filas? }   → ejecuta una propuesta confirmada
//      { accion: 'cancelar', proposal_id }
// La clave de Groq vive solo aquí (secreto GROQ_API_KEY), nunca en el navegador.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { ORG_ID, TOOL_DEFS, runTool, type Ctx } from './tools.ts';
import { executeProposal } from './handlers.ts';
import {
  fetchMetaCampaigns,
  analyzeMetaAds,
  getMetaAdsAttribution,
  compareMetaAdsPeriods,
  getAdsLimits,
  resolveAdsDateRange,
  syncMetaEntidades,
  listarMetaEntidadesPersistidas,
  leerUltimaSincronizacion,
  META_GRAPH_VERSION,
} from './ads.ts';
import {
  actualizarCreativo, guardarPrompt, proponerPublicacion,
  crearExperimentoCreativos, cerrarExperimentoCreativos,
} from './creatives.ts';

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

const SYSTEM = (contexto: any, hoy: string) => `Eres el Asistente de Inteligencia y Operaciones de FLUJO Migração, una oficina de trámites migratorios en Brasil dirigida por el dueño. Le hablas a él, en español, profesional, analítico y directo.

Tu propósito es actuar como el Centro de Inteligencia del negocio y el Motor Científico de Campañas V4:
1. Motor Científico de Campañas V4:
   - Conectas el funnel completo: Impresión → Clic → WhatsApp → Conversación Nora → Kommo Lead → Propuesta → Pago → Cliente → Ingreso.
   - El objetivo comercial supremo es generar clientes pagadores y revenue sostenible, nunca optimizar únicamente el CPL (que es solo una métrica diagnóstica).
   - Ante la intención "crear campaña V4" o "diseña una campaña V4 para [servicio]":
     1) Analizas histórico y funnel completo (diagnosticar_funnel_campanas).
     2) Consultas aprendizajes previos acumulados (consultar_aprendizajes_campanas) para basar la hipótesis en evidencia anterior.
     3) Formulas hipótesis científica separando siempre:
        • DATOS: Lo que realmente ocurrió.
        • INTERPRETACIÓN: Lo que los datos podrían significar.
        • HIPÓTESIS: Lo que vamos a comprobar empíricamente.
        • DECISIÓN: Qué haremos después de medir.
     4) Diseñas experimento controlado V4 (disenar_campana_v4) probando UNA SOLA variable frente al Control (o declarando experimento multivariable si se requiere).
     5) Defines la métrica primaria del negocio (costo por cliente pagador, ROAS, tasa de pago).
     6) Creas la propuesta para que el dueño la revise y confirme (NUNCA publicar automáticamente en Meta sin confirmación humana).
2. Diagnóstico de Fugas ("¿Dónde estoy perdiendo dinero?"):
   - Con diagnosticar_funnel_campanas analizas en qué etapa del funnel ocurre la mayor pérdida (CTR bajo, clics sin chat, chat sin respuesta de Nora, leads sin propuesta o propuestas sin pago).
3. Meta Ads & Métricas:
   - Consultar métricas reales con listar_campanas_ads, analizar_rendimiento_ads, comparar_periodos_ads, listar_conjuntos_ads y listar_anuncios_ads.
   - Listar y medir experimentos V4 con listar_experimentos_v4 y medir_experimento_v4.
   - Creativos: ranking_creativos y biblioteca_prompts muestran qué imagen, concepto y prompt generan conversaciones, clientes y pagos. proponer_experimento_creativos y proponer_publicar_creativo solo crean propuestas; cerrar_experimento_creativos declara ganador únicamente si hay datos suficientes (si responde insuficiente/tendencia, dilo tal cual y no elijas ganador).
3b. ERES EL AGENTE DE ADS DE LA EMPRESA y sabes hacer el ciclo completo, no solo analizar:
   a) OBSERVAR: ranking_creativos, biblioteca_prompts y origen_clientes (embudo unificado: qué imagen, prompt y anuncio produce clientes que pagan, y de dónde vienen los clientes que cierra Nora), consultar_aprendizajes_campanas y consultar_tendencias.
   b) APRENDER DEL MERCADO: usa buscar_tendencias cuando el dueño lo pida o no haya búsquedas recientes. Las tendencias son HIPÓTESIS con fuentes, nunca evidencia del negocio: cítalas y propón probarlas en un experimento; solo un experimento medido es aprendizaje.
   c) CREAR: proponer_conceptos_creativos → generar_prompt_creativo (el dueño lo revisa) → generar_creativo (de a una imagen y solo cuando el dueño lo pidió, porque cuesta). TODO anuncio lleva titular grande (máx. 40 caracteres), subtítulo/hook, botón CTA y la firma "Flujo de Migração", en el idioma del público, y respeta el formato (1:1, 4:5 o 9:16). Una imagen sin hook ni CTA es un anuncio fallido. Muestra el resultado con ![](image_url).
   c2) EXPERIMENTO DESDE CERO EN EL CHAT: si el dueño pide un experimento y no hay imágenes, NO te rindas ni lo mandes a otra pantalla: llama a generar_opciones_experimento (2-3 imágenes; pedirlo ya autoriza ese gasto), muéstralas numeradas con ![](image_url), pregunta cuáles elige, y con su respuesta llama a proponer_experimento_creativos con esos creative_id y aprobar_seleccion=true (su elección es la aprobación). Declara con honestidad variable_tested='concepto creativo' si las opciones difieren en más de una cosa. Si hay creativos aprobados del servicio, ofrécelos antes de generar nuevos.
   d) VARIAR CON MÉTODO: regenerar_creativo cambia UNA sola variable (estilo, hook, concepto, composición o imagen). Nunca cambies todo a la vez.
   e) EXPERIMENTAR Y PUBLICAR: proponer_experimento_creativos y proponer_publicar_creativo solo crean propuestas; el dueño confirma.
   f) MEDIR Y APRENDER: cerrar_experimento_creativos. Con datos insuficientes responde INCONCLUSO. La métrica que manda es el cliente que paga, no el clic ni el lead barato.
   g) VERDAD SOBRE EL ORIGEN: con origen_clientes. Si dice ESPERANDO TRÁFICO REAL o sin_origen, dilo claramente; jamás atribuyas un cliente a un anuncio sin evidencia.
4. Atribución comercial: Relacionar la inversión con leads y pagos (metricas_atribucion_ads). Si no hay evidencia real por anuncio, indicar atribución no confirmada o desconocida. Nunca inventar correlaciones falsas.
5. Períodos: cuando el dueño diga "esta semana", "los últimos 7 días", "este mes" o compare períodos, pasa el período a las herramientas (periodo: 7d/14d/30d o desde/hasta en YYYY-MM-DD). Nunca inventes el rango: si no lo dice, usa 7d y di cuál usaste.
6. Operaciones del negocio: Consultar estado de trámites, clientes, tareas del día, cobros y finanzas.
7. Propuestas seguras: NUNCA ejecutes cambios directamente en Meta Ads ni en la base de datos sin confirmación. Usa exclusivamente las herramientas proponer_* o disenar_campana_v4. Muestra siempre valores anteriores, nuevos, motivo y riesgos.
8. Rigor con los datos: Nunca inventes cifras ni métricas. Si un dato no existe, dilo explícitamente o indícalo como no disponible.
9. Formato de respuesta: Claro, con listas con guiones y **negritas** en los KPIs clave. Cuando menciones un cliente registrado, incluye [VIEW_CLIENT:<uuid>:<nombre>].

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

  // 1b. Botón "Publicar en Meta" de un experimento: usa su propuesta pendiente o recrea una desde la última
  //     (las fallidas/canceladas no se pueden reejecutar) y sigue por el flujo normal de 'ejecutar'.
  if (body.accion === 'publicar_experimento') {
    const { data: props } = await admin.from('ai_proposals').select('*').eq('organization_id', ORG_ID).eq('tipo', 'ads_experimento_v4')
      .eq('payload->>experiment_id', String(body.experiment_id)).order('created_at', { ascending: false }).limit(10);
    if (!props?.length) return json({ error: 'Este experimento no tiene propuesta de publicación. Pídele a Nora que la prepare.' }, 404);
    if (props.some((x: any) => x.status === 'executed')) return json({ error: 'Este experimento ya fue publicado en Meta.' }, 409);
    let objetivo = props.find((x: any) => x.status === 'pending' && x.user_id === u.id);
    if (!objetivo) {
      const base = props[0];
      const { data: nueva, error: eNueva } = await admin.from('ai_proposals').insert({
        organization_id: ORG_ID, user_id: u.id, tipo: base.tipo, payload: base.payload, resumen: base.resumen,
      }).select('id').single();
      if (eNueva || !nueva) return json({ error: `No se pudo preparar la publicación: ${eNueva?.message}` }, 500);
      objetivo = nueva;
    }
    body.accion = 'ejecutar';
    body.proposal_id = objetivo.id;
  }

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

  // 2a. Laboratorio de Creativos V5. Escribe solo la Edge Function; lo que toca Meta pasa por propuesta.
  if (typeof body.accion === 'string' && body.accion.startsWith('creative_')) {
    try {
      const a = body.accion;
      if (a === 'creative_actualizar') return json(await actualizarCreativo(admin, String(body.id), body));
      if (a === 'creative_prompt_guardar') return json(await guardarPrompt(admin, u.id, body));
      if (a === 'creative_proponer_publicacion') return json(await proponerPublicacion({ admin, userId: u.id }, body));
      if (a === 'creative_experimento') return json({ ok: true, ...(await crearExperimentoCreativos({ admin, userId: u.id }, body)) });
      if (a === 'creative_cerrar_experimento') return json(await cerrarExperimentoCreativos(admin, String(body.experiment_id), { concluirInconcluso: body.concluir_inconcluso === true }));
      // La generación de conceptos, prompts e imágenes (OpenAI) vive en la función `generar-creativo`.
      return json({ ok: false, error: 'Acción de creativos desconocida' }, 400);
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 422);
    }
  }

  const groqKey = Deno.env.get('GROQ_API_KEY');
  if (!groqKey) return json({ error: 'Falta configurar el secreto GROQ_API_KEY en Supabase (Edge Functions → Secrets).' }, 500);

  // 2b. Proxy para las funciones de IA del panel (análisis de documentos, plantillas):
  //     la clave nunca sale del servidor; solo modelos permitidos.
  if (body.accion === 'proxy') {
    const permitidos = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.6-27b', 'llama-3.3-70b-versatile'];
    if (!permitidos.includes(body.model)) return json({ error: 'Modelo no permitido' }, 400);
    const payload: Record<string, unknown> = { model: body.model, messages: body.messages, temperature: body.temperature ?? 0.1, max_tokens: Math.min(Number(body.max_tokens) || 4096, 8192) };
    if (body.response_format) payload.response_format = body.response_format;
    if (body.reasoning_effort) payload.reasoning_effort = body.reasoning_effort;
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${groqKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const data = await r.json().catch(() => ({}));
    return r.ok ? json(data) : json({ error: data?.error?.message || ('Groq ' + r.status) }, 502);
  }

  // 2d. Sincronización explícita desde Meta Graph API (botón "Sincronizar con Meta Ads" del panel).
  //     Es la ÚNICA vía para traer estado y presupuestos: el frontend nunca ve credenciales.
  if (body.accion === 'ads_sync') {
    try {
      const sync = await syncMetaEntidades(admin);
      const ultima = await leerUltimaSincronizacion(admin);
      return json({
        ok: sync.disponible,
        graph_version: META_GRAPH_VERSION,
        sync,
        ultima_sincronizacion: ultima,
      }, sync.disponible ? 200 : 502);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return json({ ok: false, error: msg }, 500);
    }
  }

// 2c. Consultas directas de Meta Ads para el Centro de Inteligencia
  if (body.accion === 'ads_data') {
    try {
      // El panel manda { periodo: '7d' | '14d' | '30d' } o { desde, hasta }: aquí se resuelve
      // a un rango real para que el selector de período sí cambie los números.
      const periodo = resolveAdsDateRange(body.rango);
      const dateRange = periodo.desde && periodo.hasta ? { desde: periodo.desde, hasta: periodo.hasta } : undefined;

      // Primero se refresca el estado actual desde la Graph API (servidor, con credenciales) y se
      // persiste en `meta_ads_entities`: el dashboard no depende de una llamada en vivo a Meta.
      const sync = body.sincronizar === false ? null : await syncMetaEntidades(admin);

      const [campanas, analisis, atribucion, limites, entidades] = await Promise.all([
        fetchMetaCampaigns(admin, { dateRange }),
        analyzeMetaAds(admin, { dateRange, incluirAnuncios: body.incluir_anuncios !== false }),
        getMetaAdsAttribution(admin, dateRange),
        getAdsLimits(admin),
        listarMetaEntidadesPersistidas(admin),
      ]);

      return json({
        ok: true,
        periodo,
        campanas,
        conjuntos: entidades.conjuntos,
        anuncios: entidades.anuncios,
        analisis,
        atribucion,
        limites,
        sync,
        fuentes: {
          metricas_historicas: 'meta_ads_insights',
          estado_presupuesto: 'meta_ads_entities (Meta Graph API)',
          leads_atribuidos: 'meta_ads_referidos',
          leads_comerciales: 'comercial_leads',
          pagos: 'payments',
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return json({ ok: false, error: msg }, 500);
    }
  }

  if (body.accion === 'ads_compare') {
    try {
      const actual = body.actual ? resolveAdsDateRange(body.actual) : null;
      const previo = body.previo ? resolveAdsDateRange(body.previo) : null;
      // Sin período anterior explícito, compareMetaAdsPeriods deriva el bloque inmediatamente anterior.
      const comparacion = await compareMetaAdsPeriods(
        admin,
        actual?.desde && actual?.hasta ? { desde: actual.desde, hasta: actual.hasta } : undefined,
        previo?.desde && previo?.hasta ? { desde: previo.desde, hasta: previo.hasta } : undefined
      );
      return json({ ok: true, comparacion });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return json({ ok: false, error: msg }, 500);
    }
  }

  if (body.accion !== 'mensaje' || !String(body.mensaje || '').trim()) return json({ error: 'Falta el mensaje' }, 400);
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

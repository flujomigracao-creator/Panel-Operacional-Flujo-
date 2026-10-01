// Guarda de regresión del panel de Meta Ads.
//
// Los builders de Supabase (from().select().order()...) son "thenable" pero NO exponen `.catch()`:
// en @supabase/postgrest-js el PostgrestBuilder solo define `then`, `returns` y `overrideTypes`.
// Encadenar `.catch()` provocaba el error que dejaba el panel sin métricas:
//   a.from(...).select(...).order(...).catch is not a function
//
// Este test lo verifica de forma estática (no necesita red, ni Supabase, ni node_modules).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Raíz del repo: este archivo vive en src/features/assistant/services/.
const RAIZ = fileURLToPath(new URL('../../../../', import.meta.url));

// Quita comentarios para no marcar los ejemplos/documentación del propio código.
const sinComentarios = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const archivosJS = (dir, salida = []) => {
  for (const entrada of readdirSync(dir)) {
    const ruta = join(dir, entrada);
    if (statSync(ruta).isDirectory()) archivosJS(ruta, salida);
    else if (/\.(js|jsx|ts|tsx)$/.test(entrada)) salida.push(ruta);
  }
  return salida;
};

test('13. ninguna consulta de Supabase encadena .catch() sobre el builder', () => {
  const cadenaBuilderCatch =
    /\.(select|order|limit|eq|neq|in|gte|lte|gt|lt|single|maybeSingle|insert|update|upsert|delete|match|ilike)\([^()]*\)\s*\.catch\(/;

  const problemas = [];
  for (const dir of [join(RAIZ, 'src'), join(RAIZ, 'supabase', 'functions')]) {
    for (const ruta of archivosJS(dir)) {
      const limpio = sinComentarios(readFileSync(ruta, 'utf8'));
      for (const linea of limpio.split('\n')) {
        if (cadenaBuilderCatch.test(linea)) problemas.push(`${ruta}: ${linea.trim()}`);
      }
    }
  }

  assert.deepEqual(problemas, [], 'Consultas con .catch() sobre el builder de Supabase:\n' + problemas.join('\n'));
});

test('14. el servicio del Centro de Inteligencia lee el error del resultado { data, error }', () => {
  const ruta = join(RAIZ, 'src', 'features', 'assistant', 'services', 'assistantService.js');
  const limpio = sinComentarios(readFileSync(ruta, 'utf8'));

  assert.ok(!limpio.includes('.catch('), 'assistantService.js no debe encadenar .catch() sobre Supabase');
  assert.ok(limpio.includes('const { data, error } = await builder'), 'las consultas deben leer { data, error } del await');
  assert.ok(limpio.includes("from('meta_ads_insights')"), 'la fuente del panel sigue siendo public.meta_ads_insights');
});

// ── Guardas del esquema real de meta_ads_insights ──
// La tabla fue creada fuera de este repo con columnas en español (verificadas contra PostgREST):
// `fecha`, `gasto`, `impresiones`, `clics`, `conversaciones`. Usar `date`/`spend` devolvía el
// error 42703 "column meta_ads_insights.date does not exist" y dejaba el panel en estado de error.

test('15. el fallback del Centro de Inteligencia consulta las columnas reales de la tabla', () => {
  const ruta = join(RAIZ, 'src', 'features', 'assistant', 'services', 'assistantService.js');
  const limpio = sinComentarios(readFileSync(ruta, 'utf8'));

  assert.ok(limpio.includes(".order('fecha'"), 'el orden debe usar la columna real `fecha`');
  assert.ok(limpio.includes("gte('fecha'") && limpio.includes("lte('fecha'"), 'el rango debe filtrarse sobre `fecha`');
  assert.ok(
    !limpio.includes(".order('date'") && !limpio.includes("gte('date'") && !limpio.includes("lte('date'"),
    'no debe filtrarse por la columna inexistente `date`'
  );

  for (const col of ['Number(r.gasto)', 'Number(r.impresiones)', 'Number(r.clics)', 'Number(r.conversaciones)']) {
    assert.ok(limpio.includes(col), `la lectura de filas debe usar ${col}`);
  }
  assert.ok(!/Number\(\s*r\.spend\s*\)/.test(limpio), '`spend` no existe en la tabla local');
  assert.ok(!/Number\(\s*r\.impressions\s*\)/.test(limpio), '`impressions` no existe en la tabla local');
});

test('16. el fallback de la Edge Function usa las columnas reales y propaga su error', () => {
  const ruta = join(RAIZ, 'supabase', 'functions', 'asistente', 'ads.ts');
  const limpio = sinComentarios(readFileSync(ruta, 'utf8'));

  assert.ok(limpio.includes(".order('fecha'"), 'el orden debe usar la columna real `fecha`');
  assert.ok(!limpio.includes(".order('date'"), 'no debe ordenarse por la columna inexistente `date`');
  assert.ok(limpio.includes('String(r.fecha)'), 'el filtro de período debe leer `fecha`');
  for (const col of ['Number(r.gasto)', 'Number(r.impresiones)', 'Number(r.clics)', 'Number(r.conversaciones)']) {
    assert.ok(limpio.includes(col), `la agregación debe leer ${col}`);
  }
  // La lectura fallida es un error real: no se disfraza de "sin datos" con un catch vacío.
  assert.ok(
    limpio.includes('No se pudieron leer las métricas de meta_ads_insights'),
    'el error de lectura de la tabla debe propagarse con un mensaje claro'
  );
});

test('17. los fallbacks no inventan estado ACTIVE cuando la tabla no lo guarda', () => {
  const frontend = sinComentarios(
    readFileSync(join(RAIZ, 'src', 'features', 'assistant', 'services', 'assistantService.js'), 'utf8')
  );
  const backend = sinComentarios(readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'ads.ts'), 'utf8'));

  assert.ok(!/status:\s*r\.status\s*\|\|\s*'ACTIVE'/.test(frontend), 'assistantService.js no debe fabricar status ACTIVE');
  assert.ok(!/status:\s*r\.status\s*\|\|\s*'ACTIVE'/.test(backend), 'ads.ts no debe fabricar status ACTIVE');
});

test('18. el rango del período no genera fechas futuras por el desfase UTC', () => {
  const frontend = sinComentarios(
    readFileSync(join(RAIZ, 'src', 'features', 'assistant', 'services', 'assistantService.js'), 'utf8')
  );
  const backend = sinComentarios(readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'ads.ts'), 'utf8'));

  // En Brasil (UTC-3) toISOString() adelanta un día a partir de las 21:00: "Últimos 7 días"
  // pedía hasta 2026-10-01 siendo todavía 2026-09-30. Ambos lados deben fijar el día local.
  assert.ok(
    !/const iso = \(d\) => d\.toISOString\(\)/.test(frontend),
    'rangoAFechas debe calcular el día en local (patrón financeService.hoyLocal), no con toISOString()'
  );
  assert.ok(frontend.includes('getFullYear()'), 'rangoAFechas debe usar la fecha local del navegador');
  assert.ok(
    backend.includes("timeZone: 'America/Sao_Paulo'"),
    'resolveAdsDateRange debe resolver "hoy" en America/Sao_Paulo (el runtime de la Edge Function es UTC)'
  );
});

// ── FASE 2: fuentes de datos del Centro de Inteligencia ──
// El dashboard lee Supabase directamente (nunca la Edge Function) y separa las categorías de
// leads. Estas guardas impiden volver a mezclar o a depender del asistente para renderizar.

const leerServicio = () => sinComentarios(readFileSync(join(RAIZ, 'src', 'features', 'assistant', 'services', 'assistantService.js'), 'utf8'));
const cuerpoGetAdsData = () => {
  const src = leerServicio();
  // Solo el cuerpo de carga: la acción de sincronización es un atajo explícito aparte.
  const fin = src.indexOf('export async function sincronizarMetaAds');
  return src.slice(src.indexOf('export async function getAdsData'), fin > 0 ? fin : src.indexOf('export async function compareAdsPeriods'));
};

test('19. el dashboard carga siempre desde Supabase y no depende del asistente', () => {
  const cuerpo = cuerpoGetAdsData();
  const servicio = leerServicio();
  assert.ok(!cuerpo.includes('invoke('), 'getAdsData no debe invocar la Edge Function (un 400 de asistente no puede romper el dashboard)');
  assert.ok(!servicio.includes("accion: 'ads_data'"), 'la carga del dashboard no pide datos al asistente');
  assert.ok(servicio.includes("accion: 'ads_sync'"), 'la única llamada al asistente para Meta Ads es la sincronización explícita');
  assert.ok(cuerpo.includes("from('meta_ads_insights')"), 'métricas históricas: meta_ads_insights');
  assert.ok(cuerpo.includes("from('meta_ads_entities')"), 'estado y presupuesto: caché sincronizada desde Meta Graph API');
  assert.ok(cuerpo.includes("from('meta_ads_referidos')"), 'leads atribuidos: meta_ads_referidos');
  assert.ok(cuerpo.includes("from('comercial_leads')"), 'leads comerciales: comercial_leads');
  assert.ok(cuerpo.includes("from('payments')"), 'cobros: payments');
});

test('20. los leads se separen en comerciales, atribuidos a Meta y no atribuidos', () => {
  const cuerpo = cuerpoGetAdsData();
  assert.ok(cuerpo.includes('comerciales:'), 'debe exponer leads comerciales');
  assert.ok(cuerpo.includes('atribuidos_meta:'), 'debe exponer leads atribuidos a Meta Ads');
  assert.ok(cuerpo.includes('declarados_origen_meta:'), 'debe distinguir los leads que solo declaran origen Meta');
  assert.ok(cuerpo.includes('no_atribuidos:'), 'debe exponer los leads sin atribución');
  // El lead_source es evidencia de procedencia, NO de campaña (patrón declarado en el servicio).
  assert.ok(leerServicio().includes('FUENTES_META_LEAD'), 'usa el patrón de lead_source solo como procedencia');
});

test('21. la atribución por campaña solo se hace con evidencia real', () => {
  const servicio = leerServicio();
  const ads = sinComentarios(readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'ads.ts'), 'utf8'));
  for (const src of [servicio, ads]) {
    assert.ok(src.includes('created_time'), 'la fecha del referido sale del payload de Meta');
    assert.ok(src.includes('por_campana'), 'los referidos se agrupan por campaña');
    assert.ok(src.includes('sin_campana'), 'lo que no se puede atribuir queda como sin campaña');
    assert.ok(src.includes('sin_fecha'), 'los referidos sin fecha no se asignan al período');
  }
  assert.ok(ads.includes("select('ad_id, raw, body')"), 'meta_ads_referidos solo tiene ad_id + payload crudo');
  assert.ok(!ads.includes(".select('id').limit(1000)"), 'no se puede consultar meta_ads_referidos por id: esa columna no existe');
});

test('22. la sincronización con Meta ocurre en el servidor, nunca en el frontend', () => {
  const servicio = leerServicio();
  const ads = sinComentarios(readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'ads.ts'), 'utf8'));
  const index = sinComentarios(readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8'));

  assert.ok(!servicio.includes('graph.facebook.com'), 'el frontend no llama a la Graph API');
  assert.ok(!servicio.includes('META_ADS_TOKEN'), 'el frontend no maneja tokens de Meta');
  assert.ok(ads.includes('export async function syncMetaEntidades'), 'la sincronización vive en la Edge Function');
  assert.ok(ads.includes("upsert(filas, { onConflict: 'account_id,entity_type,entity_id' })"), 'el estado se persiste en meta_ads_entities por cuenta + tipo + id (sin duplicados)');
  assert.ok(index.includes('await syncMetaEntidades(admin)'), 'ads_data refresca el estado antes de responder');
});

test('23. la interfaz no muestra avisos técnicos del asistente y sí muestra las fuentes', () => {
  const vista = sinComentarios(
    readFileSync(join(RAIZ, 'src', 'features', 'assistant', 'components', 'IntelligenceCenterView.jsx'), 'utf8')
  );
  assert.ok(
    !vista.includes('La Edge Function del asistente no respondió'),
    'ese aviso técnico no debe aparecer en el dashboard'
  );
  assert.ok(vista.includes('Fuentes'), 'la vista debe indicar de dónde viene cada dato');
  assert.ok(vista.includes('data.fuentes'), 'la vista debe leer el bloque de fuentes del servicio');
});

// ── Sincronización real con Meta Graph API ──

test('24. la sincronización sigue la paginación de la Graph API', () => {
  const ads = sinComentarios(readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'ads.ts'), 'utf8'));
  assert.ok(ads.includes("export const META_GRAPH_VERSION = 'v20.0'"), 'usa la versión de Graph API del proyecto');
  assert.ok(ads.includes('json.paging?.next'), 'debe seguir el enlace de paginación de Meta');
  assert.ok(ads.includes('while (url)'), 'debe recorrer todas las páginas, no solo la primera');
  assert.ok(ads.includes('limit=500'), 'debe pedir páginas de tamaño razonable');
});

test('25. cada intento de sincronización queda registrado, incluidos los fallidos', () => {
  const ads = sinComentarios(readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'ads.ts'), 'utf8'));
  assert.ok(ads.includes('meta_ads_sync_log'), 'la bitácora de sincronización debe existir');
  assert.ok(ads.includes('export async function registrarSync'), 'debe existir el registro de cada intento');
  assert.ok(ads.includes('errores:'), 'debe guardar endpoint, código HTTP y mensaje de Meta');
  assert.ok(ads.includes('console.error(\'[Meta Ads sync]'), 'los fallos se registran en el log del servidor');
  // Si Meta falla entero, la caché NO se toca (el panel sigue viendo el último estado válido):
  // el guardado (upsert) está después de esa guarda.
  assert.ok(
    ads.indexOf('fallos.length === lecturas.length') < ads.indexOf("upsert(filas, { onConflict: 'account_id,entity_type,entity_id' })"),
    'un fallo total debe detectarse ANTES de escribir, para no sobrescribir el estado ya sincronizado'
  );
});

test('26. la sincronización se dispara con la acción ads_sync y desde el servidor', () => {
  const index = sinComentarios(readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'index.ts'), 'utf8'));
  const servicio = leerServicio();
  const vista = sinComentarios(
    readFileSync(join(RAIZ, 'src', 'features', 'assistant', 'components', 'IntelligenceCenterView.jsx'), 'utf8')
  );
  assert.ok(index.includes("body.accion === 'ads_sync'"), 'la Edge Function debe exponer la acción ads_sync');
  assert.ok(index.includes('await syncMetaEntidades(admin)'), 'ads_sync ejecuta la sincronización real');
  assert.ok(servicio.includes("invoke({ accion: 'ads_sync' })"), 'el servicio llama a ads_sync');
  assert.ok(vista.includes('api.sincronizarMetaAds()'), 'el panel ofrece sincronizar con un botón');
  assert.ok(vista.includes('Última sincronización:'), 'el panel muestra la última sincronización');
  assert.ok(vista.includes("'nunca'"), 'si nunca se sincronizó, debe decirlo explícitamente');
});

// ── Prueba de humo: ejecuta el código real ──
// Los tests anteriores son estáticos (leen el texto): un `ReferenceError` en tiempo de ejecución
// se escapó de ellos. Este test importa el servicio con un cliente Supabase simulado y llama a
// `getAdsData`, de modo que cualquier variable mal nombrada revienta aquí.

test('28. getAdsData se ejecuta de verdad y devuelve las fuentes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ads-smoke-'));
  const stub = join(dir, 'supabaseStub.mjs');
  // Builder "thenable" mínimo: cada llamada encadenada devuelve el mismo objeto.
  writeFileSync(
    stub,
    `const filas = globalThis.__filas ?? [];
export const supabase = {
  from: (tabla) => ({
    select() { return this; }, order() { return this; }, gte() { return this; },
    lte() { return this; }, eq() { return this; }, limit() { return this; },
    then(resolve) { return Promise.resolve(resolve({ data: filas, error: null })); },
  }),
};`
  );

  const ruta = join(RAIZ, 'src', 'features', 'assistant', 'services', 'assistantService.js');
  const codigo = readFileSync(ruta, 'utf8').replace('@shared/config/supabaseClient', pathToFileURL(stub).href);
  const mod = join(dir, 'servicio.mjs');
  writeFileSync(mod, codigo);

  const { getAdsData, atribuirReferidos } = await import(pathToFileURL(mod).href);

  // Sin filas: el panel debe responder "sin datos", no romperse.
  const data = await getAdsData({ periodo: '7d' });
  assert.equal(data.ok, true);
  assert.ok(Array.isArray(data.campanas), 'devuelve la lista de campañas');
  assert.ok(data.fuentes && data.fuentes.metricas_historicas, 'devuelve las fuentes de datos');
  assert.ok(data.sincronizacion, 'devuelve el estado de la sincronización');
  assert.ok(data.periodo.hasta, 'resuelve el período');

  // Con referidos sin fecha no se inventa una campaña ni se mete en el corte.
  // 1789473600 = 2026-09-15 12:00 UTC (dentro del período de abajo).
  const sinCampana = atribuirReferidos([{ ad_id: '999', raw: { created_time: 1789473600 } }], [], { desde: '2026-09-01', hasta: '2026-09-30' });
  assert.equal(sinCampana.sin_campana, 1, 'un referido sin campaña queda como no atribuido');
  assert.equal(sinCampana.total, 0, 'no se inventa la atribución');

  const fueraDeRango = atribuirReferidos([{ ad_id: '999', raw: { created_time: 1780000000, campaign_id: '55' } }], [], { desde: '2026-01-01', hasta: '2026-01-31' });
  assert.equal(fueraDeRango.total, 0, 'lo que cae fuera del período no se cuenta');
});

test('27. presupuesto en BRL y status/effective_status/last_synced_at separados', () => {
  const ads = sinComentarios(readFileSync(join(RAIZ, 'supabase', 'functions', 'asistente', 'ads.ts'), 'utf8'));
  const servicio = leerServicio();
  // Graph API entrega centavos; el panel trabaja en BRL (10000 -> R$100,00).
  assert.ok(ads.includes('Number(v) / 100'), 'los presupuestos deben convertirse de centavos a BRL');
  assert.ok(ads.includes('status: c.status ?? null'), 'status se guarda por separado');
  assert.ok(ads.includes('effective_status: c.effective_status ?? null'), 'effective_status se guarda por separado');
  assert.ok(ads.includes('last_synced_at: sello'), 'last_synced_at se actualiza en cada sincronización');
  assert.ok(servicio.includes('estado_operacional:'), 'el panel distingue el estado operacional');
  // El aviso de "sin sincronizar" solo desaparece con datos reales, no por ocultarlo.
  assert.ok(servicio.includes("estado: ultimoIntento ? (ultimoIntento.ok ? 'sincronizado' : 'fallida') : 'nunca'"), 'el aviso depende del estado real de la bitácora');
});

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
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
  return src.slice(src.indexOf('export async function getAdsData'), src.indexOf('export async function compareAdsPeriods'));
};

test('19. el dashboard carga siempre desde Supabase y no depende del asistente', () => {
  const cuerpo = cuerpoGetAdsData();
  assert.ok(!cuerpo.includes('invoke('), 'getAdsData no debe invocar la Edge Function (un 400 de asistente no puede romper el dashboard)');
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
  assert.ok(ads.includes("upsert(filas, { onConflict: 'entity_type,entity_id' })"), 'el estado se persiste en meta_ads_entities');
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

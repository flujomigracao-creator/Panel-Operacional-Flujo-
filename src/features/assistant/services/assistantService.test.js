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

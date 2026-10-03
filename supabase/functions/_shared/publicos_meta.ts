// Públicos de Meta para los experimentos: convierte una definición (publicos_definiciones) en la segmentación que lleva
// cada conjunto de anuncios. Meta no deja crear «públicos guardados» con este token (error #3), pero un conjunto de anuncios
// sí lleva su segmentación dentro: así cada variante de un experimento usa su propio público sin crear nada aparte.
// Los IDs y los nombres exactos salen del catálogo guardado (meta_opciones_segmentacion); nunca se inventan ni se sustituyen:
// si falta una opción pedida, se lanza un error claro y la variante no se publica.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export interface DefinicionPublico {
  codigo: string;
  nombre: string;
  tipo: string;
  ubicacion?: { paises?: string[] } | null;
  edad_min?: number | null;
  edad_max?: number | null;
  comportamientos?: { buscar?: string; empieza: string }[] | null;
  es_control?: boolean | null;
}

export interface OpcionCatalogo { clase: string; meta_id: string; nombre: string }

const sinAcentos = (s: string) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Idioma español del catálogo: «Español (todos)» si existe; si no, «Español». null si ninguno. */
export function elegirIdiomaEspanol(catalogo: OpcionCatalogo[]): number | null {
  const idiomas = catalogo.filter((o) => o.clase === 'locale');
  const todos = idiomas.find((o) => /^(espanol|spanish) \((todos|all)\)$/.test(sinAcentos(o.nombre)));
  const generico = idiomas.find((o) => /^(espanol|spanish)$/.test(sinAcentos(o.nombre)));
  const elegido = todos || generico;
  return elegido ? Number(elegido.meta_id) : null;
}

/** Segmentación de Meta de un público. Lanza un error legible si falta alguna opción pedida (no sustituye nada). */
export function armarSegmentacion(def: DefinicionPublico, catalogo: OpcionCatalogo[]): Record<string, unknown> {
  if (def.tipo !== 'adquisicion') throw new Error(`El público ${def.codigo} es de tipo «${def.tipo}»: solo los de adquisición se usan en conjuntos de anuncios.`);
  const idioma = elegirIdiomaEspanol(catalogo);
  if (idioma == null) throw new Error('El catálogo de Meta no tiene el idioma español: actualiza el catálogo antes de usar el público.');

  const pedidos = def.comportamientos || [];
  if (!pedidos.length && !def.es_control) throw new Error(`El público ${def.codigo} no tiene comportamientos configurados y no es de control.`);
  const comportamientos = catalogo.filter((o) => o.clase === 'behaviors');
  const elegidos: { id: string; name: string }[] = [];
  const faltan: string[] = [];
  for (const p of pedidos) {
    const op = comportamientos.find((o) => sinAcentos(o.nombre).startsWith(sinAcentos(p.empieza)));
    if (op) elegidos.push({ id: op.meta_id, name: op.nombre }); else faltan.push(p.empieza);
  }
  if (faltan.length) throw new Error(`El catálogo de Meta no tiene: ${faltan.map((f) => `«${f}»`).join(', ')}. No se usa otra segmentación en su lugar.`);

  return {
    geo_locations: { countries: def.ubicacion?.paises?.length ? def.ubicacion.paises : ['BR'] },
    age_min: def.edad_min ?? 21,
    age_max: def.edad_max ?? 65,
    locales: [idioma],
    // Varios comportamientos en el mismo grupo = «o» (se suman). El público de control no lleva ninguno.
    ...(elegidos.length ? { flexible_spec: [{ behaviors: elegidos }] } : {}),
  };
}

/** Lee la definición y el catálogo y devuelve la segmentación lista para el conjunto de anuncios. */
export async function segmentacionDePublico(admin: SupabaseClient, orgId: string, codigo: string): Promise<{ targeting: Record<string, unknown>; nombre: string }> {
  const { data: def, error } = await admin.from('publicos_definiciones').select('codigo, nombre, tipo, ubicacion, edad_min, edad_max, comportamientos, es_control').eq('organization_id', orgId).eq('codigo', codigo).maybeSingle();
  if (error) throw new Error(`No se pudo leer el público ${codigo}: ${error.message}`);
  if (!def) throw new Error(`El público «${codigo}» no existe. Usa listar_publicos para ver los disponibles.`);
  const { data: catalogo, error: errCat } = await admin.from('meta_opciones_segmentacion').select('clase, meta_id, nombre').in('clase', ['locale', 'behaviors']).limit(5000);
  if (errCat) throw new Error(`No se pudo leer el catálogo de Meta: ${errCat.message}`);
  return { targeting: armarSegmentacion(def as DefinicionPublico, (catalogo || []) as OpcionCatalogo[]), nombre: def.nombre };
}

/** Códigos de público por variante: un solo código vale para todas; si hay varios, uno por variante. */
export function publicosPorVariante(codigos: string[] | undefined, nVariantes: number): (string | null)[] {
  const lista = (codigos || []).map((c) => String(c || '').trim()).filter(Boolean);
  if (!lista.length) return Array(nVariantes).fill(null);
  if (lista.length === 1) return Array(nVariantes).fill(lista[0]);
  if (lista.length !== nVariantes) throw new Error(`Indica un solo público para todas las variantes o uno por variante (${nVariantes}); recibí ${lista.length}.`);
  return lista;
}

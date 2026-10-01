// Lógica pura del Laboratorio de Creativos (V5). Sin Deno ni red: se prueba con `node --test`.

export const SERVICIOS = ['CPF', 'Agendamento PF', 'RNM', 'Residência Permanente', 'Refúgio'] as const;
export type Servicio = typeof SERVICIOS[number];

export const FORMATOS = ['1:1', '4:5', '9:16'] as const;
export type Formato = typeof FORMATOS[number];

export const CONCEPTOS = ['persona', 'documento', 'problema_solucion', 'institucional', 'mensaje_directo', 'variacion_ganadora'] as const;

// Cada servicio se mantiene separado: no se mezclan intenciones en un mismo anuncio.
const ENFOQUE_SERVICIO: Record<Servicio, string> = {
  'CPF': 'obtener o regularizar el CPF (documento fiscal brasileño) siendo extranjero',
  'Agendamento PF': 'agendar la cita en la Polícia Federal para trámites migratorios',
  'RNM': 'obtener el RNM / CRNM, el carné de identidad de extranjero en Brasil',
  'Residência Permanente': 'conseguir la residencia permanente en Brasil',
  'Refúgio': 'solicitar refugio en Brasil con acompañamiento serio y confidencial',
};

const ENFOQUE_CONCEPTO: Record<string, string> = {
  persona: 'una persona extranjera real y cercana, con su documentación, en un entorno brasileño reconocible',
  documento: 'el documento como protagonista, limpio y legible, sin datos personales reales',
  problema_solucion: 'composición en dos partes: el problema (incertidumbre, papeles) y la solución resuelta',
  institucional: 'diseño institucional y profesional que transmite confianza y seriedad',
  mensaje_directo: 'composición limpia con una sola idea y espacio para un mensaje directo',
  variacion_ganadora: 'variación del enfoque visual que históricamente mejor ha funcionado, sin copiarlo',
};

// Identidad visual de Flujo de Migração: azul confianza #1E3A8A dominante, verde, dorado y blanco.
export const IDENTIDAD_VISUAL =
  'Paleta institucional: azul confianza (#1E3A8A) como color dominante, acentos en verde y dorado (#d4a72c), blancos limpios. ' +
  'Estética corporativa limpia, profesional y cálida; tipografía sans-serif moderna; mucho aire; evita el aspecto genérico de imagen generada por IA.';

/** Estilos visuales admitidos: cambiar el estilo es UNA variable controlada de un experimento. */
export const ESTILOS: Record<string, string> = {
  fotografia_realista: 'fotografía realista, luz natural, personas reales y cercanas, aspecto editorial',
  ilustracion: 'ilustración vectorial plana, formas limpias, paleta de marca',
  minimalista_corporativo: 'diseño gráfico minimalista corporativo, composición geométrica sobria',
  documento_destacado: 'el documento como protagonista sobre fondo limpio, sin datos reales',
};

export const IDIOMAS = ['es', 'pt'] as const;
export const OBJETIVOS = ['conversaciones', 'leads', 'clientes', 'otro'] as const;

/** Variables que puede cambiar una regeneración. Solo UNA por regeneración (regla del método científico). */
export const VARIABLES_CAMBIO = ['estilo', 'hook', 'concepto', 'composicion', 'imagen'] as const;

export const REGLAS_PUBLICITARIAS =
  'Imagen publicitaria profesional para Meta Ads. Sin logos de gobiernos ni de la Polícia Federal, sin sellos oficiales falsos, ' +
  'sin documentos con datos reales, sin promesas de resultado garantizado. Deja zonas despejadas para que el texto del anuncio sea legible. ' +
  'No incluyas texto pequeño ni párrafos dentro de la imagen.';

export interface PromptInput {
  servicio: string;
  concepto?: string;
  hook?: string;
  visual_concept?: string;
  variables?: Record<string, string>;
  objetivo?: string;
  publico?: string;
  cta?: string;
  estilo?: string;
  idioma?: string;
  referencia_visual?: string;
}

export function construirPromptPublicitario(i: PromptInput): string {
  const servicio = (SERVICIOS as readonly string[]).includes(i.servicio) ? (i.servicio as Servicio) : null;
  const enfoque = servicio ? ENFOQUE_SERVICIO[servicio] : i.servicio;
  const concepto = ENFOQUE_CONCEPTO[i.concepto || ''] || i.concepto || '';
  const partes = [
    `Anuncio para Flujo de Migração, empresa que ayuda a extranjeros a ${enfoque}.`,
    concepto && `Concepto visual: ${concepto}.`,
    i.visual_concept && `Escena: ${i.visual_concept}.`,
    i.publico && `Público: ${i.publico}.`,
    i.objetivo && `Objetivo del anuncio: ${i.objetivo}.`,
    i.estilo && `Estilo visual: ${ESTILOS[i.estilo] || i.estilo}.`,
    i.referencia_visual && `Referencia visual: ${i.referencia_visual}.`,
    i.hook && `Idea central que debe transmitir (sin escribirla como texto largo): "${i.hook}".`,
    i.cta && `Debe sugerir visualmente la acción: "${i.cta}" (sin texto largo dentro de la imagen).`,
    i.idioma && `Si aparece texto, en ${i.idioma === 'pt' ? 'portugués de Brasil' : 'español'}.`,
    IDENTIDAD_VISUAL,
    REGLAS_PUBLICITARIAS,
  ].filter(Boolean) as string[];
  let prompt = partes.join('\n');
  // Variables {{x}} propias del prompt de la biblioteca.
  for (const [k, v] of Object.entries(i.variables || {})) prompt = prompt.split(`{{${k}}}`).join(String(v));
  return prompt;
}

/** Proveedores de imagen: tamaños soportados (los formatos 4:5 y 9:16 se recortan en el anuncio). */
export function tamanoOpenAI(formato: string): string {
  return formato === '1:1' ? '1024x1024' : '1024x1536';
}
export function aspectoGemini(formato: string): string {
  return formato === '9:16' ? '9:16' : formato === '4:5' ? '4:5' : '1:1';
}

// ── Regla de decisión: nunca declarar ganador con pocos datos ──────────────────────

export interface MetricasVariante {
  nombre: string;
  impresiones: number | null;
  clics: number | null;
  gasto: number | null;
  conversaciones: number | null;
  clientes_pagaron: number | null;
}

export interface UmbralesGanador {
  minImpresionesPorVariante: number;
  minConversacionesTotales: number;
  minDias: number;
  minClientesPagantes: number;
  ventajaMinima: number; // 0.2 = el mejor debe ser ≥20 % mejor que el siguiente
}

export const UMBRALES_POR_DEFECTO: UmbralesGanador = {
  minImpresionesPorVariante: 1000,
  minConversacionesTotales: 10,
  minDias: 3,
  minClientesPagantes: 3,
  ventajaMinima: 0.2,
};

export type Veredicto = 'sin_datos' | 'insuficiente' | 'tendencia' | 'ganador';

export interface ResultadoGanador {
  veredicto: Veredicto;
  confianza: 'ninguna' | 'baja' | 'media' | 'alta';
  metrica: 'costo_por_cliente' | 'costo_por_conversacion' | null;
  ganador: string | null;
  motivo: string;
  muestra: { variantes: number; impresiones: number; conversaciones: number; clientes: number; dias: number };
}

const n = (x: number | null | undefined) => (typeof x === 'number' && isFinite(x) ? x : 0);

/** Prueba z de dos proporciones (bilateral). Devuelve el p-valor, o null si no se puede calcular. */
export function pValorDosProporciones(x1: number, n1: number, x2: number, n2: number): number | null {
  if (n1 <= 0 || n2 <= 0) return null;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (se === 0) return null;
  const z = Math.abs(x1 / n1 - x2 / n2) / se;
  return 2 * (1 - cdfNormal(z));
}

function cdfNormal(z: number): number {
  // Aproximación de Abramowitz–Stegun 7.1.26
  const t = 1 / (1 + 0.2316419 * z);
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return 1 - p;
}

export function evaluarGanador(
  variantes: MetricasVariante[],
  dias: number,
  umbrales: UmbralesGanador = UMBRALES_POR_DEFECTO
): ResultadoGanador {
  const impTot = variantes.reduce((s, v) => s + n(v.impresiones), 0);
  const convTot = variantes.reduce((s, v) => s + n(v.conversaciones), 0);
  const cliTot = variantes.reduce((s, v) => s + n(v.clientes_pagaron), 0);
  const muestra = { variantes: variantes.length, impresiones: impTot, conversaciones: convTot, clientes: cliTot, dias };
  const base = { ganador: null, metrica: null, muestra } as const;

  if (variantes.length < 2) {
    return { ...base, veredicto: 'sin_datos', confianza: 'ninguna', motivo: 'Se necesitan al menos 2 variantes para comparar.' };
  }
  if (impTot === 0) {
    return { ...base, veredicto: 'sin_datos', confianza: 'ninguna', motivo: 'Ninguna variante tiene impresiones medidas todavía.' };
  }
  const pocas = variantes.filter(v => n(v.impresiones) < umbrales.minImpresionesPorVariante);
  if (pocas.length) {
    return { ...base, veredicto: 'insuficiente', confianza: 'ninguna', motivo: `Faltan impresiones: ${pocas.map(v => v.nombre).join(', ')} no llega(n) a ${umbrales.minImpresionesPorVariante}.` };
  }
  if (dias < umbrales.minDias) {
    return { ...base, veredicto: 'insuficiente', confianza: 'ninguna', motivo: `Solo ${dias} día(s) de datos; se piden al menos ${umbrales.minDias} para no decidir por ruido.` };
  }
  if (convTot < umbrales.minConversacionesTotales) {
    return { ...base, veredicto: 'insuficiente', confianza: 'ninguna', motivo: `Solo ${convTot} conversaciones en total; se piden al menos ${umbrales.minConversacionesTotales}.` };
  }

  // Métrica principal: costo por cliente pagante cuando hay pagos suficientes; si no, costo por conversación.
  const usaCliente = cliTot >= umbrales.minClientesPagantes;
  const metrica = usaCliente ? 'costo_por_cliente' : 'costo_por_conversacion';
  const puntuadas = variantes
    .map(v => {
      const denom = usaCliente ? n(v.clientes_pagaron) : n(v.conversaciones);
      return { v, costo: denom > 0 && v.gasto != null ? n(v.gasto) / denom : null };
    })
    .filter((x): x is { v: MetricasVariante; costo: number } => x.costo != null)
    .sort((a, b) => a.costo - b.costo);

  if (puntuadas.length < 2) {
    return { ...base, metrica, veredicto: 'insuficiente', confianza: 'ninguna', motivo: 'Menos de 2 variantes tienen resultado en la métrica principal.' };
  }
  const [mejor, segundo] = puntuadas;
  const ventaja = (segundo.costo - mejor.costo) / segundo.costo;
  if (ventaja < umbrales.ventajaMinima) {
    return { ganador: null, metrica, muestra, veredicto: 'tendencia', confianza: 'baja', motivo: `La mejor variante (${mejor.v.nombre}) solo supera en ${(ventaja * 100).toFixed(0)} % a la siguiente; menos del ${umbrales.ventajaMinima * 100} % exigido. No hay ganador claro.` };
  }
  // Diferencia estadística en tasa de conversación por impresión entre las dos mejores.
  const p = pValorDosProporciones(n(mejor.v.conversaciones), n(mejor.v.impresiones), n(segundo.v.conversaciones), n(segundo.v.impresiones));
  const significativo = p != null && p < 0.05;
  const confianza = significativo && usaCliente ? 'alta' : significativo || usaCliente ? 'media' : 'baja';
  const veredicto: Veredicto = confianza === 'baja' ? 'tendencia' : 'ganador';
  return {
    veredicto, confianza, metrica, muestra,
    ganador: veredicto === 'ganador' ? mejor.v.nombre : null,
    motivo: `${mejor.v.nombre} tiene ${(ventaja * 100).toFixed(0)} % menos ${usaCliente ? 'costo por cliente' : 'costo por conversación'} que ${segundo.v.nombre}` +
      (p != null ? ` (p=${p.toFixed(3)} en conversaciones/impresión).` : '.') +
      (usaCliente ? '' : ' Aún sin clientes pagantes suficientes: la conclusión es sobre conversaciones, no sobre ventas.'),
  };
}

// ── Validación de entrada de creativos ────────────────────────────────────────────

export function validarCreativo(c: { service?: string; format?: string }): string | null {
  if (!c.service || !(SERVICIOS as readonly string[]).includes(c.service)) return `Servicio inválido. Usa uno de: ${SERVICIOS.join(', ')}.`;
  if (c.format && !(FORMATOS as readonly string[]).includes(c.format)) return `Formato inválido. Usa uno de: ${FORMATOS.join(', ')}.`;
  return null;
}

/** Extensión y tipo MIME seguros a partir de lo que declara el cliente (solo imágenes). */
export function tipoImagen(mime: string | undefined): { mime: string; ext: string } | null {
  const m = (mime || '').toLowerCase();
  if (m === 'image/png') return { mime: m, ext: 'png' };
  if (m === 'image/jpeg' || m === 'image/jpg') return { mime: 'image/jpeg', ext: 'jpg' };
  if (m === 'image/webp') return { mime: m, ext: 'webp' };
  return null;
}

/** Valida que una regeneración cambie exactamente una variable declarada. */
export function validarCambio(v: unknown): string | null {
  if (typeof v !== 'string' || !(VARIABLES_CAMBIO as readonly string[]).includes(v)) {
    return `Declara UNA variable que cambia: ${VARIABLES_CAMBIO.join(', ')}.`;
  }
  return null;
}

/** Ruta de almacenamiento: {servicio}/{creative_id}/v{version}/image.{ext} (sin duplicar imágenes). */
export function rutaImagen(servicio: string, creativeId: string, version: number, ext: string): string {
  const slug = servicio.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug}/${creativeId}/v${version}/image.${ext}`;
}

/** Elige el modelo de imagen más reciente de una lista de ids (gpt-image-N); configurable y con respaldo. */
export function elegirModeloImagen(ids: string[], respaldo = 'gpt-image-1'): string {
  const cand = ids.map(id => ({ id, m: /^gpt-image-(\d+(?:\.\d+)?)$/.exec(id) })).filter(x => x.m).map(x => ({ id: x.id, v: parseFloat(x.m![1]) }));
  if (!cand.length) return respaldo;
  return cand.sort((a, b) => b.v - a.v)[0].id;
}

/** Quita cualquier fragmento parecido a una clave antes de registrar o devolver un error. */
export function sanearError(msg: string): string {
  return String(msg || '').replace(/sk-[A-Za-z0-9_*-]{6,}/g, 'sk-***').slice(0, 400);
}

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
  'sin documentos con datos reales, sin promesas de resultado garantizado. ' +
  'La imagen DEBE llevar integrados un titular grande, un botón de acción y la firma de marca (ver TEXTO DENTRO DE LA IMAGEN); ' +
  'nada de párrafos ni letra pequeña ilegible, y ningún otro texto aparte del indicado.';

/**
 * Prompt maestro del director creativo visual de Flujo de Migração (versión operativa).
 * IDIOMA: español por defecto (razonamiento, hooks, titulares, subtítulos y CTA); portugués SOLO si se pide explícitamente.
 */
export const PRINCIPIOS_CREATIVOS = [
  'Eres el DIRECTOR CREATIVO VISUAL de Flujo de Migração (empresa brasileña que ayuda a extranjeros con trámites migratorios). Tu trabajo NO es hacer imágenes bonitas: es crear piezas de Meta Ads que detengan el scroll, comuniquen en 1-2 segundos, transmitan confianza y lleven a una acción. Prioridad: ATENCIÓN → COMPRENSIÓN → CONFIANZA → ACCIÓN (no belleza ni decoración).',
  'IDIOMA: ESPAÑOL POR DEFECTO, regla prioritaria, para el razonamiento y para todo el texto del anuncio (hook, titular, subtítulo, CTA). Portugués solo si se pide explícitamente para esa campaña. El idioma del anuncio es el del público; el de trabajo es español.',
  'ESTRATEGIA ANTES DEL DISEÑO: la estrategia (servicio, público, problema, deseo, fricción, beneficio, hook, CTA) decide la composición; no inventes la estrategia, conviértela en pieza visual.',
  'HOOK: 3 a 8 palabras, específico del problema real del extranjero y del servicio (ej. "¿Necesitas tu CPF en Brasil?", "¿Tu RNM está venciendo?", "Tu CPF empieza aquí."). Prohibidos los genéricos ("Tenemos la solución", "Somos los mejores", "Facilitamos tu vida").',
  'JERARQUÍA: 1) HOOK (lo más importante) 2) imagen principal (persona/situación/problema) 3) beneficio o explicación corta 4) CTA 5) firma pequeña "Flujo de Migração". Poco texto, bien diseñado, sin párrafos; texto y fotografía claramente separados.',
  'CTA siempre visible y reconocible, sin parecer un botón barato (ej. "Habla con nosotros", "Agendar ahora", "Hablar por WhatsApp").',
  'PERSONAS: naturales, modernas, auténticas, latinoamericanas/internacionales cuando corresponda; sin poses artificiales, sonrisas exageradas, aspecto de banco de imágenes ni manos deformes. Refúgio: respetuoso, humano, nada dramático.',
  'COMPOSICIÓN: publicidad premium y editorial, espacio negativo, contraste, profundidad; nada de aspecto de plantilla genérica; sin iconos ni banderas decorativas (Brasil solo de forma sutil, no una bandera en cada anuncio). Adapta la composición al formato (1:1, 4:5, 9:16), no recortes un cuadrado.',
  'EXPERIMENTOS: cuando se piden variantes, cambia deliberadamente UNA sola variable (hook, concepto visual, composición, estilo, persona, ángulo, beneficio o CTA) y conserva servicio, público, objetivo y oferta idénticos.',
  'TEXTO: correcto, natural, corto y comercial, sin errores ortográficos. Nunca inventes precios, promociones, documentos ni condiciones legales; no prometas resultados ("100% garantizado", "aprobación garantizada", "sin riesgo").',
].join('\n');

/** Zonas de composición por formato de Meta (Stories/Reels tapan arriba y abajo con la interfaz). */
export const DISENO_FORMATO: Record<string, string> = {
  '1:1': 'titular en el tercio superior, sujeto en el centro, botón CTA en la parte inferior.',
  '4:5': 'titular en el tercio superior, sujeto en el centro, botón CTA en la parte inferior.',
  '9:16': 'zona segura de Stories/Reels: nada de texto en el 14 % superior ni en el 20 % inferior; titular en la zona media-alta, botón CTA por encima del 20 % inferior.',
};

/**
 * Textos que la IA debe DIBUJAR dentro del anuncio. Un anuncio sin titular ni botón de acción no vende:
 * se piden literales, cortos y legibles en móvil. CTA y firma siempre presentes.
 */
/** Textos literales que DEBEN aparecer dibujados en el anuncio (titular, subtítulo, CTA y firma). */
export function textosLiterales(i: { titular?: string; hook?: string; cta?: string; idioma?: string }): string[] {
  const pt = i.idioma === 'pt';
  const titular = (i.titular || i.hook || '').trim();
  const subtitulo = i.hook && i.titular && i.hook.trim() !== i.titular.trim() && i.hook.trim().length <= 60 ? i.hook.trim() : '';
  const cta = (i.cta || '').trim() || (pt ? 'Fale conosco no WhatsApp' : 'Escríbenos por WhatsApp');
  return [titular, subtitulo, cta, 'Flujo de Migração'].filter(Boolean);
}

/**
 * La IA que redacta el prompt puede reescribir o traducir un texto. Si falta alguno de los literales exigidos,
 * se añade un bloque final con el texto exacto: el anuncio nunca sale sin titular, CTA o firma correctos.
 */
export function asegurarTextos(prompt: string, textos: string[]): string {
  const norm = (s: string) => s.normalize('NFC');
  const p = norm(prompt);
  const faltan = textos.filter(t => !p.includes(norm(t)));
  if (!faltan.length) return prompt;
  return `${prompt}\n\nON-IMAGE TEXT, VERBATIM (render exactly, correct spelling and accents, highly legible): ${faltan.map(t => `"${t}"`).join(' · ')}.`;
}

export function textoEnImagen(i: { titular?: string; hook?: string; cta?: string; idioma?: string }): string[] {
  const pt = i.idioma === 'pt';
  const titular = (i.titular || i.hook || '').trim();
  const subtitulo = i.hook && i.titular && i.hook.trim() !== i.titular.trim() && i.hook.trim().length <= 60 ? i.hook.trim() : '';
  const cta = (i.cta || '').trim() || (pt ? 'Fale conosco no WhatsApp' : 'Escríbenos por WhatsApp');
  return [
    `TEXTO DENTRO DE LA IMAGEN (obligatorio; escríbelo EXACTAMENTE así, con ortografía y tildes correctas, en ${pt ? 'portugués de Brasil' : 'español'}, tipografía sans-serif gruesa y muy legible en pantalla de móvil, alto contraste con el fondo):`,
    titular && `1) TITULAR grande y destacado: "${titular}".`,
    subtitulo && `2) SUBTÍTULO breve debajo del titular: "${subtitulo}".`,
    `${titular ? '3' : '1'}) BOTÓN de acción (CTA) redondeado, en verde o dorado, con texto blanco o azul oscuro: "${cta}".`,
    `${titular ? '4' : '2'}) FIRMA de marca pequeña pero legible en una esquina: "Flujo de Migração".`,
  ].filter(Boolean) as string[];
}

export interface PromptInput {
  titular?: string;
  formato?: string;
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
  // Brief estructurado: el generador recibe la estrategia, no la inventa.
  problema?: string;
  angulo?: string;
  beneficio?: string;
  variable_experimento?: string;
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
    i.problema && `Problema del cliente: ${i.problema}.`,
    i.angulo && `Ángulo: ${i.angulo}.`,
    i.beneficio && `Beneficio: ${i.beneficio}.`,
    i.variable_experimento && `VARIABLE DEL EXPERIMENTO: ${i.variable_experimento}. Es lo ÚNICO que debe diferenciar esta pieza de sus variantes.`,
    i.objetivo && `Objetivo del anuncio: ${i.objetivo}.`,
    i.estilo && `Estilo visual: ${ESTILOS[i.estilo] || i.estilo}.`,
    i.referencia_visual && `Referencia visual: ${i.referencia_visual}.`,
    ...textoEnImagen(i),
    i.formato && `Formato ${i.formato}: ${DISENO_FORMATO[i.formato] || ''}`,
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
/**
 * Tamaños candidatos por formato, del más fiel al de respaldo. Los modelos gpt-image recientes admiten proporciones
 * propias (lados múltiplos de 16); si OpenAI rechaza el exacto se usa el clásico 1024x1536.
 */
export function tamanosCandidatos(formato: string): string[] {
  if (formato === '1:1') return ['1024x1024'];
  const exacto = formato === '4:5' ? '1024x1280' : '1152x2048'; // 4:5 y 9:16 exactos
  return [exacto, '1024x1536'];
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

/**
 * Prompt de una regeneración cuando el usuario no escribió uno nuevo: refleja EXACTAMENTE la variable declarada,
 * para que el registro (changed_variable) y la imagen no se contradigan. Devuelve null si ese cambio exige un prompt nuevo.
 */
export function ajustarPromptRegeneracion(promptPadre: string, variable: string, c: { style?: string; hook?: string }): string | null {
  if (variable === 'imagen') return promptPadre; // mismo prompt, muestra nueva
  if (variable === 'estilo' && c.style && ESTILOS[c.style]) {
    return `${promptPadre}\n\nSTYLE OVERRIDE (change ONLY the visual style; keep subject, composition, copy space and brand colors): ${ESTILOS[c.style]}. This replaces any earlier instruction about photographic or illustrative style.`;
  }
  if (variable === 'hook' && c.hook && c.hook.trim()) {
    return `${promptPadre}\n\nIDEA OVERRIDE (change ONLY the hook; keep style, composition and brand colors): the on-image headline text must now read exactly "${c.hook.trim()}" (correct spelling and accents). It replaces any earlier headline or central idea.`;
  }
  return null; // concepto / composición: requieren un prompt nuevo explícito
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

/** Mensaje que el cliente envía por defecto al tocar el anuncio, según el servicio (en español, primera persona). */
export const MENSAJE_WHATSAPP_POR_SERVICIO: Record<string, string> = {
  'CPF': 'Quiero hacer mi CPF',
  'Agendamento PF': 'Quiero comenzar mi agendamiento',
  'RNM': 'Quiero hacer mi RNM',
  'Residência Permanente': 'Quiero hacer mi residencia',
  'Refúgio': 'Quiero hacer mi solicitud de refugio',
};

/** El mensaje explícito del creativo manda; si no hay, el del servicio; nunca el genérico «quiero más información». */
export function mensajeWhatsApp(c: { whatsapp_message?: string | null; service?: string | null }): string | null {
  const propio = String(c.whatsapp_message || '').trim();
  if (propio) return propio.slice(0, 120);
  return MENSAJE_WHATSAPP_POR_SERVICIO[String(c.service || '')] ?? null;
}

/**
 * page_welcome_message de un anuncio Click-to-WhatsApp: el chat se abre con `mensaje` ya escrito en el cuadro de texto
 * (el cliente solo toca Enviar). Es un JSON dentro de un string, como lo pide la Marketing API.
 */
export function paginaBienvenidaWhatsApp(mensaje: string, saludo = '¡Hola! Toca Enviar para empezar.'): string {
  return JSON.stringify({
    type: 'VISUAL_EDITOR', version: 2, landing_screen_type: 'welcome_message', media_type: 'text',
    text_format: { customer_action_type: 'autofill_message', message: { autofill_message: { content: mensaje }, text: saludo } },
  });
}

/** Poses disponibles para el modo "Aparezco yo". */
export const POSES_PERSONA: Record<string, string> = {
  pared: 'leaning casually with his shoulder against a wall, arms relaxed, one hand raised in a friendly welcome wave',
  mostrador: 'leaning with one forearm on a reception counter, open and inviting posture',
  brazos: 'leaning back against a wall with arms crossed in a relaxed, confident way',
  saludo: 'standing and waving hello with a big welcoming gesture',
};

/** Anexa al prompt la instrucción de que aparezca la persona de las fotos de referencia (ilustración, sonriendo, dando la bienvenida). */
export function anexarPersona(prompt: string, pose = 'pared'): string {
  const p = POSES_PERSONA[pose] || POSES_PERSONA.pared;
  return `${prompt}\n\nMAIN CHARACTER: stylized high-quality digital illustration (clean cartoon look, soft shading, vibrant colors) of the SAME man shown in the reference photos. Keep his recognizable face, skin tone, short hair, mustache and beard, and a navy blue polo shirt. He has a big warm genuine smile and is welcoming the viewer, ${p}. He is the clear focal point and leaves free space for the ad text. Do not render any text other than the ad texts already specified.`;
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

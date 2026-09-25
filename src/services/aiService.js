/**
 * aiService.js
 * Servicio centralizado de IA — Groq API (compatible con OpenAI SDK).
 *
 * Modelo texto/razonamiento : qwen/qwen3-27b
 * Modelo visión (documentos): meta-llama/llama-4-scout-17b-16e-instruct
 *   (Groq no ofrece Qwen vision, pero sí Llama 4 Scout con visión nativa)
 * Modelo visión (documentos): qwen/qwen3-27b
 *
 * Base URL: https://api.groq.com/openai/v1
 * Auth    : VITE_GROQ_API_ + KEY
 */

import { supabase } from '../supabaseClient';
import { resizeImageToBase64 } from '../utils/canvasUtils';

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL_TEXT = 'openai/gpt-oss-120b';   // Texto / razonamiento general
const MODEL_VISION = 'qwen/qwen3.6-27b'; // Visión + OCR

// La API Key ya no se expone aquí. Ahora usamos Supabase Edge Functions.

/**
 * Llamada base a Groq (openai-compatible).
 * @param {string} model
 * @param {Array}  messages
 * @param {number} temperature
 * @returns {Promise<string>} contenido del mensaje del asistente
 */
async function callGroq(model, messages, temperature = 0.1, responseFormat = null, reasoningEffort = null) {
  // La clave de Groq vive solo en el servidor: todo pasa por la Edge Function `asistente` (accion 'proxy').
  const payload = { accion: 'proxy', model, messages, temperature, max_tokens: 8192 };
  if (responseFormat) payload.response_format = responseFormat;
  if (reasoningEffort) payload.reasoning_effort = reasoningEffort;

  const { data, error } = await supabase.functions.invoke('asistente', { body: payload });
  if (error || data?.error) {
    const msg = data?.error || error?.message || 'sin respuesta';
    console.error('AI proxy error:', msg);
    throw new Error(`Error en el servicio de IA: ${msg}`);
  }
  return data?.choices?.[0]?.message?.content?.trim() || '';
}

/** Limpia JSON que el modelo a veces envuelve en ```json ... ``` y remueve bloques <think> */
function cleanJson(raw) {
  let cleaned = raw;
  // Remover bloques <think> completos
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
  // Si quedó un <think> sin cerrar (modelo cortado), remover desde ahí hasta el final
  if (cleaned.includes('<think>')) {
    cleaned = cleaned.replace(/<think>[\s\S]*/gi, '');
  }
  cleaned = cleaned.trim();

  // Intentar encontrar un bloque de código JSON
  const match = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match) {
    return match[1].trim();
  }
  // Si no hay bloque, intentar encontrar el primer '{' y el último '}'
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return cleaned.substring(start, end + 1).trim();
  }
  return cleaned;
}

// ──────────────────────────────────────────────────────────────
// FUNCIÓN 1 — Analizar imagen de documento de identidad (OCR IA)
// ──────────────────────────────────────────────────────────────
/**
 * Extrae datos personales de la foto de un documento.
 * @param {File|string} fileOrBase64 - Imagen del documento (pasaporte, CPF, RNM, etc.)
 * @param {Array<{identificador: string, nombre_campo: string}>} [knownCustomFields] -
 *   Campos personalizados ya existentes en el sistema (config_campos_clientes),
 *   para que la IA reutilice su clave exacta en vez de inventar una nueva para
 *   el mismo dato. Ver useClientViewExtraction.getExtraCustomFieldsForAiPrompt.
 * @returns {Promise<object>} Campos encontrados en el documento
 */
export async function analyzeDocumentImage(fileOrBase64, knownCustomFields = []) {
  // Redimensionar imagen a max 900px / comprimir para mantener visual tokens en ~2000 (dentro del límite TPM de 8000 en Groq)
  const base64 = await resizeImageToBase64(fileOrBase64, 900, 0.8);

  const knownCustomFieldsBlock = knownCustomFields.length > 0
    ? `\n10.5. CAMPOS PERSONALIZADOS QUE YA EXISTEN EN EL SISTEMA (creados antes, a mano o por otra extracción IA). El nombre de cada uno puede terminar con el tipo de documento del que salió originalmente, entre paréntesis (ej. "Número de Licencia (CNH)"):\n${knownCustomFields.map(f => `   - ${f.identificador.toUpperCase()} (${f.nombre_campo})`).join('\n')}\n   REGLA DE REUSO — MUY IMPORTANTE, no mezclar datos entre documentos distintos:\n   - Si un campo de la lista termina en "(TIPO DE DOCUMENTO)" y ese tipo NO coincide con el "TIPO_DOCUMENTO" que vos identificaste en la imagen actual, NO lo reutilices aunque el dato se parezca conceptualmente — es de otro documento. Agregá el dato como un campo nuevo en su lugar.\n   - Si un campo de la lista coincide en tipo de documento (o no tiene tipo especificado) Y el dato coincide conceptualmente, ahí sí usá EXACTAMENTE esa clave (tal cual está escrita, en mayúsculas) — no inventes una clave distinta para el mismo dato.\n   - Solo si el dato no coincide con NINGUNO de estos ni con los campos fijos de abajo, agregalo con una clave nueva.\n`
    : '';

const prompt = `Eres un asistente especializado en leer documentos de identidad e inmigración \
(Pasaportes, CPF, RNM de Brasil, CNH, Cédulas, etc.) Y TAMBIÉN hojas escritas a mano \
(formularios, notas o listas donde un cliente o un agente anotó datos personales a mano,
en vez de un documento oficial impreso).
Analiza CUIDADOSAMENTE la imagen y extrae todos los datos personales visibles.

CONTEXTO: Esta es una herramienta interna de gestión para una agencia de trámites migratorios en Brasil. Las imágenes que recibís son fotos de documentos de identidad reales (pasaportes, CPF, RNM, etc.) u hojas manuscritas, subidas por el personal de la agencia al sistema interno de la propia agencia, con el consentimiento del titular, como parte de la gestión de su trámite — el mismo uso legítimo que haría un empleado transcribiendo el documento a mano a una ficha. Tu tarea es actuar como un parser: leer el documento y transcribir los datos visibles al formato JSON solicitado.

REGLAS DE EXTRACCIÓN MUY IMPORTANTES:
0. FORMATO DE FECHAS: Todas las fechas (nacimiento, emisión, vencimiento) DEBEN estar estrictamente en formato DD/MM/YYYY (ej. 15/10/1972). Si el documento dice "15 DE OCTUBRE DE 1972" o "1972-10-15", debes convertirlo al formato DD/MM/YYYY. NUNCA uses texto en los campos de fecha.
1. Para pasaportes (como el de Cuba), ten mucho cuidado con el orden del nombre:
   - "APELLIDOS / SURNAMES" suele aparecer ARRIBA.
   - "NOMBRES / GIVEN NAMES" suele aparecer DEBAJO.
   - Tú debes concatenarlos siempre en el orden correcto: "NOMBRE(S) APELLIDO(S)". Ejemplo: Si dice Apellidos: GUIBERT GONZALEZ y Nombres: GEORGINA, el NOMBRE_COMPLETO debe ser "GEORGINA GUIBERT GONZALEZ".
2. Números en Pasaportes:
   - "Nº DE PASAPORTE / PASSPORT Nº" (ej. letras y números como L302474) corresponde al campo "NUMERO_DOCUMENTO".
   - "Nº DE IDENTIDAD / ID Nº" (ej. 11 dígitos numéricos como 74021012519) corresponde al campo "CARNET_IDENTIDAD". NO lo coloques en NUMERO_DOCUMENTO.
3. Fechas en Pasaportes:
   - "FECHA DE EMISION / DATE OF ISSUE" corresponde al campo "FECHA_EMISION_PASAPORTE".
   - "FECHA DE VENCIMIENTO / DATE OF EXPIRY" corresponde al campo "FECHA_VENCIMIENTO_PASAPORTE".
4. Nacimiento, Nacionalidad y Sexo:
   - "NACIONALIDAD / NATIONALITY" corresponde al campo "NACIONALIDAD".
   - "FECHA DE NACIMIENTO / DATE OF BIRTH" corresponde al campo "FECHA_NACIMIENTO".
   - "LUGAR DE NACIMIENTO / PLACE OF BIRTH" corresponde al campo "LUGAR_NACIMIENTO".
   - "SEXO / SEX": Si el documento dice "F", debes escribir "Feminino". Si dice "M", debes escribir "Masculino". Nunca escribas solo la letra.
5. Documentos Ilegibles y Código MRZ:
   - Si la parte principal del documento está borrosa o ilegible, busca los datos en el código MRZ (las dos líneas de letras y números en la parte inferior).
   - En el MRZ puedes encontrar el Nombre, Apellidos, Número de Pasaporte y Carnet de Identidad.
   - Si tuviste dificultad para leer la parte principal y usaste el MRZ, pon el campo "ILEGIBLE" en true. Si se lee bien, ponlo en false.
6. Protocolos de Solicitação de Refúgio:
   - El número justo debajo del título "Protocolo de Solicitação de Refúgio" (ej. 08018.../...) corresponde al campo "NUMERO_REFUGIO".
   - "Validade" corresponde al campo "FECHA_VENCIMIENTO_REFUGIO".
   - "Filiação 1" y "Filiação 2" son los padres. Normalmente Filiação 1 es la madre ("NOMBRE_MADRE") y Filiação 2 el padre ("NOMBRE_PADRE"), pero usa el sentido común analizando los nombres si están al revés (ej. un nombre masculino en Filiação 1 sería el padre).
7. RNM (Registro Nacional Migratório de Brasil):
   - El número alfanumérico destacado bajo "RNM" (ej. F744334-H) corresponde al campo "RNM".
   - Concatena "NOME" y "SOBRENOME" para formar el "NOMBRE_COMPLETO" (ej. "ROXANA CASTILLO MANZANO").
   - "DATA DE NASCIMENTO" es "FECHA_NACIMIENTO".
   - "NACIONALIDADE" es "NACIONALIDAD".
   - Bajo "FILIAÇÃO" aparecen los padres. Asigna uno a "NOMBRE_MADRE" y otro a "NOMBRE_PADRE" por lógica de nombres.

8. TIPO DE DOCUMENTO:
   - Identifica qué documento es y colócalo en "TIPO_DOCUMENTO". Usa valores como: "PASAPORTE", "CPF", "RNM", "CARNET DE IDENTIDAD", "PROTOCOLO DE REFUGIO", "CNH", "CERTIFICADO DE NACIMIENTO", "DOCUMENTO", "HOJA MANUSCRITA", etc.
9. HOJAS MANUSCRITAS:
   - Si la imagen NO es un documento oficial sino una hoja escrita a mano (letra
     manuscrita, formulario en blanco completado a mano, lista de datos, notas,
     etc.), igual analízala: interpreta la letra lo mejor que puedas y extrae cada
     dato que reconozcas usando los mismos campos de esta lista (nombre →
     NOMBRE_COMPLETO, teléfono, dirección, etc. si aparecen).
   - Si la letra es difícil de leer, transcribe tu mejor interpretación de todos
     modos (no la descartes) y marca "ILEGIBLE" en true para que se revise a mano.
10. DATOS ADICIONALES (MUY IMPORTANTE): No te limites a los campos fijos de abajo.
   Si en el documento ves CUALQUIER OTRO dato personal identificable, ESTABLE y
   reutilizable que no encaje en ninguno de esos campos (ej. número de licencia
   de conducir, categoría de licencia, profesión, estado civil impreso, dirección
   impresa, número de seguro, código de registro, restricciones, altura, tipo de
   sangre, fecha de expedición de otro documento, etc.), agrégalo dentro del
   objeto "CAMPOS_ADICIONALES" al final del JSON, usando como clave un nombre
   corto en MAYUSCULAS_CON_GUION_BAJO que describa el dato (ej. "NUMERO_LICENCIA",
   "CATEGORIA_LICENCIA", "PROFESION"). No repitas ahí un dato que ya pusiste en un
   campo fijo de arriba, ni el nombre/tipo del archivo o documento (eso ya se
   gestiona aparte, no es un dato del cliente).
   SÉ CONSERVADOR: cada clave nueva que agregues acá crea un campo permanente en
   el sistema, así que evitá basura. NO agregues nada que sea: un código de barras,
   número de folio/página interno, watermark, texto de relleno o instrucciones
   impresas en el documento, o cualquier cosa que no puedas leer con confianza
   razonable (si dudás de si es un dato real o ruido de la imagen, mejor omitilo).
   Si no hay ningún dato adicional genuino, deja "CAMPOS_ADICIONALES" como un
   objeto vacío {}.
${knownCustomFieldsBlock}
Devuelve ÚNICAMENTE un objeto JSON puro (sin markdown, sin texto extra, SIN bloques <think> de razonamiento) con estos campos:
{
  "TIPO_DOCUMENTO": null,
  "NOMBRE_COMPLETO": null,
  "NOMBRE_MADRE": null,
  "NOMBRE_PADRE": null,
  "CPF": null,
  "RNM": null,
  "CARNET_IDENTIDAD": null,
  "FECHA_NACIMIENTO": null,
  "LUGAR_NACIMIENTO": null,
  "NACIONALIDAD": null,
  "NUMERO_DOCUMENTO": null,
  "NUMERO_REFUGIO": null,
  "FECHA_EMISION_PASAPORTE": null,
  "FECHA_VENCIMIENTO_PASAPORTE": null,
  "FECHA_VENCIMIENTO_REFUGIO": null,
  "SEXO": null,
  "ILEGIBLE": false,
  "CAMPOS_ADICIONALES": {}
}
Usa null para los campos que no estén visibles en el documento. No inventes datos.`;

  const raw = await callGroq(
    MODEL_VISION,
    [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: base64 } },
      ],
    }],
    0.1,
    { type: "json_object" },
    'none'
  );

  try {
    const parsed = JSON.parse(cleanJson(raw));
    // CAMPOS_ADICIONALES viaja como un objeto anidado para que el modelo no
    // mezcle datos sueltos con los campos fijos, pero el resto del flujo
    // (modal de revisión, guardado) espera un único objeto plano — se
    // aplanan acá antes de devolver.
    const adicionales = parsed.CAMPOS_ADICIONALES && typeof parsed.CAMPOS_ADICIONALES === 'object'
      ? parsed.CAMPOS_ADICIONALES
      : {};
    delete parsed.CAMPOS_ADICIONALES;
    const merged = { ...parsed, ...adicionales };
    // Filtrar campos null/vacíos/objetos raros para que el UI solo muestre
    // datos con valor (y nunca intente renderizar un objeto como texto).
    return Object.fromEntries(
      Object.entries(merged).filter(([, v]) => v !== null && v !== '' && typeof v !== 'object')
    );
  } catch {
    console.warn('[aiService] No se pudo parsear JSON del análisis de imagen. Respuesta cruda:', raw);
    return {};
  }
}

// ──────────────────────────────────────────────────────────────
// FUNCIÓN 1.5 — Analizar logo de marca y sugerir colores (branding)
// ──────────────────────────────────────────────────────────────
const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Analiza el logo de una organización y sugiere colores de marca (para el color
 * primario) y de fondo (para el fondo de la app). Ver
 * src/components/settings/MarcaSettings.jsx, que es donde el admin la usa.
 * @param {File|string} fileOrUrl - Archivo del logo, o su URL pública (ya subido).
 * @returns {Promise<{colores: string[], fondos: string[]}>}
 */
export async function analyzeLogoColors(fileOrUrl) {
  let source = fileOrUrl;
  if (typeof fileOrUrl === 'string') {
    source = await (await fetch(fileOrUrl)).blob();
  }
  const base64 = await resizeImageToBase64(source, 512, 0.9);

  const prompt = `Eres un diseñador experto en identidad de marca. Analiza el logo de la imagen adjunta y responde ÚNICAMENTE con un objeto JSON (sin markdown, sin texto extra) con este formato exacto:
{
  "colores": ["#RRGGBB", "#RRGGBB", "#RRGGBB"],
  "fondos": ["#RRGGBB", "#RRGGBB"]
}
- "colores": entre 3 y 5 colores dominantes o representativos del logo, en hexadecimal, del más al menos prominente. Sirven como color principal/de acento de la marca en la app.
- "fondos": entre 2 y 3 colores en hexadecimal que combinen bien como color de fondo de una aplicación junto a este logo (incluye al menos una opción clara y una oscura, priorizando buen contraste con el logo).
No inventes colores que no se relacionen con la imagen. No expliques nada, solo el JSON.`;

  const raw = await callGroq(
    MODEL_VISION,
    [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: base64 } },
      ],
    }],
    0.2
  );

  try {
    const parsed = JSON.parse(cleanJson(raw));
    const colores = Array.isArray(parsed.colores) ? parsed.colores.filter(c => HEX_RE.test(c)).slice(0, 5) : [];
    const fondos = Array.isArray(parsed.fondos) ? parsed.fondos.filter(c => HEX_RE.test(c)).slice(0, 3) : [];
    return { colores, fondos };
  } catch {
    console.warn('[aiService] No se pudo parsear JSON del análisis de colores. Respuesta cruda:', raw);
    return { colores: [], fondos: [] };
  }
}

// ──────────────────────────────────────────────────────────────
// FUNCIÓN 2 — Chat general con qwen/qwen3-27b
// ──────────────────────────────────────────────────────────────
/**
 * Envía mensajes al modelo de razonamiento qwen3-27b.
 * @param {Array<{role: string, content: string}>} messages
 * @param {number} temperature
 * @returns {Promise<string>}
 */
export async function chat(messages, temperature = 0.7) {
  return callGroq(MODEL_TEXT, messages, temperature);
}

// ──────────────────────────────────────────────────────────────
// FUNCIÓN RAG (base vectorial) — Casos parecidos de OTROS clientes
// ──────────────────────────────────────────────────────────────
/**
 * Busca sesiones de conversación de otros clientes semánticamente parecidas
 * al texto dado, usando la tabla conversaciones_embeddings (pgvector) vía
 * el Edge Function ai-embeddings. Ver database/standalone/010_vector_conversaciones.sql.
 * @param {string} texto
 * @param {{clienteIdExcluir?: number|string, limite?: number}} [opts]
 * @returns {Promise<Array<{cliente_id:number, contenido:string, servicio:string, similitud:number}>>}
 */
export async function searchSimilarCases(texto, opts = {}) {
  if (!texto || !texto.trim()) return [];
  try {
    const { data, error } = await supabase.functions.invoke('ai-embeddings', {
      body: {
        action: 'buscar_similares',
        texto,
        cliente_id_excluir: opts.clienteIdExcluir ?? null,
        limite: opts.limite ?? 5,
      },
    });
    if (error || !data?.success) return [];
    return data.casos || [];
  } catch (err) {
    console.warn('[aiService] searchSimilarCases error:', err.message);
    return [];
  }
}

function formatSimilarCases(casos) {
  if (!casos || casos.length === 0) return 'Sin casos parecidos encontrados.';
  return casos
    .map((c, i) => `Caso ${i + 1} (servicio: ${c.servicio || 'desconocido'}, similitud: ${(c.similitud * 100).toFixed(0)}%):\n${c.contenido}`)
    .join('\n\n---\n\n');
}

// ──────────────────────────────────────────────────────────────
// FUNCIÓN RAG — Chat con contexto del cliente (BD + CRM)
// ──────────────────────────────────────────────────────────────
/**
 * Genera una respuesta basada en el contexto de Supabase y Kommo CRM.
 * @param {string} userMessage - El mensaje actual del usuario.
 * @param {Array} chatHistory - Historial de la conversación con la IA.
 * @param {object} supabaseContext - Datos del cliente, trámites, etc.
 * @param {string} crmContext - Historial de WhatsApp/CRM desde n8n.
 */
export async function chatWithClientContext(userMessage, chatHistory, supabaseContext, crmContext) {
  const casosSimilares = await searchSimilarCases(userMessage, {
    clienteIdExcluir: supabaseContext?.cliente?.id,
  });

  const systemPrompt = `Eres un asistente inteligente para una agencia de gestión migratoria en Brasil.
Tu objetivo es ayudar al agente a resolver dudas, redactar respuestas o analizar el caso de un cliente específico.

A continuación, tienes TODO el contexto disponible sobre este cliente:

=== DATOS DE LA BASE DE DATOS (Supabase) ===
${JSON.stringify(supabaseContext, null, 2)}

=== HISTORIAL DE CRM / WHATSAPP ===
${crmContext}

=== CASOS PARECIDOS DE OTROS CLIENTES (cómo se resolvieron antes, para referencia) ===
${formatSimilarCases(casosSimilares)}

=== INSTRUCCIONES ===
1. Responde a la pregunta o solicitud del usuario basándote ESTRICTAMENTE en la información anterior.
2. Si te piden redactar un mensaje para el cliente, hazlo en el tono adecuado (profesional pero cercano, en español o portugués según corresponda), inspirándote en cómo se le habló al cliente en los casos parecidos si aplica.
3. Si un caso parecido tiene una resolución útil para este cliente, mencionala explícitamente.
4. Si la información no está en el contexto, di que no tienes esa información.
5. Responde en texto claro, puedes usar markdown para formatear.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...chatHistory, // Mensajes previos de la IA y el usuario
    { role: 'user', content: userMessage }
  ];

  return callGroq(MODEL_TEXT, messages, 0.5);
}

// ──────────────────────────────────────────────────────────────
// FUNCIÓN 3 — Extraer datos de cliente desde texto libre
// ──────────────────────────────────────────────────────────────
/**
 * Dado un texto (ej. copiado de un formulario), extrae datos estructurados del cliente.
 * @param {string} text
 * @returns {Promise<object>}
 */
export async function extractClientDataFromText(text) {
  const prompt = `Eres un asistente de gestión migratoria en Brasil.
Dado el siguiente texto, extrae datos del cliente y devuelve ÚNICAMENTE JSON puro:
{
  "nombre": null,
  "nombre_madre": null,
  "nombre_padre": null,
  "cpf": null,
  "rnm": null,
  "fecha_nacimiento": null,
  "nacionalidad": null,
  "numero_pasaporte": null,
  "sexo": null,
  "estado_civil": null,
  "telefono": null,
  "email": null,
  "direccion": null
}
Campos no encontrados deben ser null.

TEXTO:
${text}`;

  const raw = await callGroq(MODEL_TEXT, [{ role: 'user', content: prompt }], 0.1);
  try {
    return JSON.parse(cleanJson(raw));
  } catch {
    console.warn('[aiService] extractClientDataFromText parse error:', raw);
    return {};
  }
}

// ──────────────────────────────────────────────────────────────
// FUNCIÓN URGENCIA — Analizar si un mensaje entrante es urgente
// ──────────────────────────────────────────────────────────────
/**
 * Evalúa el nivel de urgencia de un mensaje entrante.
 * @param {string} text
 * @returns {Promise<{isUrgent: boolean, summary: string}>}
 */
export async function analyzeMessageUrgency(text) {
  const prompt = `Eres un asistente de clasificación de soporte para una agencia migratoria.
Tu objetivo es analizar el siguiente mensaje del cliente y determinar si es una EMERGENCIA que requiere atención inmediata.

Considera como URGENTE situaciones como:
- Retenciones o problemas en aeropuertos / fronteras.
- Intervenciones de la policía o autoridades migratorias (deportación, prisión).
- Emergencias médicas graves (hospital).
- Casos donde el cliente expresa desesperación extrema ("urge", "emergencia", "ayuda por favor").

NO es urgente:
- Preguntas sobre cómo va su trámite.
- Saludos ("Hola", "Buen día").
- Envío de documentos que se pidieron previamente.
- Dudas generales de precios o requisitos.

Devuelve ÚNICAMENTE un objeto JSON puro (sin markdown, sin bloques de código) con la siguiente estructura:
{
  "isUrgent": true o false,
  "summary": "Si es urgente, escribe un breve resumen de 5-10 palabras de la emergencia. Si no lo es, pon null."
}

MENSAJE DEL CLIENTE:
"${text}"`;

  try {
    const raw = await callGroq(MODEL_TEXT, [{ role: 'user', content: prompt }], 0.1);
    const parsed = JSON.parse(cleanJson(raw));
    return {
      isUrgent: !!parsed.isUrgent,
      summary: parsed.summary || 'Posible emergencia'
    };
  } catch (err) {
    console.warn('[aiService] Error en analyzeMessageUrgency:', err);
    // Ante la duda o error, no es urgente
    return { isUrgent: false, summary: null };
  }
}

// ──────────────────────────────────────────────────────────────
// FUNCIÓN 4 — Sugerir próximo paso de un trámite
// ──────────────────────────────────────────────────────────────
/**
 * Dado el historial de un trámite, sugiere el siguiente paso a seguir.
 * @param {object} tramite - Datos del trámite
 * @param {object} cliente - Datos del cliente
 * @returns {Promise<string>} Sugerencia en texto
 */
export async function suggestNextStep(tramite, cliente) {
  const prompt = `Eres un asistente experto en trámites migratorios en Brasil (Policía Federal, MTE, etc.).
Dado el siguiente contexto, sugiere el próximo paso concreto a seguir.

Cliente: ${JSON.stringify(cliente)}
Trámite: ${JSON.stringify(tramite)}

Responde en español, de forma concisa (máx 3 oraciones). No uses markdown.`;

  return callGroq(MODEL_TEXT, [{ role: 'user', content: prompt }], 0.5);
}

// ──────────────────────────────────────────────────────────────
// NUEVO — Global AI Chat Tools & Tool Calling Integration
// ──────────────────────────────────────────────────────────────

/**
 * Searches clients by name using partial match (.ilike) on the 'clientes' table.
 * @param {string} name
 * @returns {Promise<Array>}
 */
export async function searchClientsByName(name) {
  try {
    if (!name || name.trim().length === 0) {
      return [];
    }
    const { data, error } = await supabase
      .from('clientes')
      .select('*')
      .ilike('nombre', `%${name}%`);
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error("Error searching clients by name:", err);
    return [];
  }
}

/**
 * Counts entries in the 'entradas' table with estado_tramite === 'pendiente'.
 * @returns {Promise<number>}
 */
export async function countPendingProcedures() {
  try {
    const { count, error } = await supabase
      .from('entradas')
      .select('*', { count: 'exact', head: true })
      .eq('estado_tramite', 'pendiente');
    if (error) throw error;
    return count || 0;
  } catch (err) {
    console.error("Error counting pending procedures:", err);
    return 0;
  }
}

/**
 * Queries total clients, total procedures, and breakdown of procedures by status.
 * @returns {Promise<object>}
 */
export async function getOverallStats() {
  try {
    const { count: totalClientes, error: err1 } = await supabase
      .from('clientes')
      .select('*', { count: 'exact', head: true });
    if (err1) throw err1;

    const { data: entries, error: err2 } = await supabase
      .from('entradas')
      .select('estado_tramite');
    if (err2) throw err2;

    const totalTramites = entries ? entries.length : 0;
    const breakdown = {};
    if (entries) {
      entries.forEach(entry => {
        const status = entry.estado_tramite || 'desconocido';
        breakdown[status] = (breakdown[status] || 0) + 1;
      });
    }

    return {
      totalClients: totalClientes || 0,
      totalProcedures: totalTramites,
      breakdown
    };
  } catch (err) {
    console.error("Error getting overall stats:", err);
    return {
      totalClients: 0,
      totalProcedures: 0,
      breakdown: {}
    };
  }
}

// ──────────────────────────────────────────────────────────────
// NUEVO — Agente de Acciones: el chat global ahora puede EJECUTAR las mismas
// operaciones que haría un operario a mano en el panel (mover documentos,
// actualizar datos de un cliente, vincular clientes, cambiar estado de un
// trámite, generar el PDF Único), no solo consultar. Reutiliza las mismas
// funciones de servicio que usa la UI -- nunca hace un supabase.from() de
// escritura directo acá -- así que cualquier regla de negocio (recalcular
// valor de trámite, historial, etc.) se aplica igual que si lo hiciera un
// humano.
//
// Deliberadamente NO se exponen tools de borrado (eliminar cliente/documento/
// relación/trámite/pago): son irreversibles y quedan reservadas a la UI, que
// sí pide confirmación explícita antes de cada delete.
// ──────────────────────────────────────────────────────────────

// Campos de `clientes` que el agente puede tocar. Deliberadamente excluye
// credenciales del portal (clave_acceso, numero_cliente), valores/pagos
// (valor_total, valor_pago_inicial) y campos internos (id, creado_en, bot_activo).
const AGENT_UPDATABLE_CLIENT_FIELDS = new Set([
  'nombre', 'telefono', 'email', 'pais', 'ciudad', 'estado', 'estado_federal',
  'atendente', 'tramite', 'estado_cliente', 'policia_federal',
  'fecha_entrada_cliente', 'estado_civil', 'sexo', 'nacionalidad',
  'numero_pasaporte', 'nombre_madre', 'nombre_padre', 'rnm',
  'fecha_entrada_brasil', 'lugar_entrada_brasil', 'direccion',
  'numero_refugio', 'fecha_vencimiento_refugio', 'fecha_vencimiento_pasaporte',
  'carnet_identidad', 'fecha_emision_pasaporte', 'lugar_nacimiento',
  'fecha_nacimiento', 'cpf', 'recurrencia', 'fecha_ultimo_contacto',
]);

/** Ficha completa de un cliente: datos, documentos, relaciones y trámites -- para que el agente confirme el contexto antes de actuar. */
export async function agentGetClienteDetails(clienteId) {
  const { getCliente, getRelaciones } = await import('./clientesService');
  const { getDocuments } = await import('./storageService');
  const { getEntradas } = await import('./tramitesService');
  const [cliente, relaciones, documentos, entradas] = await Promise.all([
    getCliente(clienteId),
    getRelaciones(clienteId).catch(() => []),
    getDocuments(clienteId).catch(() => []),
    getEntradas(clienteId).catch(() => []),
  ]);
  return {
    cliente,
    relaciones: (relaciones || []).map(r => ({
      id: r.id,
      tipo_relacion: r.tipo_relacion,
      otro: r.cliente_id === Number(clienteId) ? r.cliente_secundario : r.cliente_principal,
    })),
    documentos: (documentos || []).map(d => ({
      id: d.id, nombre_archivo: d.nombre_archivo, tipo_documento: d.tipo_documento, estado: d.estado, creado_en: d.creado_en,
    })),
    entradas: (entradas || []).map(e => ({
      id: e.id, servicio: e.servicio, estado_tramite: e.estado_tramite, valor: e.valor,
    })),
  };
}

export async function agentUpdateCliente(clienteId, updates) {
  const { updateCliente } = await import('./clientesService');
  const filtered = {};
  for (const [key, value] of Object.entries(updates || {})) {
    if (AGENT_UPDATABLE_CLIENT_FIELDS.has(key)) filtered[key] = value;
  }
  if (Object.keys(filtered).length === 0) {
    return { ok: false, error: 'Ningún campo enviado es editable por el agente.' };
  }
  const data = await updateCliente(clienteId, filtered);
  return { ok: true, cliente: data };
}

export async function agentMoveDocumento(documentoId, clienteDestinoId) {
  const { reassignDocument } = await import('./storageService');
  return reassignDocument(documentoId, clienteDestinoId);
}

export async function agentSetDocumentoEstado(documentoId, estado) {
  const isPendiente = typeof documentoId === 'string' && documentoId.includes('-');
  const table = isPendiente ? 'documentos_pendientes' : 'documentos_operacionales';
  const column = isPendiente ? 'verificado' : 'estado';
  const value = isPendiente ? estado === 'verificado' : estado;
  const { error } = await supabase.from(table).update({ [column]: value }).eq('id', documentoId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function agentVincularClientes(clienteIdA, clienteIdB, tipoRelacion) {
  const { insertRelacion } = await import('./clientesService');
  await insertRelacion({ cliente_id: clienteIdA, cliente_relacionado_id: clienteIdB, tipo_relacion: tipoRelacion || 'Familiar' });
  return { ok: true };
}

export async function agentListFastopAcciones() {
  const { getFastopAcciones } = await import('./tramitesService');
  const acciones = await getFastopAcciones('pdf_unico');
  return acciones.map(a => ({ id: a.id, nombre: a.nombre }));
}

export async function agentUpdateEntradaEstado(entradaId, estadoTramite) {
  const { updateEntradaEstado } = await import('./tramitesService');
  await updateEntradaEstado(entradaId, estadoTramite);
  return { ok: true };
}

/** Genera el PDF Único de un cliente para una acción FastOp, igual que DocumentoUnicoModal/GlobalDocumentoUnicoListener. Queda como borrador 'pendiente' para que un operario lo apruebe. */
export async function agentGenerarPdfUnico(clienteId, tramiteCatalogoId) {
  const { getCliente } = await import('./clientesService');
  const { getRequisitosTramite } = await import('./tramitesService');
  const { getDocuments } = await import('./storageService');
  const { mergeDocumentsToPdfWithGaps } = await import('./pdfMergerService');
  const { uploadGeneratedDocumentToClient } = await import('./templateService');

  const VALID_MERGE_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
  const isValidForMerge = (doc) => {
    if (doc.estado === 'rechazado') return false; // descartado -- nunca entra a un PDF Único
    if (doc.tipo_contenido && VALID_MERGE_TYPES.includes(doc.tipo_contenido)) return true;
    const name = (doc.nombre_archivo || '').toLowerCase();
    return name.endsWith('.pdf') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.webp');
  };

  const [cliente, requisitos, docs] = await Promise.all([
    getCliente(clienteId),
    getRequisitosTramite(tramiteCatalogoId),
    getDocuments(clienteId),
  ]);

  if (!cliente) return { ok: false, error: 'Cliente no encontrado.' };
  if (requisitos.length === 0) return { ok: false, error: 'Esta acción de PDF Único no tiene checklist configurado.' };

  const mergeableDocs = docs.filter(isValidForMerge);
  const bestDocFor = (tipoDocumento) =>
    mergeableDocs.filter(d => d.tipo_documento === tipoDocumento)
      .sort((a, b) => new Date(b.creado_en || 0) - new Date(a.creado_en || 0))[0];

  const slots = requisitos.map(req => ({
    doc: bestDocFor(req.tipo_documento) || null,
    label: req.tipo_dato,
    obligatorio: req.obligatorio,
  }));

  const { blob, missing } = await mergeDocumentsToPdfWithGaps(slots);
  const filename = `PDF UNICO BORRADOR - ${(cliente.nombre || 'CLIENTE').toUpperCase()}.pdf`.replace(/[^a-zA-Z0-9.\-_ ]/g, '');

  await uploadGeneratedDocumentToClient(blob, filename, cliente, {
    estado: 'pendiente',
    tipoDocumento: 'PDF_UNICO_BORRADOR',
    subidoPor: 'Agente IA (Chat)',
    silent: true,
  });

  return {
    ok: true,
    completo: missing.length === 0,
    faltantes: missing,
    mensaje: missing.length === 0
      ? 'PDF Único generado completo, subido como borrador pendiente de aprobación en la ficha del cliente.'
      : `PDF Único generado incompleto -- faltan: ${missing.join(', ')}. Subido como borrador pendiente de aprobación.`,
  };
}

const tools = [
  {
    type: 'function',
    function: {
      name: 'searchClientsByName',
      description: 'Busca clientes por su nombre en la base de datos (búsqueda parcial).',
      parameters: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'El nombre o parte del nombre del cliente a buscar'
          }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'countPendingProcedures',
      description: 'Obtiene el número de trámites en estado pendiente.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'getOverallStats',
      description: 'Obtiene estadísticas generales del sistema, incluyendo total de clientes y de trámites.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'searchSimilarCases',
      description: 'Busca en el historial de conversaciones de WhatsApp de TODOS los clientes casos parecidos a un problema o pregunta dada, para ver cómo se resolvieron antes y cómo se le habló al cliente.',
      parameters: {
        type: 'object',
        properties: {
          texto: {
            type: 'string',
            description: 'Descripción del problema o pregunta a buscar (ej. "cliente con RNM vencido esperando renovación")'
          }
        },
        required: ['texto']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'agentGetClienteDetails',
      description: 'Obtiene la ficha completa de un cliente: sus datos, documentos, relaciones con otros clientes y trámites. Úsala ANTES de mover/editar algo para confirmar que el cliente y sus documentos son los correctos.',
      parameters: {
        type: 'object',
        properties: {
          clienteId: { type: 'number', description: 'ID numérico del cliente' }
        },
        required: ['clienteId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'agentUpdateCliente',
      description: 'Actualiza campos del perfil de un cliente (ej. dirección, teléfono, nacionalidad, fecha de entrada a Brasil, estado civil, etc.). No permite tocar credenciales del portal, valores/pagos ni eliminar nada.',
      parameters: {
        type: 'object',
        properties: {
          clienteId: { type: 'number' },
          updates: {
            type: 'object',
            description: 'Pares campo:valor a actualizar usando los nombres de columna de la tabla clientes (ej. {"direccion": "Rua X, 123", "telefono": "+55..."})'
          }
        },
        required: ['clienteId', 'updates']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'agentMoveDocumento',
      description: 'Mueve (reasigna) un documento ya subido de un cliente a otro. Confirma primero con agentGetClienteDetails el ID del documento y del cliente destino.',
      parameters: {
        type: 'object',
        properties: {
          documentoId: { description: 'ID del documento (número o UUID) a mover' },
          clienteDestinoId: { type: 'number', description: 'ID del cliente al que se debe mover el documento' }
        },
        required: ['documentoId', 'clienteDestinoId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'agentSetDocumentoEstado',
      description: 'Marca un documento como verificado o pendiente -- el mismo toggle que usa el staff en la lista de documentos del cliente.',
      parameters: {
        type: 'object',
        properties: {
          documentoId: { description: 'ID del documento (número o UUID)' },
          estado: { type: 'string', enum: ['verificado', 'pendiente'] }
        },
        required: ['documentoId', 'estado']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'agentVincularClientes',
      description: 'Crea un vínculo/relación entre dos clientes (ej. familiares, mismo grupo migratorio) en relaciones_clientes.',
      parameters: {
        type: 'object',
        properties: {
          clienteIdA: { type: 'number' },
          clienteIdB: { type: 'number' },
          tipoRelacion: { type: 'string', description: 'Ej. "Familiar", "Cónyuge", "Hijo/a". Por defecto "Familiar".' }
        },
        required: ['clienteIdA', 'clienteIdB']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'agentListFastopAcciones',
      description: 'Lista las variantes configuradas de "PDF Único" (acciones FastOp) con su ID y nombre -- necesarios para llamar a agentGenerarPdfUnico.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'agentGenerarPdfUnico',
      description: 'Genera el PDF Único de un cliente para una acción FastOp específica (ver agentListFastopAcciones), juntando sus documentos según el checklist configurado. Si faltan documentos obligatorios igual genera el PDF marcando qué falta. Queda subido como borrador pendiente de aprobación en la ficha del cliente.',
      parameters: {
        type: 'object',
        properties: {
          clienteId: { type: 'number' },
          tramiteCatalogoId: { type: 'number', description: 'ID de la acción FastOp (de agentListFastopAcciones)' }
        },
        required: ['clienteId', 'tramiteCatalogoId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'agentUpdateEntradaEstado',
      description: 'Cambia el estado de un trámite (entrada) de un cliente, ej. a "procesando", "completada", "cancelada".',
      parameters: {
        type: 'object',
        properties: {
          entradaId: { type: 'number' },
          estadoTramite: { type: 'string' }
        },
        required: ['entradaId', 'estadoTramite']
      }
    }
  }
];

/**
 * Chat multi-turno con soporte para llamadas a funciones (tool calling).
 * @param {Array<{role: string, content: string}>} chatHistory
 * @returns {Promise<string>}
 */
export async function chatWithTools(chatHistory, organizationName) {
  const apiKey = getApiKey();
  let orgName = organizationName;
  if (!orgName) {
    try {
      // Empresa única, sin multi-tenant: el nombre vive en la fila única de
      // `configuracion_empresa` (ver OrganizationContext / marcaService.js).
      const { data: empresa } = await supabase
        .from('configuracion_empresa')
        .select('nombre')
        .limit(1)
        .maybeSingle();
      orgName = empresa?.nombre;
    } catch (e) {
      console.warn('Error fetching organization name dynamically:', e);
    }
  }
  if (!orgName) {
    orgName = 'Agencia Inicial';
  }

  const systemPrompt = `Eres un agente de IA operativo para la agencia de gestión migratoria "${orgName}". Tienes herramientas para CONSULTAR y también para EJECUTAR acciones reales en el panel, las mismas que haría un operario a mano: mover documentos entre clientes, actualizar datos de un cliente, vincular clientes entre sí, cambiar el estado de un trámite y generar el PDF Único.
REGLA CRÍTICA: SOLO puedes hablar y actuar sobre los clientes, los trámites y el CRM de la empresa. Bajo NINGUNA circunstancia responderás preguntas generales, chistes, temas de cultura, programación, o cualquier cosa ajena a la empresa. Si el usuario te pregunta sobre temas ajenos, debes negarte educadamente y recordarle que tu única función es operar los datos internos de ${orgName}.
REGLAS DE SEGURIDAD PARA ACCIONES:
- Antes de mover un documento, editar un cliente o vincular dos clientes, usa searchClientsByName y/o agentGetClienteDetails para confirmar el ID correcto del cliente (y del documento, si aplica) -- nunca inventes un ID.
- Si el pedido es ambiguo (varios clientes con nombre parecido, o no está claro qué documento mover), pregunta antes de ejecutar nada.
- No tienes ninguna herramienta para BORRAR nada (clientes, documentos, relaciones, trámites, pagos). Si te piden eliminar algo, explica que eso debe hacerse a mano en el panel por seguridad.
- Después de ejecutar una acción, confirma en tu respuesta qué hiciste exactamente (qué se movió/cambió y hacia dónde).
REGLA MUY IMPORTANTE: Cuando menciones a un cliente específico, y especialmente si el usuario te pregunta por un cliente, DEBES incluir al final de tu respuesta una etiqueta especial con este formato exacto: [VIEW_CLIENT:ID_DEL_CLIENTE:NOMBRE_DEL_CLIENTE]. Por ejemplo, si hablas de Juan Pérez con ID 123, pon: [VIEW_CLIENT:123:Juan Pérez]. Esto permitirá que se genere un botón para que el usuario pueda abrir el perfil del cliente.
Siempre responde de manera profesional y en español.`;

  let messages = [...chatHistory];
  if (!messages.some(m => m.role === 'system')) {
    messages.unshift({ role: 'system', content: systemPrompt });
  }

  try {
    const response = await fetch(GROQ_BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL_TEXT,
        messages: messages,
        temperature: 0.1,
        tools: tools,
        tool_choice: 'auto'
      })
    });

    if (!response.ok) {
      throw new Error(`Groq HTTP error: ${response.status}`);
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;
    if (!message) {
      throw new Error("No response message from Groq");
    }

    // Check if the model decides to call functions
    if (message.tool_calls && message.tool_calls.length > 0) {
      messages.push(message);

      for (const toolCall of message.tool_calls) {
        const functionName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments || '{}');
        let result;

        // Cada tool corre en su propio try/catch: a diferencia de las 4 tools
        // de solo-lectura originales, varias de las nuevas ESCRIBEN en la
        // base de datos -- si una falla (ej. ID inválido), el agente debe
        // enterarse del error y poder explicárselo al usuario, no que se
        // rompa todo el chat y se pierda el resto de la conversación con
        // tool calls (ver catch general más abajo, que descarta las tools).
        try {
          if (functionName === 'searchClientsByName') {
            result = await searchClientsByName(args.name);
          } else if (functionName === 'countPendingProcedures') {
            result = await countPendingProcedures();
          } else if (functionName === 'getOverallStats') {
            result = await getOverallStats();
          } else if (functionName === 'searchSimilarCases') {
            result = await searchSimilarCases(args.texto);
          } else if (functionName === 'agentGetClienteDetails') {
            result = await agentGetClienteDetails(args.clienteId);
          } else if (functionName === 'agentUpdateCliente') {
            result = await agentUpdateCliente(args.clienteId, args.updates);
          } else if (functionName === 'agentMoveDocumento') {
            result = await agentMoveDocumento(args.documentoId, args.clienteDestinoId);
          } else if (functionName === 'agentSetDocumentoEstado') {
            result = await agentSetDocumentoEstado(args.documentoId, args.estado);
          } else if (functionName === 'agentVincularClientes') {
            result = await agentVincularClientes(args.clienteIdA, args.clienteIdB, args.tipoRelacion);
          } else if (functionName === 'agentListFastopAcciones') {
            result = await agentListFastopAcciones();
          } else if (functionName === 'agentGenerarPdfUnico') {
            result = await agentGenerarPdfUnico(args.clienteId, args.tramiteCatalogoId);
          } else if (functionName === 'agentUpdateEntradaEstado') {
            result = await agentUpdateEntradaEstado(args.entradaId, args.estadoTramite);
          } else {
            throw new Error(`Unknown tool execution requested: ${functionName}`);
          }
        } catch (toolErr) {
          result = { ok: false, error: toolErr.message || String(toolErr) };
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          name: functionName,
          content: JSON.stringify(result)
        });
      }

      // Recursive call to send the tool output back to Groq
      return chatWithTools(messages, orgName);
    }

    return message.content || '';
  } catch (error) {
    console.error("Error in chatWithTools:", error);
    // Fallback: standard chat response if tool calling is not supported or if Groq fails.
    try {
      return await chat(chatHistory);
    } catch (fallbackError) {
      console.error("Fallback chat failed:", fallbackError);
      return "Lo siento, ocurrió un error y no puedo responder en este momento.";
    }
  }
}

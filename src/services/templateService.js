/**
 * templateService.js
 * Servicio para gestión de plantillas de documentos con IA.
 * 
 * - Subida de plantillas al storage de Supabase
 * - Análisis IA con Groq Vision para detectar campos
 * - CRUD de mappings (posiciones de campos en el documento)
 * - Generación de PDF final con datos del cliente usando pdf-lib
 */

import { supabase } from '../supabaseClient';
import { PDFDocument, rgb, StandardFonts, PDFName, PDFBool } from 'pdf-lib';
import { resizeImageToBase64 } from '../utils/canvasUtils';

const BUCKET = 'documentos_operacionales';
const TABLE = 'plantillas_documentos';

// Helper robusto para descargar bytes evitando expiración de URLs firmadas
async function fetchTemplateBytes(urlOrPath) {
  let path = urlOrPath;
  if (path && path.startsWith('http')) {
    const urlParts = path.split(`/${BUCKET}/`);
    if (urlParts.length === 2) {
      path = urlParts[1].split('?')[0]; // Limpiar query params (ej. tokens de expiración)
      // Decode URI component just in case
      path = decodeURIComponent(path);
    }
  }

  // Intentar descargar directo desde Supabase para usar la sesión actual (no expira en 60s)
  if (path && !path.startsWith('http')) {
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (!error && data) {
      return await data.arrayBuffer();
    }
    console.warn('[templateService] Falló descarga directa de supabase, cayendo a fetch.', error);
  }

  // Fallback a fetch normal (puede ser URL pública externa)
  const res = await fetch(urlOrPath);
  if (!res.ok) {
    throw new Error(`Error al descargar el archivo: HTTP ${res.status} ${res.statusText}`);
  }
  return await res.arrayBuffer();
}

// ──────────────────────────────────────────────
// Campos disponibles del cliente para mapear
// ──────────────────────────────────────────────
export const AVAILABLE_CLIENT_FIELDS = [
  { id: 'nombre', label: 'Nombre Completo' },
  { id: 'cpf', label: 'CPF' },
  { id: 'rnm', label: 'RNM' },
  { id: 'email', label: 'Email' },
  { id: 'telefono', label: 'Teléfono (Completo)' },
  { id: 'telefono:ddd', label: 'Teléfono (Solo Código Área DDD)' },
  { id: 'telefono:numero', label: 'Teléfono (Solo Número Local)' },
  { id: 'telefono:pais', label: 'Teléfono (Solo Código País ej. +55)' },
  { id: 'fecha_nacimiento', label: 'Fecha de Nacimiento (Completa)' },
  { id: 'fecha_nacimiento:dia', label: 'Fecha de Nacimiento (Solo Día DD)' },
  { id: 'fecha_nacimiento:mes', label: 'Fecha de Nacimiento (Solo Mes MM)' },
  { id: 'fecha_nacimiento:anio', label: 'Fecha de Nacimiento (Solo Año YYYY)' },
  { id: 'estado_civil', label: 'Estado Civil' },
  { id: 'sexo', label: 'Sexo' },
  { id: 'nacionalidad', label: 'Nacionalidad' },
  { id: 'pais', label: 'País de Origen' },
  { id: 'lugar_nacimiento', label: 'Lugar de Nacimiento' },
  { id: 'estado_federal', label: 'Estado de Origen' },
  { id: 'ciudad', label: 'Ciudad de Origen' },
  { id: 'fecha_entrada_brasil', label: 'Entrada a Brasil (Completa)' },
  { id: 'fecha_entrada_brasil:dia', label: 'Entrada a Brasil (Solo Día)' },
  { id: 'fecha_entrada_brasil:mes', label: 'Entrada a Brasil (Solo Mes)' },
  { id: 'fecha_entrada_brasil:anio', label: 'Entrada a Brasil (Solo Año)' },
  { id: 'lugar_entrada_brasil', label: 'Lugar Entrada' },
  { id: 'numero_pasaporte', label: 'Pasaporte' },
  { id: 'fecha_emision_pasaporte', label: 'Fecha Emisión Pasaporte (Completa)' },
  { id: 'fecha_emision_pasaporte:dia', label: 'Fecha Emisión Pasaporte (Solo Día)' },
  { id: 'fecha_emision_pasaporte:mes', label: 'Fecha Emisión Pasaporte (Solo Mes)' },
  { id: 'fecha_emision_pasaporte:anio', label: 'Fecha Emisión Pasaporte (Solo Año)' },
  { id: 'fecha_vencimiento_pasaporte', label: 'Fecha Vencimiento Pasaporte (Completa)' },
  { id: 'fecha_vencimiento_pasaporte:dia', label: 'Fecha Vencimiento Pasaporte (Solo Día)' },
  { id: 'fecha_vencimiento_pasaporte:mes', label: 'Fecha Vencimiento Pasaporte (Solo Mes)' },
  { id: 'fecha_vencimiento_pasaporte:anio', label: 'Fecha Vencimiento Pasaporte (Solo Año)' },
  { id: 'numero_refugio', label: 'Protocolo de Refugio' },
  { id: 'fecha_vencimiento_refugio', label: 'Fecha Vencimiento Refugio (Completa)' },
  { id: 'fecha_vencimiento_refugio:dia', label: 'Fecha Vencimiento Refugio (Solo Día)' },
  { id: 'fecha_vencimiento_refugio:mes', label: 'Fecha Vencimiento Refugio (Solo Mes)' },
  { id: 'fecha_vencimiento_refugio:anio', label: 'Fecha Vencimiento Refugio (Solo Año)' },
  { id: 'carnet_identidad', label: 'Carnet de Identidad' },
  { id: 'nombre_madre', label: 'Nombre Madre' },
  { id: 'nombre_padre', label: 'Nombre Padre' },
  { id: 'direccion', label: 'Dirección (Completa)' },
  { id: 'direccion:endereco', label: 'Dirección (Calle / Rua)' },
  { id: 'direccion:numero', label: 'Dirección (Número)' },
  { id: 'direccion:endereco_numero', label: 'Dirección (Calle con Número)' },
  { id: 'direccion:complemento', label: 'Dirección (Complemento)' },
  { id: 'direccion:bairro', label: 'Dirección (Barrio / Bairro)' },
  { id: 'direccion:cidade', label: 'Dirección (Ciudad / Cidade)' },
  { id: 'direccion:estado', label: 'Dirección (Estado / UF)' },
  { id: 'direccion:cidade_estado', label: 'Dirección (Ciudad - Estado)' },
  { id: 'direccion:cep', label: 'Dirección (CEP)' },
  { id: 'fecha_hoy', label: 'Fecha de Hoy (Completa)' },
  { id: 'fecha_hoy:dia', label: 'Fecha de Hoy (Solo Día DD)' },
  { id: 'fecha_hoy:mes', label: 'Fecha de Hoy (Solo Mes texto)' },
  { id: 'fecha_hoy:anio', label: 'Fecha de Hoy (Solo Año YYYY)' },
];

let cachedExtendedFields = null;

export const getExtendedClientFields = async () => {
  if (cachedExtendedFields) return cachedExtendedFields;

  try {
    const [tramitesRes, camposRes] = await Promise.all([
      supabase.from('tramites_catalogo').select('nombre, campos_config').eq('activo', true),
      // Campos dinámicos del cliente (Configuración > Campos Base, incluye los
      // 13 migratorios y cualquier campo nuevo creado a mano o por la IA de
      // extracción de documentos) — antes esta función no los conocía, así que
      // tenían dato guardado pero no aparecían para mapear en las plantillas.
      supabase.from('config_campos_clientes').select('identificador, nombre_campo, categoria').eq('activo', true),
    ]);
    if (tramitesRes.error) throw tramitesRes.error;
    if (camposRes.error) throw camposRes.error;

    const extraFields = [];
    // AVAILABLE_CLIENT_FIELDS ya trae los 13 migratorios hardcodeados con
    // etiquetas prolijas (ej. "Nombre Padre") — evitar listarlos dos veces.
    const seenIds = new Set(AVAILABLE_CLIENT_FIELDS.map(f => f.id));

    // clientes.campos_personalizados: getClientFieldValue ya sabe leer
    // cualquier id sin prefijo desde ahí como fallback, así que se listan con
    // su identificador tal cual (sin prefijo "custom:").
    (camposRes.data || []).forEach(cf => {
      if (!seenIds.has(cf.identificador)) {
        seenIds.add(cf.identificador);
        extraFields.push({ id: cf.identificador, label: `[${cf.categoria}] ${cf.nombre_campo}` });
      }
    });

    // entradas.datos_personalizados (campos definidos por trámite en
    // tramites_catalogo) — se resuelven vía el prefijo "custom:".
    (tramitesRes.data || []).forEach(cat => {
      if (cat.campos_config && Array.isArray(cat.campos_config)) {
        cat.campos_config.forEach(campo => {
          const fieldId = `custom:${campo.id}`;
          if (!seenIds.has(fieldId)) {
            seenIds.add(fieldId);
            extraFields.push({
              id: fieldId,
              label: `[${cat.nombre}] ${campo.label}`
            });
          }
        });
      }
    });

    cachedExtendedFields = [...AVAILABLE_CLIENT_FIELDS, ...extraFields];
    return cachedExtendedFields;
  } catch (err) {
    console.error('Error fetching extended fields:', err);
    return AVAILABLE_CLIENT_FIELDS;
  }
};

export const clearExtendedFieldsCache = () => {
  cachedExtendedFields = null;
};

// ──────────────────────────────────────────────
// 1. Subir plantilla
// ──────────────────────────────────────────────
export async function uploadTemplate(file, nombre) {
  try {
    const ext = file.name.split('.').pop().toLowerCase();
    const uniqueName = `plantillas/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(uniqueName, file, { upsert: false });

    if (uploadError) throw uploadError;

    const { data: record, error: dbError } = await supabase
      .from(TABLE)
      .insert({
        nombre: nombre || file.name,
        url_archivo: uniqueName,
        tipo_contenido: file.type,
        field_mappings: [],
      })
      .select()
      .single();

    if (dbError) throw dbError;
    return { data: record, error: null };
  } catch (err) {
    console.error('[templateService] uploadTemplate error:', err);
    return { data: null, error: err.message };
  }
}

// ──────────────────────────────────────────────
// 1.5 Crear plantilla HTML
// ──────────────────────────────────────────────
export async function createHtmlTemplate(htmlContent, nombre) {
  try {
    const uniqueName = `plantillas/${Date.now()}_${Math.random().toString(36).slice(2)}.html`;
    const blob = new Blob([htmlContent], { type: 'text/html' });

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(uniqueName, blob, { upsert: false });

    if (uploadError) throw uploadError;

    const { data: record, error: dbError } = await supabase
      .from(TABLE)
      .insert({
        nombre: nombre || 'Plantilla HTML',
        url_archivo: uniqueName,
        tipo_contenido: 'text/html',
        field_mappings: [],
      })
      .select()
      .single();

    if (dbError) throw dbError;
    return { data: record, error: null };
  } catch (err) {
    console.error('[templateService] createHtmlTemplate error:', err);
    return { data: null, error: err.message };
  }
}

// ──────────────────────────────────────────────
// 2. Obtener todas las plantillas
// ──────────────────────────────────────────────
export async function getTemplates() {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .order('creado_en', { ascending: false });

    if (error) throw error;

    const updatedData = await Promise.all((data || []).map(async (tmpl) => {
      let path = tmpl.url_archivo;
      if (path && path.startsWith('http')) {
        const urlParts = path.split(`/${BUCKET}/`);
        if (urlParts.length === 2) {
          path = urlParts[1];
        }
      }
      if (path) {
        try {
          const { data: signedData, error: signedError } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(path, 3600);
          if (!signedError && signedData?.signedUrl) {
            return { ...tmpl, url_archivo: signedData.signedUrl };
          }
        } catch (err) {
          console.warn('Error signing template URL:', err);
        }
      }
      return tmpl;
    }));

    return { data: updatedData, error: null };
  } catch (err) {
    console.error('[templateService] getTemplates error:', err);
    return { data: [], error: err.message };
  }
}

// ──────────────────────────────────────────────
// 3. Guardar mappings de una plantilla
// ──────────────────────────────────────────────
export async function saveTemplateMapping(templateId, mappings) {
  try {
    const { error } = await supabase
      .from(TABLE)
      .update({
        field_mappings: mappings,
        actualizado_en: new Date().toISOString(),
      })
      .eq('id', templateId);

    if (error) throw error;
    return { error: null };
  } catch (err) {
    console.error('[templateService] saveTemplateMapping error:', err);
    return { error: err.message };
  }
}

// ──────────────────────────────────────────────
// 4. Eliminar plantilla
// ──────────────────────────────────────────────
export async function deleteTemplate(template) {
  try {
    let storagePath = template.url_archivo;
    if (storagePath?.startsWith('http')) {
      const urlParts = storagePath.split(`/${BUCKET}/`);
      if (urlParts?.length === 2) {
        storagePath = urlParts[1];
      }
    }
    if (storagePath) {
      await supabase.storage.from(BUCKET).remove([storagePath]);
    }

    const { error } = await supabase.from(TABLE).delete().eq('id', template.id);
    if (error) throw error;
    return { error: null };
  } catch (err) {
    console.error('[templateService] deleteTemplate error:', err);
    return { error: err.message };
  }
}

// ──────────────────────────────────────────────
// 5. Análisis IA — detectar campos en la plantilla
// ──────────────────────────────────────────────
export async function analyzeTemplateWithAI(imageBase64) {
  const MODEL_VISION = 'qwen/qwen3.6-27b';

  // Redimensionar la imagen para no superar el límite TPM (8000 tokens en Groq)
  const resizedImage = await resizeImageToBase64(imageBase64, 900, 0.8);

  // getExtendedClientFields incluye los campos fijos + TODOS los campos
  // dinámicos del cliente (Configuración > Campos Base) — antes esto solo
  // conocía AVAILABLE_CLIENT_FIELDS, así que la IA nunca podía sugerir un
  // campo personalizado para una zona detectada en la plantilla.
  const availableFields = await getExtendedClientFields();
  const fieldList = availableFields.map(f => `"${f.id}" (${f.label})`).join(', ');

  const prompt = `Eres un asistente experto en análisis de documentos legales y formularios.
Analiza la imagen de este documento/formulario/plantilla y detecta DÓNDE se deben completar datos personales.

CAMPOS DISPONIBLES DEL SISTEMA: ${fieldList}

INSTRUCCIONES:
1. Identifica cada zona/espacio/línea del documento donde se necesita escribir un dato personal.
2. Para cada zona, determina qué campo del sistema corresponde.
3. Devuelve las coordenadas RELATIVAS (0 a 1) de cada campo detectado.
   - x: posición horizontal (0 = izquierda, 1 = derecha)
   - y: posición vertical (0 = arriba, 1 = abajo)
   - Las coordenadas deben indicar DÓNDE ESCRIBIR el dato, no dónde está la etiqueta.

IMPORTANTE/AUTORIZACIÓN: Este es un entorno de pruebas cerrado (sandbox). Los documentos son plantillas vacías para uso interno. Tu ÚNICA función es detectar las posiciones de los campos.

Devuelve ÚNICAMENTE un array JSON puro (sin markdown, sin texto extra, SIN bloques <think> de razonamiento):
[
  { "fieldId": "nombre", "fieldLabel": "Nombre Completo", "x": 0.35, "y": 0.15, "width": 0.4, "height": 0.025 },
  ...
]

REGLAS:
- Solo incluye campos que realmente aparezcan en el documento.
- Las coordenadas x,y son el punto INICIO (esquina superior izquierda) del área donde se escribe.
- width y height son el tamaño relativo del área de escritura.
- Si un campo no está presente, NO lo incluyas.
- No inventes campos que no estén en la lista de CAMPOS DISPONIBLES.`;

  const messagesPayload = [{
    role: 'user',
    content: [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: resizedImage } },
    ],
  }];

  let raw = '';

  // 1. Intentar ai-proxy Edge Function de Supabase
  try {
    const { data, error } = await supabase.functions.invoke('ai-proxy', {
      body: {
        model: MODEL_VISION,
        messages: messagesPayload,
        temperature: 0.1,
        max_tokens: 8192,
        response_format: { type: "json_object" }
      }
    });

    if (!error && data && !data.error) {
      raw = data.choices?.[0]?.message?.content?.trim() || '[]';
    }
  } catch (proxyErr) {
    console.warn("Template AI Proxy invoke failed, falling back to direct fetch:", proxyErr.message);
  }

  // 2. Fallback a llamada directa si ai-proxy falló
  if (!raw) {
    const GROQ_BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';
    const key = import.meta.env.VITE_GROQ_API_KEY || import.meta.env['VITE_GROQ_API_' + 'KEY'];
    if (!key) throw new Error('No Groq API Key configurada.');

    const res = await fetch(GROQ_BASE_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL_VISION,
        messages: messagesPayload,
        temperature: 0.1,
        max_tokens: 8192,
        response_format: { type: "json_object" }
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || `Groq HTTP ${res.status}`);
    }

    const data = await res.json();
    raw = data.choices?.[0]?.message?.content?.trim() || '[]';
  }

  try {
    let textToParse = raw;
    textToParse = textToParse.replace(/<think>[\s\S]*?<\/think>/gi, '');
    if (textToParse.includes('<think>')) {
      textToParse = textToParse.replace(/<think>[\s\S]*/gi, '');
    }
    
    const cleaned = textToParse
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
      
    // Find the first '[' and last ']' just in case there is trailing text
    let arrayStart = cleaned.indexOf('[');
    let arrayEnd = cleaned.lastIndexOf(']');
    let jsonString = cleaned;
    
    if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
      jsonString = cleaned.substring(arrayStart, arrayEnd + 1);
    }
      
    const parsed = JSON.parse(jsonString);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    console.warn('[templateService] AI parse error. Raw:', raw);
    return [];
  }
}

// ──────────────────────────────────────────────
// 6. Generar PDF con datos del cliente
// ──────────────────────────────────────────────
export async function getFilledPdfBlob(templateUrl, mappings, clientData, overrides = {}, signatures = []) {
  try {
    const templateBytes = await fetchTemplateBytes(templateUrl);
    const pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
    
    // Explicitly embed a standard font to avoid silent crashes with special chars
    const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    
    const form = pdfDoc.getForm();
    const pages = pdfDoc.getPages();
    const firstPage = pages[0];
    const { width, height } = firstPage.getSize();

    // Filtrar mapeos puramente de coordenadas si el mismo dato (kommoFieldId) 
    // ya está siendo mapeado por un campo AcroForm interactivo.
    // Esto evita texto duplicado/solapado en PDFs que tienen tanto campos nativos como análisis IA previo.
    const mappedDataIds = new Set(
      mappings
        .filter(m => m.pdfFieldName && (m.kommoFieldId || m.fieldId))
        .map(m => m.kommoFieldId || m.fieldId)
    );

    const filteredMappings = mappings.filter(m => {
      // Es un mapeo puramente de coordenadas (sin pdfFieldName)
      if (!m.pdfFieldName && m.x !== undefined && m.y !== undefined) {
         const dataId = m.kommoFieldId || m.fieldId;
         // Si el campo del cliente que intenta pintar YA está cubierto por un AcroForm, lo ignoramos.
         if (dataId && mappedDataIds.has(dataId)) {
           return false; 
         }
      }
      return true;
    });

    for (const mapping of filteredMappings) {
      let value = '';
      if (mapping.isCustomText) {
        value = mapping.fieldLabel || mapping.customValue || '';
      } else {
        const kommoId = mapping.kommoFieldId || mapping.fieldId;
        value = getClientFieldValue(clientData, kommoId);
      }
      
      // Override con valores editados en la vista previa
      if (overrides[mapping.pdfFieldName || mapping.fieldId] !== undefined) {
        value = overrides[mapping.pdfFieldName || mapping.fieldId];
      }

      // Remover caracteres no compatibles con WinAnsi para TODO tipo de PDF
      const safeValue = String(value).replace(/[^\x20-\x7E\xA0-\xFF]/g, '').trim();

      if (!safeValue) continue;

      // Intentar llenar como campo AcroForm interactivo si tiene pdfFieldName
      let fieldSet = false;
      if (mapping.pdfFieldName) {
        try {
          const field = form.getField(mapping.pdfFieldName);
          if (field) {
            if (typeof field.setText === 'function') {
              if (typeof field.enableMultiline === 'function') {
                field.enableMultiline();
              }
              field.setText(safeValue);
            } else if (typeof field.select === 'function') {
              try {
                field.select(safeValue);
              } catch (_e) {
                console.warn(`No se pudo seleccionar ${safeValue} en el campo ${mapping.pdfFieldName}`);
              }
            } else if (typeof field.check === 'function') {
              if (safeValue && safeValue.toLowerCase() !== 'false' && safeValue !== '0') {
                field.check();
              }
            }
            fieldSet = true;
          }
        } catch (err) {
          console.warn(`[templateService] No se pudo setear el campo interactivo ${mapping.pdfFieldName}`, err);
        }
      }

      // Si no se pudo llenar como campo interactivo (ej. es un PDF plano o el campo no existe), 
      // y tenemos coordenadas de IA, dibujamos el texto
      if (!fieldSet && mapping.x !== undefined && mapping.y !== undefined) {
        try {
          const posX = mapping.x * width;
          const posY = height - (mapping.y * height) - 10; // Ajuste por la altura del texto

          firstPage.drawText(safeValue, {
            x: posX,
            y: posY,
            size: 11,
            font: helveticaFont,
            color: rgb(0.1, 0.1, 0.1),
          });
        } catch (err) {
          console.warn(`[templateService] Error dibujando campo plano ${mapping.fieldId}`, err);
        }
      }
    }

    // Forzar la regeneración de las apariencias con la fuente Helvetica estándar
    try {
      form.updateFieldAppearances(helveticaFont);
    } catch (e) {
      console.warn("Could not update field appearances:", e);
    }
    
    // NOTA: Hemos deshabilitado form.flatten() porque corrompe ciertos PDFs 
    // oficiales complejos (ej. formularios de Cuba/Brasil) haciéndolos fallar al cargar en el navegador.
    // En su lugar, hacemos que todos los campos sean de solo lectura (Read-Only)
    try {
      const allFields = form.getFields();
      allFields.forEach(f => {
        f.enableReadOnly();
      });
    } catch (e) {
      console.warn("Error setting fields to read-only:", e);
    }

    // ── Insertar Firmas ──
    if (signatures && signatures.length > 0) {
      for (const sig of signatures) {
        if (!sig.url) continue;
        try {
          const isBase64 = sig.url.startsWith('data:');
          let imgBytes;
          if (isBase64) {
             const base64Data = sig.url.split(',')[1];
             imgBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
          } else {
             imgBytes = await fetch(sig.url).then(r => r.arrayBuffer());
          }
          
          let embeddedImage;
          if (sig.url.includes('png') || sig.url.startsWith('data:image/png')) {
             embeddedImage = await pdfDoc.embedPng(imgBytes);
          } else {
             embeddedImage = await pdfDoc.embedJpg(imgBytes);
          }
          
          const targetPage = pages[sig.page || 0];
          const targetWidth = targetPage.getSize().width;
          const targetHeight = targetPage.getSize().height;

          const posX = sig.x * targetWidth;
          const posY = targetHeight - (sig.y * targetHeight) - (sig.height * targetHeight);
          
          targetPage.drawImage(embeddedImage, {
             x: posX,
             y: posY,
             width: sig.width * targetWidth,
             height: sig.height * targetHeight
          });

        } catch (e) {
          console.error("[templateService] Error embedding signature:", e);
        }
      }
    }

    const pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
  } catch (err) {
    console.error('[templateService] getFilledPdfBlob error:', err);
    throw err;
  }
}

/**
 * @param {Blob} blob
 * @param {string} filename
 * @param {object} clientData
 * @param {{estado?: string, tipoDocumento?: string, subidoPor?: string, silent?: boolean}} [opts]
 *   - estado: 'verificado' (default, ej. generación manual desde un botón "Generar" —
 *     el click YA es la aprobación) o 'pendiente' (ej. generación automática sin
 *     supervisión — queda como borrador hasta que un operario lo marque verificado
 *     con el toggle que ya existe en la lista de documentos del cliente).
 *   - silent: si true, no hace `alert()` en caso de error (la generación automática
 *     no tiene a nadie mirando un alert bloqueante; se limita a loguear y propagar).
 */
export async function uploadGeneratedDocumentToClient(blob, filename, clientData, opts = {}) {
  if (!clientData || !clientData.id) return;
  const { estado = 'verificado', tipoDocumento = 'GENERADO', subidoPor = 'Admin', silent = false } = opts;
  try {
    const ext = filename.split('.').pop().toLowerCase();
    const uniqueName = `${clientData.id}/${Date.now()}_${filename.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;

    const { error: uploadError } = await supabase.storage
      .from('documentos_operacionales')
      .upload(uniqueName, blob, { upsert: false });

    if (uploadError) throw uploadError;

    const { error: dbError } = await supabase
      .from('documentos_operacionales')
      .insert({
        id_cliente: clientData.id,
        nombre_archivo: filename,
        url_archivo: uniqueName,
        tipo_contenido: blob.type || (ext === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
        tipo_documento: tipoDocumento,
        tamaño_bytes: blob.size || 0,
        subido_por: subidoPor,
        estado,
      });

    if (dbError) throw dbError;
  } catch (err) {
    console.error('[templateService] Error uploading generated doc:', err);
    if (!silent) alert('Error al guardar documento generado: ' + (err.message || JSON.stringify(err)));
    else throw err;
  }
}

export async function generateFilledPDF(templateUrl, mappings, clientData, templateName) {
  try {
    const blob = await getFilledPdfBlob(templateUrl, mappings, clientData);
    const filename = `${templateName ? templateName.replace(/\.[^/.]+$/, "") : 'documento'}_${clientData.nombre || 'cliente'}.pdf`;
    const url = URL.createObjectURL(blob);

    // Descargar automáticamente
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Guardar también en los documentos del cliente
    await uploadGeneratedDocumentToClient(blob, filename, clientData);

    return { error: null, url };
  } catch (err) {
    console.error('[templateService] generateFilledPDF error:', err);
    return { error: err.message };
  }
}

// ──────────────────────────────────────────────
// Extraer campos de un formulario PDF (AcroForm)
// ──────────────────────────────────────────────
export async function getPDFFormFields(templateUrl) {
  try {
    const templateBytes = await fetchTemplateBytes(templateUrl);
    const pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    
    return fields.map(f => {
      let tooltip = '';
      try {
        const dict = f.acroField.dict;
        if (dict && dict.has(PDFName.of('TU'))) {
          const tu = dict.get(PDFName.of('TU'));
          if (tu && typeof tu.decodeText === 'function') {
            tooltip = tu.decodeText();
          }
        }
      } catch (_e) {
        // Ignorar errores al intentar leer el tooltip
      }

      // Intentamos limpiar un poco el nombre si tiene caracteres nulos
      const rawName = f.getName();
      const cleanName = rawName.replace(/\x00/g, '');

      return {
        name: rawName, 
        displayName: tooltip || cleanName,
        type: f.constructor.name
      };
    });
  } catch (err) {
    console.error('[templateService] getPDFFormFields error:', err);
    return [];
  }
}

// ──────────────────────────────────────────────
// Helper: obtener el valor de un campo del cliente
// ──────────────────────────────────────────────
export function getClientFieldValue(clientData, fieldId) {
  if (!clientData || !fieldId) return '';

  let baseFieldId = fieldId;
  let modifier = null;

  if (fieldId.includes(':')) {
    [baseFieldId, modifier] = fieldId.split(':');
  }

  // Buscar en campos dinámicos de las entradas del cliente si el id empieza con custom:
  if (fieldId.startsWith('custom:')) {
    const customKey = fieldId.replace('custom:', '');
    if (clientData.entradas && Array.isArray(clientData.entradas)) {
      // Tomar el valor del primer trámite (el más reciente) que tenga este campo no vacío
      for (const ent of clientData.entradas) {
        if (ent.datos_personalizados && ent.datos_personalizados[customKey] !== undefined && ent.datos_personalizados[customKey] !== '') {
          return ent.datos_personalizados[customKey];
        }
      }
    }
    return '';
  }

  // Campos generados automáticamente (no dependen de clientData directamente)
  if (baseFieldId === 'fecha_hoy') {
    const today = new Date();
    if (modifier === 'dia') return String(today.getDate()).padStart(2, '0');
    if (modifier === 'mes') {
      const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      return meses[today.getMonth()];
    }
    if (modifier === 'anio') return String(today.getFullYear());
    
    // Completa
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    return `${today.getDate()} de ${meses[today.getMonth()]} de ${today.getFullYear()}`;
  }

  let val = clientData ? clientData[baseFieldId] : null;
  // Fallback: los campos dinámicos nuevos (config_campos_clientes) viven en
  // clientes.campos_personalizados y no como columna plana.
  if (!val && clientData?.campos_personalizados) {
    val = clientData.campos_personalizados[baseFieldId];
  }
  if (!val && baseFieldId !== 'fecha_hoy') return '';

  if (modifier) {
    try {
      let dateObj;
      if (!isNaN(val) && String(val).length >= 10) {
        const isMs = String(val).length > 10;
        dateObj = new Date(Number(val) * (isMs ? 1 : 1000));
      } else if (typeof val === 'string') {
        if (val.includes('/')) {
          const parts = val.split('/');
          if (parts.length === 3) dateObj = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
        } else {
          dateObj = new Date(val);
        }
      }

      if (dateObj && !isNaN(dateObj.getTime())) {
        if (modifier === 'dia') return String(dateObj.getDate()).padStart(2, '0');
        if (modifier === 'mes') return String(dateObj.getMonth() + 1).padStart(2, '0');
        if (modifier === 'anio') return String(dateObj.getFullYear());
      }
    } catch (e) {
      console.warn('Error parseando fecha', e);
    }
    
    // Si es teléfono
    if (baseFieldId === 'telefono') {
      const numOnly = String(val).replace(/\D/g, '');
      let pais = '';
      let ddd = '';
      let numero = '';

      if (numOnly.startsWith('55') && numOnly.length >= 12) {
        pais = '55';
        ddd = numOnly.substring(2, 4);
        numero = numOnly.substring(4);
      } else if (numOnly.length === 10 || numOnly.length === 11) {
        ddd = numOnly.substring(0, 2);
        numero = numOnly.substring(2);
      } else {
        // Fallback
        numero = numOnly;
      }

      if (modifier === 'ddd') return ddd;
      if (modifier === 'numero') return numero;
      if (modifier === 'pais') return pais ? `+${pais}` : '';
    }
  }

  // Si es dirección (JSON)
  if (baseFieldId === 'direccion') {
    try {
      let dirObj = val;
      if (typeof val === 'string') dirObj = JSON.parse(val);

      if (modifier) {
        if (modifier === 'endereco_numero') {
          return [dirObj.endereco, dirObj.numero].filter(Boolean).join(', ');
        }
        if (modifier === 'cidade_estado') {
          return [dirObj.cidade, dirObj.estado].filter(Boolean).join(' - ');
        }
        return String(dirObj[modifier] || '');
      }

      // Concatenar si no hay modificador
      const parts = [
        dirObj.endereco,
        dirObj.numero,
        dirObj.complemento,
        dirObj.bairro,
        dirObj.cidade,
        dirObj.estado,
        dirObj.cep ? `CEP: ${dirObj.cep}` : null,
      ].filter(Boolean);
      return parts.join(', ');
    } catch {
      return String(val);
    }
  }

  return String(val);
}

// ──────────────────────────────────────────────
// Helper: renderizar página de PDF como imagen
// ──────────────────────────────────────────────
export async function renderPdfPageAsImage(url, pageNum = 1, scale = 2) {
  // Usar la instancia estática de pdfjs-dist ya configurada por pdfToImage.js
  const pdfjsLib = await import('pdfjs-dist');

  // El worker ya se configura en pdfToImage.js, pero aseguramos que esté
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  }

  const loadingTask = pdfjsLib.getDocument({ 
    url, 
    cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/standard_fonts/`,
  });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext('2d');

  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas.toDataURL('image/png');
}

// ──────────────────────────────────────────────
// Efecto "hoja escaneada" — post-procesa un PDF ya generado (con datos y
// firma insertados) para que se vea como una hoja física escaneada en vez
// de un PDF digital prolijo: leve rotación, desenfoque, grano, viñeta y
// recompresión JPEG. Rasteriza cada página y arma un PDF nuevo con esas
// imágenes — el resultado ya NO tiene texto seleccionable, como cualquier
// escaneo real.
// ──────────────────────────────────────────────
function applyScanTextureToCanvas(sourceCanvas) {
  const { width, height } = sourceCanvas;
  const angle = (Math.random() * 2.2 - 1.1) * (Math.PI / 180); // -1.1° a 1.1°

  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const octx = out.getContext('2d');

  // Fondo "papel" por si la rotación deja bordes al descubierto
  octx.fillStyle = '#f6f4ee';
  octx.fillRect(0, 0, width, height);

  octx.translate(width / 2, height / 2);
  octx.rotate(angle);
  octx.drawImage(sourceCanvas, -width / 2, -height / 2);
  octx.setTransform(1, 0, 0, 1, 0, 0);

  // Desenfoque leve: una segunda pasada levemente desplazada y semitransparente
  octx.globalAlpha = 0.35;
  octx.drawImage(out, 0.6, 0.5);
  octx.drawImage(out, -0.5, -0.4);
  octx.globalAlpha = 1;

  // Contraste/brillo + tono cálido de papel + grano, todo por píxel
  const imageData = octx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const contrast = 0.93;
  const brightness = 5;
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];
    r = (r - 128) * contrast + 128 + brightness + 3;
    g = (g - 128) * contrast + 128 + brightness + 1;
    b = (b - 128) * contrast + 128 + brightness - 5;
    const noise = (Math.random() - 0.5) * 12;
    data[i] = Math.max(0, Math.min(255, r + noise));
    data[i + 1] = Math.max(0, Math.min(255, g + noise));
    data[i + 2] = Math.max(0, Math.min(255, b + noise));
  }
  octx.putImageData(imageData, 0, 0);

  // Viñeta suave en los bordes, como la sombra de la tapa de un scanner
  const gradient = octx.createRadialGradient(
    width / 2, height / 2, Math.min(width, height) * 0.5,
    width / 2, height / 2, Math.max(width, height) * 0.75
  );
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, 'rgba(0,0,0,0.12)');
  octx.fillStyle = gradient;
  octx.fillRect(0, 0, width, height);

  return out;
}

/**
 * Rasteriza cada página de un PDF ya generado y le aplica una textura de
 * "hoja escaneada" (rotación, grano, viñeta, recompresión JPEG).
 * @param {Uint8Array|ArrayBuffer} pdfBytes
 * @returns {Promise<Blob>} Nuevo PDF (application/pdf)
 */
export async function applyScannedLook(pdfBytes) {
  const pdfjsLib = await import('pdfjs-dist');
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  }

  const data = pdfBytes instanceof Uint8Array ? pdfBytes : new Uint8Array(pdfBytes);
  const loadingTask = pdfjsLib.getDocument({ data });
  const srcPdf = await loadingTask.promise;

  const outDoc = await PDFDocument.create();
  const scale = 2.2;

  for (let i = 1; i <= srcPdf.numPages; i++) {
    const page = await srcPdf.getPage(i);
    const renderViewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = renderViewport.width;
    canvas.height = renderViewport.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: renderViewport }).promise;

    const scannedCanvas = applyScanTextureToCanvas(canvas);
    const jpegDataUrl = scannedCanvas.toDataURL('image/jpeg', 0.82);
    const jpegBytes = Uint8Array.from(atob(jpegDataUrl.split(',')[1]), c => c.charCodeAt(0));
    const embeddedImage = await outDoc.embedJpg(jpegBytes);

    const pageSize = page.getViewport({ scale: 1 });
    const outPage = outDoc.addPage([pageSize.width, pageSize.height]);
    outPage.drawImage(embeddedImage, { x: 0, y: 0, width: pageSize.width, height: pageSize.height });
  }

  const outBytes = await outDoc.save();
  return new Blob([outBytes], { type: 'application/pdf' });
}

/**
 * Aplica el efecto de escaneado a una imagen o documento.
 * @param {Blob|ArrayBuffer|string} inputBlobOrUrl
 * @param {boolean} isPdf
 * @returns {Promise<Blob>}
 */
export async function applyScannedLookToDocument(inputBlobOrUrl, isPdf = true) {
  if (isPdf) {
    let bytes = inputBlobOrUrl;
    if (inputBlobOrUrl instanceof Blob) {
      bytes = await inputBlobOrUrl.arrayBuffer();
    } else if (typeof inputBlobOrUrl === 'string') {
      bytes = await fetch(inputBlobOrUrl).then(r => r.arrayBuffer());
    }
    return await applyScannedLook(bytes);
  } else {
    let dataUrl = inputBlobOrUrl;
    if (inputBlobOrUrl instanceof Blob) {
      dataUrl = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result);
        reader.onerror = rej;
        reader.readAsDataURL(inputBlobOrUrl);
      });
    } else if (typeof inputBlobOrUrl === 'string' && !inputBlobOrUrl.startsWith('data:')) {
      const b = await fetch(inputBlobOrUrl).then(r => r.blob());
      dataUrl = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result);
        reader.onerror = rej;
        reader.readAsDataURL(b);
      });
    }

    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.crossOrigin = 'anonymous';
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = dataUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    const scannedCanvas = applyScanTextureToCanvas(canvas);
    const jpegDataUrl = scannedCanvas.toDataURL('image/jpeg', 0.85);
    const res = await fetch(jpegDataUrl);
    return await res.blob();
  }
}

/**
 * Imprime un blob de documento (PDF o imagen) usando un iframe limpio o ventana dedicada.
 * @param {Blob} blob 
 * @param {string} title 
 */
export async function printDocumentBlob(blob, title = 'documento') {
  const url = URL.createObjectURL(blob);
  const isImage = blob.type.startsWith('image/');

  if (isImage) {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${title}</title>
            <style>
              body { margin: 0; display: flex; justify-content: center; align-items: center; background: white; }
              img { max-width: 100%; max-height: 100vh; object-fit: contain; }
              @media print { body { margin: 0; } img { width: 100%; height: auto; } }
            </style>
          </head>
          <body>
            <img src="${url}" onload="window.print(); window.close();" />
          </body>
        </html>
      `);
      printWindow.document.close();
      return;
    }
  }

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.src = url;

  document.body.appendChild(iframe);

  iframe.onload = () => {
    setTimeout(() => {
      try {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } catch (err) {
        console.error('Print failed in iframe, opening new window:', err);
        window.open(url, '_blank');
      } finally {
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
          URL.revokeObjectURL(url);
        }, 60000);
      }
    }, 500);
  };
}

// ──────────────────────────────────────────────
// 6. Generar Documento (.docx)
// ──────────────────────────────────────────────
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { saveAs } from 'file-saver';
import html2pdf from 'html2pdf.js';

export async function getDocxFields(templateUrl) {
  try {
    const templateBytes = await fetchTemplateBytes(templateUrl);
    const zip = new PizZip(templateBytes);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });
    
    // Extraer texto completo del documento
    let text = '';
    if (typeof doc.getFullText === 'function') {
      text = doc.getFullText();
    }
    
    // Fallback: si docxtemplater falla o no encuentra texto, extraemos directo de los XML
    if (!text || text.trim() === '') {
      const xmlFiles = Object.keys(zip.files).filter(name => name.endsWith('.xml') && name.startsWith('word/'));
      for (const fileName of xmlFiles) {
        const content = zip.file(fileName).asText();
        // Extraer todo lo que esté entre > y < (el texto real de los nodos)
        text += content.replace(/<[^>]+>/g, '');
      }
    }

    // Limpiar caracteres invisibles (zero-width spaces) que Google Docs o Word suelen meter
    text = text.replace(/[\u200B-\u200D\uFEFF]/g, '');

    // Buscar etiquetas del tipo {{nombre}}, {nombre}, o <<nombre>> permitiendo cualquier caracter interno
    // Usamos lazy matching (.*?) para no atrapar texto entre dos etiquetas distintas
    const regex = /(?:\{\{|\{|«)\s*(.*?)\s*(?:\}\}|\}|»)/g;
    const tags = new Set();
    let match;
    while ((match = regex.exec(text)) !== null) {
      const tag = match[1].trim();
      // Filtrar cosas muy largas que probablemente no sean etiquetas sino uso normal de llaves
      if (tag && tag.length < 50 && !tag.includes('{') && !tag.includes('}')) {
        tags.add(tag);
      }
    }
    
    const result = Array.from(tags).map(tag => ({
      name: tag,
      displayName: `{{${tag}}}`,
      type: 'Etiqueta Word'
    }));

    if (result.length === 0) {
      console.warn('[templateService] No se encontraron etiquetas {{...}} en el documento. Texto extraído (primeros 200 chars):', text.substring(0, 200));
      // Devolvemos un campo de ayuda para que el usuario entienda qué pasa
      return [{
        name: 'ayuda_etiquetas',
        displayName: '⚠️ No se encontraron etiquetas {{...}}',
        type: 'Ayuda',
        isCustomText: true,
        customValue: 'Revisa que tu Word tenga etiquetas como {{nombre}}'
      }];
    }

    return result;
  } catch (err) {
    console.error('[templateService] getDocxFields error:', err);
    return [];
  }
}

export async function generateFilledDocx(templateUrl, clientData, templateName, mappings = [], overrides = {}) {
  try {
    const templateBytes = await fetch(templateUrl).then(r => r.arrayBuffer());
    const zip = new PizZip(templateBytes);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    const data = {};
    
    // 1. Cargar campos disponibles por defecto (por si el usuario usó los IDs
    // exactos como tag de Word) — incluye fijos, migratorios y dinámicos
    // (Configuración > Campos Base), no solo AVAILABLE_CLIENT_FIELDS.
    const availableFields = await getExtendedClientFields();
    availableFields.forEach(field => {
      data[field.id] = getClientFieldValue(clientData, field.id) || '';
    });

    if (clientData.direccion) {
      let dir = clientData.direccion;
      if (typeof dir === 'string') {
        try { dir = JSON.parse(dir); } catch { dir = {}; }
      }
      data['direccion.endereco'] = dir.endereco || '';
      data['direccion.numero'] = dir.numero || '';
      data['direccion.bairro'] = dir.bairro || '';
      data['direccion.cidade'] = dir.cidade || '';
      data['direccion.estado'] = dir.estado || '';
      data['direccion.cep'] = dir.cep || '';
    }
    
    // Fechas dinámicas muy comunes
    const hoy = new Date();
    data['fecha_hoy'] = hoy.toLocaleDateString('es-ES');
    data['fecha_actual'] = data['fecha_hoy'];

    // 2. Aplicar mapeos personalizados (sobreescriben los defectos si hay choque)
    for (const mapping of mappings) {
      if (mapping.pdfFieldName) {
        let value = '';
        if (mapping.isCustomText) {
          value = mapping.fieldLabel || mapping.customValue || '';
        } else {
          value = getClientFieldValue(clientData, mapping.kommoFieldId) || '';
        }
        data[mapping.pdfFieldName] = value;
      }
    }
    
    // 3. Aplicar overrides manuales desde la vista previa
    for (const [key, val] of Object.entries(overrides)) {
      data[key] = val;
    }

    doc.render(data);

    const out = doc.getZip().generate({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    const filename = `${templateName.replace(/\.[^/.]+$/, "")}_${clientData.nombre || 'documento'}.docx`;
    saveAs(out, filename);

    // Guardar en documentos del cliente
    await uploadGeneratedDocumentToClient(out, filename, clientData);

    return { error: null };
  } catch (err) {
    console.error('[templateService] generateFilledDocx error:', err);
    return { error: err.message };
  }
}

// ──────────────────────────────────────────────
// 7. Generar Documento (HTML a PDF)
// ──────────────────────────────────────────────
export async function generateFilledHtmlPdf(templateUrl, clientData, templateName) {
  try {
    let htmlContent = await fetch(templateUrl).then(r => r.text());

    // Incluye fijos, migratorios y dinámicos (Configuración > Campos Base) —
    // antes solo se reemplazaban los tags {{...}} de AVAILABLE_CLIENT_FIELDS,
    // así que un {{campo_personalizado}} en el HTML quedaba sin completar.
    const availableFields = await getExtendedClientFields();
    availableFields.forEach(field => {
      const val = getClientFieldValue(clientData, field.id) || '';
      const regex = new RegExp(`{{${field.id}}}`, 'g');
      htmlContent = htmlContent.replace(regex, val);
    });

    if (clientData.direccion) {
      let dir = clientData.direccion;
      if (typeof dir === 'string') {
        try { dir = JSON.parse(dir); } catch { dir = {}; }
      }
      const dirFields = ['endereco', 'numero', 'bairro', 'cidade', 'estado', 'cep'];
      dirFields.forEach(k => {
        const val = dir[k] || '';
        const regex = new RegExp(`{{direccion.${k}}}`, 'g');
        htmlContent = htmlContent.replace(regex, val);
      });
    }

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    tempDiv.style.padding = '20px';
    tempDiv.style.width = '210mm';
    tempDiv.style.boxSizing = 'border-box';
    tempDiv.style.fontFamily = 'Arial, sans-serif';

    const opt = {
      margin:       10,
      filename:     `${templateName.replace(/\.[^/.]+$/, "")}_${clientData.nombre || 'documento'}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    const worker = html2pdf().from(tempDiv).set(opt);
    await worker.save();
    
    // Obtener el blob para guardarlo en la cuenta del cliente
    try {
      const pdfBlob = await worker.output('blob');
      await uploadGeneratedDocumentToClient(pdfBlob, opt.filename, clientData);
    } catch (e) {
      console.warn('Could not extract blob from html2pdf for uploading', e);
    }

    return { error: null };
  } catch (err) {
    console.error('[templateService] generateFilledHtmlPdf error:', err);
    return { error: err.message };
  }
}

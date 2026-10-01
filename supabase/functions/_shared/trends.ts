// Tendencias de mercado para publicidad (búsqueda web real con la API de OpenAI).
// Lo que se encuentra aquí son HIPÓTESIS candidatas con fuentes, no evidencia del negocio: no se mezclan con
// campaign_learnings (que solo guarda lo demostrado con datos propios). El agente las usa para proponer
// experimentos, y solo el experimento medido las convierte en aprendizaje.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { SERVICIOS, sanearError } from './creative_logic.ts';
import { ORG_ID, openai, modeloTexto, registrarGeneracion } from './creative_store.ts';

export interface Tendencia { tema: string; resumen: string; aplicacion: string; periodo: string; confianza: string }

/** Extrae el JSON {tendencias:[…]} de un texto con posible ruido; si no hay JSON, devuelve null. */
export function parsearTendencias(texto: string): Tendencia[] | null {
  const m = texto.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const j = JSON.parse(m[0]);
    const lista = Array.isArray(j.tendencias) ? j.tendencias : [];
    const out = lista.map((t: any) => ({
      tema: String(t.tema || '').trim().slice(0, 160),
      resumen: String(t.resumen || '').trim().slice(0, 600),
      aplicacion: String(t.como_aplicarlo_en_anuncio || t.aplicacion || '').trim().slice(0, 400),
      periodo: String(t.fecha_o_periodo || t.periodo || '').trim().slice(0, 60),
      confianza: ['alta', 'media', 'baja'].includes(String(t.confianza)) ? String(t.confianza) : 'baja',
    })).filter((t: Tendencia) => t.tema && t.resumen);
    return out.length ? out : null;
  } catch { return null; }
}

async function responderConBusqueda(entrada: string) {
  const model = await modeloTexto();
  const intento = (tipo: string) => openai('/responses', { method: 'POST', body: JSON.stringify({ model, tools: [{ type: tipo }], input: entrada }) });
  let d: any;
  try { d = await intento('web_search'); }
  catch (e) { if (/\(400\)/.test(String(e))) d = await intento('web_search_preview'); else throw e; }
  let texto = '';
  const fuentes: { url: string; titulo: string }[] = [];
  for (const it of d.output || []) {
    if (it.type !== 'message') continue;
    for (const c of it.content || []) {
      if (c.type === 'output_text') {
        texto += c.text || '';
        for (const a of c.annotations || []) if (a.type === 'url_citation' && a.url && !fuentes.some(f => f.url === a.url)) fuentes.push({ url: a.url, titulo: String(a.title || '').slice(0, 160) });
      }
    }
  }
  return { texto, fuentes, usage: d.usage ?? null, model };
}

export async function buscarTendencias(admin: SupabaseClient, userId: string, i: { service?: string; tema?: string; pais?: string }) {
  if (i.service && !(SERVICIOS as readonly string[]).includes(i.service)) throw new Error(`Servicio inválido. Usa uno de: ${SERVICIOS.join(', ')}.`);
  const foco = i.service ? `el servicio "${i.service}" de una gestoría de trámites migratorios en Brasil` : 'una gestoría de trámites migratorios en Brasil (CPF, RNM, Agendamento PF, Residência Permanente, Refúgio)';
  const consulta = `Busca en la web información RECIENTE (últimos 6 meses) útil para anuncios de Meta Ads de ${foco}, dirigidos a extranjeros en ${i.pais || 'Brasil'}${i.tema ? `, con foco en: ${i.tema}` : ''}. ` +
    'Cubre: (1) formatos y hooks creativos que están funcionando en anuncios de servicios para inmigrantes, (2) cambios de normas, requisitos o plazos que preocupan a los inmigrantes (Polícia Federal, Receita Federal, CPF, RNM), ' +
    '(3) preguntas y dolores frecuentes de la comunidad migrante, (4) estacionalidad, (5) novedades de Meta Ads relevantes (formatos, políticas de servicios sensibles). ' +
    'Responde SOLO con JSON: {"tendencias":[{"tema":"","resumen":"","como_aplicarlo_en_anuncio":"","fecha_o_periodo":"","confianza":"alta|media|baja"}]} con 4 a 6 elementos, en español. No inventes datos: si algo no tiene fuente clara, confianza "baja".';
  let r;
  try { r = await responderConBusqueda(consulta); }
  catch (e) {
    await registrarGeneracion(admin, { user_id: userId, kind: 'trends', model: await modeloTexto().catch(() => 'desconocido'), status: 'error', error: String(e) });
    throw new Error(sanearError(String(e instanceof Error ? e.message : e)));
  }
  const tendencias = parsearTendencias(r.texto);
  await registrarGeneracion(admin, { user_id: userId, kind: 'trends', model: r.model, status: tendencias ? 'ok' : 'error', usage: r.usage, error: tendencias ? undefined : 'respuesta sin formato' });
  if (!tendencias) throw new Error('La búsqueda no devolvió tendencias en un formato utilizable. Inténtalo de nuevo.');

  const filas = tendencias.map(t => ({
    organization_id: ORG_ID, service: i.service || null, topic: t.tema,
    summary: `${t.resumen}${t.aplicacion ? `\nCómo aplicarlo: ${t.aplicacion}` : ''}${t.periodo ? `\nPeríodo: ${t.periodo}` : ''}\nConfianza de la fuente: ${t.confianza}`,
    sources: r.fuentes, query: consulta.slice(0, 500), created_by: userId,
  }));
  const { data: guardadas } = await admin.from('ad_trends').insert(filas).select('id, topic');
  return {
    ok: true,
    nota: 'Son hipótesis candidatas con fuentes, NO evidencia del negocio. Solo un experimento medido las convierte en aprendizaje.',
    tendencias: tendencias.map((t, k) => ({ ...t, id: guardadas?.[k]?.id ?? null })),
    fuentes: r.fuentes,
  };
}

export async function listarTendencias(admin: SupabaseClient, f: { service?: string; limite?: number }) {
  let q = admin.from('ad_trends').select('id, service, topic, summary, sources, status, created_at').order('created_at', { ascending: false }).limit(Math.min(f.limite || 15, 50));
  if (f.service) q = q.eq('service', f.service);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return { total: (data || []).length, tendencias: data || [], nota: 'Hipótesis de mercado con fuentes; no son evidencia del negocio.' };
}

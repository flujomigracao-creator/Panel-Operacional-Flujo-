// Públicos: agrupa los leads por país / servicio / intención y mide cada grupo contra pagos reales.
// Lógica pura (sin Supabase) para poder probarla. La clasificación de cada lead la hace la vista publicos_leads_panel.

export const DIMENSIONES = [
  ['pais', 'País'],
  ['servicio', 'Servicio'],
  ['pais_servicio', 'País + servicio'],
  ['intencion', 'Intención'],
];

export const INTENCIONES = ['COLD', 'INTERESTED', 'QUALIFIED', 'PROPOSAL', 'PAYMENT_PENDING', 'PAID', 'LOST'];

const CALIFICADOS = new Set(['QUALIFIED', 'PROPOSAL', 'PAYMENT_PENDING', 'PAID']);
const CON_PROPUESTA = new Set(['PROPOSAL', 'PAYMENT_PENDING', 'PAID']);

export const DIAS_SIN_COMPRA = 30;

const claveDe = (lead, dimension) =>
  dimension === 'pais_servicio' ? `${lead.pais} · ${lead.servicio}` : lead[dimension];

/** Un renglón por grupo: leads, calificados, propuestas, pagos, ingresos y % lead→pago. Ordenado por ingresos y leads. */
export function agruparPublicos(leads, dimension) {
  const grupos = new Map();
  for (const lead of leads) {
    const clave = claveDe(lead, dimension);
    const g = grupos.get(clave) || { clave, leads: 0, deAnuncio: 0, calificados: 0, propuestas: 0, pagos: 0, ingresos: 0 };
    g.leads += 1;
    if (lead.meta_ctwa_clid) g.deAnuncio += 1;
    if (CALIFICADOS.has(lead.intencion)) g.calificados += 1;
    if (CON_PROPUESTA.has(lead.intencion)) g.propuestas += 1;
    if (Number(lead.pagos) > 0) g.pagos += 1;
    g.ingresos += Number(lead.ingresos || 0);
    grupos.set(clave, g);
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, pctPago: g.leads ? g.pagos / g.leads : null }))
    .sort((a, b) => b.ingresos - a.ingresos || b.leads - a.leads);
}

/** Cuántos leads por intención (siempre las 7, aunque sean 0). */
export function conteoIntencion(leads) {
  const cuenta = Object.fromEntries(INTENCIONES.map((i) => [i, 0]));
  for (const lead of leads) if (lead.intencion in cuenta) cuenta[lead.intencion] += 1;
  return cuenta;
}

/**
 * Público de exclusión «no compra»: recibió propuesta, no pagó y lleva 30+ días sin escribir.
 * No depende de la etapa Perdido (se puede mover a mano en bloque). Misma regla que la vista publicos_excluir_no_compra.
 */
export function esNoCompra(lead, ahora = new Date()) {
  if (!lead.propuesta_enviada || Number(lead.pagos) > 0) return false;
  const ultimo = new Date(lead.last_inbound_at || lead.created_at).getTime();
  return ahora.getTime() - ultimo > DIAS_SIN_COMPRA * 86400000;
}

/** Resumen del público de exclusión: cuántos hay y cuándo empezarán a entrar los próximos. */
export function resumenExclusion(leads, ahora = new Date()) {
  const candidatos = leads.filter((l) => l.propuesta_enviada && !(Number(l.pagos) > 0));
  const ya = candidatos.filter((l) => esNoCompra(l, ahora));
  const proximos = candidatos
    .filter((l) => !esNoCompra(l, ahora))
    .map((l) => new Date(new Date(l.last_inbound_at || l.created_at).getTime() + DIAS_SIN_COMPRA * 86400000))
    .sort((a, b) => a - b);
  return { total: ya.length, enEspera: candidatos.length - ya.length, proximaEntrada: proximos[0] || null };
}

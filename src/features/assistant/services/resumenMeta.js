// Lógica pura del Resumen de Meta Ads (sin Supabase ni React: se prueba con node --test).
//
// Dos capas, como pide el diseño:
//   Meta Ads ........ inversión → impresiones → clics → conversaciones   (meta_ads_insights)
//   Flujo de Migração  conversaciones → leads → propuestas → pagos → facturación (CRM + payments)
//
// Regla: la ausencia de dato NO es 0. Un costo sin denominador es `null` ("—"), nunca 0.

const DIA_MS = 86400000;

export const isoDia = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const aFecha = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const sumarDias = (iso, n) => {
  const d = aFecha(iso);
  d.setDate(d.getDate() + n);
  return isoDia(d);
};

export const diasEntre = (desde, hasta) => Math.round((aFecha(hasta) - aFecha(desde)) / DIA_MS) + 1;

// Día local (no UTC) de un timestamp: en Brasil toISOString() adelanta el día de noche.
export const diaDeTimestamp = (ts) => {
  if (!ts) return null;
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? null : isoDia(d);
};

/**
 * Período pedido → { desde, hasta, dias, etiqueta } y el período previo de igual duración
 * inmediatamente anterior (base de la comparación ↑/↓).
 */
export function resolverPeriodos(rango, hoy = new Date()) {
  const hoyIso = isoDia(hoy);
  const pedido = typeof rango === 'string' ? rango : rango?.periodo || '7d';
  let desde;
  let hasta = hoyIso;
  let etiqueta;
  if (typeof rango === 'object' && rango && (rango.desde || rango.hasta)) {
    hasta = rango.hasta || hoyIso;
    desde = rango.desde || sumarDias(hasta, -6);
    etiqueta = `${desde} — ${hasta}`;
  } else if (pedido === 'hoy') {
    desde = hoyIso;
    etiqueta = 'Hoy';
  } else {
    const dias = pedido === '30d' ? 30 : pedido === '14d' ? 14 : 7;
    desde = sumarDias(hoyIso, -(dias - 1));
    etiqueta = `Últimos ${dias} días`;
  }
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  const dias = diasEntre(desde, hasta);
  const previo = { desde: sumarDias(desde, -dias), hasta: sumarDias(desde, -1), dias };
  return { desde, hasta, dias, etiqueta, previo };
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const dividir = (a, b) => (b > 0 ? a / b : null);
const enRango = (dia, p) => dia && dia >= p.desde && dia <= p.hasta;

/** Variación porcentual; `null` si no hay base para comparar. */
export function variacion(actual, previo) {
  if (actual == null || previo == null) return null;
  if (previo === 0) return actual === 0 ? 0 : null;
  return ((actual - previo) / previo) * 100;
}

/**
 * Totales de UN período. `adCampana` mapea ad_id → campaign_id (para atribuir leads y pagos).
 */
export function totalesPeriodo({ insights, leads, pagos, leadsMeta }, periodo, adCampana) {
  const ins = (insights || []).filter((r) => enRango(String(r.fecha).slice(0, 10), periodo));
  const inversion = ins.reduce((a, r) => a + num(r.gasto), 0);
  const impresiones = ins.reduce((a, r) => a + num(r.impresiones), 0);
  const clics = ins.reduce((a, r) => a + num(r.clics), 0);
  const conversaciones = ins.reduce((a, r) => a + num(r.conversaciones), 0);

  const ls = (leads || []).filter((l) => enRango(diaDeTimestamp(l.created_at), periodo));
  const ps = (pagos || []).filter((p) => enRango(diaDeTimestamp(p.paid_at), periodo));
  const facturacion = ps.reduce((a, p) => a + num(p.amount), 0);
  const clientesPagados = new Set(ps.map((p) => p.client_id).filter(Boolean)).size;

  // Atribución a Meta: el lead trae el anuncio de origen (meta_ad_id) desde el webhook.
  const leadsDeMeta = ls.filter((l) => l.meta_ad_id).length;

  // Pagos de clientes cuyo lead vino de un anuncio de Meta (cualquier fecha de creación del lead).
  const clienteAd = new Map();
  for (const l of leadsMeta || []) if (l.client_id && l.meta_ad_id) clienteAd.set(l.client_id, l.meta_ad_id);
  const clientesMeta = new Set(ps.map((p) => p.client_id).filter((c) => c && clienteAd.has(c)));
  const facturacionMeta = ps
    .filter((p) => p.client_id && clienteAd.has(p.client_id))
    .reduce((a, p) => a + num(p.amount), 0);

  return {
    inversion,
    impresiones,
    clics,
    conversaciones,
    leads: ls.length,
    leadsDeMeta,
    propuestas: ls.filter((l) => l.propuesta_enviada).length,
    pagos: ps.length,
    clientesPagados,
    facturacion,
    clientesMeta: clientesMeta.size,
    facturacionMeta,
    clicsEnlace: ins.reduce((a, r) => a + num(r.clics_enlace), 0),
    // Derivadas de sumas (correcto). El alcance NO se suma: es único por día y anuncio.
    ctr: impresiones > 0 ? (clics / impresiones) * 100 : null,
    cpm: impresiones > 0 ? (inversion / impresiones) * 1000 : null,
    cpc: clics > 0 ? inversion / clics : null,
    costoPorConversacion: dividir(inversion, conversaciones),
    costoPorCliente: dividir(inversion, clientesPagados),
    roas: dividir(facturacion, inversion),
    adCampana,
  };
}

/** Serie diaria (o semanal, lunes–domingo) de las 5 métricas del gráfico. */
export function serieRendimiento({ insights, leads, pagos }, periodo, agrupar = 'dia') {
  const dias = new Map();
  for (let i = 0; i < periodo.dias; i++) {
    dias.set(sumarDias(periodo.desde, i), { inversion: 0, conversaciones: 0, leads: 0, clientes: new Set(), facturacion: 0 });
  }
  for (const r of insights || []) {
    const o = dias.get(String(r.fecha).slice(0, 10));
    if (!o) continue;
    o.inversion += num(r.gasto);
    o.conversaciones += num(r.conversaciones);
  }
  for (const l of leads || []) {
    const o = dias.get(diaDeTimestamp(l.created_at));
    if (o) o.leads += 1;
  }
  for (const p of pagos || []) {
    const o = dias.get(diaDeTimestamp(p.paid_at));
    if (!o) continue;
    o.facturacion += num(p.amount);
    if (p.client_id) o.clientes.add(p.client_id);
  }
  const puntos = [...dias.entries()].map(([dia, o]) => ({
    dia,
    inversion: o.inversion,
    conversaciones: o.conversaciones,
    leads: o.leads,
    clientes: o.clientes.size,
    facturacion: o.facturacion,
  }));
  if (agrupar !== 'semana') return puntos;

  const semanas = new Map();
  for (const p of puntos) {
    const d = aFecha(p.dia);
    const lunes = sumarDias(p.dia, -((d.getDay() + 6) % 7));
    const s = semanas.get(lunes) || { dia: lunes, inversion: 0, conversaciones: 0, leads: 0, clientes: 0, facturacion: 0 };
    for (const k of ['inversion', 'conversaciones', 'leads', 'clientes', 'facturacion']) s[k] += p[k];
    semanas.set(lunes, s);
  }
  return [...semanas.values()];
}

/** Tabla de campañas con actividad en el período. Sin ranking: orden por inversión, solo por legibilidad. */
export function tablaCampanas({ insights, leads, pagos, leadsMeta, entidades }, periodo) {
  const ins = (insights || []).filter((r) => enRango(String(r.fecha).slice(0, 10), periodo));
  const adCampana = new Map();
  for (const r of insights || []) if (r.ad_id && r.campaign_id) adCampana.set(String(r.ad_id), String(r.campaign_id));

  const estado = new Map();
  for (const e of entidades || []) if (e.entity_type === 'campaign') estado.set(String(e.entity_id), e);

  const filas = new Map();
  const fila = (cid, nombre) => {
    if (!filas.has(cid)) {
      const e = estado.get(cid);
      filas.set(cid, {
        id: cid,
        nombre: nombre || e?.name || 'Campaña sin nombre',
        estado: e?.effective_status || e?.status || null,
        gasto: 0,
        conversaciones: 0,
        leads: 0,
        clientes: new Set(),
      });
    }
    return filas.get(cid);
  };
  for (const r of ins) {
    const cid = String(r.campaign_id || r.campaign_name || 'sin-campana');
    const f = fila(cid, r.campaign_name);
    f.gasto += num(r.gasto);
    f.conversaciones += num(r.conversaciones);
  }
  // Campañas activas sin gasto en el período también se muestran (están corriendo).
  for (const [cid, e] of estado) if (e.status === 'ACTIVE' || e.effective_status === 'ACTIVE') fila(cid, e.name);

  for (const l of leads || []) {
    if (!enRango(diaDeTimestamp(l.created_at), periodo) || !l.meta_ad_id) continue;
    const cid = adCampana.get(String(l.meta_ad_id));
    if (cid && filas.has(cid)) filas.get(cid).leads += 1;
  }
  const clienteCampana = new Map();
  for (const l of leadsMeta || []) {
    const cid = adCampana.get(String(l.meta_ad_id));
    if (l.client_id && cid) clienteCampana.set(l.client_id, cid);
  }
  for (const p of pagos || []) {
    if (!enRango(diaDeTimestamp(p.paid_at), periodo) || !p.client_id) continue;
    const cid = clienteCampana.get(p.client_id);
    if (cid && filas.has(cid)) filas.get(cid).clientes.add(p.client_id);
  }

  return [...filas.values()]
    .map((f) => ({
      id: f.id,
      nombre: f.nombre,
      estado: f.estado,
      gasto: f.gasto,
      conversaciones: f.conversaciones,
      leads: f.leads,
      cpl: dividir(f.gasto, f.leads),
      pagos: f.clientes.size,
      costoPorCliente: dividir(f.gasto, f.clientes.size),
    }))
    .sort((a, b) => b.gasto - a.gasto);
}

const ETIQUETAS_GENERO = { female: 'Mujeres', male: 'Hombres', unknown: 'Sin dato' };
const ETIQUETAS_PLATAFORMA = { facebook: 'Facebook', instagram: 'Instagram', messenger: 'Messenger', audience_network: 'Audience Network', whatsapp: 'WhatsApp', threads: 'Threads' };

/** Nombre legible de una clave de desglose. */
export function etiquetaDesglose(tipo, clave) {
  const [a, b] = String(clave).split('|');
  if (tipo === 'edad_sexo') return `${a} · ${ETIQUETAS_GENERO[b] || b || 'Sin dato'}`;
  if (tipo === 'ubicacion') return `${ETIQUETAS_PLATAFORMA[a] || a}${b ? ' · ' + b.replace(/_/g, ' ') : ''}`;
  return clave;
}

/**
 * Desgloses del período agrupados por tipo → filas { clave, etiqueta, gasto, impresiones, clics, conversaciones,
 * costoPorConversacion }. Orden por gasto (solo legibilidad, sin ranking de "mejor/peor").
 */
export function agruparDesglose(filas, periodo) {
  const porTipo = {};
  for (const f of filas || []) {
    const dia = String(f.fecha).slice(0, 10);
    if (!enRango(dia, periodo)) continue;
    const t = (porTipo[f.tipo] ||= new Map());
    const o = t.get(f.clave) || { clave: f.clave, gasto: 0, impresiones: 0, clics: 0, conversaciones: 0 };
    o.gasto += num(f.gasto);
    o.impresiones += num(f.impresiones);
    o.clics += num(f.clics);
    o.conversaciones += num(f.conversaciones);
    t.set(f.clave, o);
  }
  const out = {};
  for (const [tipo, mapa] of Object.entries(porTipo)) {
    out[tipo] = [...mapa.values()]
      .map((o) => ({ ...o, etiqueta: etiquetaDesglose(tipo, o.clave), costoPorConversacion: dividir(o.gasto, o.conversaciones) }))
      .sort((a, b) => b.gasto - a.gasto);
  }
  return out;
}

const pctTxt = (v) => `${Math.abs(v).toFixed(0)}%`;

/** Alertas en lenguaje de negocio. tipo: 'alerta' (atención) | 'info' (dato). */
export function generarAlertas({ actual, previo, ultimaFechaInsights, ultimaSyncOk = undefined, hoy = new Date() }) {
  const alertas = [];
  const hoyIso = isoDia(hoy);

  // La sincronización corre sola cada 5 min: si la última correcta es vieja, ESO es el problema.
  // Que no haya gasto reciente es otra cosa: Meta no devuelve filas de días sin entrega.
  if (ultimaSyncOk !== undefined && (!ultimaSyncOk || hoy.getTime() - new Date(ultimaSyncOk).getTime() > 30 * 60000)) {
    alertas.push({
      tipo: 'alerta',
      titulo: 'Sincronización con Meta atrasada',
      detalle: ultimaSyncOk
        ? `La última sincronización correcta fue el ${new Date(ultimaSyncOk).toLocaleString('es')}. Debería ocurrir cada 5 minutos: revisa el workflow "Meta Ads - Sincronizar Gasto" en n8n o el token de Meta.`
        : 'No hay ninguna sincronización correcta registrada con Meta.',
    });
  }

  if (ultimaFechaInsights && ultimaFechaInsights < sumarDias(hoyIso, -2)) {
    alertas.push({
      tipo: 'info',
      titulo: 'Sin gasto reciente en Meta',
      detalle: `El último día con gasto fue el ${ultimaFechaInsights}. Si hay campañas activas, revisa que estén entregando; si están pausadas es lo esperado.`,
    });
  } else if (!ultimaFechaInsights) {
    alertas.push({ tipo: 'alerta', titulo: 'Sin métricas de Meta', detalle: 'No hay métricas de Meta Ads cargadas todavía.' });
  }

  const dCostoConv = variacion(actual.costoPorConversacion, previo.costoPorConversacion);
  if (dCostoConv != null && dCostoConv >= 20) {
    alertas.push({
      tipo: 'alerta',
      titulo: 'Atención',
      detalle: `El costo por conversación aumentó ${pctTxt(dCostoConv)} frente al período anterior.`,
    });
  }

  if (actual.inversion > 0 && actual.conversaciones === 0) {
    alertas.push({
      tipo: 'alerta',
      titulo: 'Gasto sin conversaciones registradas',
      detalle: 'Hubo inversión pero Meta no reportó conversaciones iniciadas. Puede ser un problema del anuncio o del registro de datos.',
    });
  }

  if (actual.conversaciones > 0) {
    alertas.push({
      tipo: 'info',
      titulo: 'Dato',
      detalle: `Se generaron ${actual.conversaciones} conversaciones y ${actual.clientesPagados === 1 ? 'solamente 1 cliente pagó' : `${actual.clientesPagados} clientes pagaron`} en el período.`,
    });
  }

  if (actual.conversaciones > 0 && actual.leadsDeMeta === 0) {
    alertas.push({
      tipo: 'info',
      titulo: 'Atribución incompleta',
      detalle: 'Ningún lead del CRM quedó marcado con anuncio de origen. Los costos por lead y por cliente por campaña pueden verse vacíos.',
    });
  }
  return alertas;
}

const brl = (v) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "Lectura del período": explicación en lenguaje normal, solo con cifras reales. No decide nada. */
export function lecturaPeriodo(actual, periodo) {
  const titulo = `Resumen: ${periodo.etiqueta.toLowerCase()}`;
  if (actual.inversion === 0 && actual.conversaciones === 0 && actual.leads === 0 && actual.pagos === 0) {
    return { titulo, texto: 'No hay inversión, conversaciones, leads ni pagos registrados en este período.' };
  }
  const partes = [];
  partes.push(
    actual.inversion > 0
      ? `Se invirtieron ${brl(actual.inversion)}${actual.conversaciones > 0 ? ` y se generaron ${actual.conversaciones} conversaciones` : ' y Meta no reportó conversaciones'}.`
      : 'No hubo inversión en Meta.'
  );
  if (actual.costoPorConversacion != null) partes.push(`El costo medio por conversación fue de ${brl(actual.costoPorConversacion)}.`);
  partes.push(`En el CRM entraron ${actual.leads} leads${actual.propuestas ? `, ${actual.propuestas} con propuesta enviada` : ''}.`);
  if (actual.clientesPagados > 0) {
    partes.push(
      `${actual.clientesPagados === 1 ? '1 cliente pagó' : `${actual.clientesPagados} clientes pagaron`}, con una facturación de ${brl(actual.facturacion)}` +
        (actual.costoPorCliente != null ? ` y un costo de ${brl(actual.costoPorCliente)} por cliente (inversión total ÷ clientes pagados).` : '.')
    );
  } else {
    partes.push('Ningún cliente pagó en este período.');
  }
  if (actual.roas != null) partes.push(`ROAS: ${actual.roas.toFixed(2)}x.`);
  partes.push('Ojo: los pagos del período no son necesariamente de los leads del mismo período, ni todos vienen de Meta.');
  return { titulo, texto: partes.join(' ') };
}

/** Une todo: lo único que necesita el componente. */
export function construirResumen(datos, rango, hoy = new Date()) {
  const periodo = resolverPeriodos(rango, hoy);
  const adCampana = new Map();
  for (const r of datos.insights || []) if (r.ad_id && r.campaign_id) adCampana.set(String(r.ad_id), String(r.campaign_id));
  const actual = totalesPeriodo(datos, periodo, adCampana);
  const previo = totalesPeriodo(datos, periodo.previo, adCampana);
  const ultimaFechaInsights = (datos.insights || []).reduce((m, r) => {
    const f = String(r.fecha).slice(0, 10);
    return f > m ? f : m;
  }, '');
  return {
    periodo,
    actual,
    previo,
    serieDia: serieRendimiento(datos, periodo, 'dia'),
    serieSemana: serieRendimiento(datos, periodo, 'semana'),
    campanas: tablaCampanas(datos, periodo),
    alertas: generarAlertas({ actual, previo, ultimaFechaInsights: ultimaFechaInsights || null, ultimaSyncOk: datos.ultimaSyncOk, hoy }),
    lectura: lecturaPeriodo(actual, periodo),
    desglose: agruparDesglose(datos.desglose, periodo),
    ultimaFechaInsights: ultimaFechaInsights || null,
  };
}

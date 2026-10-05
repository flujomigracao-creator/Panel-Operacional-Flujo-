// Formato y comparación de métricas de creativos (puro: se prueba con node --test).

/** Métricas del comparador. `mejor`: 'min' (costos) o 'max' (volumen/resultado). */
export const METRICAS = [
  { key: 'impresiones', label: 'Impresiones', mejor: 'max', fmt: 'int' },
  { key: 'ctr', label: 'CTR', mejor: 'max', fmt: 'pct' },
  { key: 'conversaciones', label: 'Conversaciones', mejor: 'max', fmt: 'int' },
  { key: 'costo_por_conversacion', label: 'Costo/conversación', mejor: 'min', fmt: 'brl' },
  { key: 'leads', label: 'Leads', mejor: 'max', fmt: 'int' },
  { key: 'clientes_pagaron', label: 'Clientes que pagaron', mejor: 'max', fmt: 'int' },
  { key: 'costo_por_cliente', label: 'Costo/cliente', mejor: 'min', fmt: 'brl' },
  { key: 'ingresos', label: 'Ingresos', mejor: 'max', fmt: 'brl' },
];

/** null/undefined = sin dato (nunca se muestra como 0). */
export function formatear(valor, fmt) {
  if (valor === null || valor === undefined || valor === '') return '—';
  const n = Number(valor);
  if (!Number.isFinite(n)) return '—';
  if (fmt === 'brl') return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (fmt === 'pct') return `${n.toFixed(2)} %`;
  return n.toLocaleString('es');
}

/** Índices de la(s) mejor(es) celda(s) de una métrica; vacío si hay menos de 2 datos comparables. */
export function mejoresIndices(valores, mejor) {
  const nums = valores.map(v => (v === null || v === undefined ? null : Number(v)));
  const validos = nums.filter(v => v !== null && Number.isFinite(v));
  if (validos.length < 2) return [];
  const objetivo = mejor === 'min' ? Math.min(...validos) : Math.max(...validos);
  if (validos.every(v => v === objetivo)) return [];
  return nums.map((v, i) => (v === objetivo ? i : -1)).filter(i => i >= 0);
}

/**
 * Resumen de aprendizaje por servicio con datos reales: experimentos, creativos y embudo.
 * Suma solo valores presentes; si ningún creativo del servicio tiene dato, el total es null (no 0).
 */
export function resumirPorServicio(creativos = [], experimentos = []) {
  const suma = (lista, k) => {
    const v = lista.map(c => c[k]).filter(x => x !== null && x !== undefined).map(Number);
    return v.length ? v.reduce((a, b) => a + b, 0) : null;
  };
  const servicios = [...new Set([...creativos.map(c => c.service), ...experimentos.map(e => e.service)].filter(Boolean))];
  return servicios.map(servicio => {
    const cs = creativos.filter(c => c.service === servicio);
    const es = experimentos.filter(e => e.service === servicio);
    return {
      servicio,
      experimentos: es.length,
      concluidos: es.filter(e => e.status === 'completed').length,
      creativos: cs.length,
      conversaciones: suma(cs, 'conversaciones'),
      leads: suma(cs, 'leads'),
      clientes: suma(cs, 'clientes_pagaron'),
      ingresos: suma(cs, 'ingresos'),
    };
  });
}

/** Une cada creativo con el nombre/versión de su prompt y lo ordena por lo que realmente convierte (clientes, luego conversaciones). */
export function unirConversion(creativos = [], prompts = []) {
  const porPrompt = new Map(prompts.map(p => [p.id, p]));
  const num = v => (v === null || v === undefined ? null : Number(v));
  return creativos
    .filter(c => c.status !== 'archived')
    .map(c => ({ ...c, prompt_nombre: porPrompt.get(c.prompt_id)?.name ?? null }))
    .sort((a, b) => {
      const ka = [num(a.clientes_pagaron), num(a.conversaciones)];
      const kb = [num(b.clientes_pagaron), num(b.conversaciones)];
      for (let i = 0; i < 2; i++) {
        if (ka[i] === null && kb[i] === null) continue;
        if (ka[i] === null) return 1; // sin dato va al final, no se trata como 0
        if (kb[i] === null) return -1;
        if (ka[i] !== kb[i]) return kb[i] - ka[i];
      }
      return 0;
    });
}

/** Texto honesto sobre lo que se puede afirmar del origen de los clientes. */
export function resumenCobertura(cob) {
  if (!cob) return { estado: 'desconocido', texto: 'No se pudo leer la cobertura de atribución.' };
  const leads = Number(cob.leads) || 0;
  const conAnuncio = Number(cob.con_anuncio) || 0;
  if (conAnuncio === 0) {
    return {
      estado: 'esperando',
      texto: `ESPERANDO TRÁFICO REAL: de ${leads} leads, ninguno tiene anuncio de origen demostrable (referidos de Meta recibidos: ${Number(cob.referidos_recibidos) || 0}). Hasta que llegue un chat con datos de anuncio no se puede decir qué anuncio trajo a cada cliente.`,
    };
  }
  return {
    estado: 'parcial',
    texto: `${conAnuncio} de ${leads} leads (${Math.round((conAnuncio / leads) * 100)} %) tienen anuncio de origen demostrable; ${Number(cob.cerrados_con_anuncio) || 0} de ${Number(cob.cerrados) || 0} cerrados. El resto figura como sin origen: no se adivina.`,
  };
}

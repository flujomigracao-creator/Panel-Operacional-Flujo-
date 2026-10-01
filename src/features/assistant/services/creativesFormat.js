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

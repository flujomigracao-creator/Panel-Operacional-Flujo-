import { supabase } from '@shared/config/supabaseClient';

const must = ({ data, error }) => { if (error) throw error; return data; };

const startOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
const startOfNextMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString();

/**
 * Resumen del mes: lo cobrado (pagos confirmados, viene de Kommo/PicPay), lo gastado,
 * lo pendiente de cobrar y el saldo declarado en las cuentas. Es el mismo número de
 * "cobrado este mes" que ya se ve en el Laboratorio — misma fuente (payments.status='paid').
 */
export async function getResumenFinanciero(fecha = new Date()) {
  const desde = startOfMonth(fecha);
  const hasta = startOfNextMonth(fecha);

  const [cobrado, gastado, pendiente, cuentas] = await Promise.all([
    supabase.from('payments').select('amount').eq('status', 'paid').gte('paid_at', desde).lt('paid_at', hasta).then(must),
    supabase.from('expenses').select('amount').eq('status', 'paid').gte('expense_date', desde.slice(0, 10)).lt('expense_date', hasta.slice(0, 10)).then(must),
    supabase.from('payments').select('amount').in('status', ['pending', 'partial', 'overdue']).then(must),
    supabase.from('financial_accounts').select('id, initial_balance').eq('active', true).then(must),
  ]);

  const sum = (rows) => (rows || []).reduce((s, r) => s + Number(r.amount || 0), 0);
  const cobradoMes = sum(cobrado);
  const gastadoMes = sum(gastado);

  let saldoCuentas = (cuentas || []).reduce((s, c) => s + Number(c.initial_balance || 0), 0);
  if (cuentas?.length) {
    const movs = must(await supabase.from('transactions').select('account_id, type, amount').eq('status', 'completed'));
    for (const m of movs || []) {
      const signo = m.type === 'income' ? 1 : m.type === 'expense' ? -1 : 0;
      saldoCuentas += signo * Number(m.amount || 0);
    }
  }

  return {
    cobradoMes,
    gastadoMes,
    balanceMes: cobradoMes - gastadoMes,
    porCobrar: sum(pendiente),
    saldoCuentas,
    tieneCuentas: (cuentas || []).length > 0,
  };
}

export async function getCuentas() {
  const cuentas = must(await supabase.from('financial_accounts').select('id, name, type, currency, initial_balance, active').eq('active', true).order('name'));
  if (!cuentas.length) return [];
  const movs = must(await supabase.from('transactions').select('account_id, type, amount').eq('status', 'completed'));
  const porCuenta = {};
  for (const m of movs || []) {
    const signo = m.type === 'income' ? 1 : m.type === 'expense' ? -1 : 0;
    porCuenta[m.account_id] = (porCuenta[m.account_id] || 0) + signo * Number(m.amount || 0);
  }
  return cuentas.map((c) => ({ ...c, saldo: Number(c.initial_balance || 0) + (porCuenta[c.id] || 0) }));
}

export async function crearCuenta({ name, type = 'digital_wallet', currency = 'BRL', initial_balance = 0 }) {
  return must(await supabase.from('financial_accounts').insert({ name, type, currency, initial_balance }).select().single());
}

export async function getCategorias(kind) {
  let q = supabase.from('financial_categories').select('id, name, kind, parent_id').order('name');
  if (kind) q = q.eq('kind', kind);
  return must(await q);
}

export async function crearCategoria({ name, kind, parent_id = null }) {
  return must(await supabase.from('financial_categories').insert({ name, kind, parent_id }).select().single());
}

/** Gastos recientes, con el nombre de su categoría (si tiene). */
export async function getGastosRecientes(limit = 30) {
  return must(await supabase.from('expenses')
    .select('id, amount, currency, description, supplier, expense_date, status, created_at, financial_categories(name)')
    .order('expense_date', { ascending: false })
    .limit(limit));
}

export async function crearGasto({ amount, description, supplier = null, category_id = null, expense_date, status = 'paid' }) {
  return must(await supabase.from('expenses')
    .insert({ amount, description, supplier, category_id, expense_date: expense_date || new Date().toISOString().slice(0, 10), status, currency: 'BRL' })
    .select().single());
}

export async function marcarGastoPagado(id) {
  must(await supabase.from('expenses').update({ status: 'paid' }).eq('id', id));
}

export async function eliminarGasto(id) {
  must(await supabase.from('expenses').delete().eq('id', id));
}

/** Cobros pendientes (pending/partial/overdue), con nombre del cliente y del trámite. */
export async function getCobrosPendientes() {
  return must(await supabase.from('payments')
    .select('id, amount, currency, payment_method, status, due_date, created_at, clients(id, full_name, phone), client_services(id, services(name))')
    .in('status', ['pending', 'partial', 'overdue'])
    .order('due_date', { ascending: true, nullsFirst: false }));
}

export async function marcarCobroPagado(id, metodo = null) {
  const patch = { status: 'paid', paid_at: new Date().toISOString() };
  if (metodo) patch.payment_method = metodo;
  must(await supabase.from('payments').update(patch).eq('id', id));
}

/** Ingresos del mes agrupados por trámite (para ver qué servicio factura más). */
export async function getIngresosPorServicio(fecha = new Date()) {
  const desde = startOfMonth(fecha);
  const hasta = startOfNextMonth(fecha);
  const rows = must(await supabase.from('payments')
    .select('amount, client_services(services(name))')
    .eq('status', 'paid').gte('paid_at', desde).lt('paid_at', hasta));
  const porServicio = {};
  for (const r of rows || []) {
    const nombre = r.client_services?.services?.name || 'Sin trámite asociado';
    porServicio[nombre] = (porServicio[nombre] || 0) + Number(r.amount || 0);
  }
  return Object.entries(porServicio).map(([servicio, total]) => ({ servicio, total })).sort((a, b) => b.total - a.total);
}

/** Últimos movimientos (pagos cobrados + gastos), en un solo feed, para ver la actividad reciente. */
export async function getMovimientosRecientes(limit = 20) {
  const [pagos, gastos] = await Promise.all([
    supabase.from('payments').select('id, amount, paid_at, created_at, clients(full_name)').eq('status', 'paid').order('paid_at', { ascending: false }).limit(limit).then(must),
    supabase.from('expenses').select('id, amount, description, supplier, expense_date, status, created_at').order('expense_date', { ascending: false }).limit(limit).then(must),
  ]);
  const movimientos = [
    ...(pagos || []).map((p) => ({ id: `pago-${p.id}`, tipo: 'ingreso', monto: Number(p.amount), titulo: 'Pago de ' + (p.clients?.full_name || 'cliente'), fecha: p.paid_at || p.created_at })),
    ...(gastos || []).map((g) => ({ id: `gasto-${g.id}`, tipo: 'gasto', monto: Number(g.amount), titulo: g.description || g.supplier || 'Gasto', fecha: g.expense_date, pendiente: g.status !== 'paid' })),
  ];
  return movimientos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)).slice(0, limit);
}

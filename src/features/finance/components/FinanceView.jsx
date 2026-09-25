import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  CreditCard,
  Landmark,
  Plus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { formatCurrency } from '@/utils/currencyFormatter';
import {
  crearCuenta,
  crearGasto,
  eliminarGasto,
  getCategorias,
  getCobrosPendientes,
  getCuentas,
  getGastosRecientes,
  getIngresosPorServicio,
  getMovimientosRecientes,
  getResumenFinanciero,
  marcarCobroPagado,
  marcarGastoPagado,
} from '../services/financeService';

const REFRESH_MS = 120_000;

function Kpi({ label, value, icon: Icon, tone = 'neutral', hint }) {
  const tones = {
    neutral: 'text-chrome-text-active',
    good: 'text-success',
    bad: 'text-danger',
    warn: 'text-warning',
  };
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-chrome-border bg-chrome-bg p-5">
      <div className="flex items-center justify-between text-chrome-text">
        <span className="text-xs font-medium">{label}</span>
        {Icon && <Icon size={16} />}
      </div>
      <span className={`text-2xl font-bold tabular-nums ${tones[tone]}`}>{value}</span>
      {hint && <span className="text-xs text-chrome-text">{hint}</span>}
    </div>
  );
}

function Panel({ title, icon: Icon, right, children, className = '' }) {
  return (
    <section className={`rounded-xl border border-chrome-border bg-chrome-bg p-5 ${className}`}>
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-chrome-text-active">
          {Icon && <Icon size={15} className="text-brand-primary" />} {title}
        </h2>
        {right}
      </header>
      {children}
    </section>
  );
}

const ACCOUNT_TYPE_LABEL = { bank: 'Banco', cash: 'Efectivo', digital_wallet: 'Billetera digital', other: 'Otra' };

function NuevaCuentaForm({ onCreated, onCancel }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('digital_wallet');
  const [initial, setInitial] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await crearCuenta({ name: name.trim(), type, initial_balance: Number(initial) || 0 });
      toast.success('Cuenta creada');
      onCreated();
    } catch (err) {
      console.error(err);
      toast.error('No se pudo crear la cuenta');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg border border-chrome-border bg-chrome-bg-raised p-3">
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (ej. PicPay, Efectivo)"
        className="rounded-md border border-chrome-border bg-chrome-bg px-2.5 py-1.5 text-sm text-chrome-text-active outline-none focus:border-brand-primary" />
      <div className="flex gap-2">
        <select value={type} onChange={(e) => setType(e.target.value)} className="flex-1 rounded-md border border-chrome-border bg-chrome-bg px-2.5 py-1.5 text-sm text-chrome-text-active">
          {Object.entries(ACCOUNT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input value={initial} onChange={(e) => setInitial(e.target.value)} placeholder="Saldo inicial" type="number" step="0.01"
          className="w-32 rounded-md border border-chrome-border bg-chrome-bg px-2.5 py-1.5 text-sm text-chrome-text-active" />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-xs text-chrome-text hover:bg-chrome-bg">Cancelar</button>
        <button type="submit" disabled={saving} className="rounded-md bg-brand-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
          {saving ? 'Creando…' : 'Crear cuenta'}
        </button>
      </div>
    </form>
  );
}

function NuevoGastoForm({ categorias, onCreated, onCancel }) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [supplier, setSupplier] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const monto = Number(amount);
    if (!monto || !description.trim()) return;
    setSaving(true);
    try {
      await crearGasto({ amount: monto, description: description.trim(), supplier: supplier.trim() || null, category_id: categoryId || null, expense_date: date });
      toast.success('Gasto registrado');
      setAmount(''); setDescription(''); setSupplier('');
      onCreated();
    } catch (err) {
      console.error(err);
      toast.error('No se pudo registrar el gasto');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-lg border border-chrome-border bg-chrome-bg-raised p-3">
      <div className="flex gap-2">
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Monto (R$)" type="number" step="0.01" required
          className="w-28 rounded-md border border-chrome-border bg-chrome-bg px-2.5 py-1.5 text-sm text-chrome-text-active" />
        <input value={date} onChange={(e) => setDate(e.target.value)} type="date"
          className="rounded-md border border-chrome-border bg-chrome-bg px-2.5 py-1.5 text-sm text-chrome-text-active" />
      </div>
      <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="¿En qué se gastó?" required
        className="rounded-md border border-chrome-border bg-chrome-bg px-2.5 py-1.5 text-sm text-chrome-text-active" />
      <div className="flex gap-2">
        <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="Proveedor (opcional)"
          className="flex-1 rounded-md border border-chrome-border bg-chrome-bg px-2.5 py-1.5 text-sm text-chrome-text-active" />
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="flex-1 rounded-md border border-chrome-border bg-chrome-bg px-2.5 py-1.5 text-sm text-chrome-text-active">
          <option value="">Sin categoría</option>
          {categorias.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-xs text-chrome-text hover:bg-chrome-bg">Cancelar</button>
        <button type="submit" disabled={saving} className="rounded-md bg-brand-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
          {saving ? 'Guardando…' : 'Registrar gasto'}
        </button>
      </div>
    </form>
  );
}

function FinanceSkeleton() {
  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6 lg:p-8 animate-pulse">
      <div className="h-8 w-48 rounded-md bg-chrome-bg-raised" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-28 rounded-xl bg-chrome-bg" />)}
      </div>
      <div className="h-64 rounded-xl bg-chrome-bg" />
    </div>
  );
}

/**
 * Finanzas — vista simple de ERP: cuánto entró, cuánto salió, qué falta cobrar y
 * en qué cuentas está la plata. Los pagos confirmados por Kommo/PicPay ya alimentan
 * esto solos; los gastos y las cuentas se cargan a mano.
 */
export default function FinanceView() {
  const [resumen, setResumen] = useState(null);
  const [cuentas, setCuentas] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [cobros, setCobros] = useState([]);
  const [ingresosPorServicio, setIngresosPorServicio] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNuevoGasto, setShowNuevoGasto] = useState(false);
  const [showNuevaCuenta, setShowNuevaCuenta] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const [r, c, g, cb, ing, mov, cat] = await Promise.all([
        getResumenFinanciero(), getCuentas(), getGastosRecientes(15), getCobrosPendientes(),
        getIngresosPorServicio(), getMovimientosRecientes(12), getCategorias('expense'),
      ]);
      setResumen(r); setCuentas(c); setGastos(g); setCobros(cb); setIngresosPorServicio(ing); setMovimientos(mov); setCategorias(cat);
      setError(null);
    } catch (err) {
      console.error(err);
      setError('No se pudieron cargar los datos financieros.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const handleMarcarCobro = async (id) => {
    setBusyId(id);
    try {
      await marcarCobroPagado(id);
      toast.success('Marcado como cobrado');
      load();
    } catch (err) {
      console.error(err);
      toast.error('No se pudo actualizar');
    } finally {
      setBusyId(null);
    }
  };

  const handleMarcarGasto = async (id) => {
    setBusyId(id);
    try {
      await marcarGastoPagado(id);
      toast.success('Marcado como pagado');
      load();
    } catch (err) {
      console.error(err);
      toast.error('No se pudo actualizar');
    } finally {
      setBusyId(null);
    }
  };

  const handleEliminarGasto = async (id) => {
    if (!window.confirm('¿Borrar este gasto?')) return;
    setBusyId(id);
    try {
      await eliminarGasto(id);
      toast.success('Gasto borrado');
      load();
    } catch (err) {
      console.error(err);
      toast.error('No se pudo borrar');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <FinanceSkeleton />;

  const mesLabel = new Date().toLocaleDateString('es', { month: 'long', year: 'numeric' });

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-semibold text-chrome-text-active">
            <Landmark size={24} className="text-brand-primary" /> Finanzas
          </h1>
          <p className="mt-1 capitalize text-chrome-text">{mesLabel}</p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-chrome-text hover:bg-chrome-bg-raised hover:text-chrome-text-active" title="Actualizar">
          <RefreshCw size={13} /> Actualizar
        </button>
      </header>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-danger-border bg-danger-bg px-4 py-3 text-sm text-danger">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label="Cobrado este mes" value={formatCurrency(resumen.cobradoMes)} icon={TrendingUp} tone="good" />
        <Kpi label="Gastado este mes" value={formatCurrency(resumen.gastadoMes)} icon={TrendingDown} tone="bad" />
        <Kpi label="Balance del mes" value={formatCurrency(resumen.balanceMes)} icon={Banknote} tone={resumen.balanceMes >= 0 ? 'good' : 'bad'} />
        <Kpi label="Por cobrar" value={formatCurrency(resumen.porCobrar)} icon={CreditCard} tone={resumen.porCobrar > 0 ? 'warn' : 'neutral'} hint={cobros.length ? `${cobros.length} pendientes` : 'Al día'} />
        <Kpi label="En cuentas" value={formatCurrency(resumen.saldoCuentas)} icon={Wallet} hint={resumen.tieneCuentas ? `${cuentas.length} cuentas` : 'Sin cuentas cargadas'} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Panel title="Por cobrar" icon={CreditCard} className="xl:col-span-2">
          {cobros.length === 0 ? (
            <p className="py-6 text-center text-sm text-success">Todo cobrado. Nadie debe.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {cobros.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 rounded-md border border-chrome-border bg-chrome-bg-raised px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-chrome-text-active">{c.clients?.full_name || c.clients?.phone || 'Cliente'}</p>
                    <p className="truncate text-xs text-chrome-text">
                      {c.client_services?.services?.name || 'Trámite'} · {c.status === 'overdue' ? 'Vencido' : c.status === 'partial' ? 'Pago parcial' : 'Pendiente'}
                      {c.due_date && ` · vence ${new Date(c.due_date).toLocaleDateString('es')}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums text-chrome-text-active">{formatCurrency(c.amount)}</span>
                    <button onClick={() => handleMarcarCobro(c.id)} disabled={busyId === c.id}
                      className="inline-flex items-center gap-1 rounded-md bg-chrome-accent px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                      <CheckCircle2 size={13} /> Cobrado
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Cuentas" icon={Wallet} right={
          <button onClick={() => setShowNuevaCuenta((v) => !v)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-chrome-text hover:bg-chrome-bg-raised">
            <Plus size={13} /> Cuenta
          </button>
        }>
          {showNuevaCuenta && <div className="mb-3"><NuevaCuentaForm onCreated={() => { setShowNuevaCuenta(false); load(); }} onCancel={() => setShowNuevaCuenta(false)} /></div>}
          {cuentas.length === 0 && !showNuevaCuenta ? (
            <p className="text-sm text-chrome-text">Sin cuentas cargadas. Agrega tu PicPay, banco o efectivo para ver el saldo real.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {cuentas.map((c) => (
                <li key={c.id} className="flex items-center justify-between rounded-md border border-chrome-border bg-chrome-bg-raised px-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-chrome-text-active">{c.name}</p>
                    <p className="text-xs text-chrome-text">{ACCOUNT_TYPE_LABEL[c.type] || c.type}</p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-chrome-text-active">{formatCurrency(c.saldo)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Panel title="Gastos" icon={TrendingDown} className="xl:col-span-2" right={
          <button onClick={() => setShowNuevoGasto((v) => !v)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-chrome-text hover:bg-chrome-bg-raised">
            <Plus size={13} /> Gasto
          </button>
        }>
          {showNuevoGasto && <div className="mb-3"><NuevoGastoForm categorias={categorias} onCreated={() => { setShowNuevoGasto(false); load(); }} onCancel={() => setShowNuevoGasto(false)} /></div>}
          {gastos.length === 0 && !showNuevoGasto ? (
            <p className="py-6 text-center text-sm text-chrome-text">Sin gastos registrados todavía.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {gastos.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-3 rounded-md border border-chrome-border bg-chrome-bg-raised px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-chrome-text-active">{g.description}</p>
                    <p className="truncate text-xs text-chrome-text">
                      {g.supplier ? g.supplier + ' · ' : ''}{g.financial_categories?.name ? g.financial_categories.name + ' · ' : ''}{new Date(g.expense_date).toLocaleDateString('es')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums text-chrome-text-active">{formatCurrency(g.amount)}</span>
                    {g.status !== 'paid' ? (
                      <button onClick={() => handleMarcarGasto(g.id)} disabled={busyId === g.id} title="Marcar como pagado"
                        className="rounded-md px-2 py-1.5 text-xs text-warning hover:bg-warning-bg">Pendiente</button>
                    ) : (
                      <span className="text-xs text-success">Pagado</span>
                    )}
                    <button onClick={() => handleEliminarGasto(g.id)} disabled={busyId === g.id} title="Borrar"
                      className="rounded-md px-1.5 py-1.5 text-xs text-chrome-text hover:bg-danger-bg hover:text-danger">✕</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Ingresos por trámite" icon={TrendingUp}>
          {ingresosPorServicio.length === 0 ? (
            <p className="text-sm text-chrome-text">Sin cobros este mes.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {ingresosPorServicio.map(({ servicio, total }) => {
                const max = ingresosPorServicio[0].total || 1;
                return (
                  <li key={servicio}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="truncate text-chrome-text-active">{servicio}</span>
                      <span className="tabular-nums text-chrome-text">{formatCurrency(total)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-chrome-bg-raised">
                      <div className="h-1.5 rounded-full bg-brand-primary" style={{ width: `${(total / max) * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Movimientos recientes" icon={Banknote}>
        {movimientos.length === 0 ? (
          <p className="text-sm text-chrome-text">Sin movimientos todavía.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-chrome-border">
            {movimientos.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  {m.tipo === 'ingreso' ? <TrendingUp size={14} className="shrink-0 text-success" /> : <TrendingDown size={14} className="shrink-0 text-danger" />}
                  <span className="truncate text-sm text-chrome-text-active">{m.titulo}</span>
                  {m.pendiente && <span className="shrink-0 rounded-full bg-warning-bg px-1.5 py-0.5 text-[10px] text-warning">pendiente</span>}
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs text-chrome-text">
                  <span>{new Date(m.fecha).toLocaleDateString('es', { day: '2-digit', month: '2-digit' })}</span>
                  <span className={`tabular-nums font-medium ${m.tipo === 'ingreso' ? 'text-success' : 'text-danger'}`}>
                    {m.tipo === 'ingreso' ? '+' : '−'}{formatCurrency(m.monto)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { AlertTriangle, BadgeDollarSign, Plus } from 'lucide-react';
import { formatCurrency } from '@/utils/currencyFormatter';
import { actualizarTramitePrecio, crearTramite, getTramitesPrecios, setTramiteActivo } from '../services/financeService';
import { calcularMargen, parseMonto, validarTramite } from '../services/tramitesPrecios';

const inputCls = 'w-full rounded-md border border-chrome-border bg-chrome-bg px-2.5 py-1.5 text-sm text-chrome-text-active outline-none focus:border-brand-primary';
const fmtInput = (n) => (n === null || n === undefined ? '' : String(n));

function NuevoTramiteForm({ onCreated, onCancel }) {
  const [f, setF] = useState({ nombre: '', descripcion: '', precio: '', costo: '' });
  const [errores, setErrores] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const v = validarTramite(f);
    setErrores(v.errores);
    if (!v.ok) return;
    setSaving(true);
    try {
      await crearTramite(v.datos);
      toast.success('Trámite creado');
      onCreated();
    } catch (err) {
      console.error(err);
      toast.error(err?.message?.includes('Ya existe') ? 'Ya existe un trámite con ese nombre' : 'No se pudo crear el trámite');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-chrome-border bg-chrome-bg-raised p-4 md:grid-cols-4">
      <label className="md:col-span-2 text-xs text-chrome-text">Nombre del trámite
        <input className={inputCls} value={f.nombre} onChange={set('nombre')} placeholder="Ej. Antecedentes penales" autoFocus />
        {errores.nombre && <span className="text-danger">{errores.nombre}</span>}
      </label>
      <label className="text-xs text-chrome-text">Precio al cliente (R$)
        <input className={inputCls} inputMode="decimal" value={f.precio} onChange={set('precio')} placeholder="90" />
        {errores.precio && <span className="text-danger">{errores.precio}</span>}
      </label>
      <label className="text-xs text-chrome-text">Costo (R$, opcional)
        <input className={inputCls} inputMode="decimal" value={f.costo} onChange={set('costo')} placeholder="0" />
        {errores.costo && <span className="text-danger">{errores.costo}</span>}
      </label>
      <label className="md:col-span-4 text-xs text-chrome-text">Descripción (opcional)
        <input className={inputCls} value={f.descripcion} onChange={set('descripcion')} />
      </label>
      <p className="md:col-span-4 text-xs text-chrome-text">
        Se crea con las etapas estándar. Para que Kommo y Nora lo usen, agrega en Kommo la opción con el <b>mismo nombre</b> en
        «Trámite solicitado»; Nora solo lo ofrece cuando tenga su guion y audio.
      </p>
      <div className="md:col-span-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-xs text-chrome-text hover:bg-chrome-bg">Cancelar</button>
        <button type="submit" disabled={saving} className="rounded-md bg-chrome-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
          {saving ? 'Creando…' : 'Crear trámite'}
        </button>
      </div>
    </form>
  );
}

function FilaTramite({ t, onChanged }) {
  const [precio, setPrecio] = useState(fmtInput(t.precio));
  const [costo, setCosto] = useState(fmtInput(t.costo));
  const [saving, setSaving] = useState(false);

  const p = parseMonto(precio);
  const c = String(costo).trim() === '' ? null : parseMonto(costo);
  const invalido = p === null || (String(costo).trim() !== '' && c === null) || (c !== null && c > p);
  const sucio = p !== t.precio || c !== t.costo;
  const margen = calcularMargen(p, c);

  const guardar = async () => {
    if (invalido) { toast.error('Revisa precio y costo'); return; }
    setSaving(true);
    try {
      await actualizarTramitePrecio(t.id, { precio: p, costo: c });
      toast.success(t.nora && p !== t.precio ? 'Guardado. Ojo: el guion y audio de Nora hay que regenerarlos' : 'Guardado');
      onChanged();
    } catch (err) {
      console.error(err);
      toast.error('No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const alternar = async () => {
    try { await setTramiteActivo(t.id, !t.activo); onChanged(); } catch (err) { console.error(err); toast.error('No se pudo actualizar'); }
  };

  return (
    <li className={`rounded-md border border-chrome-border bg-chrome-bg-raised px-3 py-2.5 ${t.activo ? '' : 'opacity-60'}`}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-[200px] flex-1">
          <p className="text-sm font-medium text-chrome-text-active">{t.nombre}</p>
          <p className="flex flex-wrap gap-1.5 pt-0.5 text-[11px]">
            {t.nora?.enLista && <span className="rounded-full bg-chrome-bg px-1.5 py-0.5 text-success">Nora lo ofrece</span>}
            {!t.enlazadoKommo && <span className="rounded-full bg-warning-bg px-1.5 py-0.5 text-warning">Sin opción en Kommo</span>}
            {!t.activo && <span className="rounded-full bg-chrome-bg px-1.5 py-0.5 text-chrome-text">Inactivo</span>}
          </p>
        </div>
        <label className="w-28 text-[11px] text-chrome-text">Precio
          <input className={inputCls} inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} />
        </label>
        <label className="w-28 text-[11px] text-chrome-text">Costo
          <input className={inputCls} inputMode="decimal" value={costo} onChange={(e) => setCosto(e.target.value)} />
        </label>
        <div className="w-28 text-[11px] text-chrome-text">Margen
          <p className="py-1.5 text-sm tabular-nums text-chrome-text-active">
            {margen ? `${formatCurrency(margen.monto)} · ${margen.porcentaje.toFixed(0)}%` : '—'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {sucio && (
            <button onClick={guardar} disabled={saving || invalido} className="rounded-md bg-chrome-accent px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50">
              {saving ? '…' : 'Guardar'}
            </button>
          )}
          <button onClick={alternar} className="rounded-md px-2 py-1.5 text-xs text-chrome-text hover:bg-chrome-bg">{t.activo ? 'Desactivar' : 'Activar'}</button>
        </div>
      </div>
      {t.nora?.guionDesactualizado && (
        <p className="mt-2 flex items-start gap-1.5 rounded-md bg-warning-bg px-2.5 py-1.5 text-xs text-warning">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          El guion y el audio de Nora todavía dicen {formatCurrency(t.nora.precioEnGuion)} y el precio ahora es {formatCurrency(t.precio)}. Hay que regenerarlos para que no se contradigan.
        </p>
      )}
    </li>
  );
}

/** Finanzas → Trámites y precios: alta de trámites y edición de precio/costo. */
export default function TramitesPreciosPanel() {
  const [tramites, setTramites] = useState(null);
  const [error, setError] = useState(null);
  const [showNuevo, setShowNuevo] = useState(false);

  const load = useCallback(async () => {
    try { setTramites(await getTramitesPrecios()); setError(null); }
    catch (err) { console.error(err); setError('No se pudieron cargar los trámites.'); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <section className="rounded-xl border border-chrome-border bg-chrome-bg p-5">
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-chrome-text-active">
          <BadgeDollarSign size={15} className="text-brand-primary" /> Trámites y precios
        </h2>
        <button onClick={() => setShowNuevo((v) => !v)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-chrome-text hover:bg-chrome-bg-raised">
          <Plus size={13} /> Trámite
        </button>
      </header>
      {showNuevo && <NuevoTramiteForm onCreated={() => { setShowNuevo(false); load(); }} onCancel={() => setShowNuevo(false)} />}
      {error && <p className="text-sm text-danger">{error}</p>}
      {!tramites && !error && <p className="text-sm text-chrome-text">Cargando…</p>}
      {tramites && (
        <ul className="flex flex-col gap-2">
          {tramites.map((t) => <FilaTramite key={`${t.id}-${t.precio}-${t.costo}`} t={t} onChanged={load} />)}
        </ul>
      )}
    </section>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { getCatalogoMeta, getEmplazamientosReales } from '../services/resumenMetaService';
import { CLASES_CATALOGO, filtrarCatalogo, agruparEmplazamientos } from '../services/catalogoMeta';
import { LoadingSpinner } from '@/shared/components/ui/LoadingSpinner';

const ent = (v) => (v == null ? '—' : Math.round(Number(v)).toLocaleString('pt-BR'));
const brl = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(String(texto));
    toast.success('Copiado');
  } catch {
    toast.error('No se pudo copiar');
  }
}

export default function CatalogoMeta() {
  const [filas, setFilas] = useState(null);
  const [reales, setReales] = useState([]);
  const [error, setError] = useState(null);
  const [clase, setClase] = useState('behaviors');
  const [texto, setTexto] = useState('');

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const datos = await getCatalogoMeta();
        if (vivo) setFilas(datos);
      } catch (e) {
        console.error('[Catálogo Meta]', e);
        if (vivo) setError(e?.message || 'No se pudo leer el catálogo.');
      }
      // Lo que Meta mostró de verdad es un extra: si falla no se tumba el catálogo.
      try {
        const r = await getEmplazamientosReales();
        if (vivo) setReales(r);
      } catch (e) {
        console.error('[Catálogo Meta] emplazamientos reales', e);
      }
    })();
    return () => { vivo = false; };
  }, []);

  const conteo = useMemo(() => {
    const c = {};
    for (const f of filas || []) c[f.clase] = (c[f.clase] || 0) + 1;
    return c;
  }, [filas]);
  const visibles = useMemo(() => filtrarCatalogo(filas || [], clase, texto), [filas, clase, texto]);
  const emplazamientos = useMemo(() => agruparEmplazamientos(reales), [reales]);

  if (error) return <p className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>;
  if (!filas) return <LoadingSpinner />;

  return (
    <div className="space-y-4">
      <p className="text-xs leading-relaxed text-chrome-text-muted">
        Opciones de segmentación tal como las devuelve tu cuenta de Meta: nombre exacto e ID, para crear públicos sin adivinar cómo se escriben.
        «Alcance» es el rango aproximado que informa Meta, a nivel mundial.
      </p>

      <div className="flex flex-wrap gap-1">
        {CLASES_CATALOGO.map(([k, etiqueta]) => (
          <button
            key={k}
            onClick={() => setClase(k)}
            className={`rounded-md px-3 py-1 text-xs font-semibold ${clase === k ? 'bg-chrome-bg-active text-chrome-text-active' : 'text-chrome-text-muted hover:text-chrome-text'}`}
          >
            {etiqueta} <span className="tabular-nums opacity-70">{conteo[k] || 0}</span>
          </button>
        ))}
      </div>

      <input
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar por nombre, ruta o ID…"
        className="w-full rounded-lg border border-chrome-border bg-chrome-bg-raised px-3 py-2 text-sm text-chrome-text placeholder:text-chrome-text-muted"
        aria-label="Buscar en el catálogo"
      />

      <div className="overflow-x-auto rounded-xl border border-chrome-border">
        <table className="min-w-full text-xs">
          <thead className="bg-chrome-bg-active/40 text-left text-chrome-text-muted">
            <tr>
              <th className="px-3 py-2 font-semibold">Nombre exacto</th>
              <th className="px-3 py-2 font-semibold">Ruta</th>
              <th className="px-3 py-2 font-semibold">ID</th>
              <th className="px-3 py-2 text-right font-semibold">Alcance</th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-chrome-text-muted">Sin resultados.</td></tr>
            )}
            {visibles.slice(0, 300).map((f) => (
              <tr key={`${f.clase}-${f.meta_id}`} className="border-t border-chrome-border/60">
                <td className="px-3 py-2 text-chrome-text-active">
                  <button onClick={() => copiar(f.nombre)} title="Copiar el nombre" className="text-left hover:text-brand-primary">{f.nombre}</button>
                </td>
                <td className="max-w-[320px] truncate px-3 py-2 text-chrome-text-muted" title={f.ruta || ''}>{f.ruta || '—'}</td>
                <td className="whitespace-nowrap px-3 py-2">
                  <button onClick={() => copiar(f.meta_id)} title="Copiar el ID" className="font-mono text-[11px] text-chrome-text hover:text-brand-primary">{f.meta_id}</button>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-chrome-text-muted">
                  {f.tamano_min != null ? `${ent(f.tamano_min)}${f.tamano_max != null ? ` – ${ent(f.tamano_max)}` : ''}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {visibles.length > 300 && <p className="text-[11px] text-chrome-text-muted">Se muestran 300 de {visibles.length}: afina la búsqueda.</p>}

      {emplazamientos.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-chrome-text-active">Dónde se mostraron tus anuncios (datos reales)</p>
          <div className="overflow-x-auto rounded-xl border border-chrome-border">
            <table className="min-w-full text-xs">
              <thead className="bg-chrome-bg-active/40 text-left text-chrome-text-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">Emplazamiento</th>
                  <th className="px-3 py-2 text-right font-semibold">Gasto</th>
                  <th className="px-3 py-2 text-right font-semibold">Conversaciones</th>
                  <th className="px-3 py-2 text-right font-semibold">Costo/conversación</th>
                </tr>
              </thead>
              <tbody>
                {emplazamientos.map((e) => (
                  <tr key={e.clave} className="border-t border-chrome-border/60">
                    <td className="px-3 py-2 text-chrome-text-active">{e.nombre}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{brl(e.gasto)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{e.conversaciones}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{e.costo == null ? '—' : brl(e.costo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] leading-relaxed text-chrome-text-muted">
            «—» significa que no hubo conversaciones atribuidas, no que cueste cero. Con poco gasto por emplazamiento, no conviene apagar ninguno todavía.
          </p>
        </div>
      )}
    </div>
  );
}

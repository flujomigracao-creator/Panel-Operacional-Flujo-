import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Download } from 'lucide-react';
import { getInsightsCompletos, suscribirCambios } from '../services/resumenMetaService';
import { NIVELES, agruparMetricas, agruparAcciones, aCsv, etiquetaRanking } from '../services/metricasCompletas';
import { LoadingSpinner } from '@/shared/components/ui/LoadingSpinner';

const brl = (v) => (v == null ? '—' : `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const ent = (v) => (v == null ? '—' : Math.round(v).toLocaleString('pt-BR'));
const dec = (v, d = 2) => (v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));

// [clave, título, formato, ayuda]
const COLUMNAS = [
  ['gasto', 'Gasto', brl],
  ['impresiones', 'Impresiones', ent],
  ['alcance', 'Alcance*', ent],
  ['frecuenciaMedia', 'Frecuencia*', (v) => dec(v)],
  ['clics', 'Clics', ent],
  ['clicsEnlace', 'Clics en enlace', ent],
  ['ctr', 'CTR', (v) => (v == null ? '—' : `${dec(v)}%`)],
  ['cpm', 'CPM', brl],
  ['cpc', 'CPC', brl],
  ['costoPorClicEnlace', 'Costo/clic enlace', brl],
  ['conversaciones', 'Conversaciones', ent],
  ['costoPorConversacion', 'Costo/conv.', brl],
  ['leadsMeta', 'Leads (Meta)', ent],
  ['video', 'Video (repr.)', ent],
  ['rankingCalidad', 'Calidad', etiquetaRanking],
  ['rankingEngagement', 'Engagement', etiquetaRanking],
  ['rankingConversion', 'Conversión', etiquetaRanking],
];

export default function MetricasCompletas({ rango }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [nivel, setNivel] = useState('campana');

  const clave = JSON.stringify(rango);
  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    try {
      setDatos(await getInsightsCompletos(rango));
      setError(null);
    } catch (err) {
      console.error('[Métricas completas]', err);
      if (!silencioso) setError('No se pudieron leer las métricas de Meta Ads.');
    } finally {
      if (!silencioso) setCargando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    let t = null;
    const cancelar = suscribirCambios(() => {
      if (document.hidden) return;
      clearTimeout(t);
      t = setTimeout(() => cargar(true), 2000);
    });
    return () => {
      clearTimeout(t);
      cancelar();
    };
  }, [cargar]);

  const filas = useMemo(() => (datos ? agruparMetricas(datos.filas, nivel, datos.periodo) : []), [datos, nivel]);
  const acciones = useMemo(() => (datos ? agruparAcciones(datos.filas, datos.periodo) : []), [datos]);

  const descargar = () => {
    const blob = new Blob(['﻿' + aCsv(filas)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meta-ads-${nivel}-${datos.periodo.desde}_${datos.periodo.hasta}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (cargando && !datos) {
    return (
      <div className="flex h-48 items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  if (error) return <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">{error}</div>;
  if (!datos) return null;

  const grupos = [...new Set(acciones.map((a) => a.grupo))];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-chrome-text-active">Todas las métricas · {datos.periodo.etiqueta}</p>
            <p className="text-[11px] text-chrome-text-muted">
              {datos.filas.length} registros diarios por anuncio de Meta. *Alcance y frecuencia: Meta los cuenta por día y anuncio; aquí se suman los
              días, así que una misma persona puede repetirse.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-chrome-border bg-chrome-bg p-0.5 text-xs">
              {Object.entries(NIVELES).map(([v, n]) => (
                <button
                  key={v}
                  onClick={() => setNivel(v)}
                  className={`rounded-md px-2.5 py-1 font-medium ${nivel === v ? 'bg-brand-primary text-white' : 'text-chrome-text hover:text-chrome-text-active'}`}
                >
                  {n.etiqueta}
                </button>
              ))}
            </div>
            <button
              onClick={descargar}
              disabled={!filas.length}
              className="inline-flex items-center gap-1.5 rounded-lg border border-chrome-border bg-chrome-bg px-2.5 py-1 text-xs font-medium text-chrome-text hover:border-brand-primary hover:text-brand-primary disabled:opacity-40"
            >
              <Download size={12} /> CSV
            </button>
          </div>
        </div>

        {filas.length === 0 ? (
          <p className="text-xs text-chrome-text-muted">Meta no registró actividad en este período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1400px] text-left text-xs">
              <thead className="text-[10px] uppercase text-chrome-text-muted">
                <tr>
                  <th className="sticky left-0 bg-chrome-bg-raised pb-2 pr-3 font-medium">{NIVELES[nivel].etiqueta}</th>
                  {COLUMNAS.map(([k, t]) => (
                    <th key={k} className="whitespace-nowrap pb-2 pl-3 text-right font-medium">{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-chrome-border/40 text-chrome-text">
                {filas.map((f) => (
                  <tr key={f.id}>
                    <td className="sticky left-0 max-w-[280px] bg-chrome-bg-raised py-2 pr-3">
                      <span className="block truncate font-medium text-chrome-text-active" title={f.nombre}>{f.nombre}</span>
                      <span className="text-[10px] text-chrome-text-muted">{f.dias} días con actividad</span>
                    </td>
                    {COLUMNAS.map(([k, , fmt]) => (
                      <td key={k} className="whitespace-nowrap py-2 pl-3 text-right">{fmt(f[k])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-chrome-text-active">Todo lo que Meta midió (acciones, video, valores)</p>
        <p className="mb-3 text-[11px] text-chrome-text-muted">
          Total del período por tipo de acción. El costo es el gasto de las filas que registraron esa acción dividido entre la cantidad.
        </p>
        {acciones.length === 0 ? (
          <p className="text-xs text-chrome-text-muted">Sin acciones registradas en este período.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {grupos.map((g) => (
              <div key={g}>
                <p className="mb-1 text-[11px] font-semibold text-chrome-text-active">{acciones.find((a) => a.grupo === g).grupoNombre}</p>
                <table className="w-full text-left text-xs">
                  <tbody className="divide-y divide-chrome-border/40 text-chrome-text">
                    {acciones.filter((a) => a.grupo === g).map((a) => (
                      <tr key={a.tipo}>
                        <td className="py-1 pr-3">{a.nombre}</td>
                        <td className="py-1 text-right font-medium text-chrome-text-active">{dec(a.valor, a.valor % 1 ? 2 : 0)}</td>
                        <td className="w-28 py-1 text-right text-chrome-text-muted">{a.costo != null ? `${brl(a.costo)} c/u` : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

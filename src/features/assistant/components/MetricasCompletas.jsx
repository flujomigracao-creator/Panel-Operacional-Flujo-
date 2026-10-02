import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Download } from 'lucide-react';
import { getInsightsCompletos, suscribirCambios } from '../services/resumenMetaService';
import { NIVELES, agruparMetricas, agruparAcciones, aCsv, etiquetaRanking, valorAccion } from '../services/metricasCompletas';
import { LoadingSpinner } from '@/shared/components/ui/LoadingSpinner';

const brl = (v) => (v == null ? '—' : `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const ent = (v) => (v == null ? '—' : Math.round(v).toLocaleString('pt-BR'));
const dec = (v, d = 2) => (v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const pct = (v) => (v == null ? '—' : `${dec(v)}%`);

const act = (grupo, tipo) => (f) => valorAccion(f, grupo, tipo);
const A = (tipo) => act('actions', tipo);
const V = (grupo) => act(grupo, 'video_view');
const MSG = 'onsite_conversion.';
const costo = (f, tipo) => {
  const n = valorAccion(f, 'actions', tipo);
  return n > 0 ? f.gasto / n : null;
};

// Cada vista: columnas [título, valor(fila), formato]. Así cada pestaña cabe en pantalla y NADA queda oculto.
const VISTAS = {
  general: {
    nombre: 'General',
    cols: [
      ['Gasto', (f) => f.gasto, brl], ['Impresiones', (f) => f.impresiones, ent], ['Clics', (f) => f.clics, ent],
      ['CTR', (f) => f.ctr, pct], ['CPM', (f) => f.cpm, brl], ['Conversaciones', (f) => f.conversaciones, ent],
      ['Costo/conv.', (f) => f.costoPorConversacion, brl],
    ],
  },
  entrega: {
    nombre: 'Entrega',
    cols: [
      ['Gasto', (f) => f.gasto, brl], ['Impresiones', (f) => f.impresiones, ent], ['Alcance*', (f) => f.alcance, ent],
      ['Frecuencia*', (f) => f.frecuenciaMedia, dec], ['CPM', (f) => f.cpm, brl], ['Días con actividad', (f) => f.dias, ent],
    ],
  },
  clics: {
    nombre: 'Clics',
    cols: [
      ['Clics (todos)', (f) => f.clics, ent], ['Clics únicos', (f) => f.clicsUnicos, ent], ['Clics en enlace', (f) => f.clicsEnlace, ent],
      ['Clics salientes', act('outbound_clicks', 'outbound_click'), ent], ['CTR', (f) => f.ctr, pct], ['CPC', (f) => f.cpc, brl],
      ['Costo/clic enlace', (f) => f.costoPorClicEnlace, brl],
    ],
  },
  mensajes: {
    nombre: 'Mensajes',
    cols: [
      ['Conversaciones iniciadas', (f) => f.conversaciones, ent], ['Costo/conv.', (f) => f.costoPorConversacion, brl],
      ['Conexiones totales', A(MSG + 'total_messaging_connection'), ent], ['Primeras respuestas', A(MSG + 'messaging_first_reply'), ent],
      ['Respondidas', A(MSG + 'messaging_conversation_replied_7d'), ent], ['2+ mensajes', A(MSG + 'messaging_user_depth_2_message_send'), ent],
      ['3+ mensajes', A(MSG + 'messaging_user_depth_3_message_send'), ent], ['5+ mensajes', A(MSG + 'messaging_user_depth_5_message_send'), ent],
      ['Costo/2+ mensajes', (f) => costo(f, MSG + 'messaging_user_depth_2_message_send'), brl], ['Leads (Meta)', (f) => f.leadsMeta, ent],
    ],
  },
  interacciones: {
    nombre: 'Interacciones',
    cols: [
      ['Interacciones', A('post_engagement'), ent], ['Costo/interacción', (f) => costo(f, 'post_engagement'), brl],
      ['Reacciones', A('post_reaction'), ent], ['Comentarios', A('comment'), ent], ['Compartidos', A('post'), ent],
      ['Guardados', A(MSG + 'post_save'), ent], ['Vistas de foto', A('photo_view'), ent],
    ],
  },
  video: {
    nombre: 'Video',
    cols: [
      ['Reproducciones', V('video_play_actions'), ent], ['25% visto', V('video_p25_watched_actions'), ent], ['50% visto', V('video_p50_watched_actions'), ent],
      ['75% visto', V('video_p75_watched_actions'), ent], ['100% visto', V('video_p100_watched_actions'), ent], ['ThruPlay', V('video_thruplay_watched_actions'), ent],
    ],
  },
  calidad: {
    nombre: 'Calidad',
    cols: [
      ['Ranking de calidad', (f) => f.rankingCalidad, etiquetaRanking], ['Ranking de engagement', (f) => f.rankingEngagement, etiquetaRanking],
      ['Ranking de conversión', (f) => f.rankingConversion, etiquetaRanking],
    ],
  },
};
// "Todo": cada columna de cada vista, sin repetir.
VISTAS.todo = {
  nombre: 'Todo',
  cols: [...new Map(Object.values(VISTAS).flatMap((v) => v.cols).map((c) => [c[0], c])).values()],
};

export default function MetricasCompletas({ rango }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [nivel, setNivel] = useState('campana');
  const [vista, setVista] = useState('general');

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
  const cols = VISTAS[vista].cols;

  // Fila de totales (solo para columnas numéricas aditivas; razones y rankings se dejan vacíos).
  const ADITIVAS = new Set(['Gasto', 'Impresiones', 'Clics', 'Clics (todos)', 'Clics únicos', 'Clics en enlace', 'Clics salientes', 'Conversaciones', 'Conversaciones iniciadas',
    'Leads (Meta)', 'Conexiones totales', 'Primeras respuestas', 'Respondidas', '2+ mensajes', '3+ mensajes', '5+ mensajes', 'Interacciones', 'Reacciones', 'Comentarios',
    'Compartidos', 'Guardados', 'Vistas de foto', 'Reproducciones', '25% visto', '50% visto', '75% visto', '100% visto', 'ThruPlay']);
  const total = (titulo, valor) => (ADITIVAS.has(titulo) ? filas.reduce((a, f) => a + (Number(valor(f)) || 0), 0) : null);

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
  const boton = (activo) =>
    `rounded-md px-2.5 py-1 font-medium ${activo ? 'bg-brand-primary text-white' : 'text-chrome-text hover:text-chrome-text-active'}`;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-chrome-text-active">Todas las métricas · {datos.periodo.etiqueta}</p>
            <p className="text-[11px] text-chrome-text-muted">
              {datos.filas.length} registros diarios por anuncio de Meta. *Alcance y frecuencia: Meta los cuenta por día y anuncio; aquí se suman los días, así
              que una misma persona puede repetirse.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-chrome-border bg-chrome-bg p-0.5 text-xs">
              {Object.entries(NIVELES).map(([v, n]) => (
                <button key={v} onClick={() => setNivel(v)} className={boton(nivel === v)}>{n.etiqueta}</button>
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

        <div className="mb-3 inline-flex flex-wrap rounded-lg border border-chrome-border bg-chrome-bg p-0.5 text-xs">
          {Object.entries(VISTAS).map(([v, d]) => (
            <button key={v} onClick={() => setVista(v)} className={boton(vista === v)}>{d.nombre}</button>
          ))}
        </div>

        {filas.length === 0 ? (
          <p className="text-xs text-chrome-text-muted">Meta no registró actividad en este período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" style={{ minWidth: `${280 + cols.length * 110}px` }}>
              <thead className="text-[10px] uppercase text-chrome-text-muted">
                <tr>
                  <th className="sticky left-0 bg-chrome-bg-raised pb-2 pr-3 font-medium">{NIVELES[nivel].etiqueta}</th>
                  {cols.map(([t]) => (
                    <th key={t} className="pb-2 pl-3 text-right font-medium">{t}</th>
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
                    {cols.map(([t, val, fmt]) => (
                      <td key={t} className="py-2 pl-3 text-right">{fmt(val(f))}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {filas.length > 1 && (
                <tfoot className="border-t border-chrome-border text-chrome-text-active">
                  <tr>
                    <td className="sticky left-0 bg-chrome-bg-raised py-2 pr-3 font-semibold">Total</td>
                    {cols.map(([t, val, fmt]) => {
                      const v = total(t, val);
                      return <td key={t} className="py-2 pl-3 text-right font-semibold">{v == null ? '' : fmt(v)}</td>;
                    })}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-chrome-text-active">Todo lo que Meta midió (acciones, video, valores)</p>
        <p className="mb-3 text-[11px] text-chrome-text-muted">
          Total del período por tipo de acción, de TODA la cuenta. El costo es el gasto de las filas que registraron esa acción dividido entre la cantidad.
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

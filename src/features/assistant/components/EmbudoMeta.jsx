import React, { useEffect, useState, useCallback } from 'react';
import { getEmbudoMeta, suscribirCambios } from '../services/resumenMetaService';
import { LoadingSpinner } from '@/shared/components/ui/LoadingSpinner';

const NIVELES = [
  ['campana', 'Campañas'],
  ['conjunto', 'Conjuntos'],
  ['anuncio', 'Anuncios'],
];

const brl = (v) => (v == null ? '—' : `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const ent = (v) => (v == null ? '—' : Math.round(Number(v)).toLocaleString('pt-BR'));
const dec = (v) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const pct = (v) => (v == null ? '—' : `${(Number(v) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);

const COLUMNAS = [
  ['Gasto', (f) => f.gasto, brl],
  ['Conv. Meta', (f) => f.conversaciones_meta, ent],
  ['Leads atrib.', (f) => f.leads_atribuidos, ent],
  ['Calificados', (f) => f.calificados, ent],
  ['Propuestas', (f) => f.propuestas, ent],
  ['Pagos', (f) => f.pagos, ent],
  ['Ingresos', (f) => f.ingresos, brl],
  ['Costo/lead', (f) => f.cpl, brl],
  ['Costo/calif.', (f) => f.cpql, brl],
  ['Costo/propuesta', (f) => f.costo_propuesta, brl],
  ['CAC', (f) => f.cac, brl],
  ['ROAS', (f) => f.roas, dec],
  ['Lead→pago', (f) => f.conv_lead_a_pago, pct],
  ['Cobertura', (f) => f.cobertura, pct],
];

const COLOR_CONFIANZA = {
  media: 'text-green-300',
  baja: 'text-amber-300',
  'sin atribución': 'text-chrome-text-muted',
  'sin datos de Meta': 'text-chrome-text-muted',
};

export default function EmbudoMeta({ rango }) {
  const [nivel, setNivel] = useState('campana');
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setDatos(await getEmbudoMeta(rango, nivel));
    } catch (e) {
      console.error('[Embudo Meta]', e);
      setError(e?.message || 'No se pudo leer el embudo.');
      setDatos(null);
    } finally {
      setCargando(false);
    }
  }, [JSON.stringify(rango), nivel]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => suscribirCambios(cargar), [cargar]);

  const filas = datos?.filas || [];
  const total = filas.reduce(
    (a, f) => ({ gasto: a.gasto + Number(f.gasto || 0), leads: a.leads + (f.leads_atribuidos || 0), pagos: a.pagos + (f.pagos || 0), ingresos: a.ingresos + Number(f.ingresos || 0), conv: a.conv + Number(f.conversaciones_meta || 0) }),
    { gasto: 0, leads: 0, pagos: 0, ingresos: 0, conv: 0 },
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {NIVELES.map(([k, etiqueta]) => (
            <button
              key={k}
              onClick={() => setNivel(k)}
              className={`rounded-md px-3 py-1 text-xs font-semibold ${nivel === k ? 'bg-chrome-bg-active text-chrome-text-active' : 'text-chrome-text-muted hover:text-chrome-text'}`}
            >
              {etiqueta}
            </button>
          ))}
        </div>
        {datos && (
          <p className="text-xs text-chrome-text-muted">
            {datos.periodo.desde} → {datos.periodo.hasta} · gasto {brl(total.gasto)} · {ent(total.leads)} leads atribuidos de {ent(total.conv)} conversaciones de Meta
            · {ent(total.pagos)} pagos confirmados ({brl(total.ingresos)})
          </p>
        )}
      </div>

      {cargando && <LoadingSpinner />}
      {error && <p className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}

      {!cargando && !error && (
        <div className="overflow-x-auto rounded-xl border border-chrome-border">
          <table className="min-w-full text-xs">
            <thead className="bg-chrome-bg-active/40 text-left text-chrome-text-muted">
              <tr>
                <th className="px-3 py-2 font-semibold">{NIVELES.find((n) => n[0] === nivel)?.[1].slice(0, -1)}</th>
                {COLUMNAS.map(([t]) => <th key={t} className="whitespace-nowrap px-3 py-2 text-right font-semibold">{t}</th>)}
                <th className="px-3 py-2 font-semibold">Confianza</th>
              </tr>
            </thead>
            <tbody>
              {filas.length === 0 && (
                <tr><td colSpan={COLUMNAS.length + 2} className="px-3 py-6 text-center text-chrome-text-muted">Sin datos en este período.</td></tr>
              )}
              {filas.map((f) => (
                <tr key={f.entity_id} className="border-t border-chrome-border/60">
                  <td className="max-w-[260px] truncate px-3 py-2 text-chrome-text-active" title={f.nombre || f.entity_id}>{f.nombre || f.entity_id}</td>
                  {COLUMNAS.map(([t, valor, formato]) => (
                    <td key={t} className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formato(valor(f))}</td>
                  ))}
                  <td className={`whitespace-nowrap px-3 py-2 ${COLOR_CONFIANZA[f.confianza] || ''}`}>{f.confianza}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-1 text-[11px] leading-relaxed text-chrome-text-muted">
        <p>
          <strong>Cobertura</strong> = leads con anuncio identificado ÷ conversaciones que reporta Meta. Si es baja, el CAC y el ROAS no son fiables: «—» significa
          «sin evidencia», no cero. Antes del 2 de octubre no se guardaba de qué anuncio venía cada lead.
        </p>
        <p>
          Se cuentan los leads creados en el período y todo lo que les pasó después. «Pagos» son pagos confirmados por el correo de PicPay. Calificados y propuestas
          solo existen para leads nuevos desde que se crearon esas etapas.
        </p>
      </div>
    </div>
  );
}

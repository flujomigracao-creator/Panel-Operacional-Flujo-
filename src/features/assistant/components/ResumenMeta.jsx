import React, { useEffect, useState, useCallback } from 'react';
import { DollarSign, MessageSquare, Users, CreditCard, Wallet, TrendingDown, TrendingUp, Sparkles } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { getResumenMeta, suscribirCambios } from '../services/resumenMetaService';
import { variacion } from '../services/resumenMeta';
import AlertCard from './AlertCard';
import { LoadingSpinner } from '@/shared/components/ui/LoadingSpinner';

const brl = (v) => (v == null ? '—' : `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const entero = (v) => (v == null ? '—' : v.toLocaleString('pt-BR'));
const roasTxt = (v) => (v == null ? '—' : `${v.toFixed(2).replace('.', ',')}x`);

// `costo: true` → que suba es malo; `false` → que suba es bueno.
const KPIS = [
  { clave: 'inversion', titulo: 'Inversión', icono: DollarSign, fmt: brl, costo: true },
  { clave: 'conversaciones', titulo: 'Conversaciones', icono: MessageSquare, fmt: entero },
  { clave: 'leads', titulo: 'Leads', icono: Users, fmt: entero },
  { clave: 'clientesPagados', titulo: 'Clientes pagados', icono: CreditCard, fmt: entero },
  { clave: 'facturacion', titulo: 'Facturación', icono: Wallet, fmt: brl },
  { clave: 'costoPorCliente', titulo: 'Costo por cliente', icono: TrendingDown, fmt: brl, costo: true },
  { clave: 'roas', titulo: 'ROAS', icono: TrendingUp, fmt: roasTxt },
];

const METRICAS_GRAFICO = [
  { clave: 'inversion', etiqueta: 'Inversión', fmt: brl, color: '#3b82f6' },
  { clave: 'conversaciones', etiqueta: 'Conversaciones', fmt: entero, color: '#38bdf8' },
  { clave: 'leads', etiqueta: 'Leads', fmt: entero, color: '#f59e0b' },
  { clave: 'clientes', etiqueta: 'Clientes', fmt: entero, color: '#a855f7' },
  { clave: 'facturacion', etiqueta: 'Facturación', fmt: brl, color: '#10b981' },
];

function Comparacion({ actual, previo, costo }) {
  const d = variacion(actual, previo);
  if (d == null) return <span className="text-chrome-text-muted">sin base previa</span>;
  if (Math.abs(d) < 0.5) return <span className="text-chrome-text-muted">= igual</span>;
  const sube = d > 0;
  const bueno = costo ? !sube : sube;
  return (
    <span className={`font-semibold ${bueno ? 'text-emerald-400' : 'text-amber-400'}`}>
      {sube ? '↑' : '↓'} {Math.abs(d).toFixed(0)}%
    </span>
  );
}

function Tarjeta({ titulo, icono: Icono, valor, actual, previo, costo }) {
  return (
    <div className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wider text-chrome-text-muted">{titulo}</p>
        <Icono size={15} className="text-chrome-text-muted" />
      </div>
      <p className="mt-1.5 text-2xl font-bold tracking-tight text-chrome-text-active">{valor}</p>
      <p className="mt-2 border-t border-chrome-border/60 pt-2 text-xs">
        <Comparacion actual={actual} previo={previo} costo={costo} />
        <span className="text-chrome-text-muted"> vs período anterior</span>
      </p>
    </div>
  );
}

function Franja({ titulo, subtitulo, pasos }) {
  return (
    <div className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-chrome-text-active">{titulo}</p>
      <p className="mb-3 text-[11px] text-chrome-text-muted">{subtitulo}</p>
      <div className="flex flex-wrap items-stretch gap-2">
        {pasos.map((p, i) => (
          <React.Fragment key={p.etiqueta}>
            {i > 0 && <span className="self-center text-chrome-text-muted">→</span>}
            <div className="min-w-[110px] flex-1 rounded-lg border border-chrome-border/60 bg-chrome-bg/50 p-2.5 text-center">
              <p className="text-[10px] uppercase text-chrome-text-muted">{p.etiqueta}</p>
              <p className="mt-1 text-base font-bold text-chrome-text-active">{p.valor}</p>
              {p.nota && <p className="mt-0.5 text-[10px] text-chrome-text-muted">{p.nota}</p>}
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

const haceTexto = (fecha) => {
  const s = Math.max(0, Math.round((Date.now() - fecha.getTime()) / 1000));
  if (s < 60) return 'hace instantes';
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `hace ${h} h` : `el ${fecha.toLocaleDateString('es')}`;
};

const TIPOS_DESGLOSE = [
  ['edad_sexo', 'Edad y sexo'],
  ['ubicacion', 'Plataforma y ubicación'],
  ['region', 'Región'],
  ['dispositivo', 'Dispositivo'],
];

function Desgloses({ desglose }) {
  const [tipo, setTipo] = useState('edad_sexo');
  const filas = (desglose && desglose[tipo]) || [];
  return (
    <div className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-chrome-text-active">¿Quién y dónde?</p>
          <p className="text-[11px] text-chrome-text-muted">Gasto y conversaciones por segmento. Solo datos, sin ranking.</p>
        </div>
        <div className="inline-flex rounded-lg border border-chrome-border bg-chrome-bg p-0.5 text-xs">
          {TIPOS_DESGLOSE.map(([v, t]) => (
            <button
              key={v}
              onClick={() => setTipo(v)}
              className={`rounded-md px-2.5 py-1 font-medium ${tipo === v ? 'bg-brand-primary text-white' : 'text-chrome-text hover:text-chrome-text-active'}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      {filas.length === 0 ? (
        <p className="text-xs text-chrome-text-muted">Sin datos de este desglose en el período.</p>
      ) : (
        <div className="max-h-72 overflow-auto">
          <table className="w-full min-w-[480px] text-left text-xs">
            <thead className="sticky top-0 bg-chrome-bg-raised text-[10px] uppercase text-chrome-text-muted">
              <tr>
                {['Segmento', 'Gasto', 'Impresiones', 'Clics', 'Conversaciones', 'Costo/conv.'].map((h, i) => (
                  <th key={h} className={`pb-2 font-medium ${i ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-chrome-border/40 text-chrome-text">
              {filas.map((f) => (
                <tr key={f.clave}>
                  <td className="py-1.5 pr-3 font-medium text-chrome-text-active">{f.etiqueta}</td>
                  <td className="py-1.5 text-right">{brl(f.gasto)}</td>
                  <td className="py-1.5 text-right">{entero(f.impresiones)}</td>
                  <td className="py-1.5 text-right">{entero(f.clics)}</td>
                  <td className="py-1.5 text-right">{entero(f.conversaciones)}</td>
                  <td className="py-1.5 text-right">{brl(f.costoPorConversacion)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const ESTADOS = { ACTIVE: ['Activa', 'text-emerald-400'], PAUSED: ['Pausada', 'text-amber-400'], CAMPAIGN_PAUSED: ['Pausada', 'text-amber-400'] };

export default function ResumenMeta({ rango, onPreguntar }) {
  const [res, setRes] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [metrica, setMetrica] = useState('inversion');
  const [agrupar, setAgrupar] = useState('dia');

  const [vivo, setVivo] = useState(null); // momento de la última actualización
  const [, forzar] = useState(0);

  const clave = JSON.stringify(rango);
  // `silencioso`: refresco automático sin atenuar la pantalla ni borrar lo que ya se ve.
  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    try {
      setRes(await getResumenMeta(rango));
      setError(null);
      setVivo(new Date());
    } catch (err) {
      console.error('[Resumen Meta]', err);
      if (!silencioso) setError('No se pudo calcular el resumen. Intenta de nuevo en unos segundos.');
    } finally {
      if (!silencioso) setCargando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Tiempo real: Realtime avisa de cada cambio (con pausa de 1,5 s para juntar ráfagas) y un
  // refresco cada 60 s cubre cortes de conexión. Si la pestaña está oculta no se consulta.
  useEffect(() => {
    let temporizador = null;
    const refrescar = () => {
      if (document.hidden) return;
      clearTimeout(temporizador);
      temporizador = setTimeout(() => cargar(true), 1500);
    };
    const cancelar = suscribirCambios(refrescar);
    const cada60 = setInterval(() => { if (!document.hidden) cargar(true); }, 60000);
    const reloj = setInterval(() => forzar((n) => n + 1), 15000);
    document.addEventListener('visibilitychange', refrescar);
    return () => {
      clearTimeout(temporizador);
      clearInterval(cada60);
      clearInterval(reloj);
      document.removeEventListener('visibilitychange', refrescar);
      cancelar();
    };
  }, [cargar]);

  if (cargando && !res) {
    return (
      <div className="flex h-48 items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  if (error) return <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">{error}</div>;
  if (!res) return null;

  const { actual, previo, periodo, campanas, alertas, lectura } = res;
  const m = METRICAS_GRAFICO.find((x) => x.clave === metrica);
  const serie = (agrupar === 'semana' ? res.serieSemana : res.serieDia).map((p) => ({
    ...p,
    nombre: agrupar === 'semana' ? `Sem ${p.dia.slice(5)}` : p.dia.slice(5),
  }));

  return (
    <div className={`space-y-6 ${cargando ? 'opacity-60' : ''}`}>
      {res.avisos.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-400">
          No se pudo leer: {res.avisos.join(', ')}. Esas cifras aparecen vacías, no en cero real.
        </div>
      )}

      <p className="flex flex-wrap items-center gap-x-3 text-[11px] text-chrome-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> En vivo
        </span>
        {vivo && <span>Panel actualizado {haceTexto(vivo)}</span>}
        <span>
          Meta sincronizado {res.ultimaSyncOk ? haceTexto(new Date(res.ultimaSyncOk)) : 'nunca'} (automático, cada 10 min)
        </span>
      </p>

      {/* 1. Indicadores principales */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {KPIS.map((k) => (
          <Tarjeta
            key={k.clave}
            titulo={k.titulo}
            icono={k.icono}
            valor={k.fmt(actual[k.clave])}
            actual={actual[k.clave]}
            previo={previo[k.clave]}
            costo={k.costo}
          />
        ))}
      </div>

      {/* Meta + resultado real */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Franja
          titulo="Meta Ads"
          subtitulo="Lo que pasa dentro de la plataforma"
          pasos={[
            { etiqueta: 'Gasto', valor: brl(actual.inversion) },
            { etiqueta: 'Impresiones', valor: entero(actual.impresiones) },
            { etiqueta: 'Clics', valor: entero(actual.clics), nota: actual.ctr != null ? `CTR ${actual.ctr.toFixed(2).replace('.', ',')}%` : 'CTR —' },
            { etiqueta: 'CPM', valor: brl(actual.cpm), nota: actual.cpc != null ? `CPC ${brl(actual.cpc)}` : 'CPC —' },
            {
              etiqueta: 'Conversaciones',
              valor: entero(actual.conversaciones),
              nota: actual.costoPorConversacion != null ? `${brl(actual.costoPorConversacion)} c/u` : 'sin costo',
            },
          ]}
        />
        <Franja
          titulo="Flujo de Migração"
          subtitulo="Lo que pasa después del clic"
          pasos={[
            { etiqueta: 'Conversaciones', valor: entero(actual.conversaciones) },
            { etiqueta: 'Leads', valor: entero(actual.leads), nota: `${actual.leadsDeMeta} con anuncio de origen` },
            { etiqueta: 'Propuestas', valor: entero(actual.propuestas) },
            { etiqueta: 'Pagos', valor: entero(actual.clientesPagados), nota: `${actual.clientesMeta} de Meta` },
            { etiqueta: 'Facturación', valor: brl(actual.facturacion), nota: `${brl(actual.facturacionMeta)} de Meta` },
          ]}
        />
      </div>

      {/* Rendimiento */}
      <div className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wider text-chrome-text-active">Rendimiento</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border border-chrome-border bg-chrome-bg p-0.5 text-xs">
              {METRICAS_GRAFICO.map((x) => (
                <button
                  key={x.clave}
                  onClick={() => setMetrica(x.clave)}
                  className={`rounded-md px-2.5 py-1 font-medium ${metrica === x.clave ? 'bg-brand-primary text-white' : 'text-chrome-text hover:text-chrome-text-active'}`}
                >
                  {x.etiqueta}
                </button>
              ))}
            </div>
            <div className="inline-flex rounded-lg border border-chrome-border bg-chrome-bg p-0.5 text-xs">
              {[['dia', 'Día'], ['semana', 'Semana']].map(([v, t]) => (
                <button
                  key={v}
                  onClick={() => setAgrupar(v)}
                  className={`rounded-md px-2.5 py-1 font-medium ${agrupar === v ? 'bg-brand-primary text-white' : 'text-chrome-text hover:text-chrome-text-active'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={serie} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="nombre" stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#71717a" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                formatter={(v) => [m.fmt(v), m.etiqueta]}
                contentStyle={{ background: 'var(--chrome-bg-raised, #18181b)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey={metrica} fill={m.color} radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Campañas */}
      <div className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-chrome-text-active">Campañas con actividad</p>
        <p className="mb-3 text-[11px] text-chrome-text-muted">
          Solo datos, sin ranking. Leads y pagos por campaña salen de los leads que traen el anuncio de origen.
        </p>
        {campanas.length === 0 ? (
          <p className="text-xs text-chrome-text-muted">Ninguna campaña con gasto o activa en este período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="text-[10px] uppercase text-chrome-text-muted">
                <tr>
                  {['Campaña', 'Gasto', 'Conversaciones', 'CPL', 'Pagos', 'Costo/cliente'].map((h, i) => (
                    <th key={h} className={`pb-2 font-medium ${i ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-chrome-border/40 text-chrome-text">
                {campanas.map((c) => {
                  const est = ESTADOS[c.estado];
                  return (
                    <tr key={c.id}>
                      <td className="max-w-[320px] py-2 pr-3">
                        <span className="block truncate font-medium text-chrome-text-active" title={c.nombre}>{c.nombre}</span>
                        {est && <span className={`text-[10px] ${est[1]}`}>{est[0]}</span>}
                      </td>
                      <td className="py-2 text-right">{brl(c.gasto)}</td>
                      <td className="py-2 text-right">{entero(c.conversaciones)}</td>
                      <td className="py-2 text-right">{brl(c.cpl)}</td>
                      <td className="py-2 text-right">{entero(c.pagos)}</td>
                      <td className="py-2 text-right">{brl(c.costoPorCliente)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Desgloses desglose={res.desglose} />

      {/* Alertas */}
      {alertas.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-chrome-text-active">Alertas</p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {alertas.map((a, i) => (
              <AlertCard key={i} type={a.tipo} title={a.titulo} detail={a.detalle} />
            ))}
          </div>
        </div>
      )}

      {/* Lectura del período */}
      <div className="rounded-xl border border-brand-primary/30 bg-brand-primary/5 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-brand-primary">
            <Sparkles size={13} /> Lectura del período
          </p>
          {onPreguntar && (
            <button
              onClick={() =>
                onPreguntar(
                  `Explícame en lenguaje normal cómo fue el período "${periodo.etiqueta}" (${periodo.desde} a ${periodo.hasta}): inversión, conversaciones, leads, pagos y dónde se cae el funnel. No ejecutes cambios, solo analiza.`
                )
              }
              className="rounded-md border border-brand-primary/40 bg-brand-primary/10 px-2.5 py-1 text-xs font-medium text-brand-primary hover:bg-brand-primary/20"
            >
              Pedir análisis a Nora
            </button>
          )}
        </div>
        <p className="mt-2 text-sm font-semibold text-chrome-text-active">{lectura.titulo}</p>
        <p className="mt-1 text-sm leading-relaxed text-chrome-text">{lectura.texto}</p>
      </div>
    </div>
  );
}

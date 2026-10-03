import React, { useEffect, useState, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { getPublicosLeads, getPublicosDefiniciones, publicosMeta, suscribirCambios } from '../services/resumenMetaService';
import { DIMENSIONES, INTENCIONES, DIAS_SIN_COMPRA, agruparPublicos, conteoIntencion, resumenExclusion } from '../services/publicos';
import { LoadingSpinner } from '@/shared/components/ui/LoadingSpinner';

const brl = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (v) => (v == null ? '—' : `${(Number(v) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);

const PAISES = { AR: 'Argentina', VE: 'Venezuela', CU: 'Cuba', CO: 'Colombia', PY: 'Paraguay', UY: 'Uruguay', BO: 'Bolivia', PE: 'Perú', BR: 'Brasil', OTHER: 'Otros', UNKNOWN: 'Sin dato' };
const SERVICIOS = { CPF: 'CPF', AGENDAMENTO_PF: 'Agendamiento PF', RNM: 'RNM', RESIDENCIA_PERMANENTE: 'Residencia permanente', REFUGIO_SISCONARE: 'Refugio / Sisconare', CAMBIO_DIRECCION: 'Cambio de dirección', UNKNOWN: 'Sin trámite' };
const INTENCION_NOMBRE = { COLD: 'Frío', INTERESTED: 'Interesado', QUALIFIED: 'Calificado', PROPOSAL: 'Propuesta enviada', PAYMENT_PENDING: 'Pago pendiente', PAID: 'Pagó', LOST: 'Perdido (etapa del CRM)' };

const TIPO_NOMBRE = { adquisicion: 'Adquisición', remarketing: 'Remarketing', exclusion: 'Exclusión' };
const ESTADO_NOMBRE = { borrador: 'Borrador', aprobado: 'Aprobado', creado_en_meta: 'Creado en Meta', pausado: 'Pausado' };

const nombre = (clave, dimension) => {
  if (dimension === 'pais') return PAISES[clave] || clave;
  if (dimension === 'servicio') return SERVICIOS[clave] || clave;
  if (dimension === 'intencion') return INTENCION_NOMBRE[clave] || clave;
  const [p, s] = clave.split(' · ');
  return `${PAISES[p] || p} · ${SERVICIOS[s] || s}`;
};

export default function PublicosMeta() {
  const [dimension, setDimension] = useState('pais_servicio');
  const [leads, setLeads] = useState(null);
  const [definiciones, setDefiniciones] = useState([]);
  const [trabajando, setTrabajando] = useState(false);
  const [informe, setInforme] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setLeads(await getPublicosLeads());
      // Las definiciones son un extra: si fallan, no se tumba el resto de la pestaña.
      setDefiniciones(await getPublicosDefiniciones().catch((e) => { console.error('[Públicos] definiciones', e); return []; }));
    } catch (e) {
      console.error('[Públicos]', e);
      setError(e?.message || 'No se pudieron leer los públicos.');
      setLeads(null);
    } finally {
      setCargando(false);
    }
  }, []);

  const ejecutarMeta = async (accion) => {
    if (accion === 'crear' && !window.confirm('¿Crear en Meta los públicos de adquisición definidos?\n\nSe guardan como públicos guardados: no gastan nada y no cambian ninguna campaña ni conjunto de anuncios. Si Meta no ofrece la segmentación «Expats» en tu cuenta, ese público no se crea.')) return;
    setTrabajando(true);
    try {
      const r = await publicosMeta(accion);
      setInforme(r);
      if (accion === 'crear') await cargar();
    } catch (e) {
      console.error('[Públicos] Meta', e);
      toast.error(e?.message || 'No se pudo hablar con Meta', { duration: 8000 });
    } finally {
      setTrabajando(false);
    }
  };

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => suscribirCambios(cargar), [cargar]);

  const filas = useMemo(() => (leads ? agruparPublicos(leads, dimension) : []), [leads, dimension]);
  const intenciones = useMemo(() => (leads ? conteoIntencion(leads) : null), [leads]);
  const exclusion = useMemo(() => (leads ? resumenExclusion(leads) : null), [leads]);
  const sinDato = leads ? leads.filter((l) => l.pais === 'UNKNOWN').length : 0;

  if (cargando && !leads) return <LoadingSpinner />;
  if (error) return <p className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>;

  return (
    <div className="space-y-4">
      {/* Intención: dónde está cada lead en el embudo */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {INTENCIONES.map((i) => (
          <div key={i} className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-chrome-text-muted">{INTENCION_NOMBRE[i]}</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-chrome-text-active">{intenciones?.[i] ?? 0}</p>
          </div>
        ))}
      </div>

      {/* Público de exclusión «no compra» */}
      <div className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-chrome-text-active">Público de exclusión: «no compra»</p>
        <p className="mt-1 text-sm text-chrome-text">
          <strong className="tabular-nums">{exclusion?.total ?? 0}</strong> personas listas para excluir
          {exclusion?.enEspera ? <> · <strong className="tabular-nums">{exclusion.enEspera}</strong> en espera de cumplir {DIAS_SIN_COMPRA} días sin escribir</> : null}
          {exclusion?.proximaEntrada ? <> (la primera entra el {exclusion.proximaEntrada.toLocaleDateString('es')})</> : null}.
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-chrome-text-muted">
          Cuenta quien recibió propuesta, no pagó y lleva {DIAS_SIN_COMPRA}+ días sin escribir. No usa la etapa «Perdido» porque se mueve a mano en bloque.
          Todavía no se sube a Meta: un público personalizado necesita unas 100 personas para entregar anuncios y la subida se hace solo con tu aprobación.
        </p>
      </div>

      {/* Públicos definidos (borrador: nada se crea en Meta sin aprobación) */}
      {definiciones.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wider text-chrome-text-active">Públicos definidos ({definiciones.length})</p>
            <div className="flex gap-2">
              <button
                onClick={() => ejecutarMeta('verificar')}
                disabled={trabajando}
                className="rounded-lg border border-chrome-border bg-chrome-bg-raised px-3 py-1.5 text-xs font-medium text-chrome-text hover:text-chrome-text-active disabled:opacity-50"
              >
                {trabajando ? 'Consultando Meta…' : 'Verificar en Meta (no escribe nada)'}
              </button>
              <button
                onClick={() => ejecutarMeta('crear')}
                disabled={trabajando}
                className="rounded-lg border border-brand-primary/30 bg-brand-primary/10 px-3 py-1.5 text-xs font-medium text-brand-primary hover:bg-brand-primary/20 disabled:opacity-50"
              >
                Crear en Meta (sin gasto)
              </button>
            </div>
          </div>
          {informe && (
            <div className="rounded-lg border border-chrome-border bg-chrome-bg-raised p-3 text-xs">
              <p className="font-semibold text-chrome-text-active">{informe.modo === 'crear' ? 'Resultado de la creación en Meta' : 'Verificación en Meta'}</p>
              <ul className="mt-1 space-y-0.5">
                {(informe.publicos || []).map((p) => (
                  <li key={p.codigo} className={p.estado === 'no creado' ? 'text-amber-300' : 'text-green-300'}>
                    {p.nombre}: {p.estado}{p.motivo ? ` — ${p.motivo}` : ''}
                    {p.segmentacion?.comportamientos?.length ? ` (${p.segmentacion.comportamientos.join(' + ')})` : ''}
                  </li>
                ))}
                {informe.mensaje && <li className="text-chrome-text-muted">{informe.mensaje}</li>}
              </ul>
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {definiciones.map((d) => (
              <div key={d.id} className="rounded-xl border border-chrome-border bg-chrome-bg-raised p-4 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-bold text-chrome-text-active">{d.nombre}</p>
                  <span className="whitespace-nowrap rounded-full border border-chrome-border bg-chrome-bg px-2 py-0.5 text-[10px] font-semibold text-chrome-text-muted">
                    {TIPO_NOMBRE[d.tipo] || d.tipo} · {ESTADO_NOMBRE[d.estado] || d.estado}
                  </span>
                </div>
                <p className="mt-1 text-chrome-text-muted">
                  {d.tipo === 'adquisicion'
                    ? `Ubicación ${(d.ubicacion?.paises || []).join(', ')} · idioma ${(d.idiomas || []).join(', ')} · ${d.edad_min}-${d.edad_max} años`
                    : d.fuente_datos}
                </p>
                {d.excluye?.length > 0 && <p className="mt-1 text-chrome-text-muted">Excluye: {d.excluye.join(', ')}</p>}
                {d.notas && <p className="mt-1 text-chrome-text">{d.notas}</p>}
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-chrome-text-muted">
                  {(d.reglas_seguridad || []).map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rendimiento por público */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {DIMENSIONES.map(([k, etiqueta]) => (
            <button
              key={k}
              onClick={() => setDimension(k)}
              className={`rounded-md px-3 py-1 text-xs font-semibold ${dimension === k ? 'bg-chrome-bg-active text-chrome-text-active' : 'text-chrome-text-muted hover:text-chrome-text'}`}
            >
              {etiqueta}
            </button>
          ))}
        </div>
        <p className="text-xs text-chrome-text-muted">{leads?.length ?? 0} leads · {sinDato} sin país</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-chrome-border">
        <table className="min-w-full text-xs">
          <thead className="bg-chrome-bg-active/40 text-left text-chrome-text-muted">
            <tr>
              <th className="px-3 py-2 font-semibold">Público</th>
              {['Leads', 'De anuncio', 'Calificados', 'Propuestas', 'Pagos', 'Ingresos', 'Lead→pago'].map((t) => (
                <th key={t} className="whitespace-nowrap px-3 py-2 text-right font-semibold">{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-chrome-text-muted">Sin leads todavía.</td></tr>
            )}
            {filas.map((f) => (
              <tr key={f.clave} className="border-t border-chrome-border/60">
                <td className="px-3 py-2 text-chrome-text-active">{nombre(f.clave, dimension)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{f.leads}</td>
                <td className="px-3 py-2 text-right tabular-nums">{f.deAnuncio}</td>
                <td className="px-3 py-2 text-right tabular-nums">{f.calificados}</td>
                <td className="px-3 py-2 text-right tabular-nums">{f.propuestas}</td>
                <td className="px-3 py-2 text-right tabular-nums">{f.pagos}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{brl(f.ingresos)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{pct(f.pctPago)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] leading-relaxed text-chrome-text-muted">
        El país sale de la nacionalidad que registra Nora y el servicio del trámite del lead; «Sin dato» significa que todavía no se capturó, no que sea cero.
        Con pocos leads por grupo los porcentajes no son concluyentes: el pago real es el indicador, no los clics.
      </p>
    </div>
  );
}

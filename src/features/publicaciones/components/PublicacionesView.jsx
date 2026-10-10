import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, Plus, RefreshCw } from 'lucide-react';
import { listPublicaciones, updatePublicacion, createPublicacion } from '../services/publicacionesService';
import {
  ESTADOS, FRANJAS, aInputSP, deInputSP, horaSP, franjaDeHora, esVencida, contarPorEstado, filtrar,
  agruparPorDia, parchePara, accionesDe, ETIQUETA_ACCION, enlaceValido, diaSP,
} from '../publicaciones';

const FILTROS = [
  ['pendientes', 'Pendientes'],
  ['borrador', 'Borradores'],
  ['aprobada', 'Aprobadas'],
  ['publicada', 'Publicadas'],
  ['error', 'Con error'],
  ['descartada', 'Descartadas'],
  ['todas', 'Todas'],
];

const TONO_ESTADO = {
  borrador: 'bg-bg-base text-text-secondary',
  aprobada: 'bg-brand-primary/15 text-brand-primary',
  publicando: 'bg-warning/15 text-warning',
  publicada: 'bg-success/15 text-success',
  error: 'bg-danger/15 text-danger',
  descartada: 'bg-bg-base text-text-muted line-through',
};

function Tarjeta({ p, onCambio }) {
  const [texto, setTexto] = useState(p.texto);
  const [cuando, setCuando] = useState(aInputSP(p.programada_at));
  const [pidiendoEnlace, setPidiendoEnlace] = useState(false);
  const [enlace, setEnlace] = useState('');
  const [ocupada, setOcupada] = useState(false);
  const vencida = esVencida(p);
  const editable = p.estado === 'borrador' || p.estado === 'aprobada' || p.estado === 'error';

  const guardar = async (patch, ok) => {
    setOcupada(true);
    try {
      await updatePublicacion(p.id, patch);
      if (ok) toast.success(ok);
      await onCambio();
    } catch (err) {
      toast.error(err.message || 'No se pudo guardar');
    } finally {
      setOcupada(false);
    }
  };

  const guardarTexto = () => {
    if (texto === p.texto) return;
    if (!texto.trim()) { toast.error('El texto no puede quedar vacío'); setTexto(p.texto); return; }
    guardar({ texto }, 'Texto guardado');
  };

  const guardarFecha = (valor) => {
    setCuando(valor);
    const iso = deInputSP(valor);
    if (!iso || iso === new Date(p.programada_at).toISOString()) return;
    guardar({ programada_at: iso, franja: franjaDeHora(horaSP(iso)) }, 'Hora actualizada');
  };

  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); toast.success('Texto copiado'); }
    catch { toast.error('No se pudo copiar: selecciona el texto y usa Ctrl+C'); }
  };

  const accion = (nombre) => {
    if (nombre === 'publicar') { setPidiendoEnlace(true); return; }
    guardar(parchePara(nombre), nombre === 'aprobar' ? 'Aprobada: se publicará sola a su hora' : nombre === 'reintentar' ? 'Se reintentará en unos minutos' : null);
  };

  const confirmarPublicada = () => {
    if (!enlaceValido(enlace)) { toast.error('El enlace debe empezar por http:// o https://'); return; }
    setPidiendoEnlace(false);
    guardar(parchePara('publicar', new Date(), enlace), 'Marcada como publicada');
  };

  return (
    <article className={`flex flex-col gap-3 rounded-md border bg-bg-surface px-4 py-3 ${p.estado === 'aprobada' ? 'border-brand-primary' : 'border-border'}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded bg-text-primary px-2 py-0.5 font-mono text-bg-surface">{horaSP(p.programada_at)}</span>
        <span className="text-text-muted">{FRANJAS[p.franja] || p.franja}</span>
        {p.tipo && <span className="rounded-full border border-border px-2 py-0.5 text-text-secondary">{p.tipo}</span>}
        {p.tema && <span className="text-text-muted">{p.tema}</span>}
        <span className={`ml-auto rounded-full px-2 py-0.5 font-medium ${TONO_ESTADO[p.estado] || ''}`}>{ESTADOS[p.estado] || p.estado}</span>
        {vencida && <span className="rounded-full bg-warning/15 px-2 py-0.5 font-medium text-warning">Hora vencida</span>}
      </div>

      <textarea
        id={`texto-${p.id}`}
        value={texto}
        disabled={!editable || ocupada}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={guardarTexto}
        rows={Math.min(14, Math.max(4, texto.split('\n').length + 1))}
        className="w-full resize-y rounded border border-border bg-bg-base px-3 py-2 text-sm leading-relaxed text-text-primary disabled:opacity-70"
      />

      <div className="grid gap-1 text-xs text-text-muted">
        {p.imagen_idea && <p><b className="font-medium text-text-secondary">Imagen:</b> {p.imagen_idea}</p>}
        {p.fuente && <p><b className="font-medium text-text-secondary">Fuente:</b> {p.fuente}</p>}
        {p.estado === 'error' && p.error && <p className="text-danger"><b className="font-medium">Error:</b> {p.error}</p>}
        {p.estado === 'publicada' && (
          <p>
            <b className="font-medium text-text-secondary">Publicada:</b> {p.publicada_at ? `${diaSP(p.publicada_at)} ${horaSP(p.publicada_at)}` : '—'}
            {p.enlace_publicacion && <> · <a href={p.enlace_publicacion} target="_blank" rel="noreferrer" className="text-brand-primary underline">ver publicación</a></>}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={copiar} className="rounded-md bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">Copiar texto</button>
        {accionesDe(p.estado).map((a) => (
          <button key={a} disabled={ocupada} onClick={() => accion(a)}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-text-secondary hover:bg-bg-base disabled:opacity-50">
            {ETIQUETA_ACCION[a]}
          </button>
        ))}
        {editable && (
          <label className="ml-auto flex items-center gap-2 text-xs text-text-muted" htmlFor={`cuando-${p.id}`}>
            Hora (São Paulo)
            <input id={`cuando-${p.id}`} type="datetime-local" value={cuando} disabled={ocupada}
              onChange={(e) => guardarFecha(e.target.value)}
              className="rounded border border-border bg-bg-base px-2 py-1 text-text-primary" />
          </label>
        )}
      </div>

      {pidiendoEnlace && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-border bg-bg-base px-3 py-2 text-xs">
          <label htmlFor={`enlace-${p.id}`} className="text-text-secondary">Enlace de la publicación (opcional)</label>
          <input id={`enlace-${p.id}`} value={enlace} onChange={(e) => setEnlace(e.target.value)} placeholder="https://www.facebook.com/…"
            className="min-w-[200px] flex-1 rounded border border-border bg-bg-surface px-2 py-1 text-text-primary" />
          <button onClick={confirmarPublicada} className="rounded-md bg-brand-primary px-3 py-1.5 font-semibold text-white">Confirmar</button>
          <button onClick={() => setPidiendoEnlace(false)} className="rounded-md border border-border px-3 py-1.5 text-text-secondary">Cancelar</button>
        </div>
      )}
    </article>
  );
}

// Publicaciones: cola de contenido para la página de Facebook (borrador → aprobada → publicada).
export default function PublicacionesView() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['publicaciones'], queryFn: listPublicaciones, refetchInterval: 60_000 });
  const [filtro, setFiltro] = useState('pendientes');

  const lista = useMemo(() => q.data || [], [q.data]);
  const conteo = useMemo(() => contarPorEstado(lista), [lista]);
  const grupos = useMemo(() => agruparPorDia(filtrar(lista, filtro)), [lista, filtro]);
  const refrescar = () => qc.invalidateQueries({ queryKey: ['publicaciones'] });

  const nueva = async () => {
    try {
      const manana = new Date(Date.now() + 24 * 3600 * 1000);
      const dia = diaSP(manana.toISOString());
      await createPublicacion({ programada_at: deInputSP(`${dia}T07:30`), franja: 'manana', tipo: 'Guía', texto: 'Escribe aquí el texto de la publicación.', estado: 'borrador' });
      toast.success('Borrador creado para mañana a las 7:30');
      refrescar();
    } catch (err) {
      toast.error(err.message || 'No se pudo crear');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-bg-base">
      <div className="flex w-full flex-col gap-5 px-6 py-6 lg:px-10 2xl:px-14">
        <div className="flex flex-wrap items-start gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Publicaciones</h1>
            <p className="mt-1 max-w-[70ch] text-sm text-text-secondary">
              Contenido para la página de Facebook «Flujo de Migração». Revisa y aprueba cada texto: al aprobarlo se publica solo a su hora. También puedes copiarlo y publicarlo a mano.
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={refrescar} title="Actualizar" className="rounded p-2 text-text-muted hover:bg-bg-surface"><RefreshCw size={14} className={q.isFetching ? 'animate-spin' : ''} /></button>
            <button onClick={nueva} className="flex items-center gap-1.5 rounded-md bg-brand-primary px-3 py-2 text-sm font-semibold text-white hover:opacity-90"><Plus size={14} /> Nueva publicación</button>
          </div>
        </div>

        <div className="rounded-md border border-border bg-bg-surface px-4 py-2.5 text-sm text-text-secondary">
          Las publicaciones <b className="font-medium text-text-primary">aprobadas</b> se publican solas en la página de Facebook a su hora (se revisa cada 5 minutos; si la hora pasó hace más de 24 h no se publica sola). Si algo falla, queda en «Con error» y te llega una tarea.
        </div>

        {q.isError && (
          <div className="flex items-center gap-2 rounded-md border border-danger/40 bg-danger/5 px-4 py-2.5 text-sm text-danger">
            <AlertTriangle size={14} />
            <span>No se pudieron cargar las publicaciones. Lo que ves puede estar incompleto.</span>
            <button onClick={() => q.refetch()} className="ml-auto underline">Reintentar</button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {FILTROS.map(([id, label]) => {
            const n = id === 'todas' ? conteo.total : id === 'pendientes' ? conteo.borrador + conteo.aprobada : conteo[id];
            return (
              <button key={id} onClick={() => setFiltro(id)}
                className={`rounded-full border px-3 py-1 text-xs ${filtro === id ? 'border-brand-primary bg-brand-primary text-white' : 'border-border bg-bg-surface text-text-secondary hover:bg-bg-base'}`}>
                {label}{q.data ? ` · ${n}` : ''}
              </button>
            );
          })}
          {q.data && conteo.vencidas > 0 && <span className="text-xs text-warning">{conteo.vencidas} con la hora vencida</span>}
        </div>

        {q.isLoading && <p className="text-sm text-text-muted">Cargando publicaciones…</p>}

        {q.data && grupos.length === 0 && (
          <p className="rounded-md border border-border bg-bg-surface px-4 py-6 text-sm text-text-muted">
            {lista.length === 0 ? 'Todavía no hay publicaciones. Crea la primera con «Nueva publicación».' : 'No hay publicaciones con este filtro.'}
          </p>
        )}

        {grupos.map((g) => (
          <section key={g.dia} className="flex flex-col gap-3">
            <h2 className="border-b border-border pb-2 text-base font-semibold first-letter:uppercase text-text-primary">{g.etiqueta}</h2>
            {g.items.map((p) => <Tarjeta key={`${p.id}-${p.updated_at}`} p={p} onCambio={refrescar} />)}
          </section>
        ))}
      </div>
    </div>
  );
}

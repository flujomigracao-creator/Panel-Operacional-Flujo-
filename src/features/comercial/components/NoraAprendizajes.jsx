import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, Check, GraduationCap, MessageSquare, Trash2, X } from 'lucide-react';
import { useAuth } from '@features/auth/context/AuthContext';
import { getAprendizajesNora, actualizarAprendizajeNora, ensenarANora, getResultadosConfianza, getReglasNora, actualizarReglaNora } from '../services/comercialService';
import NoraEntrenador, { REGLAS_KEY } from './NoraEntrenador';

export const APRENDIZAJES_KEY = ['nora_aprendizajes'];

// Datos fijos del negocio que Nora respeta siempre (se crean desde el chat con Nora).
function ReglasFijas() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: REGLAS_KEY, queryFn: getReglasNora });
  const [editando, setEditando] = useState(null);
  const [texto, setTexto] = useState('');
  if (!data) return null;

  const guardar = async (id, cambios, ok) => {
    try {
      await actualizarReglaNora(id, cambios);
      toast.success(ok);
      setEditando(null);
      queryClient.invalidateQueries({ queryKey: REGLAS_KEY });
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'No se pudo guardar.');
    }
  };

  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold text-chrome-text-active">Reglas fijas <span className="text-xs font-normal text-chrome-text-muted">{data.length}</span></h3>
      <p className="mb-2 text-xs text-chrome-text-muted">Lo que Nora respeta siempre y responde con seguridad, sin consultar.</p>
      {data.length === 0
        ? <p className="text-xs text-chrome-text-muted">Todavía no hay reglas. Enseñáselas desde “Hablar con Nora”.</p>
        : (
          <ul className="space-y-1.5">
            {data.map((r) => (
              <li key={r.id} className="rounded-lg border border-chrome-border bg-chrome-bg-raised p-2.5 text-sm text-chrome-text-active">
                {editando === r.id ? (
                  <>
                    <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3}
                      className="w-full resize-y rounded-md border border-chrome-border bg-chrome-bg p-2 text-sm outline-none focus:border-brand-primary" />
                    <div className="mt-1.5 flex justify-end gap-2 text-xs">
                      <button onClick={() => setEditando(null)} className="rounded-md px-2.5 py-1 text-chrome-text">Cancelar</button>
                      <button disabled={texto.trim().length < 10} onClick={() => guardar(r.id, { texto: texto.trim() }, 'Regla actualizada')}
                        className="rounded-md bg-chrome-bg-active px-2.5 py-1 text-chrome-text-active disabled:opacity-50">Guardar</button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <span>{r.texto}</span>
                    <div className="flex shrink-0 gap-1 text-xs">
                      <button onClick={() => { setEditando(r.id); setTexto(r.texto); }} className="rounded px-1.5 py-0.5 text-chrome-text hover:bg-chrome-bg">Editar</button>
                      <button onClick={() => guardar(r.id, { activa: false }, 'Nora la olvidó')} aria-label="Olvidar regla"
                        className="rounded px-1.5 py-0.5 text-red-400 hover:bg-red-500/10"><Trash2 size={12} /></button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

// Qué argumento convence más a los que desconfían: se mide si el cliente pidió el PIX dentro de 7 días.
function ResultadosConfianza() {
  const { data } = useQuery({ queryKey: ['nora_resultados_confianza'], queryFn: getResultadosConfianza });
  if (!data) return null;
  const filas = data
    .map((e) => {
      const evaluados = e.usos - e.pendientes;
      return { ...e, evaluados, tasa: evaluados > 0 ? Math.round((e.convirtieron / evaluados) * 100) : null };
    })
    .sort((a, b) => (b.tasa ?? -1) - (a.tasa ?? -1));
  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold text-chrome-text-active">Qué convence a los que desconfían</h3>
      <p className="mb-2 text-xs text-chrome-text-muted">
        Nora va probando estos argumentos y usa más el que mejor funciona. Cuenta como éxito si el cliente pide el PIX dentro de los 7 días.
      </p>
      <div className="overflow-hidden rounded-lg border border-chrome-border">
        <table className="w-full text-xs">
          <thead className="bg-chrome-bg-raised text-chrome-text-muted">
            <tr><th className="px-2 py-1.5 text-left font-medium">Argumento</th><th className="px-2 py-1.5 text-right font-medium">Usado</th><th className="px-2 py-1.5 text-right font-medium">Pidieron PIX</th><th className="px-2 py-1.5 text-right font-medium">Éxito</th></tr>
          </thead>
          <tbody>
            {filas.map((e) => (
              <tr key={e.codigo} className="border-t border-chrome-border text-chrome-text-active">
                <td className="px-2 py-1.5">{e.nombre}</td>
                <td className="px-2 py-1.5 text-right">{e.usos}{e.pendientes > 0 && <span className="text-chrome-text-muted"> ({e.pendientes} esperando)</span>}</td>
                <td className="px-2 py-1.5 text-right">{e.convirtieron}</td>
                <td className="px-2 py-1.5 text-right">{e.tasa === null ? '—' : `${e.tasa}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const ORIGEN = {
  venta: 'De una venta',
  perdido: 'De un lead perdido',
  humano: 'De una respuesta del equipo',
  manual: 'Enseñada por vos',
  entrenador: 'Enseñada en el chat',
};

function Tarjeta({ item, onGuardar, onAprobar, onDescartar }) {
  const [texto, setTexto] = useState(item.leccion);
  const [ocupado, setOcupado] = useState(false);
  const cambiado = texto.trim() !== item.leccion;

  const correr = async (fn) => {
    setOcupado(true);
    try { await fn(); } finally { setOcupado(false); }
  };

  return (
    <div className="rounded-lg border border-chrome-border bg-chrome-bg-raised p-3">
      <div className="mb-1.5 flex items-center justify-between text-[11px] text-chrome-text-muted">
        <span>{item.tipo === 'ejemplo' ? 'Ejemplo real' : 'Lección'} · {ORIGEN[item.origen] || item.origen}</span>
        <span>{new Date(item.created_at).toLocaleDateString('es')}</span>
      </div>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={Math.min(6, Math.max(2, Math.ceil(texto.length / 70)))}
        className="w-full resize-y rounded-md border border-chrome-border bg-chrome-bg p-2 text-sm text-chrome-text-active outline-none focus:border-brand-primary"
      />
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        {item.estado === 'aprobada' && cambiado && (
          <button disabled={ocupado || texto.trim().length < 10} onClick={() => correr(() => onGuardar(texto))}
            className="rounded-md bg-chrome-bg-active px-2.5 py-1.5 text-xs text-chrome-text-active disabled:opacity-50">Guardar cambios</button>
        )}
        <button disabled={ocupado} onClick={() => correr(onDescartar)}
          className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-50">
          <Trash2 size={12} /> {item.estado === 'aprobada' ? 'Olvidar' : 'Descartar'}
        </button>
        {item.estado === 'pendiente' && (
          <button disabled={ocupado || texto.trim().length < 10} onClick={() => correr(() => onAprobar(texto))}
            className="inline-flex items-center gap-1 rounded-md bg-green-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-green-500 disabled:opacity-50">
            <Check size={12} /> Aprobar
          </button>
        )}
      </div>
    </div>
  );
}

export default function NoraAprendizajes({ onClose }) {
  const queryClient = useQueryClient();
  const { userProfile } = useAuth();
  const userId = userProfile?.id;
  const { data, isLoading, error } = useQuery({ queryKey: APRENDIZAJES_KEY, queryFn: getAprendizajesNora });
  const [nuevo, setNuevo] = useState('');
  const [tipoNuevo, setTipoNuevo] = useState('leccion');
  const [guardando, setGuardando] = useState(false);
  const [charlando, setCharlando] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const refrescar = () => queryClient.invalidateQueries({ queryKey: APRENDIZAJES_KEY });
  const accion = (fn, ok) => async (...args) => {
    try { await fn(...args); toast.success(ok); refrescar(); } catch (err) { console.error(err); toast.error(err.message || 'No se pudo guardar.'); }
  };

  const pendientes = (data || []).filter((x) => x.estado === 'pendiente');
  const aprobadas = (data || []).filter((x) => x.estado === 'aprobada');

  const ensenar = async () => {
    if (nuevo.trim().length < 10 || guardando) return;
    setGuardando(true);
    try {
      await ensenarANora(nuevo, tipoNuevo, userId);
      setNuevo('');
      toast.success('Nora ya lo aprendió');
      refrescar();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const tarjeta = (item) => (
    <Tarjeta
      key={item.id}
      item={item}
      onAprobar={accion((texto) => actualizarAprendizajeNora(item.id, { estado: 'aprobada', leccion: texto.trim() }, userId), 'Aprobada: Nora ya la usa')}
      onGuardar={accion((texto) => actualizarAprendizajeNora(item.id, { leccion: texto.trim() }, userId), 'Cambios guardados')}
      onDescartar={accion(() => actualizarAprendizajeNora(item.id, { estado: 'descartada' }, userId), item.estado === 'aprobada' ? 'Nora la olvidó' : 'Descartada')}
    />
  );

  return (
    <div className="fixed inset-0 z-[200] flex justify-end bg-black/40" onClick={onClose}>
      <aside className="flex h-full w-full max-w-[36rem] flex-col border-l border-chrome-border bg-chrome-bg shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-chrome-border px-4 py-3">
          <div className="flex items-center gap-2">
            <GraduationCap size={18} className="text-brand-primary" />
            <div>
              <h2 className="text-base font-semibold text-chrome-text-active">Lo que aprende Nora</h2>
              <p className="text-xs text-chrome-text-muted">Solo usa lo aprobado. Las reglas de precios, plazos y PIX siempre mandan.</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setCharlando((v) => !v)}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs text-brand-primary hover:bg-chrome-bg-raised">
              {charlando ? <><ArrowLeft size={13} /> Lo aprendido</> : <><MessageSquare size={13} /> Hablar con Nora</>}
            </button>
            <button onClick={onClose} aria-label="Cerrar" className="rounded-md p-1.5 text-chrome-text hover:bg-chrome-bg-raised hover:text-chrome-text-active"><X size={18} /></button>
          </div>
        </header>

        {charlando ? (
          <div className="min-h-0 flex-1"><NoraEntrenador /></div>
        ) : (
        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <section>
            <h3 className="mb-2 text-sm font-semibold text-chrome-text-active">Enseñale algo a Nora</h3>
            <div className="mb-2 flex gap-2 text-xs">
              {[['leccion', 'Lección'], ['ejemplo', 'Ejemplo de respuesta']].map(([v, l]) => (
                <button key={v} onClick={() => setTipoNuevo(v)}
                  className={`rounded-full px-2.5 py-1 ${tipoNuevo === v ? 'bg-brand-primary text-white' : 'bg-chrome-bg-raised text-chrome-text'}`}>{l}</button>
              ))}
            </div>
            <textarea
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              rows={3}
              placeholder={tipoNuevo === 'leccion'
                ? 'Ej: Cuando un cliente de Refugio pregunta si puede trabajar, decile que sí puede con el protocolo y ofrecé el CPF.'
                : 'Ej: Cuando el cliente dijo "lo voy a pensar", se le respondió: "Dale, te guardo el cupo hasta mañana, ¿te parece?"'}
              className="w-full resize-y rounded-md border border-chrome-border bg-chrome-bg-raised p-2 text-sm text-chrome-text-active outline-none focus:border-brand-primary"
            />
            <div className="mt-2 flex justify-end">
              <button onClick={ensenar} disabled={guardando || nuevo.trim().length < 10}
                className="rounded-md bg-brand-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">Enseñar</button>
            </div>
          </section>

          <ReglasFijas />

          <ResultadosConfianza />

          {isLoading && <p className="text-sm text-chrome-text-muted">Cargando…</p>}
          {error && <p className="text-sm text-red-400">No se pudo cargar lo que aprendió Nora.</p>}

          {data && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-chrome-text-active">Por revisar <span className="text-xs font-normal text-chrome-text-muted">{pendientes.length}</span></h3>
              {pendientes.length === 0
                ? <p className="text-xs text-chrome-text-muted">No hay lecciones nuevas. Cada madrugada Nora analiza las ventas, los leads perdidos y las respuestas del equipo, y propone lo que aprendió.</p>
                : <div className="space-y-2">{pendientes.map(tarjeta)}</div>}
            </section>
          )}

          {data && (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-chrome-text-active">Ya aprendido <span className="text-xs font-normal text-chrome-text-muted">{aprobadas.length}</span></h3>
              {aprobadas.length === 0
                ? <p className="text-xs text-chrome-text-muted">Todavía no aprobaste ninguna lección.</p>
                : <div className="space-y-2">{aprobadas.map(tarjeta)}</div>}
            </section>
          )}
        </div>
        )}
      </aside>
    </div>
  );
}

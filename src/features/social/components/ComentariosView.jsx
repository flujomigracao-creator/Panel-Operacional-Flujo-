import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { listComentarios, getSocialBot, setSocialBot } from '../services/comentariosService';

const CLASES = { elogio: 'Elogio', interes: 'Interés', queja_legitima: 'Queja legítima', malo: 'Malo', neutro: 'Neutro' };
const ACCIONES = { responder: 'Respondido', borrar: 'Borrado', tarea: 'Pasó a una persona', ninguna: 'Sin acción' };
const TONO_ACCION = {
  responder: 'bg-success/15 text-success',
  borrar: 'bg-danger/15 text-danger',
  tarea: 'bg-warning/15 text-warning',
  ninguna: 'bg-bg-base text-text-muted',
};
const FILTROS = [['todos', 'Todos'], ['responder', 'Respondidos'], ['borrar', 'Borrados'], ['tarea', 'Para una persona'], ['error', 'Con error']];

export function filtrarComentarios(lista, filtro) {
  if (filtro === 'todos') return lista;
  if (filtro === 'error') return lista.filter((c) => c.estado === 'error');
  return lista.filter((c) => c.accion === filtro);
}

function Interruptor({ etiqueta, ayuda, valor, onCambio, deshabilitado }) {
  return (
    <label className="flex items-start gap-3 rounded-md border border-border bg-bg-surface px-4 py-3">
      <input type="checkbox" checked={!!valor} disabled={deshabilitado} onChange={(e) => onCambio(e.target.checked)} className="mt-1" />
      <span>
        <span className="block text-sm font-medium text-text-primary">{etiqueta}</span>
        <span className="block text-xs text-text-muted">{ayuda}</span>
      </span>
    </label>
  );
}

// Comentarios: lo que el bot de Facebook/Instagram ha visto y hecho, y sus interruptores.
export default function ComentariosView() {
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: ['comentarios_social'], queryFn: () => listComentarios(), refetchInterval: 60_000 });
  const bot = useQuery({ queryKey: ['social_bot'], queryFn: getSocialBot });
  const [filtro, setFiltro] = useState('todos');
  const [guardando, setGuardando] = useState(false);

  const filas = useMemo(() => filtrarComentarios(lista.data || [], filtro), [lista.data, filtro]);

  const cambiar = async (parche) => {
    setGuardando(true);
    try {
      await setSocialBot({ ...(bot.data || { activo: true, borrar: true }), ...parche });
      toast.success('Guardado');
      await qc.invalidateQueries({ queryKey: ['social_bot'] });
    } catch (err) {
      toast.error(err.message || 'No se pudo guardar (solo los administradores pueden cambiarlo)');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-bg-base">
      <div className="flex w-full flex-col gap-5 px-6 py-6 lg:px-10 2xl:px-14">
        <div className="flex flex-wrap items-start gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-text-primary">Comentarios</h1>
            <p className="mt-1 max-w-[70ch] text-sm text-text-secondary">
              El bot lee los comentarios de Facebook e Instagram. Borra solo lo claramente malo; a los positivos les da like, responde en público y manda por privado el WhatsApp. Las quejas y las dudas pasan a una persona (tarea en «Hoy»).
            </p>
          </div>
          <button onClick={() => { lista.refetch(); bot.refetch(); }} title="Actualizar" className="ml-auto rounded p-2 text-text-muted hover:bg-bg-surface">
            <RefreshCw size={14} className={lista.isFetching ? 'animate-spin' : ''} />
          </button>
        </div>

        {bot.isError ? (
          <div className="flex items-center gap-2 rounded-md border border-danger/40 bg-danger/5 px-4 py-2.5 text-sm text-danger">
            <AlertTriangle size={14} /> No se pudieron leer los interruptores del bot.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <Interruptor etiqueta="Bot activo" ayuda="Si lo apagas, el bot deja de actuar (solo registra los comentarios)." valor={bot.data?.activo} deshabilitado={!bot.data || guardando} onCambio={(v) => cambiar({ activo: v })} />
            <Interruptor etiqueta="Puede borrar comentarios malos" ayuda="Solo con confianza muy alta. Si lo apagas, los malos pasan a una persona." valor={bot.data?.borrar} deshabilitado={!bot.data || guardando} onCambio={(v) => cambiar({ borrar: v })} />
          </div>
        )}

        {lista.isError && (
          <div className="flex items-center gap-2 rounded-md border border-danger/40 bg-danger/5 px-4 py-2.5 text-sm text-danger">
            <AlertTriangle size={14} />
            <span>No se pudieron cargar los comentarios. Lo que ves puede estar incompleto.</span>
            <button onClick={() => lista.refetch()} className="ml-auto underline">Reintentar</button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {FILTROS.map(([id, label]) => (
            <button key={id} onClick={() => setFiltro(id)}
              className={`rounded-full border px-3 py-1 text-xs ${filtro === id ? 'border-brand-primary bg-brand-primary text-white' : 'border-border bg-bg-surface text-text-secondary hover:bg-bg-base'}`}>
              {label}{lista.data ? ` · ${filtrarComentarios(lista.data, id).length}` : ''}
            </button>
          ))}
        </div>

        {lista.isLoading && <p className="text-sm text-text-muted">Cargando comentarios…</p>}

        {lista.data && filas.length === 0 && (
          <p className="rounded-md border border-border bg-bg-surface px-4 py-6 text-sm text-text-muted">
            {lista.data.length === 0 ? 'Todavía no hay comentarios: el bot se activa cuando Meta empiece a enviarlos.' : 'No hay comentarios con este filtro.'}
          </p>
        )}

        <div className="flex flex-col gap-2">
          {filas.map((c) => (
            <article key={c.id} className="flex flex-col gap-1.5 rounded-md border border-border bg-bg-surface px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded bg-text-primary px-2 py-0.5 text-bg-surface">{c.plataforma === 'instagram' ? 'Instagram' : 'Facebook'}</span>
                <span className="font-medium text-text-secondary">{c.autor_nombre || 'Sin nombre'}</span>
                <span className="text-text-muted">{new Date(c.creado_at).toLocaleString('es', { timeZone: 'America/Sao_Paulo' })}</span>
                {c.clase && <span className="rounded-full border border-border px-2 py-0.5 text-text-secondary">{CLASES[c.clase] || c.clase}{c.confianza != null ? ` · ${Math.round(Number(c.confianza) * 100)}%` : ''}</span>}
                <span className={`ml-auto rounded-full px-2 py-0.5 font-medium ${TONO_ACCION[c.accion] || 'bg-bg-base text-text-muted'}`}>{c.accion ? ACCIONES[c.accion] : 'Pendiente'}</span>
                {c.estado === 'error' && <span className="rounded-full bg-danger/15 px-2 py-0.5 font-medium text-danger">Error</span>}
              </div>
              <p className="whitespace-pre-wrap text-sm text-text-primary">{c.texto}</p>
              {c.motivo && <p className="text-xs text-text-muted">{c.motivo}</p>}
              {c.error && <p className="text-xs text-danger">{c.error}</p>}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Upload, Check, PenLine, X, ShieldCheck } from 'lucide-react';
import { btnCls, btnPrimaryCls, chipCls, inputCls } from '@features/crm/format';
import { Loading, ErrorText } from '@features/crm/ui';
import { analizarMarkdown } from '../importar';
import {
  importarBorradores, getPorRevisar, actualizarRespuesta, actualizarRegla, actualizarCaso, eliminarRegla, refrescarVectores,
} from '../services/noraService';
import NoraPage, { Card } from './kit/NoraPage';
import { KnowledgeStatusBadge, PriorityBadge } from './kit/KnowledgeStatus';

const TIPO = { respuesta: 'Respuesta', regla: 'Regla', caso: 'Caso histórico' };
const SECCION = { respuesta: 'respuestas', regla: 'reglas', caso: 'casos' };

// Importar conocimiento desde Markdown: se detecta, se guarda apagado y la persona decide qué entra.
export default function ImportarPage({ onOpen }) {
  const qc = useQueryClient();
  const [markdown, setMarkdown] = useState('');
  const [archivo, setArchivo] = useState('');
  const [busy, setBusy] = useState(false);
  const detectado = useMemo(() => (markdown.trim() ? analizarMarkdown(markdown) : []), [markdown]);
  const revisar = useQuery({ queryKey: ['nora', 'por_revisar'], queryFn: getPorRevisar });
  const [filtro, setFiltro] = useState('todos');

  const refrescar = () => qc.invalidateQueries({ queryKey: ['nora'] });
  const cargar = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setArchivo(f.name);
    setMarkdown(await f.text());
    e.target.value = '';
  };
  const crear = async () => {
    setBusy(true);
    try {
      const r = await importarBorradores(detectado);
      toast.success(`Importado como borrador: ${r.respuestas} respuestas, ${r.reglas} reglas, ${r.casos} casos`);
      setMarkdown('');
      setArchivo('');
      refrescar();
      refrescarVectores();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const decidir = async (it, aprobar) => {
    try {
      if (it.tipo === 'respuesta') await actualizarRespuesta(it.id, { estado: aprobar ? 'aprobada' : 'archivada' });
      if (it.tipo === 'caso') await actualizarCaso(it.id, { estado: aprobar ? 'aprobado' : 'archivado' });
      if (it.tipo === 'regla') await (aprobar ? actualizarRegla(it.id, { activa: true }) : eliminarRegla(it.id));
      toast.success(aprobar ? 'Aprobado: Nora ya puede usarlo' : 'Descartado');
      refrescar();
      if (aprobar) refrescarVectores();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const cuentas = detectado.reduce((acc, i) => ({ ...acc, [i.tipo]: (acc[i.tipo] || 0) + 1 }), {});
  const conDatos = detectado.filter((i) => i.datosQuitados.length).length;
  const items = (revisar.data || []).filter((i) => filtro === 'todos' || i.tipo === filtro);

  return (
    <NoraPage title="Importar conocimiento" description="Sube un Markdown (p. ej. flujo_migracao_conocimiento_historico.md). Se detectan preguntas, respuestas, reglas y casos; todo entra apagado hasta que lo apruebes.">
      <Card title="1. Cargar archivo">
        <div className="flex flex-wrap items-center gap-2">
          <label className={`${btnCls} cursor-pointer`}>
            <Upload size={13} /> Elegir archivo .md
            <input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" className="hidden" onChange={cargar} />
          </label>
          <span className="text-xs text-text-muted">{archivo || 'o pega el texto abajo'}</span>
        </div>
        <textarea className={`${inputCls} mt-3 font-mono text-xs`} rows={markdown ? 8 : 4} placeholder="# Agendamiento&#10;## ¿Cuánto demora el agendamiento?&#10;El tiempo depende de la disponibilidad…" value={markdown} onChange={(e) => setMarkdown(e.target.value)} />
        {markdown.trim() && (
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3 text-[13px]">
            <span className="text-text-secondary">Encontrado:</span>
            <span><b>{cuentas.respuesta || 0}</b> respuestas</span>
            <span><b>{cuentas.regla || 0}</b> reglas</span>
            <span><b>{cuentas.caso || 0}</b> casos</span>
            {conDatos > 0 && <span className="inline-flex items-center gap-1 text-xs text-warning"><ShieldCheck size={13} /> Se quitarán datos personales de {conDatos}</span>}
            <button className={`${btnPrimaryCls} ml-auto`} disabled={busy || !detectado.length} onClick={crear}>{busy ? 'Guardando…' : 'Guardar como borradores'}</button>
          </div>
        )}
        {markdown.trim() && detectado.length > 0 && (
          <ul className="mt-3 max-h-64 space-y-1.5 overflow-y-auto">
            {detectado.slice(0, 60).map((i) => (
              <li key={i.clave} className="rounded-md border border-border px-3 py-2 text-xs">
                <span className="mr-2 font-medium text-text-secondary">{TIPO[i.tipo]}</span>
                {i.tramite && <span className="mr-2 text-text-muted">· {i.tramite}</span>}
                <span className="text-text-primary">{i.pregunta || i.texto || i.resumen}</span>
              </li>
            ))}
            {detectado.length > 60 && <li className="text-xs text-text-muted">… y {detectado.length - 60} más</li>}
          </ul>
        )}
      </Card>

      <Card title="2. Revisión: conocimiento encontrado" action={
        <div className="flex gap-1">
          {[['todos', 'Todo'], ['respuesta', 'Respuestas'], ['regla', 'Reglas'], ['caso', 'Casos']].map(([k, l]) => (
            <button key={k} className={chipCls(filtro === k)} onClick={() => setFiltro(k)}>{l}</button>
          ))}
        </div>
      }>
        {revisar.isLoading && <Loading />}
        {revisar.error && <ErrorText error={revisar.error} what="lo importado" />}
        {revisar.data && !items.length && <p className="py-4 text-center text-sm text-text-muted">No hay nada importado esperando revisión.</p>}
        <div className="space-y-2">
          {items.map((it) => (
            <article key={`${it.tipo}-${it.id}`} className="rounded-md border border-border p-3">
              {it.tipo === 'respuesta' && (
                <>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">Pregunta detectada</p>
                  <p className="text-[13px] font-medium text-text-primary">{it.pregunta}</p>
                  <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-text-muted">Respuesta detectada</p>
                  <p className="whitespace-pre-line text-[13px] text-text-secondary">{it.respuesta}</p>
                </>
              )}
              {it.tipo === 'regla' && (
                <>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">Regla detectada</p>
                  <p className="text-[13px] text-text-primary">{it.texto}</p>
                </>
              )}
              {it.tipo === 'caso' && (
                <>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">Caso detectado</p>
                  {it.problema && <p className="text-[13px] font-medium text-text-primary">{it.problema}</p>}
                  <p className="whitespace-pre-line text-[13px] text-text-secondary">{it.resumen}</p>
                </>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-2 text-xs text-text-muted">
                <span>Sugerido:</span>
                <span className="text-text-primary">{TIPO[it.tipo]}</span>
                {it.tramite && <span>· Trámite <span className="text-text-primary">{it.tramite}</span></span>}
                {it.tipo === 'regla' ? <PriorityBadge prioridad={it.prioridad} /> : <KnowledgeStatusBadge estado={it.estado} />}
                {it.tipo === 'regla' && <KnowledgeStatusBadge estado="inactiva" />}
                <div className="ml-auto flex gap-1.5">
                  <button className={`${btnCls} !h-7 !border-success-border text-success hover:!bg-success-bg`} onClick={() => decidir(it, true)}><Check size={13} /> Aprobar</button>
                  <button className={`${btnCls} !h-7`} onClick={() => onOpen(SECCION[it.tipo], it.id)}><PenLine size={13} /> Editar</button>
                  <button className={`${btnCls} !h-7`} onClick={() => decidir(it, false)}><X size={13} /> Descartar</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </Card>
    </NoraPage>
  );
}

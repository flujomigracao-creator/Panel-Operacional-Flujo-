import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { RefreshCw } from 'lucide-react';
import { btnCls } from '@features/crm/format';
import { getResumen, getEstadoVectores, getRespuestas, getCasos, generarVectores } from '../services/noraService';
import { NK } from '../useNora';
import NoraPage, { Card } from './kit/NoraPage';

const FUENTES = [
  ['Información oficial', 'Documentos activos de FLUJO Migração', 'documentos', 'documentosActivos'],
  ['Respuestas aprobadas', 'Lo que ya validaste', 'respuestas', 'respuestasAprobadas'],
  ['Reglas', 'Comportamiento y seguridad: llegan siempre, primero las críticas', 'reglas', 'reglasActivas'],
  ['Casos históricos', 'Experiencias anteriores; nunca por encima de lo oficial', 'casos', 'casosAprobados'],
  ['Memoria del cliente', 'Solo del cliente de esa conversación', 'memorias', 'memoriasActivas'],
];

// Configuración del conocimiento: fuentes y su orden, categorías en uso y estado de la indexación.
export default function NoraConfigPage({ onOpen }) {
  const qc = useQueryClient();
  const resumen = useQuery({ queryKey: NK.resumen, queryFn: getResumen });
  const vectores = useQuery({ queryKey: NK.vectores, queryFn: getEstadoVectores, refetchInterval: 15_000 });
  const respuestas = useQuery({ queryKey: NK.respuestas, queryFn: getRespuestas });
  const casos = useQuery({ queryKey: NK.casos, queryFn: getCasos });
  const [busy, setBusy] = useState(false);

  const categorias = useMemo(() => {
    const cuenta = {};
    for (const r of [...(respuestas.data || []), ...(casos.data || [])]) if (r.tramite) cuenta[r.tramite] = (cuenta[r.tramite] || 0) + 1;
    return Object.entries(cuenta).sort((a, b) => b[1] - a[1]);
  }, [respuestas.data, casos.data]);
  const etiquetas = useMemo(() => {
    const cuenta = {};
    for (const r of respuestas.data || []) for (const t of r.etiquetas || []) cuenta[t] = (cuenta[t] || 0) + 1;
    return Object.entries(cuenta).sort((a, b) => b[1] - a[1]);
  }, [respuestas.data]);

  const generar = async () => {
    setBusy(true);
    try {
      const r = await generarVectores();
      const n = Object.values(r.hechos || {}).reduce((a, b) => a + b, 0);
      toast.success(`Listo: ${n} textos y ${r.documentos} documentos indexados`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
      [NK.vectores, NK.documentos, NK.resumen].forEach((k) => qc.invalidateQueries({ queryKey: k }));
    }
  };
  const v = vectores.data || {};

  return (
    <NoraPage title="Configuración de Nora" description="Qué fuentes consulta Nora, en qué orden, y si todo está listo para la búsqueda.">
      <Card title="Fuentes, en orden de prioridad">
        <ol className="divide-y divide-border">
          {FUENTES.map(([nombre, desc, seccion, clave], i) => (
            <li key={nombre}>
              <button className="flex w-full items-center gap-3 py-2 text-left hover:bg-bg-elevated" onClick={() => onOpen(seccion)}>
                <span className="w-5 text-center text-sm font-semibold text-brand-primary">{i + 1}</span>
                <span className="flex-1">
                  <span className="block text-[13px] font-medium text-text-primary">{nombre}</span>
                  <span className="block text-xs text-text-muted">{desc}</span>
                </span>
                <span className="text-sm tabular-nums text-text-secondary">{resumen.data?.[clave] ?? '—'}</span>
              </button>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-text-muted">También usa las lecciones aprobadas en Aprendizajes. Lo que está en borrador, pendiente, archivado o inactivo nunca le llega.</p>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Estado del conocimiento" action={<button className={btnCls} disabled={busy} onClick={generar}><RefreshCw size={13} className={busy ? 'animate-spin' : ''} /> Indexar pendientes</button>}>
          <dl className="grid grid-cols-2 gap-y-1.5 text-[13px]">
            {[['Respuestas', v.respuestas], ['Casos', v.casos], ['Memorias', v.memorias], ['Aprendizajes', v.aprendizajes], ['Documentos por procesar', v.documentos], ['Documentos con error', v.documentosError]].map(([k, n]) => (
              <React.Fragment key={k}>
                <dt className="text-text-secondary">{k}</dt>
                <dd className={`text-right tabular-nums ${n ? (k.includes('error') ? 'text-danger' : 'text-warning') : 'text-text-muted'}`}>{n ? `${n} pendientes` : 'Al día'}</dd>
              </React.Fragment>
            ))}
          </dl>
          <p className="mt-3 text-xs text-text-muted">Cuando editas un texto, su índice se descarta y se vuelve a calcular: Nora nunca busca con una versión vieja. Se hace solo al guardar; este botón es por si algo quedó en cola.</p>
        </Card>
        <Card title="Categorías en uso">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Trámites</p>
          <div className="mb-3 flex flex-wrap gap-1">
            {categorias.length ? categorias.map(([t, n]) => <span key={t} className="rounded bg-bg-elevated px-1.5 py-0.5 text-xs text-text-secondary">{t} · {n}</span>) : <span className="text-xs text-text-muted">—</span>}
          </div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Etiquetas de respuestas</p>
          <div className="flex flex-wrap gap-1">
            {etiquetas.length ? etiquetas.map(([t, n]) => <span key={t} className="rounded bg-bg-elevated px-1.5 py-0.5 text-xs text-text-secondary">{t} · {n}</span>) : <span className="text-xs text-text-muted">—</span>}
          </div>
        </Card>
      </div>

      <Card title="Cómo decide Nora">
        <ul className="list-disc space-y-1 pl-5 text-[13px] text-text-secondary">
          <li>En cada mensaje busca por significado hasta 6 piezas de conocimiento parecidas a lo que escribió el cliente.</li>
          <li>Si dos piezas son igual de parecidas, gana la de mayor prioridad (lo oficial antes que un caso histórico).</li>
          <li>Las reglas activas le llegan siempre completas; las críticas van primero y marcadas como obligatorias.</li>
          <li>Las memorias solo se buscan para el cliente de esa conversación.</li>
          <li>Todo queda registrado en Conversaciones › Conocimiento utilizado.</li>
        </ul>
      </Card>
    </NoraPage>
  );
}

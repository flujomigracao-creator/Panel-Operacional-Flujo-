import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { relTime } from '@features/crm/format';
import { ErrorText } from '@features/crm/ui';
import { getResumen, getActividad, getAprendizajes } from '../services/noraService';
import { NK } from '../useNora';
import NoraPage, { Card } from './kit/NoraPage';
import NoraStats from './NoraStats';
import NoraActivity from './NoraActivity';
import KnowledgePreview from './KnowledgePreview';

// Inicio del centro de Nora: qué sabe hoy, qué espera una decisión y qué cambió.
export default function NoraDashboard({ onOpen }) {
  const resumen = useQuery({ queryKey: NK.resumen, queryFn: getResumen, refetchInterval: 60_000 });
  const actividad = useQuery({ queryKey: NK.actividad, queryFn: () => getActividad(12), refetchInterval: 60_000 });
  const aprendizajes = useQuery({ queryKey: NK.aprendizajes, queryFn: getAprendizajes });
  const r = resumen.data || {};
  const pendientes = [
    ['Respuestas pendientes de aprobación', r.respuestasBorrador, 'respuestas'],
    ['Casos pendientes', r.casosPendientes, 'casos'],
    ['Aprendizajes pendientes', r.aprendizajesPendientes, 'aprendizajes'],
    ['Dudas de clientes por revisar', r.dudasPendientes, 'aprendizajes'],
    ['Documentos pendientes o con error', r.documentosPendientes, 'documentos'],
  ];
  const ultimos = (aprendizajes.data || []).slice(0, 5);

  return (
    <NoraPage title="Nora" description="Centro de control: lo que Nora sabe, lo que está usando y lo que espera tu aprobación.">
      {resumen.error ? <ErrorText error={resumen.error} what="el resumen" /> : <NoraStats resumen={resumen.data} onOpen={onOpen} />}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Pendiente de tu decisión">
          <ul className="divide-y divide-border">
            {pendientes.map(([label, n, seccion]) => (
              <li key={label}>
                <button className="flex w-full items-center gap-2 py-2 text-left text-[13px] hover:bg-bg-elevated" onClick={() => onOpen(seccion)}>
                  <span className="flex-1 text-text-primary">{label}</span>
                  <span className={`min-w-[28px] rounded px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums ${n ? 'bg-warning-bg text-warning' : 'text-text-muted'}`}>{n ?? '—'}</span>
                  <ChevronRight size={14} className="text-text-muted" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Actividad reciente">
          <NoraActivity items={actividad.data} onOpen={onOpen} />
        </Card>
      </div>
      <Card title="¿Qué usaría Nora? Prueba un mensaje de cliente">
        <KnowledgePreview onOpen={onOpen} />
      </Card>
      <Card title="Últimos aprendizajes" action={<button className="text-xs text-brand-primary hover:underline" onClick={() => onOpen('aprendizajes')}>Ver todos</button>}>
        {ultimos.length ? (
          <ul className="divide-y divide-border">
            {ultimos.map((a) => (
              <li key={a.id}>
                <button className="flex w-full items-start gap-3 py-2 text-left hover:bg-bg-elevated" onClick={() => onOpen('aprendizajes', a.id)}>
                  <span className="line-clamp-2 flex-1 text-[13px] text-text-primary">{a.leccion}</span>
                  <span className="shrink-0 text-[11px] text-text-muted">{relTime(a.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-text-muted">Todavía no hay aprendizajes.</p>}
      </Card>
    </NoraPage>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2, Check, Archive } from 'lucide-react';
import { btnPrimaryCls, normalize } from '@features/crm/format';
import { Loading, ErrorText } from '@features/crm/ui';
import { useCrmData } from '@features/crm/useCrm';
import { getCasos, crearCaso, actualizarCaso, eliminarCaso } from '../services/noraService';
import { NK, useNoraSave, TRAMITES_SUGERIDOS, confirmar } from '../useNora';
import NoraPage from './kit/NoraPage';
import KnowledgeTable, { Clip, fecha } from './kit/KnowledgeTable';
import KnowledgeFilters from './kit/KnowledgeFilters';
import KnowledgeEditor from './kit/KnowledgeEditor';
import { KnowledgeStatusBadge, EmbeddingStatus, fuenteLabel } from './kit/KnowledgeStatus';
import { IconBtn } from './RespuestasPage';

const ESTADOS = [['pendiente', 'Pendiente'], ['aprobado', 'Aprobado'], ['archivado', 'Archivado']];

// Casos históricos: antecedentes reales. Orientan a Nora, pero nunca se vuelven reglas solos.
export default function CasosPage({ focusId, onFocusDone }) {
  const q = useQuery({ queryKey: NK.casos, queryFn: getCasos });
  const { teamById } = useCrmData();
  const rows = useMemo(() => q.data || [], [q.data]);
  const [save] = useNoraSave([NK.casos]);
  const [estado, setEstado] = useState('todos');
  const [tramite, setTramite] = useState('');
  const [pais, setPais] = useState('');
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(null);

  useEffect(() => {
    if (focusId && rows.length) {
      const r = rows.find((x) => x.id === focusId);
      if (r) setAbierto(r);
      onFocusDone?.();
    }
  }, [focusId, rows, onFocusDone]);

  const tramites = useMemo(() => [...new Set(rows.map((r) => r.tramite).filter(Boolean))].sort(), [rows]);
  const paises = useMemo(() => [...new Set(rows.map((r) => r.pais).filter(Boolean))].sort(), [rows]);
  const s = normalize(texto).trim();
  const filtrados = rows.filter((r) => (estado === 'todos' || r.estado === estado) && (!tramite || r.tramite === tramite) && (!pais || r.pais === pais)
    && (!s || normalize(`${r.tramite} ${r.pais} ${r.ciudad} ${r.problema} ${r.resumen} ${r.solucion} ${r.resultado}`).includes(s)));
  const cuenta = (e) => rows.filter((r) => e === 'todos' || r.estado === e).length;
  const cambiar = (r, cambios, ok) => save(async () => {
    const nuevo = await actualizarCaso(r.id, cambios);
    setAbierto((a) => (a?.id === r.id ? nuevo : a));
  }, ok);
  const nombre = (id) => (id ? teamById[id] || 'Otro usuario' : '—');

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorText error={q.error} what="los casos" />;

  return (
    <NoraPage title="Casos históricos" description="Antecedentes reales (p. ej. del histórico de CUBANOS BR). Un caso dice “esto ya pasó”, no “así se hace siempre”."
      actions={<button className={btnPrimaryCls} onClick={() => setAbierto({})}><Plus size={14} /> Nuevo caso</button>}>
      <KnowledgeFilters
        estados={[['todos', 'Todos', cuenta('todos')], ...ESTADOS.map(([v, l]) => [v, l, cuenta(v)])]} estado={estado} onEstado={setEstado}
        selects={[
          { key: 'tramite', label: 'Trámite', value: tramite, onChange: setTramite, options: [['', 'Todos los trámites'], ...tramites.map((t) => [t, t])] },
          { key: 'pais', label: 'País', value: pais, onChange: setPais, options: [['', 'Todos los países'], ...paises.map((t) => [t, t])] },
        ]}
        texto={texto} onTexto={setTexto} placeholder="Buscar en casos…" />
      <KnowledgeTable rows={filtrados} onOpen={setAbierto} empty={rows.length ? 'No hay casos con estos filtros.' : 'Todavía no hay casos. Puedes crearlos a mano o importarlos desde un Markdown.'}
        columns={[
          { key: 'tramite', label: 'Trámite', render: (r) => r.tramite || '—' },
          { key: 'lugar', label: 'País / ciudad', render: (r) => [r.pais, r.ciudad].filter(Boolean).join(' · ') || '—' },
          { key: 'problema', label: 'Problema', width: '20%', render: (r) => <Clip>{r.problema || '—'}</Clip> },
          { key: 'resumen', label: 'Resumen', width: '24%', render: (r) => <Clip className="text-text-secondary">{r.resumen}</Clip> },
          { key: 'resultado', label: 'Resultado', render: (r) => <Clip>{r.resultado || '—'}</Clip> },
          { key: 'estado', label: 'Estado', render: (r) => <KnowledgeStatusBadge estado={r.estado} /> },
          { key: 'fuente', label: 'Fuente', render: (r) => fuenteLabel(r.fuente) },
          { key: 'acciones', label: 'Acciones', render: (r) => (
            <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
              {r.estado !== 'aprobado' && <IconBtn title="Aprobar" onClick={() => cambiar(r, { estado: 'aprobado' }, 'Caso aprobado: Nora puede usarlo como antecedente')}><Check size={13} /></IconBtn>}
              {r.estado !== 'archivado' && <IconBtn title="Archivar" onClick={() => cambiar(r, { estado: 'archivado' }, 'Caso archivado')}><Archive size={13} /></IconBtn>}
            </span>
          ) },
        ]} />

      {abierto && (
        <KnowledgeEditor
          title={abierto.id ? 'Caso histórico' : 'Nuevo caso'}
          header={abierto.id && <KnowledgeStatusBadge estado={abierto.estado} />}
          item={abierto.id ? abierto : {}}
          aviso="Un caso es un antecedente, no una regla: Nora lo usa como experiencia previa y nunca por encima de la información oficial. Sin nombres ni datos personales."
          fields={[
            { key: 'tramite', label: 'Trámite', section: 'Contexto', suggestions: [...new Set([...TRAMITES_SUGERIDOS, ...tramites])] },
            { key: 'pais', label: 'País', suggestions: paises },
            { key: 'ciudad', label: 'Ciudad' },
            { key: 'problema', label: 'Problema', type: 'textarea', rows: 2, section: 'El caso' },
            { key: 'resumen', label: 'Resumen', type: 'textarea', rows: 4, required: true },
            { key: 'solucion', label: 'Solución', type: 'textarea', rows: 3 },
            { key: 'resultado', label: 'Resultado', type: 'textarea', rows: 2 },
            { key: 'fuente', label: 'Fuente', suggestions: ['manual', 'historico_anonimizado', 'importacion'] },
          ]}
          privacy={['problema', 'resumen', 'solucion', 'resultado', 'ciudad']}
          meta={abierto.id ? [
            ['Creado por', nombre(abierto.created_by)], ['Aprobado por', nombre(abierto.approved_by)],
            ['Creado', fecha(abierto.created_at)], ['Modificado', fecha(abierto.updated_at)],
            ['Búsqueda', <EmbeddingStatus key="e" listo={abierto.tiene_embedding} />],
          ] : []}
          onClose={() => setAbierto(null)}
          onSave={async (v) => {
            if (abierto.id) await cambiar(abierto, v, 'Caso guardado');
            else { await save(() => crearCaso(v), 'Caso creado como pendiente'); setAbierto(null); }
          }}
          actions={abierto.id ? [
            abierto.estado !== 'aprobado' && { label: 'Aprobar caso', tone: 'success', needsValid: true, onClick: (v) => cambiar(abierto, { ...v, estado: 'aprobado' }, 'Caso aprobado') },
            abierto.estado !== 'archivado' && { label: 'Archivar', onClick: () => cambiar(abierto, { estado: 'archivado' }, 'Caso archivado') },
            abierto.estado !== 'aprobado' && { label: 'Eliminar', tone: 'danger', icon: <Trash2 size={13} />, onClick: async () => {
              if (!confirmar('¿Eliminar este caso para siempre? Si solo quieres que Nora no lo use, archívalo.')) return;
              await save(() => eliminarCaso(abierto.id), 'Caso eliminado', { vectores: false });
              setAbierto(null);
            } },
          ].filter(Boolean) : []}
        />
      )}
    </NoraPage>
  );
}

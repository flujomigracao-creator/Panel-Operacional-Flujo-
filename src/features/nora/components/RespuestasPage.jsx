import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Copy, Trash2, Archive, Check } from 'lucide-react';
import { btnPrimaryCls, normalize } from '@features/crm/format';
import { useCrmData } from '@features/crm/useCrm';
import { Loading, ErrorText } from '@features/crm/ui';
import { getRespuestas, crearRespuesta, actualizarRespuesta, eliminarRespuesta } from '../services/noraService';
import { NK, useNoraSave, IDIOMAS, TONOS, TRAMITES_SUGERIDOS, idiomaLabel, tonoLabel, confirmar } from '../useNora';
import NoraPage from './kit/NoraPage';
import KnowledgeTable, { Clip, Tags, fecha } from './kit/KnowledgeTable';
import KnowledgeFilters, { PERIODOS, dentroDePeriodo } from './kit/KnowledgeFilters';
import KnowledgeEditor from './kit/KnowledgeEditor';
import { KnowledgeStatusBadge, EmbeddingStatus, fuenteLabel } from './kit/KnowledgeStatus';

const ESTADOS = [['borrador', 'Borrador'], ['aprobada', 'Aprobada'], ['archivada', 'Archivada']];

// Respuestas que Nora puede usar. Solo las aprobadas llegan a Nora; lo nuevo nace como borrador.
export default function RespuestasPage({ focusId, onFocusDone }) {
  const q = useQuery({ queryKey: NK.respuestas, queryFn: getRespuestas });
  const { teamById } = useCrmData();
  const rows = useMemo(() => q.data || [], [q.data]);
  const [save] = useNoraSave([NK.respuestas]);
  const [estado, setEstado] = useState('todas');
  const [tramite, setTramite] = useState('');
  const [idioma, setIdioma] = useState('');
  const [tono, setTono] = useState('');
  const [etiqueta, setEtiqueta] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [texto, setTexto] = useState('');
  const [abierta, setAbierta] = useState(null);

  useEffect(() => {
    if (focusId && rows.length) {
      const r = rows.find((x) => x.id === focusId);
      if (r) setAbierta(r);
      onFocusDone?.();
    }
  }, [focusId, rows, onFocusDone]);

  const tramites = useMemo(() => [...new Set(rows.map((r) => r.tramite).filter(Boolean))].sort(), [rows]);
  const etiquetas = useMemo(() => [...new Set(rows.flatMap((r) => r.etiquetas || []))].sort(), [rows]);
  const filtradas = useMemo(() => {
    const s = normalize(texto).trim();
    return rows.filter((r) => (estado === 'todas' || r.estado === estado)
      && (!tramite || r.tramite === tramite) && (!idioma || r.idioma === idioma) && (!tono || r.tono === tono)
      && (!etiqueta || (r.etiquetas || []).includes(etiqueta)) && dentroDePeriodo(r.created_at, periodo)
      && (!s || normalize(`${r.pregunta} ${r.respuesta} ${r.tramite} ${(r.etiquetas || []).join(' ')}`).includes(s)));
  }, [rows, estado, tramite, idioma, tono, etiqueta, periodo, texto]);

  const cuenta = (e) => rows.filter((r) => e === 'todas' || r.estado === e).length;
  const cambiar = (r, cambios, ok) => save(async () => {
    const nueva = await actualizarRespuesta(r.id, cambios);
    setAbierta((a) => (a?.id === r.id ? nueva : a));
  }, ok);

  const campos = [
    { key: 'pregunta', label: 'Pregunta del cliente', type: 'textarea', rows: 2, required: true },
    { key: 'respuesta', label: 'Respuesta de Nora', type: 'textarea', rows: 9, required: true },
    { key: 'tramite', label: 'Trámite', section: 'Clasificación', suggestions: [...new Set([...TRAMITES_SUGERIDOS, ...tramites])] },
    { key: 'idioma', label: 'Idioma', type: 'select', options: IDIOMAS },
    { key: 'tono', label: 'Tono', type: 'select', options: TONOS },
    { key: 'etiquetas', label: 'Etiquetas', type: 'tags', hint: 'Separadas por comas (ej.: agendamiento, PF, tiempo)' },
  ];
  const nombre = (id) => (id ? teamById[id] || 'Otro usuario' : '—');

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorText error={q.error} what="las respuestas" />;

  return (
    <NoraPage title="Respuestas" description="Respuestas validadas para preguntas frecuentes. Nora solo usa las aprobadas."
      actions={<button className={btnPrimaryCls} onClick={() => setAbierta({})}><Plus size={14} /> Nueva respuesta</button>}>
      <KnowledgeFilters
        estados={[['todas', 'Todas', cuenta('todas')], ...ESTADOS.map(([v, l]) => [v, l, cuenta(v)])]} estado={estado} onEstado={setEstado}
        selects={[
          { key: 'tramite', label: 'Trámite', value: tramite, onChange: setTramite, options: [['', 'Todos los trámites'], ...tramites.map((t) => [t, t])] },
          { key: 'idioma', label: 'Idioma', value: idioma, onChange: setIdioma, options: [['', 'Todos los idiomas'], ...IDIOMAS] },
          { key: 'tono', label: 'Tono', value: tono, onChange: setTono, options: [['', 'Todos los tonos'], ...TONOS] },
          { key: 'etiqueta', label: 'Etiqueta', value: etiqueta, onChange: setEtiqueta, options: [['', 'Todas las etiquetas'], ...etiquetas.map((t) => [t, t])] },
          { key: 'periodo', label: 'Fecha', value: periodo, onChange: setPeriodo, options: PERIODOS },
        ]}
        texto={texto} onTexto={setTexto} placeholder="Buscar en respuestas…" />
      <KnowledgeTable rows={filtradas} onOpen={setAbierta} empty="No hay respuestas con estos filtros."
        columns={[
          { key: 'pregunta', label: 'Pregunta', width: '22%', render: (r) => <Clip className="font-medium">{r.pregunta}</Clip> },
          { key: 'respuesta', label: 'Respuesta', width: '30%', render: (r) => <Clip className="text-text-secondary">{r.respuesta}</Clip> },
          { key: 'tramite', label: 'Trámite', render: (r) => r.tramite || '—' },
          { key: 'idioma', label: 'Idioma', render: (r) => idiomaLabel(r.idioma) },
          { key: 'tono', label: 'Tono', render: (r) => tonoLabel(r.tono) },
          { key: 'etiquetas', label: 'Etiquetas', render: (r) => <Tags tags={r.etiquetas} /> },
          { key: 'estado', label: 'Estado', render: (r) => <KnowledgeStatusBadge estado={r.estado} /> },
          { key: 'created_at', label: 'Creada', render: (r) => fecha(r.created_at) },
          { key: 'updated_at', label: 'Modificada', render: (r) => fecha(r.updated_at) },
          { key: 'acciones', label: 'Acciones', className: 'whitespace-nowrap', render: (r) => (
            <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
              {r.estado !== 'aprobada' && <IconBtn title="Aprobar" onClick={() => cambiar(r, { estado: 'aprobada' }, 'Respuesta aprobada: Nora ya puede usarla')}><Check size={13} /></IconBtn>}
              {r.estado !== 'archivada' && <IconBtn title="Archivar" onClick={() => cambiar(r, { estado: 'archivada' }, 'Respuesta archivada')}><Archive size={13} /></IconBtn>}
              <IconBtn title="Duplicar" onClick={() => save(() => crearRespuesta({ ...r, pregunta: `${r.pregunta} (copia)` }), 'Copia creada como borrador')}><Copy size={13} /></IconBtn>
            </span>
          ) },
        ]} />

      {abierta && (
        <KnowledgeEditor
          title={abierta.id ? 'Respuesta' : 'Nueva respuesta'}
          header={abierta.id && <KnowledgeStatusBadge estado={abierta.estado} />}
          item={abierta.id ? abierta : { idioma: 'es', tono: 'humano', etiquetas: [] }}
          fields={campos}
          privacy={['pregunta', 'respuesta']}
          aviso={!abierta.id ? 'Se guarda como borrador. Nora no la usa hasta que la apruebes.' : abierta.estado === 'aprobada' ? 'Aprobada: Nora la está usando. Si cambias el texto, se vuelve a indexar sola.' : null}
          meta={abierta.id ? [
            ['Creada por', nombre(abierta.created_by)], ['Aprobada por', nombre(abierta.approved_by)],
            ['Creada', fecha(abierta.created_at)], ['Modificada', fecha(abierta.updated_at)],
            ['Origen', fuenteLabel(abierta.fuente)], ['Búsqueda', <EmbeddingStatus key="e" listo={abierta.tiene_embedding} />],
          ] : []}
          onClose={() => setAbierta(null)}
          onSave={async (v) => {
            if (abierta.id) await cambiar(abierta, v, 'Cambios guardados');
            else { await save(() => crearRespuesta(v), 'Respuesta creada como borrador'); setAbierta(null); }
          }}
          actions={abierta.id ? [
            abierta.estado !== 'aprobada' && { label: 'Aprobar respuesta', tone: 'success', needsValid: true, onClick: (v) => cambiar(abierta, { ...v, estado: 'aprobada' }, 'Respuesta aprobada: Nora ya puede usarla') },
            abierta.estado === 'aprobada' && { label: 'Volver a borrador', onClick: () => cambiar(abierta, { estado: 'borrador' }, 'Nora deja de usarla') },
            abierta.estado !== 'archivada' && { label: 'Archivar', onClick: () => cambiar(abierta, { estado: 'archivada' }, 'Respuesta archivada') },
            { label: 'Duplicar', onClick: (v) => save(() => crearRespuesta({ ...v, pregunta: `${v.pregunta} (copia)` }), 'Copia creada como borrador') },
            abierta.estado !== 'aprobada' && { label: 'Eliminar', tone: 'danger', icon: <Trash2 size={13} />, onClick: async () => {
              if (!confirmar('¿Eliminar esta respuesta para siempre? Si solo quieres que Nora no la use, archívala.')) return;
              await save(() => eliminarRespuesta(abierta.id), 'Respuesta eliminada', { vectores: false });
              setAbierta(null);
            } },
          ].filter(Boolean) : []}
        />
      )}
    </NoraPage>
  );
}

export function IconBtn({ title, onClick, children }) {
  // El error ya se avisó con un toast al guardar.
  const click = () => { const r = onClick(); r?.catch?.(() => {}); };
  return <button title={title} aria-label={title} className="rounded p-1 text-text-muted hover:bg-bg-elevated hover:text-text-primary" onClick={click}>{children}</button>;
}

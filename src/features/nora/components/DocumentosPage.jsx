import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, RefreshCw } from 'lucide-react';
import { btnPrimaryCls, normalize } from '@features/crm/format';
import { Loading, ErrorText } from '@features/crm/ui';
import { getDocumentos, getDocumento, crearDocumento, actualizarDocumento, procesarDocumento } from '../services/noraService';
import { NK, useNoraSave } from '../useNora';
import NoraPage from './kit/NoraPage';
import KnowledgeTable, { fecha } from './kit/KnowledgeTable';
import KnowledgeFilters from './kit/KnowledgeFilters';
import KnowledgeEditor from './kit/KnowledgeEditor';
import { KnowledgeStatusBadge, fuenteLabel } from './kit/KnowledgeStatus';
import { IconBtn } from './RespuestasPage';

const TIPOS = ['Información oficial', 'Guía interna', 'Procedimiento interno', 'Manual', 'Documentación de trámite', 'Markdown', 'PDF'];

// Estado que ve la persona: Activo / Inactivo / Procesando / Error.
export function estadoDocumento(d) {
  if (d.status === 'archived') return 'archivado';
  if (d.status !== 'published') return 'inactivo';
  if (d.procesamiento === 'error') return 'error';
  if (d.procesamiento !== 'procesado') return 'procesando';
  return 'activo';
}

// Documentos que Nora consulta como información oficial (la fuente de mayor prioridad).
export default function DocumentosPage({ focusId, onFocusDone }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: NK.documentos,
    queryFn: getDocumentos,
    refetchInterval: (query) => ((query.state.data || []).some((d) => d.status === 'published' && ['pendiente', 'procesando'].includes(d.procesamiento)) ? 5000 : false),
  });
  const rows = useMemo(() => q.data || [], [q.data]);
  const [save] = useNoraSave([NK.documentos]);
  const [estado, setEstado] = useState('todos');
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(null);
  const [reprocesando, setReprocesando] = useState(null);

  const abrir = async (d) => {
    try { setAbierto(await getDocumento(d.id)); } catch (err) { toast.error(err.message); }
  };
  useEffect(() => {
    if (focusId && rows.length) {
      const d = rows.find((x) => x.id === focusId);
      if (d) abrir(d);
      onFocusDone?.();
    }
  }, [focusId, rows, onFocusDone]);

  const reprocesar = async (d) => {
    setReprocesando(d.id);
    try {
      const r = await procesarDocumento(d.id);
      toast.success(`Conocimiento actualizado: ${r.fragmentos} fragmentos`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setReprocesando(null);
      [NK.documentos, NK.resumen, NK.actividad, NK.vectores].forEach((k) => qc.invalidateQueries({ queryKey: k }));
    }
  };

  const conEstado = rows.map((d) => ({ ...d, _estado: estadoDocumento(d) }));
  const s = normalize(texto).trim();
  const filtrados = conEstado.filter((d) => (estado === 'todos' ? d._estado !== 'archivado' : d._estado === estado)
    && (!s || normalize(`${d.title} ${d.category} ${d.fuente}`).includes(s)));
  const cuenta = (e) => conEstado.filter((d) => (e === 'todos' ? d._estado !== 'archivado' : d._estado === e)).length;
  const cambiar = (d, cambios, ok) => save(async () => {
    const nuevo = await actualizarDocumento(d.id, cambios);
    setAbierto((a) => (a?.id === d.id ? { ...a, ...nuevo } : a));
  }, ok);

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorText error={q.error} what="los documentos" />;

  return (
    <NoraPage title="Documentos" description="Guías, procedimientos e información oficial. Es lo primero que Nora consulta; se parten en fragmentos para encontrarlos por significado."
      actions={<button className={btnPrimaryCls} onClick={() => setAbierto({})}><Plus size={14} /> Nuevo documento</button>}>
      <KnowledgeFilters
        estados={[['todos', 'Todos', cuenta('todos')], ['activo', 'Activos', cuenta('activo')], ['inactivo', 'Inactivos', cuenta('inactivo')], ['procesando', 'Procesando', cuenta('procesando')], ['error', 'Error', cuenta('error')], ['archivado', 'Archivados', cuenta('archivado')]]}
        estado={estado} onEstado={setEstado} texto={texto} onTexto={setTexto} placeholder="Buscar documentos…" />
      <KnowledgeTable rows={filtrados} onOpen={abrir} empty={rows.length ? 'No hay documentos con estos filtros.' : 'Todavía no hay documentos. Crea uno o carga un archivo Markdown.'}
        columns={[
          { key: 'title', label: 'Nombre', width: '30%', render: (d) => <span className="font-medium">{d.title}</span> },
          { key: 'category', label: 'Tipo', render: (d) => d.category || '—' },
          { key: 'fuente', label: 'Fuente', render: (d) => d.fuente || fuenteLabel(d.source_type) },
          { key: 'fecha', label: 'Fecha', render: (d) => fecha(d.created_at) },
          { key: 'estado', label: 'Estado', render: (d) => <span title={d.procesamiento_error || ''}><KnowledgeStatusBadge estado={d._estado} /></span> },
          { key: 'fragmentos', label: 'Fragmentos', className: 'tabular-nums', render: (d) => (d.procesamiento === 'procesado' ? d.fragmentos : '—') },
          { key: 'updated_at', label: 'Actualizado', render: (d) => fecha(d.updated_at) },
          { key: 'acciones', label: '', render: (d) => (
            <span onClick={(e) => e.stopPropagation()}>
              {d.status !== 'archived' && (
                <IconBtn title="Reprocesar conocimiento" onClick={() => reprocesar(d)}>
                  <RefreshCw size={13} className={reprocesando === d.id ? 'animate-spin' : ''} />
                </IconBtn>
              )}
            </span>
          ) },
        ]} />

      {abierto && (
        <KnowledgeEditor
          title={abierto.id ? abierto.title : 'Nuevo documento'}
          header={abierto.id && <KnowledgeStatusBadge estado={estadoDocumento(abierto)} />}
          item={abierto.id ? abierto : { category: 'Guía interna' }}
          aviso={abierto.procesamiento_error ? `Error al procesar: ${abierto.procesamiento_error}` : 'Al guardar un cambio en el texto, el documento se vuelve a procesar solo; Nora no usa la versión anterior.'}
          fields={[
            { key: 'title', label: 'Nombre', required: true },
            { key: 'category', label: 'Tipo', suggestions: TIPOS },
            { key: 'fuente', label: 'Fuente', hint: 'De dónde sale (ej.: Polícia Federal, procedimiento interno de Flujo).' },
            { key: 'content', label: 'Contenido', type: 'textarea', rows: 16, required: true, upload: true, titleKey: 'title' },
          ]}
          privacy={['content']}
          meta={abierto.id ? [
            ['Fragmentos', abierto.procesamiento === 'procesado' ? abierto.fragmentos : '—'],
            ['Vectores', abierto.procesamiento === 'procesado' ? 'Generados' : abierto.procesamiento === 'error' ? 'Error' : 'En proceso'],
            ['Versión', abierto.version], ['Procesado', fecha(abierto.procesado_at)],
            ['Creado', fecha(abierto.created_at)], ['Actualizado', fecha(abierto.updated_at)],
          ] : []}
          onClose={() => setAbierto(null)}
          onSave={async (v) => {
            if (abierto.id) await cambiar(abierto, v, 'Documento guardado');
            else { await save(() => crearDocumento(v), 'Documento guardado: se está procesando'); setAbierto(null); }
          }}
          actions={abierto.id ? [
            abierto.status !== 'archived' && { label: 'Reprocesar conocimiento', onClick: () => reprocesar(abierto) },
            abierto.status === 'published'
              ? { label: 'Desactivar', onClick: () => cambiar(abierto, { status: 'draft' }, 'Documento desactivado: Nora deja de consultarlo') }
              : { label: 'Activar', tone: 'success', onClick: () => cambiar(abierto, { status: 'published' }, 'Documento activado') },
            abierto.status !== 'archived' && { label: 'Archivar', onClick: () => cambiar(abierto, { status: 'archived' }, 'Documento archivado') },
          ].filter(Boolean) : []}
        />
      )}
    </NoraPage>
  );
}

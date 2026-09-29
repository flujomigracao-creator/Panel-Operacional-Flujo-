import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, X, PenLine, ArrowRightCircle } from 'lucide-react';
import { chipCls, normalize } from '@features/crm/format';
import { Loading, ErrorText } from '@features/crm/ui';
import { getAprendizajes, actualizarAprendizaje, getDudas, actualizarDuda, convertirEnRespuesta } from '../services/noraService';
import { NK, useNoraSave } from '../useNora';
import NoraPage from './kit/NoraPage';
import KnowledgeTable, { Clip, fecha } from './kit/KnowledgeTable';
import KnowledgeFilters from './kit/KnowledgeFilters';
import KnowledgeEditor from './kit/KnowledgeEditor';
import { KnowledgeStatusBadge, fuenteLabel } from './kit/KnowledgeStatus';
import { IconBtn } from './RespuestasPage';

const ESTADOS = [['pendiente', 'Pendiente'], ['aprobada', 'Correcto'], ['corregir', 'Corregir'], ['descartada', 'Descartado']];
const ORIGENES = { venta: 'Venta', cierre: 'Cierre', perdido: 'Lead perdido', silencio: 'Cliente en silencio', humano: 'Respuesta del equipo', manual: 'Manual', entrenador: 'Entrenador', duda: 'Duda de cliente' };
const estadoLabel = (e) => (ESTADOS.find(([k]) => k === e) || [e, e])[1];

// Un ejemplo "Cuando el cliente dijo: … se le respondió: …" se separa en pregunta y respuesta.
export function separarEjemplo(a) {
  if (a.pregunta || a.respuesta) return { pregunta: a.pregunta || '', respuesta: a.respuesta || a.leccion };
  const m = String(a.leccion || '').match(/cuando el cliente (?:dijo|pregunta|preguntó|dice)\s*:?\s*"?(.+?)"?,?\s*se le (?:respondi[oó]|responde|contest[oó])\s*:?\s*(.+)$/is);
  return m ? { pregunta: m[1].trim(), respuesta: m[2].trim() } : { pregunta: '', respuesta: a.leccion };
}

// Aprendizajes: lo que Nora saca de las conversaciones (cada madrugada) y las dudas reales de los clientes.
export default function AprendizajesPage({ focusId, onFocusDone }) {
  const [tab, setTab] = useState('lecciones');
  const lecciones = useQuery({ queryKey: NK.aprendizajes, queryFn: getAprendizajes });
  const dudas = useQuery({ queryKey: NK.dudas, queryFn: getDudas });
  const pendientesDudas = (dudas.data || []).filter((d) => d.estado === 'pendiente').length;
  const pendientesLecciones = (lecciones.data || []).filter((d) => d.estado === 'pendiente' || d.estado === 'corregir').length;

  return (
    <NoraPage title="Aprendizajes" description="Lo que Nora aprende de las conversaciones. Nada entra solo: tú decides qué es correcto y qué pasa a Respuestas.">
      <div className="flex gap-1">
        <button className={chipCls(tab === 'lecciones')} onClick={() => setTab('lecciones')}>Lecciones y ejemplos {pendientesLecciones > 0 && <span className="text-warning">{pendientesLecciones}</span>}</button>
        <button className={chipCls(tab === 'dudas')} onClick={() => setTab('dudas')}>Dudas de clientes {pendientesDudas > 0 && <span className="text-warning">{pendientesDudas}</span>}</button>
      </div>
      {tab === 'lecciones' ? <Lecciones q={lecciones} focusId={focusId} onFocusDone={onFocusDone} /> : <Dudas q={dudas} />}
    </NoraPage>
  );
}

function Lecciones({ q, focusId, onFocusDone }) {
  const rows = useMemo(() => q.data || [], [q.data]);
  const [save] = useNoraSave([NK.aprendizajes, NK.respuestas]);
  const [estado, setEstado] = useState('pendiente');
  const [origen, setOrigen] = useState('');
  const [texto, setTexto] = useState('');
  const [abierto, setAbierto] = useState(null);

  useEffect(() => {
    if (focusId && rows.length) {
      const r = rows.find((x) => x.id === focusId);
      if (r) { setEstado('todos'); setAbierto(r); }
      onFocusDone?.();
    }
  }, [focusId, rows, onFocusDone]);

  const s = normalize(texto).trim();
  const filtradas = rows.filter((r) => (estado === 'todos' || r.estado === estado) && (!origen || r.origen === origen)
    && (!s || normalize(`${r.leccion} ${r.pregunta} ${r.respuesta} ${r.feedback}`).includes(s)));
  const cuenta = (e) => rows.filter((r) => e === 'todos' || r.estado === e).length;
  const cambiar = (r, cambios, ok) => save(async () => {
    const n = await actualizarAprendizaje(r.id, cambios);
    setAbierto((a) => (a?.id === r.id ? n : a));
  }, ok);
  const convertir = (r) => {
    const { pregunta, respuesta } = separarEjemplo(r);
    return save(async () => {
      await convertirEnRespuesta({ origen: 'aprendizaje', id: r.id, pregunta: pregunta || 'Pregunta del cliente (completar)', respuesta });
      setAbierto(null);
    }, 'Pasó a Respuestas como borrador: revísala y apruébala allí');
  };

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorText error={q.error} what="los aprendizajes" />;

  return (
    <>
      <KnowledgeFilters
        estados={[...ESTADOS.map(([v, l]) => [v, l, cuenta(v)]), ['todos', 'Todos', cuenta('todos')]]} estado={estado} onEstado={setEstado}
        selects={[{ key: 'origen', label: 'Fuente', value: origen, onChange: setOrigen, options: [['', 'Todas las fuentes'], ...Object.entries(ORIGENES)] }]}
        texto={texto} onTexto={setTexto} placeholder="Buscar en aprendizajes…" />
      <KnowledgeTable rows={filtradas} onOpen={setAbierto} empty="No hay aprendizajes con estos filtros."
        columns={[
          { key: 'pregunta', label: 'Pregunta del cliente', width: '22%', render: (r) => <Clip>{separarEjemplo(r).pregunta || <span className="text-text-muted">—</span>}</Clip> },
          { key: 'respuesta', label: 'Respuesta / lección', width: '34%', render: (r) => <Clip lines={3} className="text-text-secondary">{separarEjemplo(r).respuesta}</Clip> },
          { key: 'resultado', label: 'Resultado', render: (r) => r.resultado || '—' },
          { key: 'feedback', label: 'Feedback', render: (r) => <Clip>{r.feedback || '—'}</Clip> },
          { key: 'origen', label: 'Fuente', render: (r) => ORIGENES[r.origen] || fuenteLabel(r.origen) },
          { key: 'fecha', label: 'Fecha', render: (r) => fecha(r.created_at) },
          { key: 'estado', label: 'Estado', render: (r) => <KnowledgeStatusBadge estado={r.estado} label={estadoLabel(r.estado)} /> },
          { key: 'acciones', label: 'Acciones', className: 'whitespace-nowrap', render: (r) => (
            <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
              {r.estado !== 'aprobada' && <IconBtn title="Correcto (Nora lo usa)" onClick={() => cambiar(r, { estado: 'aprobada' }, 'Marcado como correcto: Nora lo usa')}><Check size={13} /></IconBtn>}
              {r.estado !== 'corregir' && <IconBtn title="Corregir" onClick={() => cambiar(r, { estado: 'corregir' }, 'Marcado para corregir')}><PenLine size={13} /></IconBtn>}
              {r.estado !== 'descartada' && <IconBtn title="Descartar" onClick={() => cambiar(r, { estado: 'descartada' }, 'Descartado')}><X size={13} /></IconBtn>}
              {!r.respuesta_id && <IconBtn title="Convertir en respuesta aprobada" onClick={() => convertir(r)}><ArrowRightCircle size={13} /></IconBtn>}
            </span>
          ) },
        ]} />
      {abierto && (
        <KnowledgeEditor
          title="Aprendizaje"
          header={<KnowledgeStatusBadge estado={abierto.estado} label={estadoLabel(abierto.estado)} />}
          item={abierto}
          aviso={abierto.respuesta_id ? 'Ya se convirtió en una respuesta (está en Respuestas).' : 'Si funcionó bien, conviértelo en respuesta: entra como borrador y la apruebas en Respuestas.'}
          fields={[
            { key: 'pregunta', label: 'Pregunta del cliente', type: 'textarea', rows: 2 },
            { key: 'leccion', label: 'Lección / respuesta de Nora', type: 'textarea', rows: 6, required: true },
            { key: 'resultado', label: 'Resultado', suggestions: ['Respuesta útil', 'El cliente siguió', 'El cliente compró', 'El cliente dejó de responder', 'Respuesta incorrecta'] },
            { key: 'feedback', label: 'Feedback', type: 'textarea', rows: 3, hint: 'Qué corregir o por qué funcionó.' },
          ]}
          privacy={['pregunta', 'leccion']}
          meta={[['Fuente', ORIGENES[abierto.origen] || fuenteLabel(abierto.origen)], ['Tipo', abierto.tipo === 'ejemplo' ? 'Ejemplo real' : 'Lección'], ['Fecha', fecha(abierto.created_at)], ['Revisado', fecha(abierto.revisado_at)]]}
          onClose={() => setAbierto(null)}
          onSave={(v) => cambiar(abierto, v, 'Guardado')}
          actions={[
            abierto.estado !== 'aprobada' && { label: 'Correcto', tone: 'success', onClick: (v) => cambiar(abierto, { ...v, estado: 'aprobada' }, 'Marcado como correcto: Nora lo usa') },
            abierto.estado !== 'corregir' && { label: 'Corregir', onClick: (v) => cambiar(abierto, { ...v, estado: 'corregir' }, 'Marcado para corregir') },
            abierto.estado !== 'descartada' && { label: 'Descartar', onClick: () => cambiar(abierto, { estado: 'descartada' }, 'Descartado') },
            !abierto.respuesta_id && { label: 'Convertir en respuesta aprobada', onClick: (v) => convertir({ ...abierto, ...v }) },
          ].filter(Boolean)}
        />
      )}
    </>
  );
}

function Dudas({ q }) {
  const rows = useMemo(() => q.data || [], [q.data]);
  const [save] = useNoraSave([NK.dudas, NK.respuestas, NK.aprendizajes]);
  const [estado, setEstado] = useState('pendiente');
  const [abierta, setAbierta] = useState(null);
  const filtradas = rows.filter((r) => estado === 'todas' || r.estado === estado);
  const cuenta = (e) => rows.filter((r) => e === 'todas' || r.estado === e).length;
  const cambiar = (r, cambios, ok) => save(async () => { await actualizarDuda(r.id, cambios); setAbierta(null); }, ok);
  const convertir = (r) => save(async () => {
    await convertirEnRespuesta({ origen: 'duda', id: r.id, pregunta: r.pregunta, respuesta: r.respuesta, tramite: r.tramite });
    setAbierta(null);
  }, 'Pasó a Respuestas como borrador');

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorText error={q.error} what="las dudas" />;

  return (
    <>
      <KnowledgeFilters estados={[['pendiente', 'Pendientes', cuenta('pendiente')], ['aprobada', 'Aprobadas', cuenta('aprobada')], ['descartada', 'Descartadas', cuenta('descartada')], ['todas', 'Todas', cuenta('todas')]]}
        estado={estado} onEstado={setEstado} />
      <KnowledgeTable rows={filtradas} onOpen={setAbierta} empty="No hay dudas en este estado."
        columns={[
          { key: 'pregunta', label: 'Pregunta', width: '30%', render: (r) => <Clip className="font-medium">{r.pregunta}</Clip> },
          { key: 'respuesta', label: 'Mejor respuesta', width: '38%', render: (r) => <Clip className="text-text-secondary">{r.respuesta}</Clip> },
          { key: 'tramite', label: 'Trámite', render: (r) => r.tramite || '—' },
          { key: 'veces', label: 'Veces', className: 'tabular-nums', render: (r) => r.veces },
          { key: 'estado', label: 'Estado', render: (r) => <KnowledgeStatusBadge estado={r.estado} /> },
          { key: 'acciones', label: '', render: (r) => (
            <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
              {!r.respuesta_id && <IconBtn title="Convertir en respuesta aprobada" onClick={() => convertir(r)}><ArrowRightCircle size={13} /></IconBtn>}
            </span>
          ) },
        ]} />
      {abierta && (
        <KnowledgeEditor
          title="Duda de cliente"
          header={<KnowledgeStatusBadge estado={abierta.estado} />}
          item={abierta}
          aviso="Aprobar una duda la agrega a la memoria de Nora como ejemplo. Convertirla la lleva a Respuestas como borrador."
          fields={[
            { key: 'pregunta', label: 'Pregunta', type: 'textarea', rows: 2, required: true },
            { key: 'respuesta', label: 'Mejor respuesta', type: 'textarea', rows: 6, required: true },
            { key: 'tramite', label: 'Trámite' },
          ]}
          privacy={['pregunta', 'respuesta']}
          meta={[['Veces preguntada', abierta.veces], ['En ventas', abierta.en_ventas], ['Última vez', fecha(abierta.ultima_vez)]]}
          onClose={() => setAbierta(null)}
          onSave={(v) => cambiar(abierta, v, 'Guardado')}
          actions={[
            abierta.estado !== 'aprobada' && { label: 'Aprobar', tone: 'success', needsValid: true, onClick: (v) => cambiar(abierta, { ...v, estado: 'aprobada' }, 'Duda aprobada') },
            abierta.estado !== 'descartada' && { label: 'Descartar', onClick: () => cambiar(abierta, { estado: 'descartada' }, 'Duda descartada') },
            !abierta.respuesta_id && { label: 'Convertir en respuesta aprobada', onClick: (v) => convertir({ ...abierta, ...v }) },
          ].filter(Boolean)}
        />
      )}
    </>
  );
}

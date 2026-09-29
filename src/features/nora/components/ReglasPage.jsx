import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2, Power, PowerOff } from 'lucide-react';
import { btnPrimaryCls, normalize } from '@features/crm/format';
import { Loading, ErrorText } from '@features/crm/ui';
import { getReglas, crearRegla, actualizarRegla, eliminarRegla } from '../services/noraService';
import { NK, useNoraSave, confirmar } from '../useNora';
import NoraPage from './kit/NoraPage';
import KnowledgeTable, { Clip, fecha } from './kit/KnowledgeTable';
import KnowledgeFilters from './kit/KnowledgeFilters';
import KnowledgeEditor from './kit/KnowledgeEditor';
import { KnowledgeStatusBadge, PriorityBadge, fuenteLabel } from './kit/KnowledgeStatus';
import { IconBtn } from './RespuestasPage';

const PRIORIDADES = [['critica', 'Crítica — Nora la respeta siempre'], ['importante', 'Importante — regla general de atención'], ['normal', 'Normal — preferencia de comunicación']];
const ORDEN = { critica: 0, importante: 1, normal: 2 };
const ORIGENES = ['manual', 'dueno', 'entrenador', 'privacidad', 'historico_anonimizado', 'importacion'];

// Reglas de comportamiento: van siempre enteras a Nora, primero las críticas.
export default function ReglasPage({ focusId, onFocusDone }) {
  const q = useQuery({ queryKey: NK.reglas, queryFn: getReglas });
  const rows = useMemo(() => (q.data || []).slice().sort((a, b) => (ORDEN[a.prioridad] - ORDEN[b.prioridad]) || a.created_at.localeCompare(b.created_at)), [q.data]);
  const [save] = useNoraSave([NK.reglas]);
  const [estado, setEstado] = useState('activas');
  const [prioridad, setPrioridad] = useState('');
  const [origen, setOrigen] = useState('');
  const [texto, setTexto] = useState('');
  const [abierta, setAbierta] = useState(null);

  useEffect(() => {
    if (focusId && rows.length) {
      const r = rows.find((x) => x.id === focusId);
      if (r) { setEstado('todas'); setAbierta(r); }
      onFocusDone?.();
    }
  }, [focusId, rows, onFocusDone]);

  const origenes = useMemo(() => [...new Set([...ORIGENES, ...rows.map((r) => r.origen).filter(Boolean)])], [rows]);
  const filtradas = rows.filter((r) => (estado === 'todas' || (estado === 'activas' ? r.activa : !r.activa))
    && (!prioridad || r.prioridad === prioridad) && (!origen || r.origen === origen)
    && (!texto.trim() || normalize(r.texto).includes(normalize(texto).trim())));
  const cambiar = (r, cambios, ok) => save(async () => {
    const nueva = await actualizarRegla(r.id, cambios);
    setAbierta((a) => (a?.id === r.id ? nueva : a));
  }, ok, { vectores: false });

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorText error={q.error} what="las reglas" />;

  return (
    <NoraPage title="Reglas" description="Controlan el comportamiento de Nora. Las activas se le mandan siempre, en orden de prioridad."
      actions={<button className={btnPrimaryCls} onClick={() => setAbierta({})}><Plus size={14} /> Nueva regla</button>}>
      <KnowledgeFilters
        estados={[['activas', 'Activas', rows.filter((r) => r.activa).length], ['inactivas', 'Inactivas', rows.filter((r) => !r.activa).length], ['todas', 'Todas', rows.length]]}
        estado={estado} onEstado={setEstado}
        selects={[
          { key: 'prioridad', label: 'Prioridad', value: prioridad, onChange: setPrioridad, options: [['', 'Todas las prioridades'], ['critica', 'Crítica'], ['importante', 'Importante'], ['normal', 'Normal']] },
          { key: 'origen', label: 'Origen', value: origen, onChange: setOrigen, options: [['', 'Todos los orígenes'], ...origenes.map((o) => [o, fuenteLabel(o)])] },
        ]}
        texto={texto} onTexto={setTexto} placeholder="Buscar en reglas…" />
      <KnowledgeTable rows={filtradas} onOpen={setAbierta} empty="No hay reglas con estos filtros."
        columns={[
          { key: 'texto', label: 'Regla', width: '52%', render: (r) => <Clip lines={3}>{r.texto}</Clip> },
          { key: 'prioridad', label: 'Prioridad', render: (r) => <PriorityBadge prioridad={r.prioridad} /> },
          { key: 'origen', label: 'Origen', render: (r) => fuenteLabel(r.origen) },
          { key: 'estado', label: 'Estado', render: (r) => <KnowledgeStatusBadge estado={r.activa ? 'activa' : 'inactiva'} /> },
          { key: 'fecha', label: 'Fecha', render: (r) => fecha(r.created_at) },
          { key: 'acciones', label: 'Acciones', render: (r) => (
            <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
              {r.activa
                ? <IconBtn title="Desactivar" onClick={() => cambiar(r, { activa: false }, 'Regla desactivada: Nora deja de seguirla')}><PowerOff size={13} /></IconBtn>
                : <IconBtn title="Activar" onClick={() => cambiar(r, { activa: true }, 'Regla activada: Nora la sigue desde el próximo mensaje')}><Power size={13} /></IconBtn>}
            </span>
          ) },
        ]} />

      {abierta && (
        <KnowledgeEditor
          title={abierta.id ? 'Regla' : 'Nueva regla'}
          header={abierta.id && <KnowledgeStatusBadge estado={abierta.activa ? 'activa' : 'inactiva'} />}
          item={abierta.id ? abierta : { prioridad: 'normal', origen: 'manual', activa: true }}
          fields={[
            { key: 'texto', label: 'Regla', type: 'textarea', rows: 4, required: true, hint: 'Entre 10 y 800 caracteres. Ej.: No prometer una fecha de agendamiento hasta que exista una cita confirmada.' },
            { key: 'prioridad', label: 'Prioridad', type: 'select', options: PRIORIDADES },
            { key: 'origen', label: 'Categoría / origen', suggestions: origenes },
            { key: 'activa', label: 'Activa (Nora la sigue)', type: 'checkbox' },
          ]}
          privacy={['texto']}
          meta={abierta.id ? [['Creada', fecha(abierta.created_at)], ['Modificada', fecha(abierta.updated_at)]] : []}
          onClose={() => setAbierta(null)}
          onSave={async (v) => {
            if ((v.texto || '').length < 10 || v.texto.length > 800) throw new Error('La regla debe tener entre 10 y 800 caracteres');
            if (abierta.id) await cambiar(abierta, v, 'Regla guardada');
            else { await save(() => crearRegla(v), 'Regla creada', { vectores: false }); setAbierta(null); }
          }}
          actions={abierta.id ? [{
            label: 'Eliminar', tone: 'danger', icon: <Trash2 size={13} />, onClick: async () => {
              if (!confirmar('¿Eliminar esta regla? Si solo quieres que Nora no la siga, desactívala.')) return;
              await save(() => eliminarRegla(abierta.id), 'Regla eliminada', { vectores: false });
              setAbierta(null);
            },
          }] : []}
        />
      )}
    </NoraPage>
  );
}

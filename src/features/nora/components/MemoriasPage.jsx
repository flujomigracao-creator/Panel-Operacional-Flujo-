import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2, PowerOff, Power } from 'lucide-react';
import { btnCls, btnPrimaryCls, inputCls, selectCls, normalize } from '@features/crm/format';
import { Loading, ErrorText, Modal } from '@features/crm/ui';
import { getMemorias, crearMemoria, actualizarMemoria, eliminarMemoria, buscarClientes } from '../services/noraService';
import { NK, useNoraSave, TIPOS_MEMORIA, tipoMemoriaLabel, confirmar } from '../useNora';
import NoraPage from './kit/NoraPage';
import KnowledgeTable, { Clip, fecha } from './kit/KnowledgeTable';
import KnowledgeFilters from './kit/KnowledgeFilters';
import KnowledgeEditor from './kit/KnowledgeEditor';
import { KnowledgeStatusBadge, EmbeddingStatus } from './kit/KnowledgeStatus';
import { IconBtn } from './RespuestasPage';

const IMPORTANCIAS = [1, 2, 3, 4, 5].map((n) => [String(n), `${n}/5`]);

// Memorias: lo que Nora recuerda de UN cliente. Nunca se mezcla con el conocimiento general.
export default function MemoriasPage({ focusId, onFocusDone, onNavigateToClient }) {
  const q = useQuery({ queryKey: NK.memorias, queryFn: getMemorias });
  const rows = useMemo(() => q.data || [], [q.data]);
  const [save] = useNoraSave([NK.memorias]);
  const [estado, setEstado] = useState('activas');
  const [tipo, setTipo] = useState('');
  const [texto, setTexto] = useState('');
  const [abierta, setAbierta] = useState(null);
  const [nueva, setNueva] = useState(false);

  useEffect(() => {
    if (focusId && rows.length) {
      const r = rows.find((x) => x.id === focusId);
      if (r) { setEstado('todas'); setAbierta(r); }
      onFocusDone?.();
    }
  }, [focusId, rows, onFocusDone]);

  const s = normalize(texto).trim();
  const filtradas = rows.filter((r) => (estado === 'todas' || (estado === 'activas' ? r.activa : !r.activa)) && (!tipo || r.tipo === tipo)
    && (!s || normalize(`${r.contenido} ${r.clients?.full_name}`).includes(s)));
  const cambiar = (r, cambios, ok) => save(async () => {
    const m = await actualizarMemoria(r.id, cambios);
    setAbierta((a) => (a?.id === r.id ? m : a));
  }, ok);

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorText error={q.error} what="las memorias" />;

  return (
    <NoraPage title="Memorias de clientes" description="Lo que Nora recuerda de cada cliente. Solo se usa con ese mismo cliente y nunca pasa al conocimiento general."
      actions={<button className={btnPrimaryCls} onClick={() => setNueva(true)}><Plus size={14} /> Nueva memoria</button>}>
      <KnowledgeFilters
        estados={[['activas', 'Activas', rows.filter((r) => r.activa).length], ['inactivas', 'Inactivas', rows.filter((r) => !r.activa).length], ['todas', 'Todas', rows.length]]}
        estado={estado} onEstado={setEstado}
        selects={[{ key: 'tipo', label: 'Tipo', value: tipo, onChange: setTipo, options: [['', 'Todos los tipos'], ...TIPOS_MEMORIA] }]}
        texto={texto} onTexto={setTexto} placeholder="Buscar por cliente o texto…" />
      <KnowledgeTable rows={filtradas} onOpen={setAbierta} empty={rows.length ? 'No hay memorias con estos filtros.' : 'Todavía no hay memorias de clientes.'}
        columns={[
          { key: 'cliente', label: 'Cliente', render: (r) => (
            <button className="text-left font-medium text-brand-primary hover:underline" onClick={(e) => { e.stopPropagation(); onNavigateToClient?.(r.client_id); }}>
              {r.clients?.full_name || 'Cliente'}
            </button>
          ) },
          { key: 'contenido', label: 'Memoria', width: '44%', render: (r) => <Clip>{r.contenido}</Clip> },
          { key: 'tipo', label: 'Tipo', render: (r) => tipoMemoriaLabel(r.tipo) },
          { key: 'importancia', label: 'Importancia', render: (r) => `${r.importancia}/5` },
          { key: 'activa', label: 'Estado', render: (r) => <KnowledgeStatusBadge estado={r.activa ? 'activa' : 'inactiva'} /> },
          { key: 'acciones', label: 'Acciones', render: (r) => (
            <span className="flex gap-1" onClick={(e) => e.stopPropagation()}>
              {r.activa
                ? <IconBtn title="Desactivar" onClick={() => cambiar(r, { activa: false }, 'Memoria desactivada')}><PowerOff size={13} /></IconBtn>
                : <IconBtn title="Activar" onClick={() => cambiar(r, { activa: true }, 'Memoria activada')}><Power size={13} /></IconBtn>}
            </span>
          ) },
        ]} />

      {abierta && (
        <KnowledgeEditor
          title={`Memoria · ${abierta.clients?.full_name || 'Cliente'}`}
          header={<KnowledgeStatusBadge estado={abierta.activa ? 'activa' : 'inactiva'} />}
          item={{ ...abierta, importancia: String(abierta.importancia) }}
          aviso="Esta memoria pertenece solo a este cliente. Nora no la usa con otros clientes."
          fields={[
            { key: 'contenido', label: 'Memoria', type: 'textarea', rows: 5, required: true },
            { key: 'tipo', label: 'Tipo', type: 'select', options: TIPOS_MEMORIA },
            { key: 'importancia', label: 'Importancia', type: 'select', options: IMPORTANCIAS },
            { key: 'activa', label: 'Activa (Nora la recuerda)', type: 'checkbox' },
          ]}
          meta={[['Creada', fecha(abierta.created_at)], ['Modificada', fecha(abierta.updated_at)], ['Búsqueda', <EmbeddingStatus key="e" listo={abierta.tiene_embedding} />]]}
          onClose={() => setAbierta(null)}
          onSave={(v) => cambiar(abierta, { ...v, importancia: Number(v.importancia) }, 'Memoria guardada')}
          actions={[{
            label: 'Eliminar', tone: 'danger', icon: <Trash2 size={13} />, onClick: async () => {
              if (!confirmar('¿Eliminar esta memoria del cliente?')) return;
              await save(() => eliminarMemoria(abierta.id), 'Memoria eliminada', { vectores: false });
              setAbierta(null);
            },
          }]}
        />
      )}
      {nueva && <NuevaMemoria onClose={() => setNueva(false)} onCreate={(v) => save(() => crearMemoria(v), 'Memoria guardada').then(() => setNueva(false))} />}
    </NoraPage>
  );
}

function NuevaMemoria({ onClose, onCreate }) {
  const [busqueda, setBusqueda] = useState('');
  const [cliente, setCliente] = useState(null);
  const [v, setV] = useState({ tipo: 'client_fact', importancia: '3', contenido: '' });
  const [busy, setBusy] = useState(false);
  const clientes = useQuery({ queryKey: ['nora', 'buscar_clientes', busqueda], queryFn: () => buscarClientes(busqueda), enabled: busqueda.trim().length >= 2 && !cliente });
  const crear = async () => {
    setBusy(true);
    try { await onCreate({ ...v, client_id: cliente.id, importancia: Number(v.importancia) }); } catch { /* avisado */ } finally { setBusy(false); }
  };
  return (
    <Modal title="Nueva memoria de cliente" onClose={onClose} width="max-w-[460px]">
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Cliente *</label>
          {cliente ? (
            <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-[13px]">
              <span className="flex-1">{cliente.full_name}</span>
              <button className="text-xs text-brand-primary" onClick={() => setCliente(null)}>Cambiar</button>
            </div>
          ) : (
            <>
              <input className={inputCls} placeholder="Buscar cliente por nombre…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} autoFocus />
              {(clientes.data || []).length > 0 && (
                <ul className="mt-1 max-h-40 overflow-y-auto rounded-md border border-border">
                  {clientes.data.map((c) => (
                    <li key={c.id}><button className="w-full px-2 py-1.5 text-left text-[13px] hover:bg-bg-elevated" onClick={() => setCliente(c)}>{c.full_name}</button></li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Tipo</label>
            <select className={selectCls} value={v.tipo} onChange={(e) => setV({ ...v, tipo: e.target.value })}>
              {TIPOS_MEMORIA.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-secondary">Importancia</label>
            <select className={selectCls} value={v.importancia} onChange={(e) => setV({ ...v, importancia: e.target.value })}>
              {IMPORTANCIAS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Memoria *</label>
          <textarea className={inputCls} rows={4} placeholder="Ej.: Está realizando la renovación del RNM." value={v.contenido} onChange={(e) => setV({ ...v, contenido: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2">
          <button className={btnCls} onClick={onClose}>Cancelar</button>
          <button className={btnPrimaryCls} disabled={busy || !cliente || !v.contenido.trim()} onClick={crear}>Guardar</button>
        </div>
      </div>
    </Modal>
  );
}

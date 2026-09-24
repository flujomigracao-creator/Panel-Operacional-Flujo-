import React, { useState, useCallback, useEffect } from 'react';
import { ReactFlow, applyNodeChanges, applyEdgeChanges, addEdge, Background, Controls, MiniMap } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { nodeTypes } from './CustomNodes';
import { getAiWorkflows, createAiWorkflow, updateAiWorkflow, deleteAiWorkflow } from '../../../services/workflowService';
import { getPipelines, getPipelineStages } from '../../../services/pipelineService';
import { getEtiquetas, getOperarios } from '../../../services/tramitesService';
import toast from 'react-hot-toast';
import { Bot, Plus, Trash2, Edit2, ChevronLeft, Loader2 } from 'lucide-react';
import Button from '../../ui/Button';
import Select from '../../ui/Select';

// Custom Edge style to match dark theme
const edgeOptions = {
  style: { stroke: '#4b5563', strokeWidth: 2 },
  animated: true,
};

const initialNodes = [
  { id: 'start', type: 'start', position: { x: 50, y: 150 }, data: { label: 'Iniciar Salesbot' } },
  { id: 'add', type: 'addStep', position: { x: 350, y: 155 }, data: {} },
];

const initialEdges = [
  { id: 'e-start-add', source: 'start', target: 'add', ...edgeOptions }
];

export default function AiBotBuilder() {
  const [view, setView] = useState('list'); // 'list' | 'editor'
  const [workflows, setWorkflows] = useState([]);
  const [currentWorkflow, setCurrentWorkflow] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Editor State
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const [workflowName, setWorkflowName] = useState('Mi Nuevo Bot');
  const [selectedNodeId, setSelectedNodeId] = useState(null);

  // Opciones para configurar los targets reales de los nodos de acción/etiqueta
  // (antes solo guardaban texto libre, sin ID vinculado a ninguna tabla real).
  const [etiquetas, setEtiquetas] = useState([]);
  const [operarios, setOperarios] = useState([]);
  const [stageGroups, setStageGroups] = useState([]); // [{ label: pipelineNombre, options: [{value, label}] }]

  useEffect(() => {
    loadWorkflows();
    loadTargetOptions();
  }, []);

  const loadTargetOptions = async () => {
    try {
      const [etiqs, ops, pipelines] = await Promise.all([getEtiquetas(), getOperarios(), getPipelines()]);
      setEtiquetas(etiqs);
      setOperarios(ops);
      const groups = await Promise.all(pipelines.map(async (pipeline) => ({
        label: pipeline.nombre,
        options: (await getPipelineStages(pipeline.id)).map((s) => ({ value: s.id, label: s.nombre })),
      })));
      setStageGroups(groups.filter((g) => g.options.length > 0));
    } catch (err) {
      console.error('Error cargando opciones de configuración del bot:', err);
    }
  };

  const loadWorkflows = async () => {
    setLoading(true);
    try {
      const data = await getAiWorkflows();
      setWorkflows(data || []);
    } catch (err) {
      console.error(err);
      toast.error('Error al cargar bots');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNew = () => {
    setCurrentWorkflow(null);
    setWorkflowName('Bot Nuevo');
    setNodes(initialNodes);
    setEdges(initialEdges);
    setView('editor');
  };

  const handleEdit = (wf) => {
    setCurrentWorkflow(wf);
    setWorkflowName(wf.nombre);
    setNodes(wf.nodes?.length > 0 ? wf.nodes : initialNodes);
    setEdges(wf.edges?.length > 0 ? wf.edges : initialEdges);
    setView('editor');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Seguro que quieres eliminar este bot? Las automatizaciones que lo usen dejarán de funcionar.')) return;
    try {
      await deleteAiWorkflow(id);
      setWorkflows(prev => prev.filter(w => w.id !== id));
      toast.success('Bot eliminado');
    } catch (_err) {
      toast.error('No se pudo eliminar');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const wfData = {
        nombre: workflowName,
        nodes: nodes,
        edges: edges,
        activo: true
      };

      if (currentWorkflow) {
        await updateAiWorkflow(currentWorkflow.id, wfData);
        toast.success('Bot actualizado correctamente');
      } else {
        const created = await createAiWorkflow(wfData);
        setCurrentWorkflow(created);
        toast.success('Bot creado correctamente');
      }
      // Volver a cargar la lista por detrás
      loadWorkflows();
    } catch (err) {
      console.error(err);
      toast.error('Error al guardar el bot');
    } finally {
      setSaving(false);
    }
  };

  const onNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );
  const onEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );
  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, ...edgeOptions }, eds)),
    []
  );

  const handleAddNode = (type) => {
    setNodes((nds) => {
      const addNode = nds.find(n => n.id === 'add');
      const newId = `node-${Date.now()}`;
      
      const newNode = {
        id: newId,
        type: type,
        position: { x: addNode.position.x, y: addNode.position.y - 10 },
        data: { text: type === 'message' ? 'Nuevo mensaje...' : 'Configurar...' }
      };

      const movedAddNode = {
        ...addNode,
        position: { x: addNode.position.x + 350, y: addNode.position.y }
      };

      setEdges(eds => {
        const sourceEdge = eds.find(e => e.target === 'add');
        const newEdges = eds.filter(e => e.target !== 'add');
        
        if (sourceEdge) {
          newEdges.push({ ...sourceEdge, target: newId });
        }
        
        newEdges.push({
          id: `e-${newId}-add`,
          source: newId,
          target: 'add',
          ...edgeOptions
        });
        
        return newEdges;
      });

      return [...nds.filter(n => n.id !== 'add'), newNode, movedAddNode];
    });
  };

  const onNodeClick = useCallback((event, node) => {
    if (node.id !== 'add' && node.id !== 'start') {
      setSelectedNodeId(node.id);
    } else {
      setSelectedNodeId(null);
    }
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const updateNodeData = (id, newText) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === id) {
          return { ...n, data: { ...n.data, text: newText } };
        }
        return n;
      })
    );
  };

  // Setter genérico para nodos cuyo target real (etiqueta_id, etapa_destino_id,
  // operario_nombre, webhook_url) es distinto del texto que se muestra en el
  // lienzo — "text" queda como la etiqueta legible, el resto son los IDs que
  // runStageAutomations necesita para ejecutar el nodo de verdad.
  const updateNodeFields = (id, patch) => {
    setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
  };

  const updateNodeActionType = (id, actionType, text) => {
    // Cambiar de tipo de acción invalida cualquier target ya elegido
    // (etapa/etiqueta/operario/webhook pertenecen a acciones distintas).
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === id) {
          return { ...n, data: { actionType, text } };
        }
        return n;
      })
    );
  };

  const nodesWithData = nodes.map(n => {
    if (n.id === 'add') {
      return { ...n, data: { ...n.data, onAdd: handleAddNode } };
    }
    return n;
  });

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  if (view === 'list') {
    return (
      <div className="flex h-full flex-col p-6 max-w-5xl mx-auto w-full">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 style={{ font: 'var(--font-page-title)' }} className="text-2xl font-bold">Mis Bots (Workflows)</h1>
            <p className="text-text-secondary mt-1 text-sm">Crea bots visuales y luego vincúlalos en las automatizaciones del Pipeline.</p>
          </div>
          <Button onClick={handleCreateNew} variant="primary" className="flex items-center gap-2">
            <Plus size={16} /> Nuevo Bot
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-20">
            <Loader2 className="animate-spin text-brand-primary" size={32} />
          </div>
        ) : workflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 border border-dashed border-border rounded-xl bg-bg-surface text-center">
            <div className="w-16 h-16 bg-brand-primary/10 rounded-full flex items-center justify-center mb-4 text-brand-primary">
              <Bot size={32} />
            </div>
            <h3 className="text-lg font-semibold text-text-primary mb-2">No tienes ningún Bot</h3>
            <p className="text-text-secondary max-w-[24rem] mb-6">Crea tu primer flujo conversacional o automatizado para usarlo en el pipeline.</p>
            <Button onClick={handleCreateNew} variant="primary">Crear mi primer Bot</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workflows.map(wf => (
              <div key={wf.id} className="border border-border bg-bg-surface rounded-xl p-5 shadow-sm hover:border-brand-primary/50 transition-colors flex flex-col h-full">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 bg-brand-primary/10 rounded-lg flex items-center justify-center text-brand-primary">
                    <Bot size={20} />
                  </div>
                  <span className="text-xs font-medium px-2 py-1 bg-success/10 text-success rounded-full">Activo</span>
                </div>
                <h3 className="text-base font-semibold text-text-primary mb-1">{wf.nombre}</h3>
                <p className="text-sm text-text-secondary line-clamp-2 mb-4 flex-1">
                  {wf.descripcion || 'Flujo de trabajo sin descripción.'}
                </p>
                
                <div className="flex items-center gap-2 mt-auto pt-4 border-t border-border">
                  <Button variant="secondary" size="sm" onClick={() => handleEdit(wf)} className="flex-1 justify-center">
                    <Edit2 size={14} className="mr-2" /> Editar
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(wf.id)} className="text-text-muted hover:text-danger hover:bg-danger/10 px-2">
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // EDITOR VIEW
  return (
    <div style={{ width: '100%', height: '100%', background: '#0f172a', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 20px', background: '#1e293b', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="flex items-center gap-4">
          <button onClick={() => setView('list')} className="text-text-muted hover:text-white transition-colors">
            <ChevronLeft size={20} />
          </button>
          <input 
            type="text" 
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            className="bg-transparent border-none text-white text-lg font-semibold outline-none focus:ring-1 focus:ring-brand-primary/50 rounded px-2 py-1"
          />
        </div>
        <button 
          onClick={handleSave} 
          disabled={saving}
          style={{ padding: '8px 16px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', opacity: saving ? 0.7 : 1 }}
        >
          {saving && <Loader2 size={16} className="animate-spin" />}
          {saving ? 'Guardando...' : 'Guardar Bot'}
        </button>
      </div>
      
      <div style={{ flex: 1, width: '100%', display: 'flex' }}>
        <div style={{ flex: 1, height: '100%' }}>
          <ReactFlow
            nodes={nodesWithData}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
          >
            <Background color="#334155" gap={20} size={1} />
            <Controls style={{ background: '#1e293b', fill: 'white', color: 'white' }} />
            <MiniMap nodeStrokeColor="#4b5563" nodeColor="#1e293b" maskColor="rgba(15, 23, 42, 0.7)" style={{ background: '#0f172a' }} />
          </ReactFlow>
        </div>
        
        {/* Sidebar de Configuración */}
        {selectedNode && (
          <div style={{ width: '320px', background: '#1e293b', borderLeft: '1px solid #334155', padding: '20px', color: 'white', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
            <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, borderBottom: '1px solid #334155', paddingBottom: '12px' }}>
              Configurar {
                selectedNode.type === 'message' ? 'Mensaje' : 
                selectedNode.type === 'condition' ? 'Condición' : 
                selectedNode.type === 'action' ? 'Acción' :
                selectedNode.type === 'tag' ? 'Etiqueta' : 'Pausa'
              }
            </h4>
            
            {/* Renderizar campos dependiendo del tipo de nodo */}
            
            {selectedNode.type === 'message' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.85rem', color: '#9ca3af', fontWeight: 500 }}>Texto del Mensaje</label>
                <textarea 
                  value={selectedNode.data.text || ''}
                  onChange={(e) => updateNodeData(selectedNode.id, e.target.value)}
                  style={{ 
                    width: '100%', minHeight: '100px', background: '#0f172a', border: '1px solid #334155', 
                    borderRadius: '6px', color: 'white', padding: '10px', fontSize: '0.9rem', resize: 'vertical' 
                  }}
                  placeholder="Escribe el mensaje que enviará el bot..."
                />
              </div>
            )}

            {selectedNode.type === 'action' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.85rem', color: '#9ca3af', fontWeight: 500 }}>Seleccionar Acción</label>
                <select
                  value={selectedNode.data.actionType || ''}
                  onChange={(e) => {
                    updateNodeActionType(selectedNode.id, e.target.value, e.target.options[e.target.selectedIndex].text);
                  }}
                  style={{
                    width: '100%', background: '#0f172a', border: '1px solid #334155',
                    borderRadius: '6px', color: 'white', padding: '10px', fontSize: '0.9rem'
                  }}
                >
                  <option value="" disabled>Elige una acción...</option>
                  <option value="move_pipeline">Mover Etapa en Pipeline</option>
                  <option value="add_tag">Añadir Etiqueta</option>
                  <option value="assign_agent">Asignar a Operario Humano</option>
                  <option value="send_webhook">Enviar Webhook</option>
                  <option value="create_document">Generar Documento PDF</option>
                </select>

                {selectedNode.data.actionType === 'move_pipeline' && (
                  <div style={{ marginTop: '10px' }}>
                    <label style={{ fontSize: '0.85rem', color: '#9ca3af', fontWeight: 500 }}>Etapa de destino</label>
                    <div style={{ marginTop: '6px' }}>
                      <Select
                        value={selectedNode.data.etapa_destino_id || ''}
                        onChange={(e) => {
                          const label = e.target.options[e.target.selectedIndex].text;
                          updateNodeFields(selectedNode.id, { etapa_destino_id: e.target.value, text: `Mover a: ${label}` });
                        }}
                        placeholder="Selecciona la etapa..."
                        groups={stageGroups}
                      />
                    </div>
                    {stageGroups.length === 0 && (
                      <p style={{ fontSize: '0.75rem', color: '#60a5fa', marginTop: '6px' }}>No hay pipelines/etapas configuradas todavía.</p>
                    )}
                  </div>
                )}

                {selectedNode.data.actionType === 'add_tag' && (
                  <div style={{ marginTop: '10px' }}>
                    <label style={{ fontSize: '0.85rem', color: '#9ca3af', fontWeight: 500 }}>Etiqueta a añadir</label>
                    <div style={{ marginTop: '6px' }}>
                      <Select
                        value={selectedNode.data.etiqueta_id || ''}
                        onChange={(e) => {
                          const label = e.target.options[e.target.selectedIndex].text;
                          updateNodeFields(selectedNode.id, { etiqueta_id: e.target.value, text: `Añadir etiqueta: ${label}` });
                        }}
                        placeholder="Selecciona la etiqueta..."
                        options={etiquetas.map((e) => ({ value: e.id, label: e.nombre }))}
                      />
                    </div>
                    {etiquetas.length === 0 && (
                      <p style={{ fontSize: '0.75rem', color: '#60a5fa', marginTop: '6px' }}>No hay etiquetas creadas todavía.</p>
                    )}
                  </div>
                )}

                {selectedNode.data.actionType === 'assign_agent' && (
                  <div style={{ marginTop: '10px' }}>
                    <label style={{ fontSize: '0.85rem', color: '#9ca3af', fontWeight: 500 }}>Operario responsable</label>
                    <div style={{ marginTop: '6px' }}>
                      <Select
                        value={selectedNode.data.operario_nombre || ''}
                        onChange={(e) => {
                          updateNodeFields(selectedNode.id, { operario_nombre: e.target.value, text: `Asignar a: ${e.target.value}` });
                        }}
                        placeholder="Selecciona el operario..."
                        options={operarios.map((o) => ({ value: o.nombre, label: o.nombre }))}
                      />
                    </div>
                    {operarios.length === 0 && (
                      <p style={{ fontSize: '0.75rem', color: '#60a5fa', marginTop: '6px' }}>No hay operarios activos todavía.</p>
                    )}
                  </div>
                )}

                {selectedNode.data.actionType === 'send_webhook' && (
                  <div style={{ marginTop: '10px' }}>
                    <label style={{ fontSize: '0.85rem', color: '#9ca3af', fontWeight: 500 }}>URL del Webhook</label>
                    <input
                      type="url"
                      value={selectedNode.data.webhook_url || ''}
                      onChange={(e) => updateNodeFields(selectedNode.id, { webhook_url: e.target.value, text: e.target.value })}
                      placeholder="https://hook.us1.make.com/..."
                      style={{
                        width: '100%', background: '#0f172a', border: '1px solid #334155',
                        borderRadius: '6px', color: 'white', padding: '10px', fontSize: '0.9rem', marginTop: '6px'
                      }}
                    />
                  </div>
                )}

                {selectedNode.data.actionType === 'create_document' && (
                  <p style={{ fontSize: '0.8rem', color: '#f59e0b', background: 'rgba(245, 158, 11, 0.1)', padding: '10px', borderRadius: '6px', marginTop: '10px' }}>
                    Próximamente: esta acción aún no se ejecuta automáticamente.
                  </p>
                )}

                <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '10px' }}>
                  El bot ejecutará esta acción silenciosamente en segundo plano.
                </p>
              </div>
            )}

            {selectedNode.type === 'condition' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '0.85rem', color: '#9ca3af', fontWeight: 500 }}>Si el cliente dice / Variable</label>
                  <input 
                    type="text"
                    value={selectedNode.data.text || ''}
                    onChange={(e) => updateNodeData(selectedNode.id, e.target.value)}
                    style={{ 
                      width: '100%', background: '#0f172a', border: '1px solid #334155', 
                      borderRadius: '6px', color: 'white', padding: '10px', fontSize: '0.9rem', marginTop: '4px' 
                    }}
                    placeholder="Ej. 'Sí', 'No', o 'Quiero info'"
                  />
                </div>
                <div style={{ fontSize: '0.8rem', color: '#60a5fa', background: 'rgba(59, 130, 246, 0.1)', padding: '10px', borderRadius: '6px' }}>
                  * Más adelante añadiremos un botón para crear diferentes caminos (Ej. Camino 1, Camino 2) desde este nodo.
                </div>
              </div>
            )}

            {selectedNode.type === 'tag' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.85rem', color: '#9ca3af', fontWeight: 500 }}>Etiqueta a añadir</label>
                <Select
                  value={selectedNode.data.etiqueta_id || ''}
                  onChange={(e) => {
                    const label = e.target.options[e.target.selectedIndex].text;
                    updateNodeFields(selectedNode.id, { etiqueta_id: e.target.value, text: label });
                  }}
                  placeholder="Selecciona la etiqueta..."
                  options={etiquetas.map((e) => ({ value: e.id, label: e.nombre }))}
                />
                {etiquetas.length === 0 && (
                  <p style={{ fontSize: '0.75rem', color: '#60a5fa' }}>No hay etiquetas creadas todavía.</p>
                )}
              </div>
            )}

            {selectedNode.type === 'pause' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.85rem', color: '#9ca3af', fontWeight: 500 }}>Tiempo de espera (minutos)</label>
                <input 
                  type="number"
                  value={selectedNode.data.text || ''}
                  onChange={(e) => updateNodeData(selectedNode.id, e.target.value)}
                  style={{ 
                    width: '100%', background: '#0f172a', border: '1px solid #334155', 
                    borderRadius: '6px', color: 'white', padding: '10px', fontSize: '0.9rem' 
                  }}
                  placeholder="60"
                />
              </div>
            )}
          </div>
        )}
      </div>
      
      <style>{`
        /* Overrides for React Flow controls dark theme */
        .react-flow__controls-button {
          background: #1e293b !important;
          border-bottom: 1px solid #334155 !important;
          fill: #cbd5e1 !important;
        }
        .react-flow__controls-button:hover {
          background: #334155 !important;
        }
      `}</style>
    </div>
  );
}

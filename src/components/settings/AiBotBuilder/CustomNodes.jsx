import React, { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Play, MessageCircle, GitBranch, Plus, Sparkles, Tags, MessageSquare, Clock } from 'lucide-react';

const nodeStyle = {
  background: '#1a1f2b', // Dark blue-grey matching Kommo
  border: '1px solid #2a3441',
  borderRadius: '8px',
  color: 'white',
  padding: '0',
  width: '280px',
  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
  fontSize: '14px',
};

// 1. Nodo de Inicio (Start Node)
export const StartNode = ({ data }) => {
  return (
    <div style={{ ...nodeStyle, width: '200px' }}>
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '8px', borderLeft: '3px solid #10b981', borderRadius: '8px' }}>
        <Play size={16} color="#10b981" />
        <span style={{ fontWeight: 600 }}>{data.label || 'Iniciar Salesbot'}</span>
      </div>
      <Handle type="source" position={Position.Right} style={{ background: '#3b82f6', width: '8px', height: '8px' }} />
    </div>
  );
};

// 2. Nodo de Mensaje
export const MessageNode = ({ data }) => {
  return (
    <div style={nodeStyle}>
      <Handle type="target" position={Position.Left} style={{ background: '#3b82f6', width: '8px', height: '8px' }} />
      
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #2a3441', display: 'flex', alignItems: 'center', gap: '8px', background: '#202736', borderTopLeftRadius: '8px', borderTopRightRadius: '8px' }}>
        <MessageSquare size={16} color="#3b82f6" />
        <span style={{ fontWeight: 600 }}>Mensaje</span>
      </div>
      <div style={{ padding: '12px 16px', fontSize: '13px', color: '#9ca3af' }}>
        {data.text ? data.text.substring(0, 50) + (data.text.length > 50 ? '...' : '') : 'Haz clic para configurar el mensaje...'}
      </div>
      
      <Handle type="source" position={Position.Right} style={{ background: '#3b82f6', width: '8px', height: '8px' }} />
    </div>
  );
};

// 3. Nodo Interactivo (Add Step Node)
export const AddStepNode = ({ data }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <Handle type="target" position={Position.Left} style={{ background: '#3b82f6', width: '8px', height: '8px' }} />
      
      <div style={{ 
        width: '40px', height: '40px', background: '#1a1f2b', border: '1px dashed #4b5563', borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        color: '#9ca3af', transition: 'all 0.2s ease', 
        ...(isOpen ? { borderColor: '#3b82f6', color: '#3b82f6', background: '#1e293b' } : {})
      }}
      onClick={() => setIsOpen(!isOpen)}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.color = '#3b82f6'; }}
      onMouseLeave={(e) => { if (!isOpen) { e.currentTarget.style.borderColor = '#4b5563'; e.currentTarget.style.color = '#9ca3af'; } }}
      >
        <Plus size={20} />
      </div>

      {isOpen && (
        <div style={{
          position: 'absolute', top: '-10px', left: '50px', width: '250px',
          background: '#1a1f2b', border: '1px solid #2a3441', borderRadius: '8px',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)', zIndex: 1000
        }}>
          <div style={{ padding: '12px 16px', fontSize: '12px', color: '#9ca3af', fontWeight: 600, borderBottom: '1px solid #2a3441' }}>
            Agrega el siguiente paso
          </div>
          <div style={{ padding: '8px' }}>
            <div className="step-option" onClick={() => { setIsOpen(false); data.onAdd('message'); }}>
              <MessageCircle size={16} color="#3b82f6" /> Mensaje
            </div>
            <div className="step-option" onClick={() => { setIsOpen(false); data.onAdd('condition'); }}>
              <GitBranch size={16} color="#a855f7" /> Condición
            </div>
            <div className="step-option" onClick={() => { setIsOpen(false); data.onAdd('action'); }}>
              <Sparkles size={16} color="#10b981" /> Acciones
            </div>
            <div className="step-option" onClick={() => { setIsOpen(false); data.onAdd('tag'); }}>
              <Tags size={16} color="#f59e0b" /> Añadir Etiqueta
            </div>
            <div className="step-option" onClick={() => { setIsOpen(false); data.onAdd('pause'); }}>
              <Clock size={16} color="#ef4444" /> Pausa
            </div>
          </div>
          
          <style>{`
            .step-option {
              display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 6px; cursor: pointer;
              font-size: 13px; color: #d1d5db; transition: background 0.2s ease;
            }
            .step-option:hover { background: #2a3441; color: white; }
          `}</style>
        </div>
      )}
    </div>
  );
};

// 4. Nodo de Condición
export const ConditionNode = ({ data }) => {
  return (
    <div style={nodeStyle}>
      <Handle type="target" position={Position.Left} style={{ background: '#a855f7', width: '8px', height: '8px' }} />
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #2a3441', display: 'flex', alignItems: 'center', gap: '8px', background: '#202736', borderTopLeftRadius: '8px', borderTopRightRadius: '8px' }}>
        <GitBranch size={16} color="#a855f7" />
        <span style={{ fontWeight: 600 }}>Condición</span>
      </div>
      <div style={{ padding: '12px 16px', fontSize: '13px', color: '#9ca3af' }}>
        {data.text || 'Configurar condición...'}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: '#a855f7', width: '8px', height: '8px' }} />
    </div>
  );
};

// 5. Nodo de Acción
export const ActionNode = ({ data }) => {
  return (
    <div style={nodeStyle}>
      <Handle type="target" position={Position.Left} style={{ background: '#10b981', width: '8px', height: '8px' }} />
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #2a3441', display: 'flex', alignItems: 'center', gap: '8px', background: '#202736', borderTopLeftRadius: '8px', borderTopRightRadius: '8px' }}>
        <Sparkles size={16} color="#10b981" />
        <span style={{ fontWeight: 600 }}>Acción</span>
      </div>
      <div style={{ padding: '12px 16px', fontSize: '13px', color: '#9ca3af' }}>
        {data.text || 'Seleccionar acción...'}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: '#10b981', width: '8px', height: '8px' }} />
    </div>
  );
};

// 6. Nodo de Etiqueta
export const TagNode = ({ data }) => {
  return (
    <div style={nodeStyle}>
      <Handle type="target" position={Position.Left} style={{ background: '#f59e0b', width: '8px', height: '8px' }} />
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #2a3441', display: 'flex', alignItems: 'center', gap: '8px', background: '#202736', borderTopLeftRadius: '8px', borderTopRightRadius: '8px' }}>
        <Tags size={16} color="#f59e0b" />
        <span style={{ fontWeight: 600 }}>Añadir Etiqueta</span>
      </div>
      <div style={{ padding: '12px 16px', fontSize: '13px', color: '#9ca3af' }}>
        {data.text || 'Seleccionar etiqueta...'}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: '#f59e0b', width: '8px', height: '8px' }} />
    </div>
  );
};

// 7. Nodo de Pausa
export const PauseNode = ({ data }) => {
  return (
    <div style={nodeStyle}>
      <Handle type="target" position={Position.Left} style={{ background: '#ef4444', width: '8px', height: '8px' }} />
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #2a3441', display: 'flex', alignItems: 'center', gap: '8px', background: '#202736', borderTopLeftRadius: '8px', borderTopRightRadius: '8px' }}>
        <Clock size={16} color="#ef4444" />
        <span style={{ fontWeight: 600 }}>Pausa</span>
      </div>
      <div style={{ padding: '12px 16px', fontSize: '13px', color: '#9ca3af' }}>
        {data.text || 'Configurar tiempo...'}
      </div>
      <Handle type="source" position={Position.Right} style={{ background: '#ef4444', width: '8px', height: '8px' }} />
    </div>
  );
};

export const nodeTypes = {
  start: StartNode,
  message: MessageNode,
  condition: ConditionNode,
  action: ActionNode,
  tag: TagNode,
  pause: PauseNode,
  addStep: AddStepNode,
};

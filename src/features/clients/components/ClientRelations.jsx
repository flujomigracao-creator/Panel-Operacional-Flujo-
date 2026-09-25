import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { ExternalLink, Trash2 } from 'lucide-react';
import ClientPicker from './ClientPicker';
import { RELATION_TYPES, addRelation, removeRelation, createQuickClient } from '../services/clientDetailService';

// Tipos que se eligen al crear (los invertidos, como "padre_o_madre", solo se muestran).
const TIPOS_ELEGIBLES = ['conyuge', 'hijo', 'padre', 'madre', 'hermano', 'abuelo', 'nieto', 'tio', 'sobrino', 'primo', 'otro_familiar', 'representante', 'otro'];

/**
 * Relaciones del cliente (familia, representante…). Se guardan una vez y se
 * ven desde ambos lados.
 */
export default function ClientRelations({ client, relaciones, organizationId, onChanged, onNavigateToClient }) {
  const [tipo, setTipo] = useState('conyuge');
  const [busy, setBusy] = useState(false);

  const vincular = async (otro) => {
    setBusy(true);
    try {
      await addRelation(organizationId, client.id, otro.id, tipo);
      toast.success(`${otro.full_name} agregado como ${RELATION_TYPES[tipo].toLowerCase()}`);
      onChanged();
    } catch (err) {
      console.error(err);
      toast.error(String(err.message || '').includes('duplicate') ? 'Ya están relacionados.' : 'No se pudo guardar la relación.');
    } finally {
      setBusy(false);
    }
  };

  const crearYVincular = async (nombre) => {
    setBusy(true);
    try {
      const nuevo = await createQuickClient(organizationId, nombre);
      await vincular(nuevo);
    } catch (err) {
      console.error(err);
      toast.error('No se pudo crear el cliente.');
      setBusy(false);
    }
  };

  const quitar = async (r) => {
    if (!window.confirm(`¿Quitar la relación con ${r.cliente?.full_name || 'este cliente'}?`)) return;
    try {
      await removeRelation(r.id);
      onChanged();
    } catch (err) {
      console.error(err);
      toast.error('No se pudo quitar.');
    }
  };

  return (
    <div className="space-y-3">
      {relaciones.length === 0 ? (
        <p className="text-sm text-chrome-text-muted">Sin relaciones. Agrega familiares o representantes para ver sus trámites juntos.</p>
      ) : (
        <ul className="space-y-1.5">
          {relaciones.map(r => (
            <li key={r.id + r.con_client_id} className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-chrome-bg-raised">
              <span className="w-24 shrink-0 text-xs text-chrome-text-muted">{RELATION_TYPES[r.tipo] || r.tipo}</span>
              <button
                onClick={() => onNavigateToClient?.(r.con_client_id, r.cliente?.full_name)}
                className="inline-flex min-w-0 items-center gap-1 truncate text-sm text-chrome-text-active hover:underline"
                title="Abrir ficha"
              >
                {r.cliente?.full_name || 'Cliente'} <ExternalLink size={11} className="shrink-0 text-chrome-text-muted" />
              </button>
              {r.cliente?.phone && <span className="text-xs text-chrome-text-muted">{r.cliente.phone}</span>}
              <button onClick={() => quitar(r)} className="ml-auto rounded p-1 text-chrome-text-muted opacity-0 hover:text-red-400 group-hover:opacity-100" title="Quitar relación">
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className={`space-y-2 rounded-lg border border-dashed border-chrome-border p-2 ${busy ? 'pointer-events-none opacity-60' : ''}`}>
        <div className="flex items-center gap-2 text-xs text-chrome-text-muted">
          Agregar como
          <select value={tipo} onChange={e => setTipo(e.target.value)} className="rounded-md border border-chrome-border bg-chrome-bg px-2 py-1 text-xs text-chrome-text-active">
            {TIPOS_ELEGIBLES.map(t => <option key={t} value={t}>{RELATION_TYPES[t]}</option>)}
          </select>
          de {client.full_name}:
        </div>
        <ClientPicker
          excludeIds={[client.id, ...relaciones.map(r => r.con_client_id)]}
          onPick={vincular}
          onCreate={crearYVincular}
        />
      </div>
    </div>
  );
}

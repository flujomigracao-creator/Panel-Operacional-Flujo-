import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { Trash2, Users } from 'lucide-react';
import ClientPicker from './ClientPicker';
import { PARTICIPANT_ROLES, addParticipant, removeParticipant, createQuickClient } from '../services/clientDetailService';

const ROLES_ELEGIBLES = ['dependiente', 'conyuge', 'hijo', 'chamante', 'representante', 'otro'];

/**
 * Personas incluidas en un trámite además del titular (ej. reunión familiar:
 * titular + cónyuge + hijos). El trámite aparece en la ficha de cada una.
 */
export default function TramiteParticipants({ tramite, relaciones, organizationId, onChanged, onNavigateToClient }) {
  const [adding, setAdding] = useState(false);
  const [rol, setRol] = useState('dependiente');

  const yaIncluidos = [tramite.client_id, ...tramite.participantes.map(p => p.client_id)];
  // Sugerencias rápidas: familiares del cliente que todavía no están en el trámite
  const sugeridos = (relaciones || []).filter(r => r.cliente && !yaIncluidos.includes(r.con_client_id));

  const agregar = async (cliente) => {
    try {
      await addParticipant(organizationId, tramite.id, cliente.id, rol);
      toast.success(`${cliente.full_name} agregado al trámite`);
      setAdding(false);
      onChanged();
    } catch (err) {
      console.error(err);
      toast.error('No se pudo agregar.');
    }
  };

  const crearYAgregar = async (nombre) => {
    try {
      await agregar(await createQuickClient(organizationId, nombre));
    } catch (err) {
      console.error(err);
      toast.error('No se pudo crear el cliente.');
    }
  };

  const quitar = async (p) => {
    if (!window.confirm(`¿Quitar a ${p.clients?.full_name} de este trámite?`)) return;
    try {
      await removeParticipant(p.id);
      onChanged();
    } catch (err) {
      console.error(err);
      toast.error('No se pudo quitar.');
    }
  };

  return (
    <div className="mt-3 border-t border-chrome-border pt-2">
      <div className="mb-1 flex items-center justify-between">
        <p className="flex items-center gap-1 text-xs font-medium text-chrome-text-muted"><Users size={12} /> Personas en el trámite</p>
        {!adding && (
          <button onClick={() => setAdding(true)} className="text-xs text-sky-400 hover:underline">+ Agregar persona</button>
        )}
      </div>

      <ul className="space-y-1 text-sm">
        <li className="flex items-center gap-2">
          <span className="w-24 shrink-0 text-xs text-chrome-text-muted">Titular</span>
          {tramite.esTitular
            ? <span className="text-chrome-text-active">Este cliente</span>
            : <button onClick={() => onNavigateToClient?.(tramite.client_id, tramite.titular?.full_name)} className="text-chrome-text-active hover:underline">{tramite.titular?.full_name}</button>}
        </li>
        {tramite.participantes.map(p => (
          <li key={p.id} className="group flex items-center gap-2">
            <span className="w-24 shrink-0 text-xs text-chrome-text-muted">{PARTICIPANT_ROLES[p.rol] || p.rol}</span>
            <button onClick={() => onNavigateToClient?.(p.client_id, p.clients?.full_name)} className="truncate text-chrome-text-active hover:underline">{p.clients?.full_name}</button>
            <button onClick={() => quitar(p)} className="ml-auto rounded p-1 text-chrome-text-muted opacity-0 hover:text-red-400 group-hover:opacity-100" title="Quitar del trámite">
              <Trash2 size={12} />
            </button>
          </li>
        ))}
      </ul>

      {adding && (
        <div className="mt-2 space-y-2 rounded-lg border border-dashed border-chrome-border p-2">
          <div className="flex items-center gap-2 text-xs text-chrome-text-muted">
            Rol
            <select value={rol} onChange={e => setRol(e.target.value)} className="rounded-md border border-chrome-border bg-chrome-bg px-2 py-1 text-xs text-chrome-text-active">
              {ROLES_ELEGIBLES.map(r => <option key={r} value={r}>{PARTICIPANT_ROLES[r]}</option>)}
            </select>
            <button onClick={() => setAdding(false)} className="ml-auto text-chrome-text-muted hover:text-chrome-text-active">Cancelar</button>
          </div>
          {sugeridos.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {sugeridos.map(r => (
                <button key={r.con_client_id} onClick={() => agregar({ id: r.con_client_id, full_name: r.cliente.full_name })}
                  className="rounded-full border border-chrome-border px-2 py-0.5 text-xs text-chrome-text hover:bg-chrome-bg-raised">
                  + {r.cliente.full_name}
                </button>
              ))}
            </div>
          )}
          <ClientPicker excludeIds={yaIncluidos} onPick={agregar} onCreate={crearYAgregar} />
        </div>
      )}
    </div>
  );
}

import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus } from 'lucide-react';
import { useCrmData, KEYS } from '../useCrm';
import { createLead } from '../services/crmService';
import LeadPanel from './LeadPanel';
import { StagePill } from '../ui';
import { money, relTime } from '../format';

// Leads (oportunidades) de un contacto, dentro de su ficha. Un mismo contacto puede tener varios:
// uno por trámite que le interesa (ej.: RNM y CPF). Al hacer clic se abre el panel del lead.
export default function ContactLeads({ client, onOpenChat }) {
  const qc = useQueryClient();
  const { leads, teamById, stageById } = useCrmData();
  const [openId, setOpenId] = useState(null);
  const [busy, setBusy] = useState(false);
  const mine = (leads.data || []).filter((l) => l.client_id === client.id);
  const open = mine.find((l) => l.id === openId);

  const add = async () => {
    setBusy(true);
    try {
      const res = await createLead({ name: client.full_name || client.phone || 'Sin nombre', phone: client.phone || client.whatsapp });
      toast.success('Lead creado');
      await qc.invalidateQueries({ queryKey: KEYS.leads });
      setOpenId(res.lead_id);
    } catch (err) {
      toast.error(err.message || 'No se pudo crear el lead');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      {leads.isLoading && <p className="text-xs text-chrome-text-muted">Cargando…</p>}
      {mine.map((l) => (
        <button key={l.id} onClick={() => setOpenId(l.id)}
          className="flex items-center gap-2 rounded-md border border-chrome-border px-2.5 py-2 text-left hover:border-brand-primary/60">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-chrome-text-active">{l.service_label || 'Trámite por definir'}</p>
            <p className="truncate text-[11px] text-chrome-text-muted">
              {[teamById[l.assigned_to], money(l.value), `actualizado ${relTime(l.updated_at)}`].filter(Boolean).join(' · ')}
            </p>
          </div>
          {l.needs_reply && <span className="h-2 w-2 shrink-0 rounded-full bg-success" title="Mensaje sin responder" />}
          <StagePill name={l.stage_name} kind={l.stage_kind} color={stageById[l.stage_id]?.color} />
        </button>
      ))}
      {!leads.isLoading && mine.length === 0 && <p className="text-xs text-chrome-text-muted">Este contacto no tiene leads.</p>}
      <button onClick={add} disabled={busy} className="mt-1 inline-flex items-center gap-1 self-start text-xs font-medium text-brand-primary hover:underline disabled:opacity-50">
        <Plus size={12} /> Nuevo lead para este contacto
      </button>

      {open && (
        <div className="fixed inset-0 z-[200] flex justify-end bg-surface-overlay" onMouseDown={() => setOpenId(null)}>
          <div className="h-full shadow-lg" onMouseDown={(e) => e.stopPropagation()}>
            <LeadPanel key={open.id} lead={open} onClose={() => setOpenId(null)} onOpenChat={onOpenChat} width="w-[380px]" />
          </div>
        </div>
      )}
    </div>
  );
}

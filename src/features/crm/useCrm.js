import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getPipelines, getLeads, getTeam, getTags, getLeadTags, getUnsyncedEvents, moveLeadStage, retryUnsynced, getOrgSetting } from './services/crmService';

export const KEYS = {
  pipelines: ['crm', 'pipelines'],
  leads: ['crm', 'leads'],
  team: ['crm', 'team'],
  tags: ['crm', 'tags'],
  leadTags: ['crm', 'lead_tags'],
  unsynced: ['crm', 'unsynced'],
  events: ['crm', 'events'],
  conversations: ['crm', 'conversations'],
  unreadCount: ['crm', 'unread_count'],
  tasks: ['crm', 'tasks'],
  kommoUrl: ['crm', 'kommo_url'],
};

// Datos base del CRM, compartidos (y cacheados) entre Inicio, Leads, Funis, Chats y Contactos.
export function useCrmData() {
  const pipelines = useQuery({ queryKey: KEYS.pipelines, queryFn: getPipelines, staleTime: 5 * 60_000 });
  const leads = useQuery({ queryKey: KEYS.leads, queryFn: getLeads, refetchInterval: 30_000 });
  const team = useQuery({ queryKey: KEYS.team, queryFn: getTeam, staleTime: 5 * 60_000 });
  const tags = useQuery({ queryKey: KEYS.tags, queryFn: getTags });
  const leadTags = useQuery({ queryKey: KEYS.leadTags, queryFn: getLeadTags });
  const stages = (pipelines.data || []).flatMap((p) => p.stages);
  const stageById = Object.fromEntries(stages.map((s) => [s.id, s]));
  const teamById = Object.fromEntries((team.data || []).map((m) => [m.id, m.name]));
  return { pipelines, leads, team, tags, leadTags, stages, stageById, teamById };
}

// Dominio de la cuenta de Kommo de la organización (organization_settings.kommo_base_url).
export function useKommoLeadUrl() {
  const { data } = useQuery({ queryKey: KEYS.kommoUrl, queryFn: () => getOrgSetting('kommo_base_url'), staleTime: 30 * 60_000 });
  const base = typeof data === 'string' ? data.replace(/\/+$/, '') : null;
  return (externalId) => (base && externalId ? `${base}/leads/detail/${externalId}` : null);
}

export function useUnsynced() {
  return useQuery({ queryKey: KEYS.unsynced, queryFn: getUnsyncedEvents, refetchInterval: 60_000 });
}

// Refresca todo lo que depende de un lead después de un cambio.
export function useRefreshLead() {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: KEYS.leads });
    qc.invalidateQueries({ queryKey: KEYS.events });
    qc.invalidateQueries({ queryKey: KEYS.leadTags });
    qc.invalidateQueries({ queryKey: KEYS.unsynced });
  }, [qc]);
}

// Mueve un lead con actualización optimista; si algo falla se vuelve al estado anterior.
export function useMoveLead(stages) {
  const qc = useQueryClient();
  const refresh = useRefreshLead();
  return useCallback(async (lead, stageId, { silent = false } = {}) => {
    const stage = stages.find((s) => s.id === stageId);
    if (!stage || lead.stage_id === stageId) return null;
    const previous = qc.getQueryData(KEYS.leads);
    qc.setQueryData(KEYS.leads, (old = []) => old.map((l) => (l.id === lead.id
      ? { ...l, stage_id: stage.id, stage_name: stage.name, stage_kind: stage.kind, stage_position: stage.position, updated_at: new Date().toISOString() }
      : l)));
    try {
      const res = await moveLeadStage(lead.id, stageId);
      if (silent) return res;
      if (res.sync === 'failed') {
        toast.error(`Movido a “${stage.name}”, pero Kommo no respondió: ${res.syncError}. Quedó pendiente de sincronizar.`, { duration: 7000 });
      } else {
        toast.success(`Movido a “${stage.name}”`);
      }
      return res;
    } catch (err) {
      qc.setQueryData(KEYS.leads, previous);
      if (silent) throw err;
      toast.error(err.message || 'No se pudo mover el lead');
      return null;
    } finally {
      refresh();
    }
  }, [qc, stages, refresh]);
}

export function useRetryUnsynced() {
  const qc = useQueryClient();
  return useCallback(async (eventIds = null) => {
    const t = toast.loading('Sincronizando con Kommo…');
    try {
      const { total, synced, errors } = await retryUnsynced(eventIds);
      if (total === synced) toast.success(`${synced} cambio(s) sincronizado(s) con Kommo`, { id: t });
      else toast.error(`${synced} de ${total} sincronizados. ${errors[0] || ''}`, { id: t, duration: 7000 });
    } catch (err) {
      toast.error(err.message || 'No se pudo sincronizar', { id: t });
    } finally {
      qc.invalidateQueries({ queryKey: KEYS.unsynced });
      qc.invalidateQueries({ queryKey: KEYS.events });
    }
  }, [qc]);
}

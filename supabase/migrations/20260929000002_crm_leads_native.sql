-- Leads propios del panel: pueden existir sin lead de Kommo (kommo_lead_id nulo).
-- El índice único (organization_id, kommo_lead_id) admite varios nulos, así que no cambia nada
-- para los leads que ya vienen de Kommo.
alter table public.comercial_leads alter column kommo_lead_id drop not null;

-- País y ciudad en la vista (columnas nuevas al final: create or replace no rompe consumidores).
create or replace view public.crm_leads with (security_invoker = true) as
select
  l.id,
  l.organization_id,
  l.client_id,
  l.nombre as name,
  l.telefono as phone,
  l.tramite_texto as service_label,
  l.precio as value,
  st.id as stage_id,
  coalesce(st.name, l.etapa_nombre) as stage_name,
  st.kind as stage_kind,
  st.pipeline_id,
  coalesce(st.position, l.etapa_position) as stage_position,
  l.assigned_to,
  l.lead_source,
  l.created_at,
  l.updated_at,
  l.last_inbound_at,
  l.last_atendido_at as last_answered_at,
  (l.last_inbound_at is not null and (l.last_atendido_at is null or l.last_inbound_at > l.last_atendido_at)) as needs_reply,
  l.atendente_pausado as ai_paused,
  l.temperatura as temperature,
  l.kommo_lead_id as external_id,
  l.kommo_contact_id as external_contact_id,
  l.nacionalidad as country,
  l.ciudad_brasil as city
from public.comercial_leads l
left join public.crm_stages st
  on st.organization_id = l.organization_id and st.kommo_status_id = l.etapa_status_id;
grant select on public.crm_leads to authenticated;
revoke all on public.crm_leads from anon;

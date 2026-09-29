-- Checklist de cada trámite (aditivo, solo lectura). Cruza los requisitos del servicio (service_requirements)
-- con lo que el contacto ya entregó: documentos (kind 'foto') y datos (kind 'dado').
-- Estados: ok (aprobado / dato completo), revisar (documento recibido sin revisar), rechazado, vencido,
-- reutilizable (el mismo tipo de documento ya está aprobado en OTRO trámite del contacto) y falta.
-- No reemplaza checklist_caso (la usa n8n y trata "recibido" como completo); esta es la vista del panel.
create or replace view public.crm_tramite_checklist with (security_invoker = true) as
select
  cs.id as client_service_id,
  cs.organization_id,
  cs.client_id,
  r.id as requirement_id,
  r.position,
  r.kind,
  r.label,
  r.required,
  r.ask_client,
  coalesce(dt.name, sf.name) as codigo,
  d.id as document_id,
  d.status::text as document_status,
  coalesce(d.review_notes, d.quality_notes) as motivo,
  other.id as reuse_document_id,
  other_s.name as reuse_from,
  fv.value as field_value,
  case
    when r.kind = 'foto' and d.status = 'approved' then 'ok'
    when r.kind = 'foto' and d.status = 'received' then 'revisar'
    when r.kind = 'foto' and d.status = 'rejected' then 'rechazado'
    when r.kind = 'foto' and d.status = 'expired' then 'vencido'
    when r.kind = 'foto' and other.id is not null then 'reutilizable'
    when r.kind = 'dado' and nullif(trim(fv.value), '') is not null then 'ok'
    else 'falta'
  end as estado
from public.client_services cs
join public.service_requirements r on r.service_id = cs.service_id
left join public.document_types dt on dt.id = r.document_type_id
left join public.service_fields sf on sf.id = r.service_field_id
left join lateral (
  select d.id, d.status, d.review_notes, d.quality_notes from public.documents d
   where d.client_service_id = cs.id and d.document_type_id = r.document_type_id
     and (d.client_id = cs.client_id or d.client_id is null)
   order by (d.status = 'approved') desc, d.created_at desc
   limit 1
) d on r.kind = 'foto'
left join lateral (
  select d2.id, d2.client_service_id from public.documents d2
   where d2.client_id = cs.client_id and d2.document_type_id = r.document_type_id
     and d2.client_service_id is distinct from cs.id and d2.status = 'approved'
   order by d2.created_at desc
   limit 1
) other on r.kind = 'foto'
left join public.client_services ocs on ocs.id = other.client_service_id
left join public.services other_s on other_s.id = ocs.service_id
left join public.client_service_field_values fv
  on r.kind = 'dado' and fv.client_service_id = cs.id and fv.service_field_id = r.service_field_id;

grant select on public.crm_tramite_checklist to authenticated;
revoke all on public.crm_tramite_checklist from anon;

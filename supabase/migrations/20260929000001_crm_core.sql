-- CRM propio sobre Supabase (aditivo: no borra ni renombra nada existente).
-- comercial_leads sigue siendo escrita por n8n/Kommo; el panel lee la vista crm_leads,
-- que expone nombres neutrales (sin ids de Kommo en la estructura de cara al frontend).

-- 1. Embudos y etapas propios por organización ------------------------------------
create table if not exists public.crm_pipelines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  position integer not null default 0,
  is_default boolean not null default false,
  kommo_pipeline_id bigint,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists public.crm_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pipeline_id uuid not null references public.crm_pipelines(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  kind text not null default 'open' check (kind in ('open', 'won', 'lost')),
  color text,
  kommo_status_id bigint,
  created_at timestamptz not null default now(),
  unique (pipeline_id, kommo_status_id)
);
create index if not exists crm_stages_org_idx on public.crm_stages (organization_id, pipeline_id, position);

-- 2. Responsable y origen en los leads existentes ---------------------------------
alter table public.comercial_leads
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists lead_source text;
create index if not exists comercial_leads_assigned_idx on public.comercial_leads (organization_id, assigned_to);

-- 3. Etiquetas de lead (reutiliza public.tags) ------------------------------------
create table if not exists public.crm_lead_tags (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.comercial_leads(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (lead_id, tag_id)
);

-- 4. Eventos / actividad del lead (auditoría + cola de sincronización con Kommo) ---
create table if not exists public.crm_lead_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lead_id uuid not null references public.comercial_leads(id) on delete cascade,
  event_type text not null,
  from_stage_id uuid references public.crm_stages(id) on delete set null,
  to_stage_id uuid references public.crm_stages(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  idempotency_key text,
  metadata jsonb not null default '{}'::jsonb,
  sync_status text not null default 'skipped' check (sync_status in ('skipped', 'pending', 'synced', 'failed')),
  sync_error text,
  synced_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists crm_lead_events_idem_uq
  on public.crm_lead_events (organization_id, idempotency_key) where idempotency_key is not null;
create index if not exists crm_lead_events_lead_idx on public.crm_lead_events (lead_id, created_at desc);

-- 5. RLS: mismo aislamiento por organización que el resto del esquema --------------
alter table public.crm_pipelines enable row level security;
alter table public.crm_stages enable row level security;
alter table public.crm_lead_tags enable row level security;
alter table public.crm_lead_events enable row level security;

do $$
declare t text;
begin
  foreach t in array array['crm_pipelines', 'crm_stages', 'crm_lead_tags', 'crm_lead_events'] loop
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format(
      'create policy tenant_isolation on public.%I for all to authenticated
         using (organization_id = (select private.get_user_org_id()))
         with check (organization_id = (select private.get_user_org_id()))', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- 6. Datos iniciales: el embudo Comercial actual (solo orgs que ya tienen leads) ----
insert into public.crm_pipelines (organization_id, code, name, position, is_default, kommo_pipeline_id)
select distinct organization_id, 'comercial', 'Comercial', 0, true, 14489115
from public.comercial_leads
on conflict (organization_id, code) do nothing;

insert into public.crm_stages (organization_id, pipeline_id, name, position, kind, color, kommo_status_id)
select p.organization_id, p.id, s.name, s.position, s.kind, s.color, s.status_id
from public.crm_pipelines p
cross join (values
  (112261572::bigint, 'Espera al Supervisor',                        15, 'open', '#dc2626'),
  (111918875, 'Bienvenida y Confianza',                              20, 'open', null),
  (111918879, 'Calificación de Necesidad',                           30, 'open', null),
  (111918883, 'Propuesta y Precio',                                  40, 'open', null),
  (111919155, 'Datos y Pago (PIX)',                                  50, 'open', null),
  (111919159, 'Pago Confirmado/esperando documentos',                60, 'open', null),
  (111919167, 'Seguimiento (Sin Respuesta)',                         70, 'open', null),
  (112025771, 'RECUPERACION INSTANTANEA',                            80, 'open', null),
  (112263100, 'Pruebas (Nora)',                                      90, 'open', null),
  (142,       'Logrado con éxito',                                10000, 'won',  '#16a34a'),
  (143,       'Descalificado / Perdido',                          11000, 'lost', '#71717a')
) as s(status_id, name, position, kind, color)
where p.code = 'comercial' and p.kommo_pipeline_id = 14489115
on conflict (pipeline_id, kommo_status_id) do nothing;

-- 7. Vista neutral para el frontend (respeta RLS del usuario que consulta) ----------
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
  l.kommo_contact_id as external_contact_id
from public.comercial_leads l
left join public.crm_stages st
  on st.organization_id = l.organization_id and st.kommo_status_id = l.etapa_status_id;
grant select on public.crm_leads to authenticated;
revoke all on public.crm_leads from anon;

-- 8. Mover de etapa: Supabase primero, idempotente, con evento -----------------------
-- SECURITY INVOKER: RLS del usuario decide si puede tocar el lead y la etapa.
create or replace function public.crm_move_lead_stage(
  p_lead_id uuid,
  p_stage_id uuid,
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_org uuid := private.get_user_org_id();
  v_lead public.comercial_leads%rowtype;
  v_stage public.crm_stages%rowtype;
  v_from public.crm_stages%rowtype;
  v_event uuid;
  v_existing public.crm_lead_events%rowtype;
begin
  if v_org is null then
    return jsonb_build_object('ok', false, 'error', 'sin_organizacion');
  end if;

  if p_idempotency_key is not null then
    select * into v_existing from public.crm_lead_events
     where organization_id = v_org and idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('ok', true, 'event_id', v_existing.id, 'duplicate', true,
                                'sync_status', v_existing.sync_status);
    end if;
  end if;

  select * into v_lead from public.comercial_leads where id = p_lead_id and organization_id = v_org for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'lead_no_encontrado');
  end if;
  select * into v_stage from public.crm_stages where id = p_stage_id and organization_id = v_org;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'etapa_no_encontrada');
  end if;
  select * into v_from from public.crm_stages
   where organization_id = v_org and kommo_status_id = v_lead.etapa_status_id;

  if v_lead.etapa_status_id is not distinct from v_stage.kommo_status_id then
    return jsonb_build_object('ok', true, 'unchanged', true);
  end if;

  update public.comercial_leads
     set etapa_status_id = v_stage.kommo_status_id,
         etapa_nombre = v_stage.name,
         etapa_position = v_stage.position,
         updated_at = now()
   where id = v_lead.id;

  insert into public.crm_lead_events
    (organization_id, lead_id, event_type, from_stage_id, to_stage_id, actor_id, idempotency_key, sync_status, metadata)
  values
    (v_org, v_lead.id, 'stage_changed', v_from.id, v_stage.id, auth.uid(), p_idempotency_key,
     case when v_lead.kommo_lead_id is not null and v_stage.kommo_status_id is not null then 'pending' else 'skipped' end,
     jsonb_build_object('from', v_from.name, 'to', v_stage.name))
  returning id into v_event;

  return jsonb_build_object(
    'ok', true, 'event_id', v_event,
    'sync_status', case when v_lead.kommo_lead_id is not null and v_stage.kommo_status_id is not null then 'pending' else 'skipped' end);
end;
$$;

revoke all on function public.crm_move_lead_stage(uuid, uuid, text) from public, anon;
grant execute on function public.crm_move_lead_stage(uuid, uuid, text) to authenticated;

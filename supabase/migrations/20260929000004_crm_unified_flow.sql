-- Flujo único del CRM (aditivo). Fuente de verdad: comercial_leads (la escriben el panel y n8n);
-- el panel lee la vista crm_leads. Todo lo que tiene que pasar "siempre" lo hacen triggers en la base,
-- sin importar quién escriba: vincular el lead con su contacto y registrar la actividad.

-- 0. Etapa de entrada del embudo (donde nacen los leads creados en el panel).
alter table public.crm_stages add column if not exists is_entry boolean not null default false;
update public.crm_stages set is_entry = true
 where kommo_status_id = 111918875
   and not exists (select 1 from public.crm_stages s2 where s2.pipeline_id = crm_stages.pipeline_id and s2.is_entry);

-- 1. Lead → contacto (persona). Busca por contacto de Kommo y después por teléfono (phone_key, mismo
--    criterio que vincular_kommo/sincronizar_lead_comercial); si no existe lo crea. Nunca duplica y nunca
--    bloquea la escritura del lead: ante cualquier error el lead queda sin contacto y se avisa en el log.
create or replace function public.crm_leads_link_contact() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_key text;
  v_tel text;
  v_client uuid;
begin
  if new.client_id is not null then
    return new;
  end if;
  begin
    v_key := public.telefone_chave(new.telefono);
    v_tel := public.normalizar_telefone(new.telefono);
    if new.kommo_contact_id is not null then
      select id into v_client from public.clients
       where organization_id = new.organization_id and kommo_contact_id = new.kommo_contact_id
       limit 1;
    end if;
    if v_client is null and v_key is not null then
      select id into v_client from public.clients
       where organization_id = new.organization_id and phone_key = v_key
       limit 1;
    end if;
    -- Los clientes simulados con los que se entrena a Nora (+55 00…) no son personas reales.
    if v_client is null and coalesce(regexp_replace(new.telefono, '\D', '', 'g'), '') not like '5500%' then
      begin
        insert into public.clients (organization_id, full_name, phone, whatsapp, nationality, status, lead_source, kommo_contact_id)
        values (new.organization_id,
                coalesce(nullif(trim(new.nombre_completo), ''), nullif(trim(new.nombre), ''), v_tel, 'Contacto ' || coalesce(new.kommo_contact_id::text, 'sin nombre')),
                v_tel, v_tel, nullif(trim(new.nacionalidad), ''), 'lead',
                coalesce(new.lead_source, case when new.kommo_lead_id is not null then 'kommo' else 'panel' end),
                new.kommo_contact_id)
        returning id into v_client;
      exception when unique_violation then
        select id into v_client from public.clients
         where organization_id = new.organization_id
           and ((new.kommo_contact_id is not null and kommo_contact_id = new.kommo_contact_id)
                or (v_key is not null and phone_key = v_key))
         limit 1;
      end;
    end if;
    new.client_id := v_client;
  exception when others then
    raise warning 'crm_leads_link_contact(%): %', new.id, sqlerrm;
  end;
  return new;
end $$;

drop trigger if exists trg_crm_link_contact on public.comercial_leads;
create trigger trg_crm_link_contact
  before insert or update of client_id, kommo_contact_id, telefono on public.comercial_leads
  for each row execute function public.crm_leads_link_contact();

-- 2. Actividad del lead, venga de donde venga el cambio (panel, n8n, webhook de Kommo).
--    Los cambios de etapa hechos con crm_move_lead_stage ya dejan su propio evento (con idempotencia y
--    estado de sincronización), así que ese RPC marca crm.in_move para no duplicarlo.
create or replace function public.crm_leads_log_events() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_from public.crm_stages%rowtype;
  v_to public.crm_stages%rowtype;
begin
  begin
    if tg_op = 'INSERT' then
      insert into public.crm_lead_events (organization_id, lead_id, event_type, actor_id, metadata, created_at)
      values (new.organization_id, new.id, 'created', auth.uid(),
              jsonb_build_object('source', coalesce(new.lead_source, case when new.kommo_lead_id is not null then 'kommo' else 'panel' end),
                                 'stage', new.etapa_nombre),
              new.created_at);
      return null;
    end if;

    if new.etapa_status_id is distinct from old.etapa_status_id
       and coalesce(current_setting('crm.in_move', true), '') <> 'on' then
      select * into v_from from public.crm_stages where organization_id = new.organization_id and kommo_status_id = old.etapa_status_id limit 1;
      select * into v_to from public.crm_stages where organization_id = new.organization_id and kommo_status_id = new.etapa_status_id limit 1;
      insert into public.crm_lead_events (organization_id, lead_id, event_type, from_stage_id, to_stage_id, actor_id, sync_status, metadata)
      values (new.organization_id, new.id, 'stage_changed', v_from.id, v_to.id, auth.uid(), 'skipped',
              jsonb_build_object('from', coalesce(v_from.name, old.etapa_nombre), 'to', coalesce(v_to.name, new.etapa_nombre),
                                 'origin', case when auth.uid() is null then 'automatizacion' else 'panel' end));
    end if;

    if new.assigned_to is distinct from old.assigned_to then
      insert into public.crm_lead_events (organization_id, lead_id, event_type, actor_id, metadata)
      values (new.organization_id, new.id, 'assigned', auth.uid(),
              jsonb_build_object('from', old.assigned_to, 'to', new.assigned_to,
                                 'to_name', (select coalesce(full_name, email) from public.profiles where id = new.assigned_to)));
    end if;

    if new.tramite_texto is distinct from old.tramite_texto or new.precio is distinct from old.precio then
      insert into public.crm_lead_events (organization_id, lead_id, event_type, actor_id, metadata)
      values (new.organization_id, new.id, 'updated', auth.uid(),
              jsonb_strip_nulls(jsonb_build_object(
                'service_label', case when new.tramite_texto is distinct from old.tramite_texto then new.tramite_texto end,
                'value', case when new.precio is distinct from old.precio then new.precio end)));
    end if;
  exception when others then
    raise warning 'crm_leads_log_events(%): %', new.id, sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists trg_crm_log_events on public.comercial_leads;
create trigger trg_crm_log_events
  after insert or update of etapa_status_id, assigned_to, tramite_texto, precio on public.comercial_leads
  for each row execute function public.crm_leads_log_events();

create or replace function public.crm_lead_tags_log() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record := coalesce(new, old);
begin
  begin
    insert into public.crm_lead_events (organization_id, lead_id, event_type, actor_id, metadata)
    values (r.organization_id, r.lead_id, case when tg_op = 'INSERT' then 'tag_added' else 'tag_removed' end, auth.uid(),
            jsonb_build_object('tag', (select name from public.tags where id = r.tag_id)));
  exception when others then
    raise warning 'crm_lead_tags_log: %', sqlerrm;
  end;
  return null;
end $$;

drop trigger if exists trg_crm_lead_tags_log on public.crm_lead_tags;
create trigger trg_crm_lead_tags_log
  after insert or delete on public.crm_lead_tags
  for each row execute function public.crm_lead_tags_log();

revoke all on function public.crm_leads_link_contact() from public, anon, authenticated;
revoke all on function public.crm_leads_log_events() from public, anon, authenticated;
revoke all on function public.crm_lead_tags_log() from public, anon, authenticated;

-- 3. Mover de etapa: igual que antes + marca crm.in_move para que el trigger no duplique el evento.
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
  v_lead public.comercial_leads%rowtype;
  v_stage public.crm_stages%rowtype;
  v_from public.crm_stages%rowtype;
  v_event uuid;
  v_sync text;
  v_existing public.crm_lead_events%rowtype;
begin
  if p_idempotency_key is not null then
    select * into v_existing from public.crm_lead_events where idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('ok', true, 'event_id', v_existing.id, 'duplicate', true,
                                'sync_status', v_existing.sync_status);
    end if;
  end if;

  select * into v_lead from public.comercial_leads where id = p_lead_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'lead_no_encontrado');
  end if;
  select * into v_stage from public.crm_stages where id = p_stage_id and organization_id = v_lead.organization_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'etapa_no_encontrada');
  end if;
  select * into v_from from public.crm_stages
   where organization_id = v_lead.organization_id and kommo_status_id = v_lead.etapa_status_id;

  if v_lead.etapa_status_id is not distinct from v_stage.kommo_status_id then
    return jsonb_build_object('ok', true, 'unchanged', true);
  end if;

  v_sync := case when v_lead.kommo_lead_id is not null and v_stage.kommo_status_id is not null then 'pending' else 'skipped' end;

  perform set_config('crm.in_move', 'on', true);
  update public.comercial_leads
     set etapa_status_id = v_stage.kommo_status_id,
         etapa_nombre = v_stage.name,
         etapa_position = v_stage.position,
         updated_at = now()
   where id = v_lead.id;
  perform set_config('crm.in_move', 'off', true);

  insert into public.crm_lead_events
    (organization_id, lead_id, event_type, from_stage_id, to_stage_id, actor_id, idempotency_key, sync_status, metadata)
  values
    (v_lead.organization_id, v_lead.id, 'stage_changed', v_from.id, v_stage.id, auth.uid(), p_idempotency_key, v_sync,
     jsonb_build_object('from', v_from.name, 'to', v_stage.name, 'origin', 'panel'))
  returning id into v_event;

  return jsonb_build_object('ok', true, 'event_id', v_event, 'sync_status', v_sync);
end;
$$;

-- 4. Alta de lead desde el panel (SECURITY INVOKER: RLS del usuario decide la organización).
create or replace function public.crm_create_lead(
  p_name text,
  p_phone text default null,
  p_service_label text default null,
  p_value numeric default null,
  p_stage_id uuid default null,
  p_assigned_to uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_stage public.crm_stages%rowtype;
  v_id uuid;
  v_client uuid;
begin
  if nullif(trim(p_name), '') is null then
    return jsonb_build_object('ok', false, 'error', 'falta_nombre');
  end if;
  if p_stage_id is not null then
    select * into v_stage from public.crm_stages where id = p_stage_id;
  else
    select s.* into v_stage from public.crm_stages s join public.crm_pipelines p on p.id = s.pipeline_id
     where s.kind = 'open'
     order by p.is_default desc, p.position, s.is_entry desc, s.position
     limit 1;
  end if;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'etapa_no_encontrada');
  end if;

  insert into public.comercial_leads
    (organization_id, nombre, telefono, tramite_texto, precio, etapa_status_id, etapa_nombre, etapa_position, assigned_to, lead_source)
  values
    (v_stage.organization_id, trim(p_name), nullif(trim(p_phone), ''), nullif(trim(p_service_label), ''), p_value,
     v_stage.kommo_status_id, v_stage.name, v_stage.position, p_assigned_to, 'panel')
  returning id, client_id into v_id, v_client;

  return jsonb_build_object('ok', true, 'lead_id', v_id, 'client_id', v_client);
end;
$$;

-- 5. Cambios de campos del lead (uno o varios leads): responsable, trámite, valor.
--    Solo toca las claves presentes en p_patch.
create or replace function public.crm_update_leads(p_lead_ids uuid[], p_patch jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.comercial_leads set
    assigned_to   = case when p_patch ? 'assigned_to' then nullif(p_patch->>'assigned_to', '')::uuid else assigned_to end,
    tramite_texto = case when p_patch ? 'service_label' then nullif(trim(p_patch->>'service_label'), '') else tramite_texto end,
    precio        = case when p_patch ? 'value' then nullif(p_patch->>'value', '')::numeric else precio end,
    updated_at    = now()
  where id = any(p_lead_ids);
  get diagnostics v_count = row_count;
  return jsonb_build_object('ok', true, 'updated', v_count);
end;
$$;

revoke all on function public.crm_move_lead_stage(uuid, uuid, text) from public, anon;
revoke all on function public.crm_create_lead(text, text, text, numeric, uuid, uuid) from public, anon;
revoke all on function public.crm_update_leads(uuid[], jsonb) from public, anon;
grant execute on function public.crm_move_lead_stage(uuid, uuid, text) to authenticated;
grant execute on function public.crm_create_lead(text, text, text, numeric, uuid, uuid) to authenticated;
grant execute on function public.crm_update_leads(uuid[], jsonb) to authenticated;

-- 6. Bandeja de chats: conversación + último mensaje + mensajes sin responder
--    (entrantes posteriores a la última respuesta del equipo o de Nora).
create or replace view public.crm_conversations with (security_invoker = true) as
select
  c.id,
  c.organization_id,
  c.client_id,
  c.channel,
  c.status,
  c.last_message_at,
  c.kommo_lead_id,
  c.kommo_contact_id,
  coalesce(nullif(cl.full_name, ''), ld.nombre, cl.phone, ld.telefono) as display_name,
  coalesce(cl.phone, ld.telefono) as phone,
  cl.assigned_to as client_assigned_to,
  lm.direction as last_direction,
  lm.message_type as last_type,
  lm.content as last_content,
  lm.sender_type as last_sender,
  lm.created_at as last_at,
  coalesce(un.n, 0) as unread_count
from public.conversations c
left join public.clients cl on cl.id = c.client_id
left join lateral (
  select l.nombre, l.telefono from public.comercial_leads l
   where l.organization_id = c.organization_id and l.kommo_contact_id = c.kommo_contact_id
   order by l.updated_at desc limit 1
) ld on c.kommo_contact_id is not null
left join lateral (
  select m.direction, m.message_type, m.content, m.sender_type, m.created_at from public.messages m
   where m.conversation_id = c.id order by m.created_at desc limit 1
) lm on true
left join lateral (
  select count(*)::int as n from public.messages m
   where m.conversation_id = c.id and m.direction = 'inbound'
     and m.created_at > coalesce((select max(o.created_at) from public.messages o
                                   where o.conversation_id = c.id and o.direction = 'outbound'), '-infinity'::timestamptz)
) un on true;
grant select on public.crm_conversations to authenticated;
revoke all on public.crm_conversations from anon;

-- 7. crm_leads expone el contacto de Kommo (para cruzar chats sin contacto todavía) y la etapa de entrada.
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

-- 8. Backfill: vincular los leads existentes con su contacto (dispara trg_crm_link_contact; no cambia
--    updated_at ni ninguna otra columna) y registrar el "Lead creado" de los que ya existían.
update public.comercial_leads set client_id = client_id where client_id is null;

insert into public.crm_lead_events (organization_id, lead_id, event_type, metadata, created_at)
select l.organization_id, l.id, 'created',
       jsonb_build_object('source', coalesce(l.lead_source, case when l.kommo_lead_id is not null then 'kommo' else 'panel' end), 'stage', l.etapa_nombre, 'backfill', true),
       l.created_at
from public.comercial_leads l
where not exists (select 1 from public.crm_lead_events e where e.lead_id = l.id and e.event_type = 'created');

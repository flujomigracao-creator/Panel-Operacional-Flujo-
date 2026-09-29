-- crm_move_lead_stage: no llama a private.get_user_org_id() (el rol authenticated no tiene USAGE
-- sobre el schema private fuera de las policies). La organización sale de las filas que RLS ya filtra.
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

  update public.comercial_leads
     set etapa_status_id = v_stage.kommo_status_id,
         etapa_nombre = v_stage.name,
         etapa_position = v_stage.position,
         updated_at = now()
   where id = v_lead.id;

  insert into public.crm_lead_events
    (organization_id, lead_id, event_type, from_stage_id, to_stage_id, actor_id, idempotency_key, sync_status, metadata)
  values
    (v_lead.organization_id, v_lead.id, 'stage_changed', v_from.id, v_stage.id, auth.uid(), p_idempotency_key, v_sync,
     jsonb_build_object('from', v_from.name, 'to', v_stage.name))
  returning id into v_event;

  return jsonb_build_object('ok', true, 'event_id', v_event, 'sync_status', v_sync);
end;
$$;

revoke all on function public.crm_move_lead_stage(uuid, uuid, text) from public, anon;
grant execute on function public.crm_move_lead_stage(uuid, uuid, text) to authenticated;

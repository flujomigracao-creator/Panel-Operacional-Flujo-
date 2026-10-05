-- Corrección de crear_tramite: `authenticated` no tiene USAGE en el esquema private, así que la función (SECURITY INVOKER)
-- no puede llamar a private.get_user_org_id(). La organización se lee de organization_members, que el usuario sí puede ver por RLS.
create or replace function public.crear_tramite(p_nombre text, p_descripcion text, p_precio numeric, p_costo numeric default null)
returns uuid
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_org uuid;
  v_nombre text := trim(coalesce(p_nombre, ''));
  v_id uuid;
  v_pos integer;
begin
  select organization_id into v_org from public.organization_members where user_id = auth.uid() limit 1;
  if v_org is null then raise exception 'Sin organización'; end if;
  if v_nombre = '' then raise exception 'El nombre es obligatorio'; end if;
  if p_precio is null or p_precio < 0 then raise exception 'El precio es obligatorio y no puede ser negativo'; end if;
  if p_costo is not null and p_costo < 0 then raise exception 'El costo no puede ser negativo'; end if;
  if exists (select 1 from public.services where organization_id = v_org and lower(name) = lower(v_nombre)) then
    raise exception 'Ya existe un trámite con ese nombre';
  end if;

  select coalesce(max(position), 0) + 1 into v_pos from public.services where organization_id = v_org and position < 99;

  insert into public.services (organization_id, name, description, default_price, default_cost, currency, category, active, position)
  values (v_org, v_nombre, nullif(trim(coalesce(p_descripcion, '')), ''), p_precio, p_costo, 'BRL', 'migracao', true, v_pos)
  returning id into v_id;

  insert into public.service_stages (organization_id, service_id, name, position, pipeline_stage_code)
  select v_org, v_id, x.name, x.pos, x.code
  from (values
    ('PAGO_CONFIRMADO', 0, 'PAGO_CONFIRMADO'),
    ('AGUARDANDO_DOCUMENTOS', 1, 'AGUARDANDO_DOCUMENTOS'),
    ('DOCUMENTACAO_COMPLETA', 2, 'EM_REVISAO'),
    ('ENVIADO', 3, 'ENVIADO_AO_ORGAO'),
    ('AGUARDANDO_RESPOSTA', 4, 'AGUARDANDO_RESPOSTA'),
    ('PRONTO_PARA_ENTREGAR', 5, 'LISTO_PARA_ENTREGAR'),
    ('CONCLUIDO', 6, 'CONCLUIDO'),
    ('CORRECAO', 7, 'PROBLEMA')
  ) as x(name, pos, code);

  return v_id;
end;
$$;
revoke all on function public.crear_tramite(text, text, numeric, numeric) from public, anon;
grant execute on function public.crear_tramite(text, text, numeric, numeric) to authenticated;

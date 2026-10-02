-- Finanzas: catálogo de trámites y precios editable desde el panel.
-- Fuente de verdad del precio = services.default_price. Un trigger lo copia a comercial_audios_pitch.precio
-- (lo que lee Nora) para que ella siga funcionando igual, y marca el guion/audio como desactualizado si cambió.

-- 1) Seguridad: comercial_audios_pitch daba INSERT/UPDATE/DELETE al rol anon con una política `true` (la clave anónima
--    viaja en el panel). Se cierran las escrituras anónimas. La lectura anónima se conserva TEMPORALMENTE por si algún
--    flujo externo la usa con la clave anónima; retirarla cuando se confirme que no hace falta.
drop policy if exists tenant_isolation on public.comercial_audios_pitch;
drop policy if exists pitch_read on public.comercial_audios_pitch;
drop policy if exists pitch_insert on public.comercial_audios_pitch;
drop policy if exists pitch_update on public.comercial_audios_pitch;
drop policy if exists pitch_delete on public.comercial_audios_pitch;
create policy pitch_read on public.comercial_audios_pitch for select to anon, authenticated using (true);
create policy pitch_insert on public.comercial_audios_pitch for insert to authenticated
  with check ((select private.get_user_org_id()) is not null);
create policy pitch_update on public.comercial_audios_pitch for update to authenticated
  using ((select private.get_user_org_id()) is not null) with check ((select private.get_user_org_id()) is not null);
create policy pitch_delete on public.comercial_audios_pitch for delete to authenticated
  using ((select private.get_user_org_id()) is not null);
revoke insert, update, delete, truncate on public.comercial_audios_pitch from anon;

-- 2) Columnas nuevas
alter table public.services add column if not exists kommo_enum_id integer;
create unique index if not exists services_kommo_enum_uq on public.services (organization_id, kommo_enum_id) where kommo_enum_id is not null;

alter table public.comercial_audios_pitch add column if not exists precio_en_guion numeric;
alter table public.comercial_audios_pitch add column if not exists guion_desactualizado boolean not null default false;
-- Los guiones vigentes se escribieron con el precio actual.
update public.comercial_audios_pitch set precio_en_guion = precio where precio_en_guion is null;

-- 3) Trigger: precio del catálogo -> precio que usa Nora
create or replace function public.services_sync_precio_pitch()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.kommo_enum_id is not null and new.default_price is not null
     and (tg_op = 'INSERT'
          or new.default_price is distinct from old.default_price
          or new.kommo_enum_id is distinct from old.kommo_enum_id) then
    update public.comercial_audios_pitch
       set precio = new.default_price,
           updated_at = now(),
           guion_desactualizado = (precio_en_guion is distinct from new.default_price)
     where tramite_enum_id = new.kommo_enum_id;
  end if;
  return new;
end;
$$;
revoke all on function public.services_sync_precio_pitch() from public, anon, authenticated;

drop trigger if exists trg_services_sync_precio_pitch on public.services;
create trigger trg_services_sync_precio_pitch
  after insert or update of default_price, kommo_enum_id on public.services
  for each row execute function public.services_sync_precio_pitch();

-- 4) Enlace trámite <-> opción de Kommo (campo 211058) y precio inicial desde lo que Nora ya ofrecía
update public.services s set kommo_enum_id = m.enum_id
from (values
  ('CPF para Estrangeiros', 165686),
  ('Agendamento na Policia Federal (RNM/Refugio)', 239444),
  ('RNM (1ª vía)', 165690),
  ('RNM (2ª vía)', 165692),
  ('Refugio (primera vez)', 166572),
  ('Refugio (renovación)', 166574),
  ('Cambio de dirección', 166576),
  ('Sisconare', 239268),
  ('Residencia PMTE', 239270),
  ('Antecedentes BR', 239272)
) as m(name, enum_id)
where s.name = m.name and s.kommo_enum_id is null;

update public.services s set default_price = p.precio
from public.comercial_audios_pitch p
where p.tramite_enum_id = s.kommo_enum_id and s.default_price is null;

-- 5) Crear un trámite completo (con sus etapas estándar) de forma atómica. SECURITY INVOKER: respeta el RLS de quien llama.
create or replace function public.crear_tramite(p_nombre text, p_descripcion text, p_precio numeric, p_costo numeric default null)
returns uuid
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_org uuid := (select private.get_user_org_id());
  v_nombre text := trim(coalesce(p_nombre, ''));
  v_id uuid;
  v_pos integer;
begin
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

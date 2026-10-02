-- Desgloses de Meta Ads por anuncio y día: quién (edad/sexo), dónde (plataforma/posición, región) y en qué dispositivo.
-- Meta no permite combinar todos los desgloses en un pedido, por eso `tipo` identifica cada familia.
-- (Versionada desde producción: aplicada como 20261002015155.)
create table if not exists public.meta_ads_desglose (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  fecha date not null,
  ad_id text not null,
  tipo text not null check (tipo in ('edad_sexo','ubicacion','region','dispositivo')),
  clave text not null,
  campaign_id text,
  edad text, genero text, plataforma text, posicion text, region text, dispositivo text,
  gasto numeric not null default 0,
  impresiones bigint,
  alcance bigint,
  clics bigint,
  clics_enlace bigint,
  conversaciones integer,
  raw jsonb,
  actualizado_at timestamptz not null default now(),
  primary key (organization_id, fecha, ad_id, tipo, clave)
);
create index if not exists meta_ads_desglose_fecha_tipo_idx on public.meta_ads_desglose (fecha desc, tipo);

grant select on public.meta_ads_desglose to authenticated, service_role;
revoke all on public.meta_ads_desglose from anon;
alter table public.meta_ads_desglose enable row level security;
drop policy if exists panel_read on public.meta_ads_desglose;
create policy panel_read on public.meta_ads_desglose for select to authenticated
  using (organization_id = (select private.get_user_org_id()));
revoke insert, update, delete on public.meta_ads_desglose from anon, authenticated;

create or replace function public.meta_ads_guardar_desglose(p_organization_id uuid, p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_filas integer;
begin
  if jsonb_typeof(p_filas) is distinct from 'array' then
    raise exception 'p_filas debe ser un array';
  end if;

  insert into public.meta_ads_desglose as d
    (organization_id, fecha, ad_id, tipo, clave, campaign_id, edad, genero, plataforma, posicion, region, dispositivo,
     gasto, impresiones, alcance, clics, clics_enlace, conversaciones, raw, actualizado_at)
  select p_organization_id, (f->>'date_start')::date, f->>'ad_id', t.tipo, t.clave, f->>'campaign_id',
         f->>'age', f->>'gender', f->>'publisher_platform', f->>'platform_position', f->>'region', f->>'impression_device',
         coalesce((f->>'spend')::numeric, 0),
         nullif(f->>'impressions','')::bigint, nullif(f->>'reach','')::bigint,
         nullif(f->>'clicks','')::bigint, nullif(f->>'inline_link_clicks','')::bigint,
         (select sum((a->>'value')::numeric)::integer from jsonb_array_elements(coalesce(f->'actions','[]')) a
           where a->>'action_type' = 'onsite_conversion.messaging_conversation_started_7d'),
         f, now()
  from jsonb_array_elements(p_filas) f
  cross join lateral (
    select case
             when f ? 'age' then 'edad_sexo'
             when f ? 'publisher_platform' then 'ubicacion'
             when f ? 'region' then 'region'
             when f ? 'impression_device' then 'dispositivo'
           end as tipo,
           case
             when f ? 'age' then coalesce(f->>'age','') || '|' || coalesce(f->>'gender','')
             when f ? 'publisher_platform' then coalesce(f->>'publisher_platform','') || '|' || coalesce(f->>'platform_position','')
             when f ? 'region' then f->>'region'
             when f ? 'impression_device' then f->>'impression_device'
           end as clave
  ) t
  where coalesce(f->>'ad_id','') <> '' and coalesce(f->>'date_start','') <> '' and t.tipo is not null
  on conflict (organization_id, fecha, ad_id, tipo, clave) do update set
    campaign_id = excluded.campaign_id, gasto = excluded.gasto, impresiones = excluded.impresiones,
    alcance = excluded.alcance, clics = excluded.clics, clics_enlace = excluded.clics_enlace,
    conversaciones = excluded.conversaciones, raw = excluded.raw, actualizado_at = now();
  get diagnostics v_filas = row_count;
  return jsonb_build_object('ok', true, 'filas', v_filas);
end;
$$;

revoke all on function public.meta_ads_guardar_desglose(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.meta_ads_guardar_desglose(uuid, jsonb) to service_role;

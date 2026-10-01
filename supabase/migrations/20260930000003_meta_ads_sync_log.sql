-- Sincronización real de campañas con Meta Graph API.
--
-- 1) `last_synced_at`: fecha de la última sincronización correcta de cada entidad (la que
--    usa el panel para mostrar "Última sincronización: ..."). `synced_at` ya existía; este
--    campo deja el contrato explícito pedido y se rellena en cada sincronización.
-- 2) `meta_ads_sync_log`:bitácora de cada intento (correcto o fallido) con endpoint, código
--    HTTP y mensaje de Meta. Permite decir "No se pudo sincronizar. Última sincronización
--    disponible: <fecha>" sin perder los últimos datos válidos.

alter table public.meta_ads_entities
  add column if not exists last_synced_at timestamptz;

update public.meta_ads_entities
set last_synced_at = synced_at
where last_synced_at is null;

alter table public.meta_ads_entities
  alter column last_synced_at set default now();

-- El panel filtra por tipo y estado (tarjetas de campañas).
create index if not exists meta_ads_entities_tipo_status_idx
  on public.meta_ads_entities (entity_type, status);

create table if not exists public.meta_ads_sync_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  account_id text,
  ok boolean not null default false,
  campanas integer not null default 0,
  conjuntos integer not null default 0,
  anuncios integer not null default 0,
  errores jsonb not null default '[]'::jsonb,
  iniciado_en timestamptz not null default now(),
  terminado_en timestamptz
);

create index if not exists meta_ads_sync_log_org_fecha_idx
  on public.meta_ads_sync_log (organization_id, iniciado_en desc);

grant select on public.meta_ads_sync_log to authenticated, service_role;
revoke all on public.meta_ads_sync_log from anon;

alter table public.meta_ads_sync_log enable row level security;

drop policy if exists panel_read on public.meta_ads_sync_log;
create policy panel_read on public.meta_ads_sync_log
  for select to authenticated
  using (organization_id is null or organization_id = (select private.get_user_org_id()));

-- Solo la Edge Function escribe la bitácora.
revoke insert, update, delete on public.meta_ads_sync_log from anon, authenticated;
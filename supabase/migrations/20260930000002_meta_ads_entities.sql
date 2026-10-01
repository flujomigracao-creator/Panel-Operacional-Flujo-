-- Estado ACTUAL de las entidades de Meta Ads (campañas, conjuntos y anuncios).
--
-- POR QUÉ EXISTE
--   `meta_ads_insights` guarda MÉTRICAS HISTÓRICAS (gasto, impresiones, clics,
--   conversaciones por día y campaña). NO guarda el estado actual ni los presupuestos:
--   eso solo existe en la Meta Graph API. Antes el panel adivinaba `status = 'ACTIVE'`.
--
--   Esta tabla es la persistencia (caché) de esa lectura: la Edge Function `asistente`
--   la sincroniza con credenciales de servidor (META_ADS_TOKEN / META_AD_ACCOUNT_ID) y el
--   panel la lee directamente de Supabase. Así:
--     - el dashboard no depende de una llamada en vivo a Meta ni del asistente;
--     - el frontend nunca ve tokens de Meta;
--     - queda historial/auditoría de cambios de estado y presupuesto (`synced_at`).
--
--   Nada se inventa: si Meta no devolvió el campo, la columna queda en null.

create table if not exists public.meta_ads_entities (
  organization_id uuid references public.organizations(id) on delete cascade,
  entity_type text not null check (entity_type in ('campaign', 'adset', 'ad')),
  entity_id text not null,                                  -- id de Meta (string numérica)
  parent_id text,                                           -- adset -> campaign_id, ad -> adset_id
  name text,
  status text,                                              -- ACTIVE | PAUSED | ARCHIVED | DELETED
  effective_status text,                                    -- effective_status de Meta
  daily_budget numeric,                                     -- en BRL (la API devuelve centavos)
  lifetime_budget numeric,
  objective text,
  account_id text not null,                                       -- cuenta publicitaria de Meta (act_…)
  creative_name text,
  synced_at timestamptz not null default now(),
  -- Identidad lógica: cuenta + tipo + id de Meta. Una campaña de otra cuenta nunca colisiona
  -- y sincronizar N veces siempre actualiza el mismo registro (UPSERT), nunca duplica.
  primary key (account_id, entity_type, entity_id)
);

create index if not exists meta_ads_entities_org_type_idx
  on public.meta_ads_entities (organization_id, entity_type);
create index if not exists meta_ads_entities_parent_idx
  on public.meta_ads_entities (parent_id);

-- Lectura: el panel (rol `authenticated`) y la Edge Function (`service_role`).
-- Escritura: SOLO la Edge Function; el frontend nunca inserta ni actualiza aquí.
grant select on public.meta_ads_entities to authenticated, service_role;
revoke all on public.meta_ads_entities from anon;

alter table public.meta_ads_entities enable row level security;

drop policy if exists panel_read on public.meta_ads_entities;
create policy panel_read on public.meta_ads_entities
  for select to authenticated
  using (organization_id is null or organization_id = (select private.get_user_org_id()));

-- Comprobación de escritura restringida a service_role (que bypasea RLS).
revoke insert, update, delete on public.meta_ads_entities from anon, authenticated;

-- Nota sobre atribución: `meta_ads_referidos` solo tiene `ad_id`, `raw` y `body` (payload
-- crudo del webhook de Meta); no tiene `created_at` ni `campaign_id`. NO se altera aquí para
-- no romper el flujo de Nora: la atribución real se resuelve leyendo ese payload y cruzando
-- `ad_id` con `meta_ads_insights`/`meta_ads_entities`. Lo que no se puede determinar queda
-- como "no atribuido".
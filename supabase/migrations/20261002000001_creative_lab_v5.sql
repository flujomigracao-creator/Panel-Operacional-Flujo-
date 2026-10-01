-- Motor Científico V5 — Laboratorio de Creativos
--
-- Se construye SOBRE el V4 (campaign_experiments / variants / measurements / hypotheses /
-- learnings) y sobre la atribución que ya existe en la base:
--   meta_ads_referidos(ad_id, telefono_chave) --trigger--> comercial_leads.meta_ad_id
--   comercial_leads.client_id --> payments(status='paid')
--   vista meta_ads_resultados: ad_id -> gasto, conversaciones, leads, ganados, clientes_pagaron, ingresos
-- Aquí solo se añade la capa que faltaba: QUÉ creativo (imagen + prompt + copy) era cada anuncio.
-- Nada se inventa: si un anuncio no tiene datos, las métricas quedan en NULL, nunca en 0 artificial.

-- 1. Biblioteca de prompts ---------------------------------------------------------
create table if not exists public.creative_prompts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  name text not null,
  service text not null,
  concept text,
  prompt text not null,
  version integer not null default 1,
  variables jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'archived')),
  parent_prompt_id uuid references public.creative_prompts(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists creative_prompts_org_service_idx on public.creative_prompts (organization_id, service);

-- 2. Creativos (imagen + copy + prompt usado + enlace a los IDs reales de Meta) ---------
create table if not exists public.creatives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  service text not null,
  objective text,
  concept text,
  format text not null default '1:1' check (format in ('1:1', '4:5', '9:16')),
  prompt_id uuid references public.creative_prompts(id) on delete set null,
  prompt_text text,
  prompt_version integer,
  hook text,
  headline text,
  primary_text text,
  cta text,
  visual_concept text,
  image_path text,
  image_source text check (image_source in ('generated', 'uploaded')),
  status text not null default 'draft' check (status in ('draft', 'approved', 'published', 'archived')),
  parent_creative_id uuid references public.creatives(id) on delete set null,
  campaign_id text,
  adset_id text,
  ad_id text,
  meta_creative_id text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists creatives_org_service_idx on public.creatives (organization_id, service);
create index if not exists creatives_ad_idx on public.creatives (ad_id);
create index if not exists creatives_prompt_idx on public.creatives (prompt_id);
-- Un anuncio de Meta corresponde a UN creativo: así la atribución nunca se reparte ni se duplica.
create unique index if not exists creatives_ad_unique_idx on public.creatives (ad_id) where ad_id is not null;

-- 3. El V4 ya usa campaign_variants.creative_id para el id de AdCreative de Meta; para no mezclar
--    significados el creativo del laboratorio se enlaza con una columna propia.
alter table public.campaign_variants
  add column if not exists creative_asset_id uuid references public.creatives(id) on delete set null;
create index if not exists campaign_variants_creative_asset_idx on public.campaign_variants (creative_asset_id);

-- 4. Aprendizajes: tamaño de muestra y siguiente paso (el V4 solo tenía 'evidence' libre).
alter table public.campaign_learnings
  add column if not exists sample_size integer,
  add column if not exists next_experiment text;

-- 5. Resultados por creativo: embudo completo, solo con datos reales -------------------
create or replace view public.creative_resultados with (security_invoker = true) as
with ins as (
  select organization_id, ad_id,
         sum(impresiones) as impresiones, sum(clics) as clics,
         sum(gasto) as gasto, sum(conversaciones) as conversaciones
  from public.meta_ads_insights
  group by organization_id, ad_id
)
select
  c.id, c.organization_id, c.service, c.objective, c.concept, c.format, c.prompt_id, c.prompt_version,
  c.hook, c.headline, c.primary_text, c.cta, c.visual_concept, c.image_path, c.image_source, c.status,
  c.parent_creative_id, c.campaign_id, c.adset_id, c.ad_id, c.created_at,
  i.impresiones, i.clics, i.gasto, i.conversaciones,
  r.leads, r.ganados, r.clientes_pagaron, r.ingresos,
  round(i.clics::numeric * 100 / nullif(i.impresiones, 0), 2)        as ctr,
  round(i.gasto / nullif(i.conversaciones, 0), 2)                    as costo_por_conversacion,
  round(i.gasto / nullif(r.leads, 0), 2)                             as costo_por_lead,
  round(i.gasto / nullif(r.clientes_pagaron, 0), 2)                  as costo_por_cliente,
  round(r.ingresos / nullif(i.gasto, 0), 2)                          as roas
from public.creatives c
left join ins i on i.ad_id = c.ad_id and i.organization_id is not distinct from c.organization_id
left join public.meta_ads_resultados r on r.ad_id = c.ad_id and r.organization_id is not distinct from c.organization_id;

-- 6. Resultados por prompt: ¿qué tipo de instrucción produce mejores creativos? ---------
create or replace view public.prompt_resultados with (security_invoker = true) as
select
  p.id, p.organization_id, p.name, p.service, p.concept, p.prompt, p.version, p.variables, p.status, p.created_at,
  count(cr.id)                                   as creativos_generados,
  count(cr.ad_id)                                as creativos_publicados,
  sum(cr.impresiones)                            as impresiones,
  sum(cr.clics)                                  as clics,
  sum(cr.conversaciones)                         as conversaciones,
  sum(cr.leads)                                  as leads,
  sum(cr.clientes_pagaron)                       as clientes,
  sum(cr.gasto)                                  as gasto,
  sum(cr.ingresos)                               as ingresos,
  round(sum(cr.gasto) / nullif(sum(cr.clientes_pagaron), 0), 2) as costo_por_cliente
from public.creative_prompts p
left join public.creative_resultados cr on cr.prompt_id = p.id
group by p.id;

-- 7. Seguridad: lectura para el panel, escritura SOLO desde la Edge Function (service_role) ---
grant select on public.creative_prompts, public.creatives to authenticated;
grant select, insert, update, delete on public.creative_prompts, public.creatives to service_role;
grant select on public.creative_resultados, public.prompt_resultados to authenticated, service_role;
grant update on public.campaign_variants to service_role;
revoke all on public.creative_prompts, public.creatives, public.creative_resultados, public.prompt_resultados from anon;
revoke insert, update, delete on public.creative_prompts, public.creatives from authenticated;

alter table public.creative_prompts enable row level security;
alter table public.creatives enable row level security;

drop policy if exists panel_read on public.creative_prompts;
create policy panel_read on public.creative_prompts for select to authenticated
  using (organization_id is null or organization_id = (select private.get_user_org_id()));
drop policy if exists panel_read on public.creatives;
create policy panel_read on public.creatives for select to authenticated
  using (organization_id is null or organization_id = (select private.get_user_org_id()));

-- 8. Imágenes: bucket privado. El panel las ve con URL firmada; solo la Edge Function las escribe.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('creatives', 'creatives', false, 8388608, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists creatives_read on storage.objects;
create policy creatives_read on storage.objects for select to authenticated
  using (bucket_id = 'creatives');

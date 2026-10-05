-- Generación de creativos con OpenAI: extiende `creatives` (sin tabla duplicada) y registra cada generación.

alter table public.creatives
  add column if not exists model text,
  add column if not exists variant text,                 -- 'A', 'B'… dentro de un experimento
  add column if not exists changed_variable text,        -- qué cambió frente al creativo padre (estilo, hook, imagen…)
  add column if not exists version integer not null default 1,
  add column if not exists root_creative_id uuid references public.creatives(id) on delete set null,
  add column if not exists audience text,
  add column if not exists style text,
  add column if not exists language text,
  add column if not exists image_mime text,
  add column if not exists image_bytes integer,
  add column if not exists experiment_id uuid references public.campaign_experiments(id) on delete set null;
create index if not exists creatives_root_idx on public.creatives (root_creative_id, version);
create index if not exists creatives_experiment_idx on public.creatives (experiment_id);

-- Bitácora de generaciones: modelo, usuario, uso/costo (solo lo que la API devuelve; nada se inventa).
create table if not exists public.creative_generations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  creative_id uuid references public.creatives(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('concepts', 'prompt', 'image')),
  model text,
  status text not null check (status in ('ok', 'error')),
  usage jsonb,                 -- tokens/uso devueltos por OpenAI
  cost_usd numeric,            -- null si OpenAI no lo informa; se completa con tarifas reales, no con estimaciones
  error text,
  created_at timestamptz not null default now()
);
create index if not exists creative_generations_creative_idx on public.creative_generations (creative_id);
create index if not exists creative_generations_org_day_idx on public.creative_generations (organization_id, created_at desc);

grant select on public.creative_generations to authenticated;
grant select, insert, update, delete on public.creative_generations to service_role;
revoke all on public.creative_generations from anon;
revoke insert, update, delete on public.creative_generations from authenticated;
alter table public.creative_generations enable row level security;
drop policy if exists panel_read on public.creative_generations;
create policy panel_read on public.creative_generations for select to authenticated
  using (organization_id is null or organization_id = (select private.get_user_org_id()));

-- Resultados por creativo: añade versión, variante y modelo al final (mismo orden previo de columnas).
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
  round(r.ingresos / nullif(i.gasto, 0), 2)                          as roas,
  c.version, c.variant, c.model, c.root_creative_id, c.changed_variable
from public.creatives c
left join ins i on i.ad_id = c.ad_id and i.organization_id is not distinct from c.organization_id
left join public.meta_ads_resultados r on r.ad_id = c.ad_id and r.organization_id is not distinct from c.organization_id;
grant select on public.creative_resultados to authenticated, service_role;

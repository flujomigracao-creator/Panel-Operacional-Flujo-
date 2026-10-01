-- Trazabilidad completa de experimentos:
--   experimento → variante → creativo → generación → campaña → conjunto → anuncio → leads → pagos
-- creatives ya guardaba experiment_id/campaign_id/adset_id/ad_id; faltaba la generación que produjo la imagen.

alter table public.creatives
  add column if not exists generation_id uuid references public.creative_generations(id) on delete set null;
create index if not exists creatives_generation_idx on public.creatives (generation_id);

alter table public.campaign_variants
  add column if not exists creative_generation_id uuid references public.creative_generations(id) on delete set null;

-- Relleno de lo ya existente: la última generación de imagen registrada para cada creativo.
update public.creatives c set generation_id = g.id
from (
  select distinct on (creative_id) id, creative_id
  from public.creative_generations
  where kind = 'image' and status = 'ok' and creative_id is not null
  order by creative_id, created_at desc
) g
where g.creative_id = c.id and c.generation_id is null;

update public.campaign_variants v set creative_generation_id = c.generation_id
from public.creatives c
where c.id = v.creative_asset_id and v.creative_generation_id is null and c.generation_id is not null;

-- Una fila por variante con todo el recorrido. Sin datos → NULL (nunca 0 inventado).
create or replace view public.experiment_trazabilidad with (security_invoker = true) as
with leads as (
  select ad_id, count(*) as leads, count(*) filter (where ganado) as ganados,
         sum(pagos) as pagos, sum(ingresos) as ingresos
  from public.origen_leads
  where ad_id is not null
  group by ad_id
)
select
  e.id as experiment_id, e.name as experiment_name, e.status as experiment_status, e.service,
  v.id as variant_id, v.variant_name, v.variable_changed,
  c.id as creative_id, c.headline, c.format, c.style, c.version as creative_version,
  g.id as creative_generation_id, g.model as generation_model, g.cost_usd as generation_cost_usd,
  coalesce(v.campaign_id, c.campaign_id) as campaign_id,
  coalesce(v.adset_id, c.adset_id) as adset_id,
  coalesce(v.ad_id, c.ad_id) as ad_id,
  r.impresiones, r.clics, r.gasto, r.conversaciones,
  l.leads, l.ganados, l.pagos, l.ingresos
from public.campaign_variants v
join public.campaign_experiments e on e.id = v.experiment_id
left join public.creatives c on c.id = v.creative_asset_id
left join public.creative_generations g on g.id = coalesce(v.creative_generation_id, c.generation_id)
left join public.creative_resultados r on r.id = c.id
left join leads l on l.ad_id = coalesce(v.ad_id, c.ad_id);

grant select on public.experiment_trazabilidad to authenticated;

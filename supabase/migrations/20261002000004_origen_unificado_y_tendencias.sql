-- V5.2 — Vista unificada de origen (lead → anuncio → creativo → prompt → pagos) y tendencias de mercado.
-- Nada se inventa: sin evidencia de anuncio, el origen es 'sin_origen' (no se reparte a ojo).

-- 1. Origen de TODOS los leads. origen: 'anuncio' (referral de Meta con ad_id), 'meta_declarado' (lead_source de Meta sin anuncio)
--    o 'sin_origen'. Incluye el creativo y el prompt cuando el anuncio salió del Laboratorio.
create or replace view public.origen_leads with (security_invoker = true) as
select
  l.id as lead_id, l.organization_id, l.nombre, l.tramite_texto, l.etapa_nombre, l.created_at,
  (l.etapa_status_id = 142) as ganado,
  l.client_id,
  case when l.meta_ad_id is not null then 'anuncio'
       when l.lead_source ~* '(meta|facebook|instagram|fb|ig|messenger|paid_?social)' then 'meta_declarado'
       else 'sin_origen' end as origen,
  l.meta_ad_id as ad_id, ad.name as ad_name,
  ad.parent_id as adset_id, st.name as adset_name,
  st.parent_id as campaign_id, cp.name as campaign_name,
  l.meta_referido_at,
  c.id as creative_id, c.headline as creative_headline, c.style as creative_style, c.format as creative_format, c.version as creative_version,
  c.prompt_id, pr.name as prompt_name, c.prompt_version,
  coalesce(p.pagos, 0) as pagos, coalesce(p.ingresos, 0) as ingresos
from public.comercial_leads l
left join public.meta_ads_entities ad on ad.entity_type = 'ad' and ad.entity_id = l.meta_ad_id
left join public.meta_ads_entities st on st.entity_type = 'adset' and st.entity_id = ad.parent_id
left join public.meta_ads_entities cp on cp.entity_type = 'campaign' and cp.entity_id = st.parent_id
left join public.creatives c on c.ad_id = l.meta_ad_id
left join public.creative_prompts pr on pr.id = c.prompt_id
left join lateral (
  select count(*) as pagos, sum(amount) as ingresos from public.payments pa where pa.client_id = l.client_id and pa.status = 'paid'
) p on true;

-- 2. Cobertura de atribución: cuántos leads tienen origen demostrable (para decir la verdad sobre lo que se puede afirmar).
create or replace view public.cobertura_atribucion with (security_invoker = true) as
select
  organization_id,
  count(*) as leads,
  count(*) filter (where origen = 'anuncio') as con_anuncio,
  count(*) filter (where origen = 'meta_declarado') as meta_declarado,
  count(*) filter (where origen = 'sin_origen') as sin_origen,
  count(*) filter (where ganado or pagos > 0) as cerrados,
  count(*) filter (where (ganado or pagos > 0) and origen = 'anuncio') as cerrados_con_anuncio,
  (select count(*) from public.meta_ads_referidos r where r.organization_id is not distinct from l.organization_id) as referidos_recibidos
from public.origen_leads l
group by organization_id;

-- 3. Tendencias de mercado buscadas por el agente. Son HIPÓTESIS candidatas, no evidencia: no se mezclan con campaign_learnings.
create table if not exists public.ad_trends (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  service text,
  topic text not null,
  summary text not null,
  sources jsonb not null default '[]'::jsonb,
  query text,
  status text not null default 'new' check (status in ('new', 'used', 'discarded')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists ad_trends_org_service_idx on public.ad_trends (organization_id, service, created_at desc);

-- La bitácora de generaciones también registra las búsquedas de tendencias.
alter table public.creative_generations drop constraint if exists creative_generations_kind_check;
alter table public.creative_generations add constraint creative_generations_kind_check check (kind in ('concepts', 'prompt', 'image', 'trends'));

-- 4. Seguridad: lectura para el panel; escritura solo service_role.
grant select on public.ad_trends to authenticated;
grant select, insert, update, delete on public.ad_trends to service_role;
grant select on public.origen_leads, public.cobertura_atribucion to authenticated, service_role;
revoke all on public.ad_trends, public.origen_leads, public.cobertura_atribucion from anon;
revoke insert, update, delete on public.ad_trends from authenticated;
alter table public.ad_trends enable row level security;
drop policy if exists panel_read on public.ad_trends;
create policy panel_read on public.ad_trends for select to authenticated
  using (organization_id is null or organization_id = (select private.get_user_org_id()));

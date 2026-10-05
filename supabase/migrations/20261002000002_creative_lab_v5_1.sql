-- V5.1 — completa el Laboratorio de Creativos sobre las tablas existentes (sin duplicar V4/V5).

-- 1. Conceptos publicitarios registrados (antes de generar la imagen).
create table if not exists public.creative_concepts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  service text not null,
  objective text,
  concept text not null,
  hook text,
  headline text,
  primary_text text,
  cta text,
  visual_concept text,
  prompt text,
  based_on_data boolean not null default false,
  status text not null default 'proposed' check (status in ('proposed', 'used', 'discarded')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists creative_concepts_org_service_idx on public.creative_concepts (organization_id, service);

alter table public.creatives
  add column if not exists concept_id uuid references public.creative_concepts(id) on delete set null;

-- 2. Qué cambió exactamente en cada variante respecto al control (variable controlada).
alter table public.campaign_variants add column if not exists variable_changed text;

-- 3. Umbrales de decisión congelados al crear el experimento (no cambian a mitad del test).
alter table public.campaign_experiments add column if not exists decision_thresholds jsonb;

-- 4. Atribución por lead: anuncio -> conjunto -> campaña -> creativo -> cliente -> pago (solo evidencia real).
create or replace view public.lead_atribucion_anuncio with (security_invoker = true) as
select
  l.id as lead_id, l.organization_id, l.kommo_lead_id, l.client_id, l.tramite_texto, l.etapa_nombre,
  l.meta_ad_id as ad_id, l.meta_referido_at,
  ad.parent_id as adset_id, ads.parent_id as campaign_id,
  c.id as creative_id, c.service as creative_service, c.concept as creative_concept,
  cl.country as pais,
  coalesce(p.pagos, 0) as pagos, coalesce(p.ingresos, 0) as ingresos
from public.comercial_leads l
left join public.meta_ads_entities ad on ad.entity_type = 'ad' and ad.entity_id = l.meta_ad_id
left join public.meta_ads_entities ads on ads.entity_type = 'adset' and ads.entity_id = ad.parent_id
left join public.creatives c on c.ad_id = l.meta_ad_id
left join public.clients cl on cl.id = l.client_id
left join lateral (
  select count(*) as pagos, sum(amount) as ingresos from public.payments pa where pa.client_id = l.client_id and pa.status = 'paid'
) p on true
where l.meta_ad_id is not null;

-- 5. Seguridad: lectura para el panel; escritura solo service_role.
grant select on public.creative_concepts to authenticated;
grant select, insert, update, delete on public.creative_concepts to service_role;
grant select on public.lead_atribucion_anuncio to authenticated, service_role;
grant update on public.campaign_experiments to service_role;
revoke all on public.creative_concepts, public.lead_atribucion_anuncio from anon;
revoke insert, update, delete on public.creative_concepts from authenticated;
alter table public.creative_concepts enable row level security;
drop policy if exists panel_read on public.creative_concepts;
create policy panel_read on public.creative_concepts for select to authenticated
  using (organization_id is null or organization_id = (select private.get_user_org_id()));

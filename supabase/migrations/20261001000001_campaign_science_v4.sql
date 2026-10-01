-- Motor Científico de Campañas V4 — Flujo de Migração
-- Tablas para experimentación de marketing basada en datos reales,
-- medición del funnel completo (Impresión -> Clic -> WhatsApp -> Conversación -> Lead -> Propuesta -> Pago -> Cliente -> Ingreso),
-- registro de hipótesis y acumulación sistemática de aprendizajes.

-- 1. Experimentos de Campañas --------------------------------------------------
create table if not exists public.campaign_experiments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  name text not null,
  service text not null,
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'approved', 'running', 'paused', 'completed', 'cancelled')),
  hypothesis text not null,
  objective text not null,
  primary_metric text not null,
  secondary_metrics jsonb not null default '[]'::jsonb,
  audience_definition jsonb not null default '{}'::jsonb,
  budget numeric not null default 0,
  start_date timestamptz,
  end_date timestamptz,
  control_description text,
  treatment_description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaign_experiments_org_status_idx
  on public.campaign_experiments (organization_id, status);
create index if not exists campaign_experiments_service_idx
  on public.campaign_experiments (service);

-- 2. Variantes del Experimento (Control, Tratamiento A, Tratamiento B...) --------
create table if not exists public.campaign_variants (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.campaign_experiments(id) on delete cascade,
  variant_name text not null,
  campaign_id text,
  adset_id text,
  ad_id text,
  creative_id text,
  hook text,
  copy text,
  creative_reference text,
  cta text,
  audience_definition jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists campaign_variants_exp_idx
  on public.campaign_variants (experiment_id);
create index if not exists campaign_variants_meta_ids_idx
  on public.campaign_variants (campaign_id, adset_id, ad_id);

-- 3. Mediciones periódicas del Experimento --------------------------------------
-- Importante: Si un dato no existe o no está atribuido, es NULL, no 0 artificial.
create table if not exists public.campaign_measurements (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.campaign_experiments(id) on delete cascade,
  variant_id uuid not null references public.campaign_variants(id) on delete cascade,
  date date not null default current_date,
  spend numeric,
  impressions integer,
  reach integer,
  clicks integer,
  ctr numeric,
  cpc numeric,
  cpm numeric,
  conversations integer,
  leads integer,
  proposals integer,
  payments integer,
  customers integer,
  revenue numeric,
  cost_per_lead numeric,
  cost_per_customer numeric,
  conversion_rate numeric,
  roas numeric,
  created_at timestamptz not null default now()
);

create index if not exists campaign_measurements_exp_date_idx
  on public.campaign_measurements (experiment_id, date desc);
create index if not exists campaign_measurements_variant_idx
  on public.campaign_measurements (variant_id);

-- 4. Hipótesis formuladas y su resultado empírico --------------------------------
create table if not exists public.campaign_hypotheses (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.campaign_experiments(id) on delete cascade,
  hypothesis text not null,
  reasoning text,
  evidence jsonb,
  result text not null default 'inconclusive' check (result in ('supported', 'not_supported', 'inconclusive')),
  confidence numeric,
  decision text,
  created_at timestamptz not null default now()
);

create index if not exists campaign_hypotheses_exp_idx
  on public.campaign_hypotheses (experiment_id);

-- 5. Aprendizajes Acumulados (Learning Engine) ----------------------------------
-- Se consulta antes de diseñar nuevas hipótesis para no repetir errores y escalar lo que funciona.
create table if not exists public.campaign_learnings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  service text not null,
  audience text,
  country text,
  creative_angle text,
  hook text,
  channel text,
  learning text not null,
  evidence text,
  confidence numeric,
  source_experiment_id uuid references public.campaign_experiments(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists campaign_learnings_org_service_idx
  on public.campaign_learnings (organization_id, service);

-- 6. Seguridad y RLS -------------------------------------------------------------
grant select on public.campaign_experiments to authenticated, service_role;
grant select on public.campaign_variants to authenticated, service_role;
grant select on public.campaign_measurements to authenticated, service_role;
grant select on public.campaign_hypotheses to authenticated, service_role;
grant select on public.campaign_learnings to authenticated, service_role;

revoke all on public.campaign_experiments from anon;
revoke all on public.campaign_variants from anon;
revoke all on public.campaign_measurements from anon;
revoke all on public.campaign_hypotheses from anon;
revoke all on public.campaign_learnings from anon;

alter table public.campaign_experiments enable row level security;
alter table public.campaign_variants enable row level security;
alter table public.campaign_measurements enable row level security;
alter table public.campaign_hypotheses enable row level security;
alter table public.campaign_learnings enable row level security;

-- Políticas de lectura para usuarios autenticados
drop policy if exists panel_read on public.campaign_experiments;
create policy panel_read on public.campaign_experiments
  for select to authenticated
  using (organization_id is null or organization_id = (select private.get_user_org_id()));

drop policy if exists panel_read on public.campaign_variants;
create policy panel_read on public.campaign_variants
  for select to authenticated
  using (true);

drop policy if exists panel_read on public.campaign_measurements;
create policy panel_read on public.campaign_measurements
  for select to authenticated
  using (true);

drop policy if exists panel_read on public.campaign_hypotheses;
create policy panel_read on public.campaign_hypotheses
  for select to authenticated
  using (true);

drop policy if exists panel_read on public.campaign_learnings;
create policy panel_read on public.campaign_learnings
  for select to authenticated
  using (organization_id is null or organization_id = (select private.get_user_org_id()));

-- Escritura reservada a service_role (Edge Function)
revoke insert, update, delete on public.campaign_experiments from anon, authenticated;
revoke insert, update, delete on public.campaign_variants from anon, authenticated;
revoke insert, update, delete on public.campaign_measurements from anon, authenticated;
revoke insert, update, delete on public.campaign_hypotheses from anon, authenticated;
revoke insert, update, delete on public.campaign_learnings from anon, authenticated;

-- Motor Científico de Campañas V5 — Flujo de Migração
-- Creativos, Biblioteca de Prompts, Comparador de Variantes y Atribución Completa hasta el Pago.

-- 1. Biblioteca de Prompts Publicitarios ---------------------------------------
-- Guarda las instrucciones maestras y mide qué tipo de prompt produce mejores clientes.
create table if not exists public.creative_prompts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  nombre text not null,
  service text not null, -- 'CPF', 'Agendamento PF', 'RNM', 'Residência Permanente', 'Refúgio'
  prompt text not null,
  version text not null default 'v1.0',
  concepto text not null default 'servicio_directo', -- 'persona_documentacion', 'problema_solucion', 'servicio_directo', 'institucional', 'ganador_historico'
  variables jsonb not null default '{}'::jsonb,
  creativos_generados integer not null default 0,
  impresiones integer not null default 0,
  clics integer not null default 0,
  conversaciones integer not null default 0,
  leads integer not null default 0,
  clientes integer not null default 0,
  pagos integer not null default 0,
  costo_por_cliente numeric,
  ingresos numeric not null default 0,
  estado text not null default 'active' check (estado in ('active', 'draft', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists creative_prompts_org_service_idx
  on public.creative_prompts (organization_id, service);
create index if not exists creative_prompts_concepto_idx
  on public.creative_prompts (concepto);

-- 2. Biblioteca de Creativos Publicitarios -------------------------------------
-- Almacena cada imagen, prompt utilizado, formato, copy publicitario y desempeño.
create table if not exists public.campaign_creatives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  prompt_id uuid references public.creative_prompts(id) on delete set null,
  service text not null, -- 'CPF', 'Agendamento PF', 'RNM', 'Residência Permanente', 'Refúgio'
  prompt_text text not null,
  prompt_version text default 'v1.0',
  image_url text not null,
  format text not null default '1:1' check (format in ('1:1', '4:5', '9:16')),
  headline text,
  primary_text text,
  cta text default 'Enviar mensaje',
  visual_concept text not null default 'servicio_directo', -- 'persona', 'problema_solucion', 'documento', 'institucional', 'mensaje_directo'
  meta_creative_id text,
  ad_id text,
  campaign_id text,
  adset_id text,
  status text not null default 'draft' check (status in ('draft', 'approved', 'active', 'paused', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaign_creatives_org_service_idx
  on public.campaign_creatives (organization_id, service);
create index if not exists campaign_creatives_meta_ids_idx
  on public.campaign_creatives (campaign_id, adset_id, ad_id, meta_creative_id);
create index if not exists campaign_creatives_prompt_idx
  on public.campaign_creatives (prompt_id);

-- 3. Extensión de Variantes con Referencia a Creativos -------------------------
alter table public.campaign_variants
  add column if not exists creative_ref_id uuid references public.campaign_creatives(id) on delete set null;

-- 4. Extensión de Atribución en Leads Comerciales ------------------------------
-- Conecta Anuncio -> Conversación -> Lead -> Cliente -> Pago con IDs reales.
alter table public.comercial_leads
  add column if not exists meta_campaign_id text,
  add column if not exists meta_adset_id text,
  add column if not exists meta_ad_id text,
  add column if not exists meta_creative_id text;

create index if not exists comercial_leads_meta_ad_idx
  on public.comercial_leads (meta_ad_id);
create index if not exists comercial_leads_meta_camp_idx
  on public.comercial_leads (meta_campaign_id);

-- 5. Seguridad y Permisos RLS --------------------------------------------------
grant select on public.creative_prompts to authenticated, service_role;
grant select on public.campaign_creatives to authenticated, service_role;

revoke all on public.creative_prompts from anon;
revoke all on public.campaign_creatives from anon;

alter table public.creative_prompts enable row level security;
alter table public.campaign_creatives enable row level security;

drop policy if exists panel_read on public.creative_prompts;
create policy panel_read on public.creative_prompts
  for select to authenticated
  using (organization_id is null or organization_id = (select private.get_user_org_id()));

drop policy if exists panel_read on public.campaign_creatives;
create policy panel_read on public.campaign_creatives
  for select to authenticated
  using (organization_id is null or organization_id = (select private.get_user_org_id()));

-- Escritura restringida a service_role (Edge Function) y authenticated con org activa
drop policy if exists panel_write on public.creative_prompts;
create policy panel_write on public.creative_prompts
  for all to authenticated
  using (organization_id is null or organization_id = (select private.get_user_org_id()))
  with check (organization_id is null or organization_id = (select private.get_user_org_id()));

drop policy if exists panel_write on public.campaign_creatives;
create policy panel_write on public.campaign_creatives
  for all to authenticated
  using (organization_id is null or organization_id = (select private.get_user_org_id()))
  with check (organization_id is null or organization_id = (select private.get_user_org_id()));

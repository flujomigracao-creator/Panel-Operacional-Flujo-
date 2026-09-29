-- Atribución de anuncios de Meta: de qué anuncio vino cada lead, cuánto se gastó en cada anuncio y qué
-- produjo en clientes y pagos. Tres piezas:
--   · meta_ads_referidos: el objeto `referral` que Meta manda en el primer mensaje de un chat abierto
--     desde un anuncio "clic a WhatsApp" (lo guarda el edge function whatsapp-webhook).
--   · comercial_leads.meta_ad_id: el anuncio de origen de cada lead, completado por triggers, tanto si el
--     lead ya existía como si n8n lo crea después del primer mensaje (el caso normal de un número nuevo).
--   · meta_ads_insights: gasto y resultados diarios por anuncio, que carga n8n desde la Marketing API.
-- La vista meta_ads_resultados cruza las tres cosas con payments.

-- ── Referidos de anuncios (uno por mensaje entrante que trae `referral`) ────────────────────────────
create table if not exists public.meta_ads_referidos (
  wamid text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  telefono_chave text not null,
  source_type text,          -- 'ad' | 'post'
  ad_id text,                -- referral.source_id cuando source_type = 'ad'
  source_url text,
  headline text,
  body text,
  ctwa_clid text,            -- id del clic, sirve para devolver conversiones a Meta (Conversions API)
  raw jsonb not null,
  recibido_at timestamptz not null default now()
);
comment on table public.meta_ads_referidos is
  'Objeto referral de WhatsApp Cloud API: un registro por mensaje entrante que llegó desde un anuncio o publicación de Meta.';
create index if not exists meta_ads_referidos_tel_idx on public.meta_ads_referidos (organization_id, telefono_chave, recibido_at desc);
create index if not exists meta_ads_referidos_ad_idx on public.meta_ads_referidos (ad_id);

alter table public.meta_ads_referidos enable row level security;
drop policy if exists tenant_isolation on public.meta_ads_referidos;
create policy tenant_isolation on public.meta_ads_referidos
  for select to authenticated
  using (organization_id = (select private.get_user_org_id()));
revoke insert, update, delete on public.meta_ads_referidos from anon, authenticated;
revoke all on public.meta_ads_referidos from anon;

-- ── Anuncio de origen en el lead ───────────────────────────────────────────────────────────────────
alter table public.comercial_leads
  add column if not exists meta_ad_id text,
  add column if not exists meta_ctwa_clid text,
  add column if not exists meta_referido_at timestamptz;
comment on column public.comercial_leads.meta_ad_id is
  'Anuncio de Meta del que vino el lead (primer toque). Se cruza con meta_ads_insights.ad_id.';
create index if not exists comercial_leads_meta_ad_idx on public.comercial_leads (organization_id, meta_ad_id) where meta_ad_id is not null;

-- Lead que se crea (o recibe teléfono) después del mensaje del anuncio: toma el referido más reciente
-- de ese teléfono dentro de los últimos 30 días.
create or replace function public.comercial_lead_tomar_referido()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
begin
  if new.meta_ad_id is not null or coalesce(new.telefono, '') = '' then
    return new;
  end if;
  select ad_id, ctwa_clid, recibido_at into r
  from public.meta_ads_referidos
  where organization_id = new.organization_id
    and telefono_chave = public.telefone_chave(new.telefono)
    and ad_id is not null
    and recibido_at > now() - interval '30 days'
  order by recibido_at desc
  limit 1;
  if found then
    new.meta_ad_id := r.ad_id;
    new.meta_ctwa_clid := r.ctwa_clid;
    new.meta_referido_at := r.recibido_at;
  end if;
  return new;
end;
$$;

drop trigger if exists comercial_lead_tomar_referido on public.comercial_leads;
create trigger comercial_lead_tomar_referido
  before insert or update of telefono on public.comercial_leads
  for each row execute function public.comercial_lead_tomar_referido();

-- Referido que llega para un lead que ya existe: se asigna a sus leads abiertos sin anuncio
-- (no toca ganados/perdidos ni pisa un anuncio ya asignado).
create or replace function public.meta_ads_referido_a_lead()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.ad_id is null then
    return new;
  end if;
  update public.comercial_leads
     set meta_ad_id = new.ad_id, meta_ctwa_clid = new.ctwa_clid, meta_referido_at = new.recibido_at
   where organization_id = new.organization_id
     and meta_ad_id is null
     and coalesce(etapa_status_id, 0) not in (142, 143)
     and public.telefone_chave(telefono) = new.telefono_chave;
  return new;
end;
$$;

drop trigger if exists meta_ads_referido_a_lead on public.meta_ads_referidos;
create trigger meta_ads_referido_a_lead
  after insert on public.meta_ads_referidos
  for each row execute function public.meta_ads_referido_a_lead();

revoke execute on function public.comercial_lead_tomar_referido() from public, anon, authenticated;
revoke execute on function public.meta_ads_referido_a_lead() from public, anon, authenticated;

-- Mensajes ya guardados que traían referral (metadata.raw es el mensaje original de Meta). Va después de
-- los triggers para que también se asignen a sus leads.
insert into public.meta_ads_referidos (wamid, organization_id, telefono_chave, source_type, ad_id, source_url, headline, body, ctwa_clid, raw, recibido_at)
select m.external_message_id, m.organization_id,
       public.telefone_chave(m.metadata->'raw'->>'from'),
       r->>'source_type', case when r->>'source_type' = 'ad' then r->>'source_id' end,
       r->>'source_url', r->>'headline', r->>'body', r->>'ctwa_clid', r, m.created_at
from public.messages m, lateral (select m.metadata->'raw'->'referral' as r) x
where m.direction = 'inbound' and m.external_message_id is not null
  and jsonb_typeof(m.metadata->'raw'->'referral') = 'object'
  and coalesce(m.metadata->'raw'->>'from', '') <> ''
on conflict (wamid) do nothing;

-- ── Gasto y resultados diarios por anuncio (los carga n8n desde la Marketing API) ──────────────────
create table if not exists public.meta_ads_insights (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  fecha date not null,
  ad_id text not null,
  ad_name text,
  adset_id text,
  adset_name text,
  campaign_id text,
  campaign_name text,
  moneda text,
  gasto numeric(12, 2) not null default 0,
  impresiones bigint,
  clics bigint,
  conversaciones integer,    -- onsite_conversion.messaging_conversation_started_7d
  leads_meta integer,        -- lo que Meta cuenta como lead (formularios / píxel)
  raw jsonb,
  actualizado_at timestamptz not null default now(),
  primary key (organization_id, fecha, ad_id)
);
comment on table public.meta_ads_insights is
  'Insights diarios de Meta Ads por anuncio (nivel ad, time_increment=1). Upsert por (organization_id, fecha, ad_id).';
create index if not exists meta_ads_insights_campaign_idx on public.meta_ads_insights (organization_id, campaign_id, fecha);

alter table public.meta_ads_insights enable row level security;
drop policy if exists tenant_isolation on public.meta_ads_insights;
create policy tenant_isolation on public.meta_ads_insights
  for select to authenticated
  using (organization_id = (select private.get_user_org_id()));
revoke insert, update, delete on public.meta_ads_insights from anon, authenticated;
revoke all on public.meta_ads_insights from anon;

-- ── Resultado por anuncio: gasto → leads → ganados → clientes que pagaron → ingresos ──────────────
-- Cada cliente cuenta para un solo anuncio (el de su primer lead atribuido), así los pagos no se duplican.
create or replace view public.meta_ads_resultados
with (security_invoker = true) as
with gasto as (
  select organization_id, ad_id,
         max(ad_name) as ad_name, max(adset_name) as adset_name,
         max(campaign_id) as campaign_id, max(campaign_name) as campaign_name,
         sum(gasto) as gasto, sum(conversaciones) as conversaciones_meta,
         min(fecha) as desde, max(fecha) as hasta
  from public.meta_ads_insights
  group by organization_id, ad_id
), leads as (
  select organization_id, meta_ad_id as ad_id,
         count(*) as leads,
         count(*) filter (where etapa_status_id = 142) as ganados
  from public.comercial_leads
  where meta_ad_id is not null
  group by organization_id, meta_ad_id
), cliente_anuncio as (
  select distinct on (organization_id, client_id) organization_id, client_id, meta_ad_id as ad_id
  from public.comercial_leads
  where meta_ad_id is not null and client_id is not null
  order by organization_id, client_id, meta_referido_at nulls last, created_at
), pagos as (
  select ca.organization_id, ca.ad_id,
         count(distinct p.client_id) as clientes_pagaron,
         sum(p.amount) as ingresos
  from cliente_anuncio ca
  join public.payments p on p.client_id = ca.client_id and p.status = 'paid'
  group by ca.organization_id, ca.ad_id
)
select coalesce(g.organization_id, l.organization_id) as organization_id,
       coalesce(g.ad_id, l.ad_id) as ad_id,
       g.ad_name, g.adset_name, g.campaign_id, g.campaign_name, g.desde, g.hasta,
       coalesce(g.gasto, 0) as gasto,
       g.conversaciones_meta,
       coalesce(l.leads, 0) as leads,
       coalesce(l.ganados, 0) as ganados,
       coalesce(pa.clientes_pagaron, 0) as clientes_pagaron,
       coalesce(pa.ingresos, 0) as ingresos,
       round(g.gasto / nullif(l.leads, 0), 2) as costo_por_lead,
       round(g.gasto / nullif(pa.clientes_pagaron, 0), 2) as costo_por_cliente,
       round(pa.ingresos / nullif(g.gasto, 0), 2) as retorno
from gasto g
full join leads l on l.organization_id = g.organization_id and l.ad_id = g.ad_id
left join pagos pa on pa.organization_id = coalesce(g.organization_id, l.organization_id)
                  and pa.ad_id = coalesce(g.ad_id, l.ad_id);

comment on view public.meta_ads_resultados is
  'Totales históricos por anuncio de Meta. Para un período concreto, consultar meta_ads_insights y comercial_leads filtrando por fecha.';
revoke all on public.meta_ads_resultados from anon;

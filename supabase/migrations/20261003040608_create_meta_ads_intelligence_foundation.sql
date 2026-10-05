-- Meta Ads Intelligence foundation. Operational writes are server-side only.
alter table public.meta_ads_entities drop constraint if exists meta_ads_entities_entity_type_check;
alter table public.meta_ads_entities add constraint meta_ads_entities_entity_type_check check (entity_type in ('account', 'campaign', 'adset', 'ad', 'creative'));
create table if not exists public.meta_ads_attribution (
  id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id) on delete cascade, client_id uuid references public.clients(id) on delete set null, entrada_id uuid, conversation_id uuid,
  attribution_source text not null default 'unknown', fbclid text, ctwa_clid text, campaign_id text, adset_id text, ad_id text, creative_id text, utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists meta_ads_attribution_client_idx on public.meta_ads_attribution (organization_id, client_id, created_at desc);
create table if not exists public.meta_ads_funnel_events (
  id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id) on delete cascade,
  event_type text not null check (event_type in ('lead_created','contacted','qualified','service_selected','proposal_sent','payment_pending','payment_confirmed','process_started','process_completed')),
  source text not null, source_record_id text not null, client_id uuid references public.clients(id) on delete set null, entrada_id uuid, conversation_id uuid, service_id uuid, value numeric, currency text,
  campaign_id text, adset_id text, ad_id text, creative_id text, attribution_id uuid references public.meta_ads_attribution(id) on delete set null,
  occurred_at timestamptz not null default now(), metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), unique (event_type, source, source_record_id)
);
create index if not exists meta_ads_funnel_events_org_type_time_idx on public.meta_ads_funnel_events (organization_id, event_type, occurred_at desc);
create table if not exists public.meta_ads_conversion_events (
  id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id) on delete cascade, funnel_event_id uuid references public.meta_ads_funnel_events(id) on delete cascade,
  source text not null, source_record_id text not null, event_name text not null default 'Purchase', status text not null default 'pending' check (status in ('pending','sending','sent','failed')),
  attempts integer not null default 0, meta_event_id text not null default gen_random_uuid()::text, payload jsonb not null default '{}'::jsonb, response jsonb, error text, last_attempt_at timestamptz, sent_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (source, source_record_id, event_name)
);
create index if not exists meta_ads_conversion_events_pending_idx on public.meta_ads_conversion_events (status, created_at) where status in ('pending','failed');
alter table public.meta_ads_attribution enable row level security;
alter table public.meta_ads_funnel_events enable row level security;
alter table public.meta_ads_conversion_events enable row level security;
revoke all on public.meta_ads_attribution, public.meta_ads_funnel_events, public.meta_ads_conversion_events from anon;
revoke insert, update, delete on public.meta_ads_attribution, public.meta_ads_funnel_events, public.meta_ads_conversion_events from authenticated;
grant select on public.meta_ads_attribution, public.meta_ads_funnel_events, public.meta_ads_conversion_events to authenticated, service_role;
drop policy if exists panel_read on public.meta_ads_attribution;
create policy panel_read on public.meta_ads_attribution for select to authenticated using (organization_id is null or organization_id = (select private.get_user_org_id()));
drop policy if exists panel_read on public.meta_ads_funnel_events;
create policy panel_read on public.meta_ads_funnel_events for select to authenticated using (organization_id is null or organization_id = (select private.get_user_org_id()));
drop policy if exists panel_read on public.meta_ads_conversion_events;
create policy panel_read on public.meta_ads_conversion_events for select to authenticated using (organization_id is null or organization_id = (select private.get_user_org_id()));
create or replace view public.meta_ads_funnel_summary with (security_invoker = true) as
select organization_id, date_trunc('day', occurred_at)::date as event_date, campaign_id, adset_id, ad_id, creative_id,
count(*) filter (where event_type = 'lead_created') as leads, count(*) filter (where event_type = 'qualified') as qualified_leads, count(*) filter (where event_type = 'proposal_sent') as proposals,
count(*) filter (where event_type = 'payment_confirmed') as payment_confirmed, count(distinct client_id) filter (where event_type = 'payment_confirmed') as customers,
coalesce(sum(value) filter (where event_type = 'payment_confirmed'), 0) as revenue
from public.meta_ads_funnel_events group by organization_id, date_trunc('day', occurred_at)::date, campaign_id, adset_id, ad_id, creative_id;
-- payments.status = paid is the sole source of payment_confirmed.
create or replace function private.capture_meta_ads_paid_payment() returns trigger language plpgsql security definer set search_path = pg_catalog, public, private as $$
declare attribution public.meta_ads_attribution%rowtype; funnel_id uuid; source_id text := new.id::text; service_ref uuid;
begin
if new.status is distinct from 'paid' or (tg_op = 'UPDATE' and old.status = 'paid') then return new; end if;
service_ref := nullif(to_jsonb(new)->>'client_service_id', '')::uuid;
select * into attribution from public.meta_ads_attribution where organization_id is not distinct from new.organization_id and client_id is not distinct from new.client_id order by created_at desc limit 1;
insert into public.meta_ads_funnel_events (organization_id,event_type,source,source_record_id,client_id,service_id,value,currency,campaign_id,adset_id,ad_id,creative_id,attribution_id,occurred_at,metadata)
values (new.organization_id,'payment_confirmed','payments',source_id,new.client_id,service_ref,new.amount,new.currency,attribution.campaign_id,attribution.adset_id,attribution.ad_id,attribution.creative_id,attribution.id,coalesce(new.paid_at,now()),jsonb_build_object('payment_id',new.id,'payment_method',new.payment_method))
on conflict (event_type,source,source_record_id) do update set occurred_at = excluded.occurred_at returning id into funnel_id;
insert into public.meta_ads_conversion_events (organization_id,funnel_event_id,source,source_record_id,payload)
values (new.organization_id,funnel_id,'payments',source_id,jsonb_strip_nulls(jsonb_build_object('value',new.amount,'currency',new.currency,'attribution',to_jsonb(attribution))))
on conflict (source,source_record_id,event_name) do nothing;
return new;
end;
$$;
revoke all on function private.capture_meta_ads_paid_payment() from public;
drop trigger if exists capture_meta_ads_paid_payment on public.payments;
create trigger capture_meta_ads_paid_payment after insert or update of status, paid_at on public.payments for each row execute function private.capture_meta_ads_paid_payment();

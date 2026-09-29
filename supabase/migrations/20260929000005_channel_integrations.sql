-- Canales con credenciales propias de la instalación (número de WhatsApp, token de Kommo): los secretos
-- de las edge functions son de UNA organización. Esta tabla dice cuál puede usarlos, así las funciones no
-- necesitan un ORG_ID fijo en el código y ninguna otra organización puede enviar con esas credenciales.
-- Solo el servidor (service_role) escribe acá: los usuarios pueden leer el estado de su organización.
create table if not exists public.channel_integrations (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  whatsapp_enabled boolean not null default false,
  kommo_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.channel_integrations enable row level security;
drop policy if exists channel_integrations_select on public.channel_integrations;
create policy channel_integrations_select on public.channel_integrations
  for select to authenticated
  using (organization_id = (select private.get_user_org_id()));
revoke insert, update, delete on public.channel_integrations from anon, authenticated;
revoke all on public.channel_integrations from anon;

-- La organización que hoy usa esos canales: la dueña de los leads de Kommo existentes.
insert into public.channel_integrations (organization_id, whatsapp_enabled, kommo_enabled)
select distinct organization_id, true, true from public.comercial_leads where kommo_lead_id is not null
on conflict (organization_id) do nothing;

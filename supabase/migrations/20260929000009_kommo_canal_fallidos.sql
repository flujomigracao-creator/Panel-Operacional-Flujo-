-- Si WhatsApp rechaza un mensaje (ej. fuera de la ventana de 24 h, código 131047), Kommo lo marca como fallido.
-- El rechazo llega después, en el webhook de estados de Meta (whatsapp_actualizar_estado): para ese momento el
-- mensaje ya se copió a Kommo como enviado, o ya se le avisó a Kommo que salió bien (los escritos desde Kommo).
-- Un trigger lo encola en kommo_canal_estados y kommo-canal avisa a Kommo con delivery_status en el próximo flush.
create table if not exists public.kommo_canal_estados (
  id bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  message_id uuid not null unique references public.messages(id) on delete cascade,
  error text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists kommo_canal_estados_pendientes on public.kommo_canal_estados (created_at) where status = 'pending';

alter table public.kommo_canal_estados enable row level security;
drop policy if exists kommo_canal_estados_select on public.kommo_canal_estados;
create policy kommo_canal_estados_select on public.kommo_canal_estados
  for select to authenticated using (organization_id = (select private.get_user_org_id()));
revoke all on public.kommo_canal_estados from anon;
revoke insert, update, delete on public.kommo_canal_estados from authenticated;

create or replace function private.kommo_canal_fallido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.metadata ->> 'estado_envio', '') <> 'failed'
     or coalesce(old.metadata ->> 'estado_envio', '') = 'failed'
     or coalesce(new.metadata ->> 'origin', '') not in ('whatsapp_cloud_api', 'kommo_canal_whatsapp') then
    return new;
  end if;
  if not exists (select 1 from public.channel_integrations
                 where organization_id = new.organization_id and kommo_canal_enabled) then
    return new;
  end if;
  insert into public.kommo_canal_estados (organization_id, message_id, error)
  values (new.organization_id, new.id, new.metadata ->> 'error_envio')
  on conflict (message_id) do nothing;
  perform private.kommo_canal_despertar();
  return new;
exception when others then
  raise warning 'kommo_canal_fallido: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_kommo_canal_fallido on public.messages;
create trigger trg_kommo_canal_fallido
  after update of metadata on public.messages
  for each row execute function private.kommo_canal_fallido();

revoke execute on function private.kommo_canal_fallido() from public, anon, authenticated;

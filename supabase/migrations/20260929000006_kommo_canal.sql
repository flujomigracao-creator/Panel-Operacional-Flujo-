-- Canal personalizado de Kommo (Chats API / amoJo) para el número propio de WhatsApp.
-- Kommo vuelve a ver las conversaciones: cada mensaje de WhatsApp que se registra en `messages` (del cliente, de
-- Nora o del panel) se copia al chat del contacto en Kommo, y lo que un operador escribe en ese chat de Kommo llega
-- a la edge function `kommo-canal`, que lo manda por WhatsApp Cloud API.
--
-- Salida hacia Kommo: una cola (kommo_canal_outbox). Un trigger encola cada mensaje nuevo y despierta a la función
-- con pg_net; la función toma lo pendiente (sin pisarse si hay dos llamadas a la vez) y lo reintenta si Kommo falla.
-- Nada se encola hasta que el servidor activa el canal (channel_integrations.kommo_canal_enabled).

alter table public.channel_integrations
  add column if not exists kommo_canal_enabled boolean not null default false,
  add column if not exists kommo_amojo_account_id text,
  add column if not exists kommo_scope_id text;

-- Un chat de Kommo por número de WhatsApp (misma clave que las conversaciones: 'wa:' || telefone_chave).
create table if not exists public.kommo_canal_chats (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_key text not null,
  telefono text not null,               -- número al que se manda por WhatsApp (solo dígitos, con código de país)
  nombre text,
  kommo_chat_id text,                   -- id del chat en amoJo
  kommo_contact_id bigint,              -- contacto de Kommo al que quedó vinculado el chat
  vinculado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, conversation_key)
);

create table if not exists public.kommo_canal_outbox (
  id bigserial primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  message_id uuid not null unique references public.messages(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'waiting_contact', 'sent', 'failed', 'skipped')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  kommo_msgid text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists kommo_canal_outbox_pendientes on public.kommo_canal_outbox (next_attempt_at)
  where status in ('pending', 'processing', 'waiting_contact');

-- Mensajes que llegaron desde Kommo (operador escribiendo en el chat): Kommo puede reintentar el webhook,
-- así que cada uno se procesa una sola vez.
create table if not exists public.kommo_canal_recibidos (
  kommo_msgid text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  wamid text,
  error text,
  created_at timestamptz not null default now()
);

alter table public.kommo_canal_chats enable row level security;
alter table public.kommo_canal_outbox enable row level security;
alter table public.kommo_canal_recibidos enable row level security;

drop policy if exists kommo_canal_chats_select on public.kommo_canal_chats;
create policy kommo_canal_chats_select on public.kommo_canal_chats
  for select to authenticated using (organization_id = (select private.get_user_org_id()));
drop policy if exists kommo_canal_outbox_select on public.kommo_canal_outbox;
create policy kommo_canal_outbox_select on public.kommo_canal_outbox
  for select to authenticated using (organization_id = (select private.get_user_org_id()));
drop policy if exists kommo_canal_recibidos_select on public.kommo_canal_recibidos;
create policy kommo_canal_recibidos_select on public.kommo_canal_recibidos
  for select to authenticated using (organization_id = (select private.get_user_org_id()));

revoke all on public.kommo_canal_chats, public.kommo_canal_outbox, public.kommo_canal_recibidos from anon;
revoke insert, update, delete on public.kommo_canal_chats, public.kommo_canal_outbox, public.kommo_canal_recibidos from authenticated;

-- Despierta a la edge function para que vacíe la cola. pg_net manda el pedido después del commit.
create or replace function private.kommo_canal_despertar()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url := 'https://rumpfqevyspdmhaggxtq.supabase.co/functions/v1/kommo-canal',
    body := jsonb_build_object('action', 'flush'),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    timeout_milliseconds := 60000
  );
exception when others then
  raise warning 'kommo_canal_despertar: %', sqlerrm;
end;
$$;

-- Encola los mensajes de WhatsApp (origen whatsapp_cloud_api: cliente, Nora y panel). Los que vinieron desde Kommo
-- se registran con otro origen ('kommo_canal_whatsapp') y no vuelven a Kommo.
create or replace function private.kommo_canal_encolar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.metadata ->> 'origin', '') <> 'whatsapp_cloud_api' then
    return new;
  end if;
  if not exists (select 1 from public.channel_integrations
                 where organization_id = new.organization_id and kommo_canal_enabled) then
    return new;
  end if;
  insert into public.kommo_canal_outbox (organization_id, message_id)
  values (new.organization_id, new.id)
  on conflict (message_id) do nothing;
  perform private.kommo_canal_despertar();
  return new;
exception when others then
  -- Nunca bloquear el registro del mensaje por Kommo.
  raise warning 'kommo_canal_encolar: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_kommo_canal_encolar on public.messages;
create trigger trg_kommo_canal_encolar
  after insert on public.messages
  for each row execute function private.kommo_canal_encolar();

-- Cuando n8n crea el lead de un número nuevo (whatsapp_contactos_nuevos.kommo_contact_id), los mensajes que
-- esperaban el contacto ya se pueden mandar: el chat queda vinculado a ese contacto y no a uno nuevo de Kommo.
create or replace function private.kommo_canal_contacto_listo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kommo_contact_id is not null and old.kommo_contact_id is distinct from new.kommo_contact_id
     and exists (select 1 from public.kommo_canal_outbox where organization_id = new.organization_id and status = 'waiting_contact') then
    update public.kommo_canal_outbox set next_attempt_at = now()
     where organization_id = new.organization_id and status = 'waiting_contact';
    perform private.kommo_canal_despertar();
  end if;
  return new;
exception when others then
  raise warning 'kommo_canal_contacto_listo: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists trg_kommo_canal_contacto_listo on public.whatsapp_contactos_nuevos;
create trigger trg_kommo_canal_contacto_listo
  after update of kommo_contact_id on public.whatsapp_contactos_nuevos
  for each row execute function private.kommo_canal_contacto_listo();

-- Toma hasta p_limite mensajes listos para mandar, en orden, sin que dos llamadas tomen los mismos
-- (los que quedaron 'processing' más de 5 minutos se consideran abandonados y se vuelven a tomar).
create or replace function public.kommo_canal_tomar(p_limite int default 20)
returns setof public.kommo_canal_outbox
language sql
security definer
set search_path = public
as $$
  update public.kommo_canal_outbox o
     set status = 'processing', locked_at = now(), attempts = o.attempts + 1
   where o.id in (
     select id from public.kommo_canal_outbox
      where (status in ('pending', 'waiting_contact') and next_attempt_at <= now())
         or (status = 'processing' and locked_at < now() - interval '5 minutes')
      order by created_at
      limit p_limite
      for update skip locked)
  returning o.*;
$$;

-- A qué número / chat / contacto de Kommo corresponde un mensaje.
create or replace function public.kommo_canal_destino(p_message_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m record;
  v_ext text;
  v_conv_contact bigint;
  v_tel text;
  v_nombre text;
  v_key text;
  v_contact bigint;
  v_lead bigint;
  v_resol jsonb;
begin
  select msg.*, c.external_conversation_id, c.kommo_contact_id as conv_contact_id, c.kommo_lead_id as conv_lead_id
    into m
    from public.messages msg left join public.conversations c on c.id = msg.conversation_id
   where msg.id = p_message_id;
  if not found then return null; end if;

  v_ext := m.external_conversation_id;
  v_lead := coalesce(m.kommo_lead_id, m.conv_lead_id);
  if m.direction = 'inbound' then
    v_tel := nullif(regexp_replace(coalesce(m.metadata -> 'raw' ->> 'from', ''), '\D', '', 'g'), '');
    v_nombre := m.author_name;
  end if;
  if v_lead is not null then
    select coalesce(v_tel, nullif(cl.telefono, '')), coalesce(v_nombre, cl.nombre_completo, cl.nombre), cl.kommo_contact_id
      into v_tel, v_nombre, v_contact
      from public.comercial_leads cl where cl.organization_id = m.organization_id and cl.kommo_lead_id = v_lead limit 1;
  end if;
  if (v_tel is null or v_nombre is null) and m.client_id is not null then
    select coalesce(v_tel, nullif(cli.whatsapp, ''), nullif(cli.phone, '')), coalesce(v_nombre, cli.full_name), coalesce(v_contact, cli.kommo_contact_id)
      into v_tel, v_nombre, v_contact
      from public.clients cli where cli.id = m.client_id;
  end if;
  if v_tel is null and v_ext like 'wa:%' then
    v_tel := substr(v_ext, 4);
  end if;
  if v_tel is null then
    return jsonb_build_object('error', 'sin_telefono');
  end if;
  -- Sin código de país y con 11 dígitos o menos: Brasil (mismo criterio que enviar-whatsapp-cliente).
  v_tel := regexp_replace(v_tel, '\D', '', 'g');
  if length(v_tel) <= 11 and v_tel not like '55%' then v_tel := '55' || v_tel; end if;

  v_key := case when v_ext like 'wa:%' then v_ext else 'wa:' || public.telefone_chave(v_tel) end;
  v_contact := coalesce(m.kommo_contact_id, m.conv_contact_id, v_contact);
  if v_contact is null then
    v_resol := public.whatsapp_resolver_lead(v_tel);
    v_contact := nullif(v_resol ->> 'kommo_contact_id', '')::bigint;
  end if;

  return jsonb_build_object(
    'conversation_key', v_key,
    'telefono', v_tel,
    'nombre', v_nombre,
    'kommo_contact_id', v_contact,
    -- Clientes simulados para probar a Nora (+55 00…): no existen en WhatsApp ni se copian a Kommo.
    'simulado', public.telefone_chave(v_tel) like '5500%'
  );
end;
$$;

revoke execute on function public.kommo_canal_tomar(int), public.kommo_canal_destino(uuid) from public, anon, authenticated;
revoke execute on function private.kommo_canal_despertar(), private.kommo_canal_encolar(), private.kommo_canal_contacto_listo() from public, anon, authenticated;

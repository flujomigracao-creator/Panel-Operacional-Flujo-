-- Plantillas de WhatsApp (Meta) en Kommo. Kommo no manda plantillas de Meta por un canal personalizado (las manda
-- como texto, que WhatsApp rechaza pasadas 24 h del último mensaje del cliente). Por eso:
--   1. kommo-canal copia a Kommo, como plantillas de chat, las plantillas aprobadas y en revisión de Meta
--      (esta tabla es la copia local y guarda el id de la plantilla creada en Kommo).
--   2. Cuando un operador manda desde Kommo un texto que coincide con una plantilla aprobada y el cliente no
--      escribió en las últimas 24 h, kommo-canal la manda como plantilla de Meta con los valores de las variables.
-- variables: qué dato de Kommo va en cada variable de Meta, ej. {"1": "{{contact.first_name}}"}; las que no
-- tengan dato quedan como [1], [2]… para completarlas a mano en Kommo antes de mandar.
create table if not exists public.whatsapp_plantillas (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  nombre text not null,
  idioma text not null,
  estado text not null,               -- APPROVED | PENDING | IN_APPEAL | REJECTED | PAUSED | DISABLED
  categoria text,
  encabezado text,                    -- texto del encabezado (sin variables), si tiene
  cuerpo text not null,
  pie text,
  botones jsonb not null default '[]'::jsonb,
  variables jsonb not null default '{}'::jsonb,
  kommo_template_id bigint,
  kommo_contenido text,               -- lo último que se mandó a Kommo (para saber si hay que actualizarla)
  meta_actualizado_at timestamptz not null default now(),
  primary key (organization_id, nombre, idioma)
);

alter table public.whatsapp_plantillas enable row level security;
drop policy if exists whatsapp_plantillas_select on public.whatsapp_plantillas;
create policy whatsapp_plantillas_select on public.whatsapp_plantillas
  for select to authenticated using (organization_id = (select private.get_user_org_id()));
revoke all on public.whatsapp_plantillas from anon;
revoke insert, update, delete on public.whatsapp_plantillas from authenticated;

alter table public.channel_integrations
  add column if not exists plantillas_sincronizadas_at timestamptz;

-- Plantillas nuevas: una fila con estado 'BORRADOR' (la escribe el servidor) se manda a aprobación de Meta en la
-- próxima sincronización. ejemplos: valores de ejemplo de las variables del cuerpo, que Meta exige para revisarla.
alter table public.whatsapp_plantillas
  add column if not exists ejemplos jsonb not null default '[]'::jsonb,
  add column if not exists error text;

-- Públicos de Meta: catálogo mínimo (país + servicio + intención), vistas de medición contra pagos reales
-- y definiciones de públicos (borrador → aprobado → creado en Meta). Ya aplicado en producción vía MCP el 2026-10-03.

create table if not exists public.publicos_catalogo (
  dimension text not null check (dimension in ('pais','servicio','intencion')),
  codigo text not null,
  nombre text not null,
  primary key (dimension, codigo)
);
alter table public.publicos_catalogo enable row level security;
drop policy if exists "catalogo lectura autenticados" on public.publicos_catalogo;
create policy "catalogo lectura autenticados" on public.publicos_catalogo for select to authenticated using (true);
grant select on public.publicos_catalogo to authenticated;
grant all on public.publicos_catalogo to service_role;

insert into public.publicos_catalogo (dimension, codigo, nombre) values
 ('pais','AR','Argentina'),('pais','VE','Venezuela'),('pais','CU','Cuba'),('pais','CO','Colombia'),
 ('pais','PY','Paraguay'),('pais','UY','Uruguay'),('pais','BO','Bolivia'),('pais','PE','Perú'),('pais','BR','Brasil'),
 ('pais','OTHER','Otros'),('pais','UNKNOWN','Sin dato'),
 ('servicio','CPF','CPF'),('servicio','AGENDAMENTO_PF','Agendamiento PF'),('servicio','RNM','RNM'),
 ('servicio','RESIDENCIA_PERMANENTE','Residencia permanente'),('servicio','REFUGIO_SISCONARE','Refugio / Sisconare'),
 ('servicio','CAMBIO_DIRECCION','Cambio de dirección'),('servicio','UNKNOWN','Sin trámite'),
 ('intencion','COLD','Frío'),('intencion','INTERESTED','Interesado'),('intencion','QUALIFIED','Calificado'),
 ('intencion','PROPOSAL','Propuesta enviada'),('intencion','PAYMENT_PENDING','Pago pendiente'),
 ('intencion','PAID','Pagó'),('intencion','LOST','No compra (perdido)')
on conflict do nothing;

drop view if exists public.publicos_excluir_no_compra;
drop view if exists public.publicos_rendimiento;
drop view if exists public.publicos_leads_panel;

-- Lógica única, sin teléfono. security_invoker => aplica el RLS de la organización del usuario.
create view public.publicos_leads_panel with (security_invoker = true) as
with pagos as (
  select kommo_lead_id, count(*) n_pagos, sum(valor) ingresos
  from public.eventos_comerciales where evento = 'pago_confirmado' group by 1
)
select
  l.id as lead_id, l.organization_id, l.kommo_lead_id, l.client_id,
  l.meta_ad_id, l.meta_ctwa_clid, l.created_at,
  case
    when lower(coalesce(l.nacionalidad,'')) ~ 'venezol' then 'VE'
    when lower(coalesce(l.nacionalidad,'')) ~ 'cuba' then 'CU'
    when lower(coalesce(l.nacionalidad,'')) ~ 'colomb' then 'CO'
    when lower(coalesce(l.nacionalidad,'')) ~ 'bolivi' then 'BO'
    when lower(coalesce(l.nacionalidad,'')) ~ 'peru' then 'PE'
    when lower(coalesce(l.nacionalidad,'')) ~ 'argentin' then 'AR'
    when lower(coalesce(l.nacionalidad,'')) ~ 'paragua' then 'PY'
    when lower(coalesce(l.nacionalidad,'')) ~ 'urugua' then 'UY'
    when lower(coalesce(l.nacionalidad,'')) ~ 'brasil' then 'BR'
    when coalesce(trim(l.nacionalidad),'') = '' then 'UNKNOWN'
    else 'OTHER' end as pais,
  case
    when lower(coalesce(l.tramite_texto,'')) ~ 'cpf' then 'CPF'
    when lower(coalesce(l.tramite_texto,'')) ~ 'agendam' then 'AGENDAMENTO_PF'
    when lower(coalesce(l.tramite_texto,'')) ~ 'rnm' then 'RNM'
    when lower(coalesce(l.tramite_texto,'')) ~ 'residencia|pmte' then 'RESIDENCIA_PERMANENTE'
    when lower(coalesce(l.tramite_texto,'')) ~ 'refugio|sisconare' then 'REFUGIO_SISCONARE'
    when lower(coalesce(l.tramite_texto,'')) ~ 'direcci' then 'CAMBIO_DIRECCION'
    else 'UNKNOWN' end as servicio,
  case
    when coalesce(p.n_pagos,0) > 0 or l.etapa_nombre = 'Logrado con éxito' then 'PAID'
    when l.etapa_nombre = 'Descalificado / Perdido' or l.perdido_por_silencio_at is not null then 'LOST'
    when l.datos_pago_at is not null or l.comprobante_at is not null then 'PAYMENT_PENDING'
    when l.propuesta_enviada then 'PROPOSAL'
    when l.calificado_at is not null or l.etapa_nombre in ('Caliente','Tibio','Programado') then 'QUALIFIED'
    when l.etapa_nombre in ('Cualificando','Seguimiento (Sin Respuesta)') then 'INTERESTED'
    else 'COLD' end as intencion,
  coalesce(p.n_pagos,0) as pagos, coalesce(p.ingresos,0) as ingresos,
  l.propuesta_enviada, l.last_inbound_at
from public.comercial_leads l
left join pagos p on p.kommo_lead_id = l.kommo_lead_id;

create view public.publicos_rendimiento with (security_invoker = true) as
select organization_id, pais, servicio,
  count(*) as leads,
  count(*) filter (where meta_ctwa_clid is not null) as leads_de_anuncio,
  count(*) filter (where intencion in ('QUALIFIED','PROPOSAL','PAYMENT_PENDING','PAID')) as calificados,
  count(*) filter (where intencion in ('PROPOSAL','PAYMENT_PENDING','PAID')) as propuestas,
  count(*) filter (where pagos > 0) as pagos,
  coalesce(sum(ingresos),0) as ingresos,
  round(100.0 * count(*) filter (where pagos > 0) / nullif(count(*),0), 1) as pct_lead_a_pago
from public.publicos_leads_panel group by 1,2,3;

-- Lista para Meta (con teléfono): «no compra» = propuesta enviada, sin pago y 30+ días sin escribir. Solo service_role.
create view public.publicos_excluir_no_compra with (security_invoker = true) as
select p.organization_id, p.lead_id, l.telefono, p.pais, p.servicio
from public.publicos_leads_panel p
join public.comercial_leads l on l.id = p.lead_id
where p.pagos = 0 and p.propuesta_enviada
  and coalesce(p.last_inbound_at, p.created_at) < now() - interval '30 days'
  and coalesce(l.telefono,'') <> '';

revoke all on public.publicos_leads_panel, public.publicos_rendimiento, public.publicos_excluir_no_compra from anon;
revoke all on public.publicos_excluir_no_compra from authenticated;
grant select on public.publicos_leads_panel, public.publicos_rendimiento to authenticated, service_role;
grant select on public.publicos_excluir_no_compra to service_role;

create table if not exists public.publicos_definiciones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  codigo text not null,
  nombre text not null,
  tipo text not null check (tipo in ('adquisicion','remarketing','exclusion')),
  pais text not null,
  servicio text,
  intencion text,
  prioridad int not null default 3,
  ubicacion jsonb not null default '{"paises":["BR"]}',
  idiomas text[] not null default '{es}',
  edad_min int not null default 21,
  edad_max int not null default 65,
  excluye text[] not null default '{}',
  fuente_datos text not null,
  reglas_seguridad text[] not null default '{}',
  estado text not null default 'borrador' check (estado in ('borrador','aprobado','creado_en_meta','pausado')),
  meta_audience_id text,
  notas text,
  creado_at timestamptz not null default now(),
  unique (organization_id, codigo)
);
alter table public.publicos_definiciones enable row level security;
drop policy if exists tenant_isolation on public.publicos_definiciones;
create policy tenant_isolation on public.publicos_definiciones for all
  using (organization_id = private.get_user_org_id()) with check (organization_id = private.get_user_org_id());
grant select, update on public.publicos_definiciones to authenticated;
grant all on public.publicos_definiciones to service_role;
-- Las definiciones iniciales (7 públicos de Cuba, en borrador) se sembraron con datos de la organización en producción.

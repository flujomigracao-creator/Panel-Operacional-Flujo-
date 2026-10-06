-- resumen_embudo: embudo comercial por oportunidad (cohorte del período) + qué costos conocemos.
-- Etapas (cada oportunidad = una fila de comercial_leads, una por servicio):
--   oportunidad → servicio elegido → propuesta enviada → pago confirmado → trámite iniciado
--  * propuesta cuenta también si ya hay pago (alguien pudo pagar sin que se marcara la propuesta).
--  * pago = pago confirmado posterior a la oportunidad, mismo cliente y servicio (misma regla que resumen_inicio_v2).
--  * trámite iniciado = trámite del mismo cliente y servicio (en curso, en espera o completado) o lead enviado a Operacional.
--    Se informa aparte cuántos iniciados NO tienen pago confirmado (no es un error: hay trámites anteriores al CRM).
-- 'costos_conocidos' dice qué datos existen para calcular rentabilidad; nada se estima aquí.
-- Solo lectura, SECURITY INVOKER (RLS), día de America/Sao_Paulo.

create or replace function public.resumen_embudo(p_desde date, p_hasta date)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with par as (
  select p_desde as d1, p_hasta as h1,
         (p_desde - ((p_hasta - p_desde) + 1)) as d0,
         (p_desde - 1) as h0
),
rangos as (
  select 'actual'::text as periodo, d1 as d, h1 as h from par
  union all
  select 'previo', d0, h0 from par
),
pagados as (
  select py.client_id, py.paid_at,
         s.kommo_enum_id as enum_id,
         (s.id is null or s.position >= 99 or s.kommo_enum_id is null) as sin_servicio
  from payments py
  left join client_services cs on cs.id = py.client_service_id
  left join services s on s.id = cs.service_id
  where py.status = 'paid'
),
opp as (
  select r.periodo, l.id, l.client_id, l.tramite_enum_id, l.created_at,
         l.propuesta_enviada, l.enviado_operacional_at, l.etapa_nombre,
         exists (
           select 1 from pagados p
           where p.client_id = l.client_id and p.paid_at >= l.created_at
             and ((l.tramite_enum_id is not null and p.enum_id = l.tramite_enum_id)
               or (l.tramite_enum_id is null and p.sin_servicio))
         ) as pagada,
         (l.enviado_operacional_at is not null or (
            l.tramite_enum_id is not null and exists (
              select 1 from client_services cs join services s on s.id = cs.service_id
              where cs.client_id = l.client_id and s.kommo_enum_id = l.tramite_enum_id
                and cs.status in ('in_progress', 'completed', 'on_hold'))
         )) as iniciado
  from rangos r
  join comercial_leads l
    on (l.created_at at time zone 'America/Sao_Paulo')::date between r.d and r.h
),
agr as (
  select periodo,
    count(*) as oportunidades,
    count(*) filter (where tramite_enum_id is not null) as con_servicio,
    count(*) filter (where propuesta_enviada or pagada) as propuesta,
    count(*) filter (where pagada) as pago,
    count(*) filter (where iniciado) as iniciado,
    count(*) filter (where iniciado and not pagada) as iniciado_sin_pago,
    count(*) filter (where etapa_nombre = 'Descalificado / Perdido') as perdidas
  from opp group by periodo
),
catalogo as (
  select count(*) as servicios,
         count(*) filter (where default_price is not null) as con_precio,
         count(*) filter (where default_cost is not null) as con_costo
  from services where position < 99 and active
),
gastos as (
  select count(*) as n, coalesce(sum(amount), 0) as total
  from expenses, par
  where status = 'paid' and expense_date between par.d1 and par.h1
)
select jsonb_build_object(
  'version', 1,
  'generado_en', now(),
  'periodo', (select jsonb_build_object('desde', d1, 'hasta', h1) from par),
  'embudo', jsonb_build_object(
    'actual', (select to_jsonb(x) - 'periodo' from agr x where x.periodo = 'actual'),
    'previo', (select to_jsonb(x) - 'periodo' from agr x where x.periodo = 'previo')),
  'costos_conocidos', jsonb_build_object(
    'gastos_registrados', (select to_jsonb(g) from gastos g),
    'catalogo', (select to_jsonb(c) from catalogo c))
);
$$;

revoke all on function public.resumen_embudo(date, date) from public, anon;
grant execute on function public.resumen_embudo(date, date) to authenticated;

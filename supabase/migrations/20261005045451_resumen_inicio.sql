-- Resumen ejecutivo del Inicio: una sola fuente de verdad para KPIs, con el período anterior para comparar.
-- Solo lectura. SECURITY INVOKER: respeta RLS (cada usuario ve solo su organización).
-- Fechas en America/Sao_Paulo. Definiciones (ver AUDITORIA_PANEL_INICIO):
--   leads_personas  = personas distintas (client_id, o teléfono normalizado, o el propio lead) con lead creado en el período
--   leads_brutos    = filas de comercial_leads creadas en el período
--   cobrado         = payments.status='paid' con paid_at en el período
--   conversion      = cohorte: personas del período que tienen algún pago 'paid' / leads_personas
--   potencial       = propuestas enviadas de personas sin pago; NUNCA se suma al cobrado
--   gasto           = meta_ads_insights.gasto por fecha (todo en BRL, verificado)

create or replace function public.resumen_inicio(p_desde date, p_hasta date)
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
leads as (
  select r.periodo,
         l.id,
         coalesce(l.client_id::text,
                  nullif(right(regexp_replace(coalesce(l.telefono, ''), '\D', '', 'g'), 10), ''),
                  l.id::text) as persona,
         l.client_id,
         l.meta_ad_id,
         l.propuesta_enviada
  from rangos r
  join comercial_leads l
    on (l.created_at at time zone 'America/Sao_Paulo')::date between r.d and r.h
),
leads_agr as (
  select periodo,
         count(*) as brutos,
         count(distinct persona) as personas,
         count(distinct persona) filter (where meta_ad_id is not null) as personas_meta,
         count(distinct persona) filter (
           where client_id is not null
             and exists (select 1 from payments p where p.client_id = leads.client_id and p.status = 'paid')
         ) as personas_pagaron
  from leads group by periodo
),
pagos as (
  select r.periodo, count(*) as n, coalesce(sum(p.amount), 0) as total
  from rangos r
  join payments p
    on p.status = 'paid'
   and (p.paid_at at time zone 'America/Sao_Paulo')::date between r.d and r.h
  group by r.periodo
),
gasto as (
  select r.periodo, coalesce(sum(i.gasto), 0) as total,
         coalesce(sum(i.conversaciones), 0) as conversaciones
  from rangos r
  join meta_ads_insights i on i.fecha between r.d and r.h
  group by r.periodo
),
por_servicio as (
  select coalesce(s.name, 'Sin trámite asociado') as servicio, sum(p.amount) as total, count(*) as n
  from par
  join payments p
    on p.status = 'paid'
   and (p.paid_at at time zone 'America/Sao_Paulo')::date between par.d1 and par.h1
  left join client_services cs on cs.id = p.client_service_id
  left join services s on s.id = cs.service_id
  group by 1
),
potencial as (
  select count(*) as n, coalesce(sum(coalesce(l.monto_ahora, l.precio, 0)), 0) as total
  from comercial_leads l
  where l.propuesta_enviada
    and l.perdido_por_silencio_at is null
    and not exists (select 1 from payments p where p.client_id = l.client_id and p.status = 'paid')
),
sync as (
  select max(terminado_en) filter (where ok) as ultimo_ok,
         (array_agg(ok order by iniciado_en desc))[1] as ultimo_resultado
  from meta_ads_sync_log
),
-- Detalle de la fila vacía: si no hubo actividad devolvemos 0 explícito (no null) solo donde 0 es un dato real.
cuenta as (
  select
    (select count(*) from crm_conversations where unread_count > 0) as conv_pendientes
)
select jsonb_build_object(
  'generado_en', now(),
  'zona', 'America/Sao_Paulo',
  'periodo', (select jsonb_build_object('desde', d1, 'hasta', h1) from par),
  'periodo_previo', (select jsonb_build_object('desde', d0, 'hasta', h0) from par),
  'leads', jsonb_build_object(
    'actual', (select to_jsonb(la) - 'periodo' from leads_agr la where la.periodo = 'actual'),
    'previo', (select to_jsonb(la) - 'periodo' from leads_agr la where la.periodo = 'previo')
  ),
  'cobrado', jsonb_build_object(
    'actual', (select to_jsonb(x) - 'periodo' from pagos x where x.periodo = 'actual'),
    'previo', (select to_jsonb(x) - 'periodo' from pagos x where x.periodo = 'previo')
  ),
  'gasto', jsonb_build_object(
    'actual', (select to_jsonb(x) - 'periodo' from gasto x where x.periodo = 'actual'),
    'previo', (select to_jsonb(x) - 'periodo' from gasto x where x.periodo = 'previo')
  ),
  'ingresos_por_servicio', coalesce((select jsonb_agg(to_jsonb(s) order by s.total desc) from por_servicio s), '[]'::jsonb),
  'potencial', (select to_jsonb(p) from potencial p),
  'conversaciones_pendientes', (select conv_pendientes from cuenta),
  'meta_sync', (select to_jsonb(s) from sync s)
);
$$;

revoke all on function public.resumen_inicio(date, date) from public, anon;
grant execute on function public.resumen_inicio(date, date) to authenticated;

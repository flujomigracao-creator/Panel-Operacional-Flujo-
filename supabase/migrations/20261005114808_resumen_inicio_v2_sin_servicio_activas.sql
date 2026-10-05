-- resumen_inicio_v2: indicador de calidad del CRM «sin servicio elegido» separado en activas y ya perdidas.
-- Con los datos de 2026-10-05: 159 sin servicio = 101 perdidas + 58 activas (50 en Cualificando con Nora, 46 creadas hace <24 h).
-- Mantiene la identidad por telefone_chave. Solo añade campos; el resto del resultado es idéntico.

create or replace function public.resumen_inicio_v2(p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  perform public.validar_periodo(p_desde, p_hasta);
  return (
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
pagos_attr as (select * from public.atribucion_pagos()),
-- Identidad de persona: client_id; si no hay, el cliente cuya phone_key (telefone_chave, indexada) coincide;
-- si no, la propia clave de teléfono (unifica variantes con/sin el 9); si no, el lead.
opp as (
  select r.periodo, l.id, l.client_id, l.tramite_enum_id, l.created_at, l.meta_ad_id, l.etapa_nombre,
         coalesce(l.client_id::text, cli.id::text, t.chave, l.id::text) as persona
  from rangos r
  join comercial_leads l
    on (l.created_at at time zone 'America/Sao_Paulo')::date between r.d and r.h
  cross join lateral (select nullif(public.telefone_chave(l.telefono), '') as chave) t
  left join clients cli on t.chave is not null and cli.phone_key = t.chave and cli.organization_id = l.organization_id
),
opp_pago as (
  select o.*, pa.paid_at as primer_pago_at, pa.amount as primer_pago_monto
  from opp o
  left join lateral (
    select a.paid_at, a.amount from pagos_attr a
    where a.opp_id = o.id and a.estado = 'atribuido'
    order by a.paid_at limit 1
  ) pa on true
),
opp_agr as (
  select periodo,
    count(*) as oportunidades,
    count(distinct persona) as personas,
    count(*) filter (where meta_ad_id is not null) as con_anuncio,
    count(*) filter (where meta_ad_id is null) as sin_atribucion,
    count(*) filter (where tramite_enum_id is null) as sin_servicio_elegido,
    -- calidad del CRM: las ya perdidas no son trabajo pendiente; solo cuentan las activas
    count(*) filter (where tramite_enum_id is null and etapa_nombre is distinct from 'Descalificado / Perdido' and primer_pago_at is null) as sin_servicio_activas,
    count(*) filter (where tramite_enum_id is null and etapa_nombre = 'Descalificado / Perdido') as sin_servicio_perdidas,
    count(*) filter (where primer_pago_at is not null) as pagadas,
    count(*) filter (where created_at <= now() - interval '7 days') as maduras_7d,
    count(*) filter (where created_at <= now() - interval '7 days' and primer_pago_at <= created_at + interval '7 days') as pagadas_7d,
    count(*) filter (where created_at <= now() - interval '30 days') as maduras_30d,
    count(*) filter (where created_at <= now() - interval '30 days' and primer_pago_at <= created_at + interval '30 days') as pagadas_30d,
    count(*) filter (where meta_ad_id is not null and primer_pago_at is not null) as pagadas_con_anuncio,
    coalesce(sum(primer_pago_monto) filter (where meta_ad_id is not null), 0) as ingresos_con_anuncio
  from opp_pago group by periodo
),
pagos as (
  select r.periodo, count(*) as n, coalesce(sum(a.amount), 0) as total,
         count(*) filter (where a.estado = 'atribuido') as atribuido,
         count(*) filter (where a.estado = 'ambiguo') as ambiguo,
         count(*) filter (where a.estado = 'sin_coincidencia') as sin_coincidencia,
         count(*) filter (where a.estado = 'sin_oportunidad') as sin_oportunidad
  from rangos r
  join pagos_attr a on (a.paid_at at time zone 'America/Sao_Paulo')::date between r.d and r.h
  group by r.periodo
),
gasto as (
  select r.periodo, coalesce(sum(i.gasto), 0) as total, coalesce(sum(i.conversaciones), 0) as conversaciones
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
  select count(*) as n, coalesce(sum(coalesce(x.monto_ahora, x.precio, 0)), 0) as total,
         count(*) filter (where x.ultima_actividad < now() - interval '7 days') as sin_actividad_7d,
         count(*) filter (where x.ultima_actividad < now() - interval '14 days') as sin_actividad_14d
  from (
    select l.monto_ahora, l.precio,
           coalesce(greatest(l.last_inbound_at, l.last_atendido_at, l.seguimiento_ultimo_at), l.created_at) as ultima_actividad
    from comercial_leads l
    where l.propuesta_enviada
      and l.perdido_por_silencio_at is null
      and not exists (select 1 from payments p where p.client_id = l.client_id and p.status = 'paid')
  ) x
),
sync as (
  select max(terminado_en) filter (where ok) as ultimo_ok,
         (array_agg(ok order by iniciado_en desc))[1] as ultimo_resultado
  from meta_ads_sync_log
)
select jsonb_build_object(
  'version', 2,
  'generado_en', now(),
  'zona', 'America/Sao_Paulo',
  'periodo', (select jsonb_build_object('desde', d1, 'hasta', h1) from par),
  'periodo_previo', (select jsonb_build_object('desde', d0, 'hasta', h0) from par),
  'resultados_periodo', jsonb_build_object(
    'oportunidades', jsonb_build_object(
      'actual', (select to_jsonb(x) - 'periodo' from opp_agr x where x.periodo = 'actual'),
      'previo', (select to_jsonb(x) - 'periodo' from opp_agr x where x.periodo = 'previo')),
    'cobrado', jsonb_build_object(
      'actual', (select to_jsonb(x) - 'periodo' from pagos x where x.periodo = 'actual'),
      'previo', (select to_jsonb(x) - 'periodo' from pagos x where x.periodo = 'previo')),
    'gasto', jsonb_build_object(
      'actual', (select to_jsonb(x) - 'periodo' from gasto x where x.periodo = 'actual'),
      'previo', (select to_jsonb(x) - 'periodo' from gasto x where x.periodo = 'previo')),
    'ingresos_por_servicio', coalesce((select jsonb_agg(to_jsonb(s) order by s.total desc) from por_servicio s), '[]'::jsonb)
  ),
  'situacion_actual', jsonb_build_object(
    'potencial', (select to_jsonb(p) from potencial p),
    'conversaciones_pendientes', (select count(*) from crm_conversations where unread_count > 0),
    'meta_sync', (select to_jsonb(s) from sync s)
  )
)
  );
end;
$$;

revoke all on function public.resumen_inicio_v2(date, date) from public, anon;
grant execute on function public.resumen_inicio_v2(date, date) to authenticated;

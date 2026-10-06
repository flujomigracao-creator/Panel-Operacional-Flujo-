-- resumen_inicio_v2 (convive con resumen_inicio v1 hasta que el panel migre): semántica comercial corregida (Fase 1).
--  * OPORTUNIDAD = una fila de comercial_leads (una por servicio solicitado). PERSONA = contacto distinto.
--  * Conversión por oportunidad: pago confirmado POSTERIOR a la creación de la oportunidad, del mismo cliente y
--    del mismo servicio (si la oportunidad aún no tiene servicio elegido, vale un pago de "Trámite por definir").
--    Se informa acumulada y a 7/30 días; las de plazo solo cuentan oportunidades que ya cumplieron ese plazo.
--  * Se separa lo que depende del período (resultados_periodo) de la foto de hoy (situacion_actual).
--  * Atribución: oportunidades con anuncio de origen identificado (meta_ad_id) NO prueba que Meta las originara
--    ni que el pago sea por ese anuncio; se devuelve el vínculo oportunidad→pago para que la UI lo diga con rigor.
--  * Identidad de persona: client_id, o el teléfono con todos sus dígitos (conserva el código de país).
-- Solo lectura, SECURITY INVOKER (respeta RLS). Día de America/Sao_Paulo.

create or replace function public.resumen_inicio_v2(p_desde date, p_hasta date)
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
  select py.client_id, py.paid_at, py.amount,
         s.kommo_enum_id as enum_id,
         (s.id is null or s.position >= 99 or s.kommo_enum_id is null) as sin_servicio
  from payments py
  left join client_services cs on cs.id = py.client_service_id
  left join services s on s.id = cs.service_id
  where py.status = 'paid'
),
opp as (
  select r.periodo, l.id, l.client_id, l.tramite_enum_id, l.created_at, l.meta_ad_id,
         coalesce(l.client_id::text,
                  nullif(regexp_replace(coalesce(l.telefono, ''), '\D', '', 'g'), ''),
                  l.id::text) as persona
  from rangos r
  join comercial_leads l
    on (l.created_at at time zone 'America/Sao_Paulo')::date between r.d and r.h
),
opp_pago as (
  select o.*, pp.paid_at as primer_pago_at, pp.amount as primer_pago_monto
  from opp o
  left join lateral (
    select p.paid_at, p.amount
    from pagados p
    where p.client_id = o.client_id
      and p.paid_at >= o.created_at
      and ((o.tramite_enum_id is not null and p.enum_id = o.tramite_enum_id)
        or (o.tramite_enum_id is null and p.sin_servicio))
    order by p.paid_at
    limit 1
  ) pp on true
),
opp_agr as (
  select periodo,
    count(*) as oportunidades,
    count(distinct persona) as personas,
    count(*) filter (where meta_ad_id is not null) as con_anuncio,
    count(*) filter (where meta_ad_id is null) as sin_atribucion,
    count(*) filter (where tramite_enum_id is null) as sin_servicio_elegido,
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
  select r.periodo, count(*) as n, coalesce(sum(p.amount), 0) as total,
         count(*) filter (where not exists (select 1 from comercial_leads l where l.client_id = p.client_id)) as sin_oportunidad
  from rangos r
  join payments p
    on p.status = 'paid'
   and (p.paid_at at time zone 'America/Sao_Paulo')::date between r.d and r.h
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
  select count(*) as n, coalesce(sum(coalesce(l.monto_ahora, l.precio, 0)), 0) as total,
         count(*) filter (where l.updated_at < now() - interval '14 days') as sin_movimiento_14d
  from comercial_leads l
  where l.propuesta_enviada
    and l.perdido_por_silencio_at is null
    and not exists (select 1 from payments p where p.client_id = l.client_id and p.status = 'paid')
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
);
$$;

revoke all on function public.resumen_inicio_v2(date, date) from public, anon;
grant execute on function public.resumen_inicio_v2(date, date) to authenticated;

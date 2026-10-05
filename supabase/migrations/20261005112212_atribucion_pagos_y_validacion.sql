-- Endurecimiento de las funciones del Inicio (revisión externa, 2026-10-05).
--  1. atribucion_pagos(): UN pago ↔ A LO SUMO UNA oportunidad. Reglas:
--       elegible = mismo cliente, oportunidad creada antes o en el momento del pago, y mismo servicio
--                  (o la oportunidad aún sin servicio y el pago en "Trámite por definir").
--       1 elegible  → 'atribuido'      ≥2 elegibles → 'ambiguo' (no cuenta como conversión de ninguna)
--       0 elegibles → 'sin_coincidencia' (el cliente tiene oportunidades, ninguna encaja) o 'sin_oportunidad' (no tiene ninguna)
--     Es la ÚNICA fuente de la conversión: resumen_inicio_v2 y resumen_embudo la reutilizan.
--  2. validar_periodo(): validaciones en el servidor (no solo en la UI): fechas obligatorias, orden, no futuras,
--     desde 2025-01-01 y máximo 366 días.
--  3. Identidad de persona: client_id; si no hay, el único cliente con ese teléfono completo; si no, el teléfono; si no, el lead.
--  4. Propuestas abiertas: "sin actividad" se mide con la actividad comercial real (último mensaje entrante, atención o seguimiento),
--     no con updated_at (que las sincronizaciones técnicas también tocan).
-- Solo lectura, SECURITY INVOKER (RLS), día de America/Sao_Paulo.

create or replace function public.validar_periodo(p_desde date, p_hasta date)
returns void
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  hoy date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if p_desde is null or p_hasta is null then
    raise exception 'Las fechas inicial y final son obligatorias' using errcode = '22023';
  end if;
  if p_desde > p_hasta then
    raise exception 'La fecha inicial (%) es posterior a la final (%)', p_desde, p_hasta using errcode = '22023';
  end if;
  if p_hasta > hoy then
    raise exception 'La fecha final (%) no puede ser futura (hoy es %)', p_hasta, hoy using errcode = '22023';
  end if;
  if p_desde < date '2025-01-01' then
    raise exception 'La fecha inicial (%) es anterior al intervalo permitido (2025-01-01)', p_desde using errcode = '22023';
  end if;
  if (p_hasta - p_desde) + 1 > 366 then
    raise exception 'El período no puede superar 366 días (pedido: % días)', (p_hasta - p_desde) + 1 using errcode = '22023';
  end if;
end;
$$;

create or replace function public.atribucion_pagos()
returns table (payment_id uuid, client_id uuid, paid_at timestamptz, amount numeric, opp_id uuid, estado text)
language sql
stable
security invoker
set search_path = public
as $$
with pagados as (
  select py.id as pid, py.client_id as cid, py.paid_at as pat, py.amount as monto,
         s.kommo_enum_id as enum_id,
         (s.id is null or s.position >= 99 or s.kommo_enum_id is null) as sin_servicio
  from payments py
  left join client_services cs on cs.id = py.client_service_id
  left join services s on s.id = cs.service_id
  where py.status = 'paid'
),
elig as (
  select p.pid, l.id as lid
  from pagados p
  join comercial_leads l
    on l.client_id = p.cid
   and l.created_at <= p.pat
   and ((l.tramite_enum_id is not null and p.enum_id = l.tramite_enum_id)
     or (l.tramite_enum_id is null and p.sin_servicio))
),
cnt as (
  select pid, count(*) as n, (array_agg(lid))[1] as lid from elig group by pid
)
select p.pid, p.cid, p.pat, p.monto,
       case when c.n = 1 then c.lid end,
       case when c.n = 1 then 'atribuido'
            when c.n > 1 then 'ambiguo'
            when exists (select 1 from comercial_leads l where l.client_id = p.cid) then 'sin_coincidencia'
            else 'sin_oportunidad' end
from pagados p
left join cnt c on c.pid = p.pid;
$$;

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
opp as (
  select r.periodo, l.id, l.client_id, l.tramite_enum_id, l.created_at, l.meta_ad_id,
         coalesce(l.client_id::text, ident.cid, t.tel, l.id::text) as persona
  from rangos r
  join comercial_leads l
    on (l.created_at at time zone 'America/Sao_Paulo')::date between r.d and r.h
  cross join lateral (select nullif(regexp_replace(coalesce(l.telefono, ''), '\D', '', 'g'), '') as tel) t
  left join lateral (
    select (array_agg(c.id))[1]::text as cid
    from clients c
    where t.tel is not null and regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = t.tel
    having count(*) = 1
  ) ident on true
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

create or replace function public.resumen_embudo(p_desde date, p_hasta date)
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
opp as (
  select r.periodo, l.id, l.client_id, l.tramite_enum_id, l.created_at,
         l.propuesta_enviada, l.enviado_operacional_at, l.etapa_nombre,
         exists (select 1 from pagos_attr a where a.opp_id = l.id and a.estado = 'atribuido') as pagada,
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
)
  );
end;
$$;

revoke all on function public.validar_periodo(date, date) from public, anon;
revoke all on function public.atribucion_pagos() from public, anon;
revoke all on function public.resumen_inicio_v2(date, date) from public, anon;
revoke all on function public.resumen_embudo(date, date) from public, anon;
grant execute on function public.validar_periodo(date, date) to authenticated;
grant execute on function public.atribucion_pagos() to authenticated;
grant execute on function public.resumen_inicio_v2(date, date) to authenticated;
grant execute on function public.resumen_embudo(date, date) to authenticated;

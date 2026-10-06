-- Regla de seguimiento para oportunidades sin servicio elegido (decidida por el dueño el 2026-10-05):
--   · Primer seguimiento: 48 horas después de crear la oportunidad (Nora está cualificando durante ese tiempo).
--   · Reintento: cada 48 horas, máximo 3 tareas por oportunidad; no se crea otra mientras la anterior siga abierta.
--   · Asignación: cola común (la tabla tasks no tiene responsable: aparecen en «Hoy» sin dueño).
--   · No se crea tarea si: ya está perdida/descalificada o perdida por silencio, ya se envió a Operacional, el cliente ya pagó,
--     está en 'Seguimiento (Sin Respuesta)' (ya la sigue el flujo automático de Nora) o la conversación está viva
--     (respondida y el cliente escribió hace menos de 48 h).
--   · Dos casos: el cliente espera respuesta (prioridad alta, «continuar conversación») o el cliente calla ≥48 h («seguimiento»).
-- p_ejecutar = false (por defecto) NO crea nada: solo devuelve lo que crearía. Idempotente (dedupe_key por oportunidad e intento).
-- Solo para el sistema (postgres/service_role): se revoca a anon/authenticated.

create or replace function public.generar_tareas_sin_servicio(p_ejecutar boolean default false, p_max_intentos int default 3)
returns table (lead_id uuid, kommo_lead_id bigint, caso text, intento int, creada boolean)
language plpgsql
volatile
security invoker
set search_path = public
as $$
begin
  return query
  with cand as (
    select l.id, l.organization_id, l.client_id, l.kommo_lead_id as kid, l.nombre, l.created_at,
           l.last_inbound_at, l.last_atendido_at,
           (l.last_inbound_at is not null and (l.last_atendido_at is null or l.last_inbound_at > l.last_atendido_at)) as espera_respuesta,
           (l.last_inbound_at is null or l.last_inbound_at < now() - interval '48 hours') as cliente_calla,
           (select count(*) from tasks t where t.organization_id = l.organization_id
              and t.metadata ->> 'regla' = 'sin_servicio' and t.metadata ->> 'lead_id' = l.id::text) as previas,
           exists (select 1 from tasks t where t.organization_id = l.organization_id
              and t.metadata ->> 'regla' = 'sin_servicio' and t.metadata ->> 'lead_id' = l.id::text
              and t.status in ('open', 'in_progress')) as abierta,
           (select max(t.created_at) from tasks t where t.organization_id = l.organization_id
              and t.metadata ->> 'regla' = 'sin_servicio' and t.metadata ->> 'lead_id' = l.id::text) as ultima_tarea
    from comercial_leads l
    where l.tramite_enum_id is null
      and l.etapa_nombre is distinct from 'Descalificado / Perdido'
      and l.etapa_nombre is distinct from 'Seguimiento (Sin Respuesta)'
      and l.perdido_por_silencio_at is null
      and l.enviado_operacional_at is null
      and l.created_at <= now() - interval '48 hours'
      and not exists (select 1 from payments p where p.client_id = l.client_id and p.status = 'paid')
  ),
  elegibles as (
    select c.*,
           case when c.espera_respuesta then 'continuar_conversacion'
                when c.cliente_calla then 'seguimiento_sin_respuesta' end as caso_calc
    from cand c
    where not c.abierta
      and c.previas < p_max_intentos
      and (c.ultima_tarea is null or c.ultima_tarea <= now() - interval '48 hours')
      and (c.espera_respuesta or c.cliente_calla)
  ),
  ins as (
    insert into tasks (organization_id, client_id, kommo_lead_id, kind, title, details, priority, status, source, dedupe_key, metadata)
    select e.organization_id, e.client_id, e.kid, 'outro',
           case e.caso_calc when 'continuar_conversacion' then 'Elegir servicio: el cliente espera respuesta — ' || coalesce(e.nombre, 'sin nombre')
                            else 'Elegir servicio: sin respuesta, dar seguimiento — ' || coalesce(e.nombre, 'sin nombre') end,
           'Oportunidad creada hace ' || (extract(day from now() - e.created_at))::int || ' días y aún sin servicio elegido. Intento ' || (e.previas + 1) || ' de ' || p_max_intentos
             || '. Regla: 48 h de espera, reintento cada 48 h, cola común.',
           (case when e.caso_calc = 'continuar_conversacion' then 'high' else 'normal' end)::task_priority,
           'open', 'regla_sin_servicio',
           'sin_servicio:' || e.id::text || ':' || (e.previas + 1),
           jsonb_build_object('regla', 'sin_servicio', 'lead_id', e.id, 'intento', e.previas + 1, 'caso', e.caso_calc)
    from elegibles e
    where p_ejecutar
      and not exists (select 1 from tasks t where t.dedupe_key = 'sin_servicio:' || e.id::text || ':' || (e.previas + 1))
    returning (metadata ->> 'lead_id')::uuid as lid
  )
  select e.id, e.kid, e.caso_calc, (e.previas + 1)::int, (p_ejecutar and exists (select 1 from ins where ins.lid = e.id))
  from elegibles e
  order by e.created_at;
end;
$$;

revoke all on function public.generar_tareas_sin_servicio(boolean, int) from public, anon, authenticated;
grant execute on function public.generar_tareas_sin_servicio(boolean, int) to service_role;

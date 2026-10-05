-- Programa la regla de tareas para oportunidades sin servicio (ver 20261005115108_tareas_sin_servicio.sql): cada hora, en punto.
-- Para pausarla:   select cron.unschedule('tareas_sin_servicio');
-- Para simular:    select * from public.generar_tareas_sin_servicio(false);   -- no crea nada
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'tareas_sin_servicio';
select cron.schedule('tareas_sin_servicio', '0 * * * *', $$select public.generar_tareas_sin_servicio(true)$$);

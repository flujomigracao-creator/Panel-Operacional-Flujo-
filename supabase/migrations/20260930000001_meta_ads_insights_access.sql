-- meta_ads_insights: la fuente única del Centro de Inteligencia (Meta Ads). La leen dos caminos:
--   1) fallback directo del panel (rol `authenticated`);
--   2) Edge Function `asistente` con `service_role` cuando no hay Graph API.
-- DIAGNÓSTICO verificado contra PostgREST con la clave pública:
--   `permission denied for table meta_ads_insights` (42501) → a la tabla NO se le hizo GRANT
--   a ningún rol de usuario (ni siquiera a `anon`, que Supabase concede por defecto), así que
--   AMBOS caminos de lectura fallan. Este script solo agrega privilegios de lectura e índice:
--   no crea tablas ni cambia columnas/tipos. Idempotente.

grant select on public.meta_ads_insights to authenticated, service_role;

-- anon nunca lee esta tabla (convención del repo).
revoke all on public.meta_ads_insights from anon;

-- Compatibilidad RLS (defensivo): NO se habilita RLS aquí. Si la tabla ya la tuviera activada
-- sin políticas, `authenticated` leería 0 filas pese al GRANT; esta política evita ese caso.
-- Si RLS está desactivada la política queda inerte (no restringe ni amplía nada).
drop policy if exists panel_read on public.meta_ads_insights;
create policy panel_read on public.meta_ads_insights
  for select to authenticated
  using (true);

-- El panel ordena y filtra por fecha en cada carga.
create index if not exists meta_ads_insights_fecha_idx
  on public.meta_ads_insights (fecha desc);
-- Instagram como segundo destino de «Publicaciones». Facebook sigue como estaba (columna estado / post_id / error);
-- Instagram lleva su propio estado para que un fallo en una red no repita ni bloquee la otra.
alter table public.publicaciones add column if not exists destinos text[] not null default array['facebook']::text[];
alter table public.publicaciones add column if not exists ig_estado text;
alter table public.publicaciones add column if not exists ig_post_id text;
alter table public.publicaciones add column if not exists ig_enlace text;
alter table public.publicaciones add column if not exists ig_publicada_at timestamptz;
alter table public.publicaciones add column if not exists ig_error text;

alter table public.publicaciones drop constraint if exists publicaciones_destinos_check;
alter table public.publicaciones add constraint publicaciones_destinos_check
  check (cardinality(destinos) > 0 and destinos <@ array['facebook', 'instagram']::text[]);
alter table public.publicaciones drop constraint if exists publicaciones_ig_estado_check;
alter table public.publicaciones add constraint publicaciones_ig_estado_check
  check (ig_estado is null or ig_estado in ('publicando', 'publicada', 'error'));

-- El publicador de Facebook ahora solo toma las que llevan «facebook» entre sus destinos.
create or replace function public.publicacion_reclamar()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare p publicaciones;
begin
  select * into p from publicaciones
   where estado = 'aprobada' and 'facebook' = any(destinos)
     and programada_at <= now() and programada_at > now() - interval '24 hours'
   order by programada_at
   limit 1
   for update skip locked;
  if p.id is null then return '{}'::jsonb; end if;
  update publicaciones set estado = 'publicando', error = null, updated_at = now() where id = p.id;
  return jsonb_build_object('id', p.id, 'texto', p.texto, 'programada_at', p.programada_at);
end;
$$;

-- Toma UNA publicación para Instagram: con «instagram» entre sus destinos, sin intento previo, hora cumplida (máx. 24 h de retraso)
-- y aprobada (o ya publicada por el workflow de Facebook, es decir con post_id; una marcada «a mano» no se envía).
create or replace function public.publicacion_ig_reclamar()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare p publicaciones;
begin
  select * into p from publicaciones
   where 'instagram' = any(destinos) and ig_estado is null
     and (estado = 'aprobada' or (estado = 'publicada' and post_id is not null))
     and programada_at <= now() and programada_at > now() - interval '24 hours'
   order by programada_at
   limit 1
   for update skip locked;
  if p.id is null then return '{}'::jsonb; end if;
  update publicaciones set ig_estado = 'publicando', ig_error = null, updated_at = now() where id = p.id;
  return jsonb_build_object('id', p.id, 'texto', p.texto, 'programada_at', p.programada_at);
end;
$$;

-- Cierra el intento en Instagram. Si Instagram era el único destino, también cierra la publicación completa.
create or replace function public.publicacion_ig_resolver(p_id uuid, p_ok boolean, p_post_id text default null, p_enlace text default null, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare p publicaciones;
begin
  if p_ok then
    update publicaciones
       set ig_estado = 'publicada', ig_post_id = p_post_id, ig_enlace = p_enlace, ig_publicada_at = now(), ig_error = null, updated_at = now(),
           estado = case when 'facebook' = any(destinos) then estado else 'publicada' end,
           publicada_at = case when 'facebook' = any(destinos) then publicada_at else now() end,
           enlace_publicacion = case when 'facebook' = any(destinos) then enlace_publicacion else p_enlace end,
           error = case when 'facebook' = any(destinos) then error else null end
     where id = p_id and ig_estado = 'publicando';
  else
    update publicaciones
       set ig_estado = 'error', ig_error = left(p_error, 500), updated_at = now(),
           estado = case when 'facebook' = any(destinos) then estado else 'error' end,
           error = case when 'facebook' = any(destinos) then error else left(p_error, 500) end
     where id = p_id and ig_estado = 'publicando' returning * into p;
    if p.id is not null then
      insert into tasks (organization_id, kind, title, details, priority, source, dedupe_key, metadata)
      values (p.organization_id, 'outro', 'No se pudo publicar en Instagram: ' || left(replace(p.texto, E'\n', ' '), 50),
              coalesce(left(p_error, 300), 'error desconocido') || ' — revisa la publicación en el panel.', 'high'::task_priority,
              'publicacion_error', 'publicacion_ig:' || p.id, jsonb_build_object('publicacion_id', p.id, 'red', 'instagram'));
    end if;
  end if;
end;
$$;

-- «publicando» en Instagram más de 30 min: pasa a error y se revisa a mano (no se reintenta sola para no duplicar).
create or replace function public.publicacion_ig_rescatar_atascadas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  with x as (
    update publicaciones
       set ig_estado = 'error', ig_error = 'Se quedó publicando más de 30 min: comprueba en Instagram si salió antes de reintentar.', updated_at = now(),
           estado = case when 'facebook' = any(destinos) then estado else 'error' end,
           error = case when 'facebook' = any(destinos) then error else 'Se quedó publicando en Instagram más de 30 min: comprueba si salió antes de reintentar.' end
     where ig_estado = 'publicando' and updated_at < now() - interval '30 minutes' returning id, organization_id, texto)
  insert into tasks (organization_id, kind, title, details, priority, source, dedupe_key, metadata)
  select organization_id, 'outro', 'Publicación atascada en Instagram: ' || left(replace(texto, E'\n', ' '), 50),
         'Comprueba en Instagram si salió antes de reintentar.', 'high'::task_priority, 'publicacion_error', 'publicacion_ig:' || id,
         jsonb_build_object('publicacion_id', id, 'red', 'instagram')
    from x;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.publicacion_ig_reclamar() from public, anon, authenticated;
revoke all on function public.publicacion_ig_resolver(uuid, boolean, text, text, text) from public, anon, authenticated;
revoke all on function public.publicacion_ig_rescatar_atascadas() from public, anon, authenticated;
grant execute on function public.publicacion_ig_reclamar() to service_role;
grant execute on function public.publicacion_ig_resolver(uuid, boolean, text, text, text) to service_role;
grant execute on function public.publicacion_ig_rescatar_atascadas() to service_role;

alter table public.publicaciones add column if not exists post_id text;
alter table public.publicaciones add column if not exists error text;

alter table public.publicaciones drop constraint if exists publicaciones_estado_check;
alter table public.publicaciones add constraint publicaciones_estado_check
  check (estado in ('borrador', 'aprobada', 'publicando', 'publicada', 'error', 'descartada'));

-- Toma UNA publicación aprobada cuya hora ya llegó (y no lleva más de 24 h de retraso) y la marca «publicando»
-- en el mismo paso, para que dos ejecuciones nunca publiquen lo mismo. Devuelve {} si no hay ninguna.
create or replace function public.publicacion_reclamar()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare p publicaciones;
begin
  select * into p from publicaciones
   where estado = 'aprobada' and programada_at <= now() and programada_at > now() - interval '24 hours'
   order by programada_at
   limit 1
   for update skip locked;
  if p.id is null then return '{}'::jsonb; end if;
  update publicaciones set estado = 'publicando', error = null, updated_at = now() where id = p.id;
  return jsonb_build_object('id', p.id, 'texto', p.texto, 'programada_at', p.programada_at);
end;
$$;

-- Cierra el intento: publicada (con id y enlace) o error (queda visible en el panel y crea una tarea).
create or replace function public.publicacion_resolver(p_id uuid, p_ok boolean, p_post_id text default null, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare p publicaciones;
begin
  if p_ok then
    update publicaciones
       set estado = 'publicada', publicada_at = now(), post_id = p_post_id, error = null, updated_at = now(),
           enlace_publicacion = case when p_post_id is not null then 'https://www.facebook.com/' || p_post_id else enlace_publicacion end
     where id = p_id and estado = 'publicando';
  else
    update publicaciones set estado = 'error', error = left(p_error, 500), updated_at = now()
     where id = p_id and estado = 'publicando' returning * into p;
    if p.id is not null then
      insert into tasks (organization_id, kind, title, details, priority, source, dedupe_key, metadata)
      values (p.organization_id, 'outro', 'No se pudo publicar en Facebook: ' || left(replace(p.texto, E'\n', ' '), 50),
              coalesce(left(p_error, 300), 'error desconocido') || ' — revisa la publicación en el panel.', 'high'::task_priority,
              'publicacion_error', 'publicacion:' || p.id, jsonb_build_object('publicacion_id', p.id));
    end if;
  end if;
end;
$$;

revoke all on function public.publicacion_reclamar() from public, anon, authenticated;
revoke all on function public.publicacion_resolver(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.publicacion_reclamar() to service_role;
grant execute on function public.publicacion_resolver(uuid, boolean, text, text) to service_role;

-- Una publicación que se quedó «publicando» más de 30 min (n8n se cortó a medias) vuelve a revisión humana, no se reintenta sola:
-- podría haberse publicado ya y duplicarla es peor que esperar.
create or replace function public.publicacion_rescatar_atascadas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  with x as (
    update publicaciones set estado = 'error', error = 'Se quedó publicando más de 30 min: comprueba en Facebook si salió antes de reintentar.', updated_at = now()
     where estado = 'publicando' and updated_at < now() - interval '30 minutes' returning id, organization_id, texto)
  insert into tasks (organization_id, kind, title, details, priority, source, dedupe_key, metadata)
  select organization_id, 'outro', 'Publicación atascada: ' || left(replace(texto, E'\n', ' '), 50),
         'Comprueba en Facebook si salió antes de reintentar.', 'high'::task_priority, 'publicacion_error', 'publicacion:' || id, jsonb_build_object('publicacion_id', id)
    from x;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.publicacion_rescatar_atascadas() from public, anon, authenticated;
grant execute on function public.publicacion_rescatar_atascadas() to service_role;

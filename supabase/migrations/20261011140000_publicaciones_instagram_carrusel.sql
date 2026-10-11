-- Carruseles de Instagram: la portada (lámina 1) es siempre la imagen del país de origen dirigida al grupo (ej. Cuba → cubanos).
-- ig_slides = [{ titular, texto, idea, path?, at? }] (2 a 10). Las imágenes se generan a petición (ig_generar) para poder verlas
-- en el panel ANTES de aprobar; si faltan al publicar, el publicador de Instagram las genera.
alter table public.publicaciones add column if not exists ig_formato text not null default 'imagen';
alter table public.publicaciones add column if not exists ig_slides jsonb not null default '[]'::jsonb;
alter table public.publicaciones add column if not exists ig_pais text;
alter table public.publicaciones add column if not exists ig_grupo text;
alter table public.publicaciones add column if not exists ig_generar boolean not null default false;

alter table public.publicaciones drop constraint if exists publicaciones_ig_formato_check;
alter table public.publicaciones add constraint publicaciones_ig_formato_check check (ig_formato in ('imagen', 'carrusel'));
alter table public.publicaciones drop constraint if exists publicaciones_ig_slides_check;
alter table public.publicaciones add constraint publicaciones_ig_slides_check
  check (jsonb_typeof(ig_slides) = 'array' and jsonb_array_length(ig_slides) <= 10);

-- El publicador de Instagram ahora también recibe el formato y el número de láminas.
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
  return jsonb_build_object('id', p.id, 'texto', coalesce(nullif(btrim(p.ig_texto), ''), p.texto), 'programada_at', p.programada_at,
                            'formato', p.ig_formato, 'n_slides', jsonb_array_length(p.ig_slides));
end;
$$;

-- Toma UNA publicación a la que se le pidió «Generar imágenes» desde el panel y baja la marca (si algo falla se vuelve a pedir).
create or replace function public.publicacion_ig_pedido_imagenes()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare p publicaciones;
begin
  select * into p from publicaciones where ig_generar = true order by updated_at limit 1 for update skip locked;
  if p.id is null then return '{}'::jsonb; end if;
  update publicaciones set ig_generar = false where id = p.id;
  return jsonb_build_object('id', p.id, 'formato', p.ig_formato, 'n_slides', case when p.ig_formato = 'carrusel' then jsonb_array_length(p.ig_slides) else 1 end);
end;
$$;

revoke all on function public.publicacion_ig_pedido_imagenes() from public, anon, authenticated;
grant execute on function public.publicacion_ig_pedido_imagenes() to service_role;

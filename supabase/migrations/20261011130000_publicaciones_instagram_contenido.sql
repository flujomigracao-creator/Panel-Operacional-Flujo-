-- Contenido propio de Instagram: texto que engancha (si va vacío se usa el de Facebook), titular corto dentro de la imagen
-- e idea de imagen. La imagen de Instagram se guarda aparte de la de Facebook.
alter table public.publicaciones add column if not exists ig_texto text;
alter table public.publicaciones add column if not exists ig_titular text;
alter table public.publicaciones add column if not exists ig_imagen_idea text;
alter table public.publicaciones add column if not exists ig_imagen_path text;
alter table public.publicaciones add column if not exists ig_imagen_at timestamptz;

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
  return jsonb_build_object('id', p.id, 'texto', coalesce(nullif(btrim(p.ig_texto), ''), p.texto), 'programada_at', p.programada_at);
end;
$$;

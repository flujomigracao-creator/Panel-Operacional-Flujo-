-- Guarda la ruta de la imagen de UNA lámina de forma atómica (jsonb_set sobre la fila): varias láminas se generan casi a la vez
-- y un «leer lista → escribir lista» desde la función se pisaría entre sí.
create or replace function public.publicacion_ig_slide_path(p_id uuid, p_n integer, p_path text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update publicaciones
     set ig_slides = jsonb_set(jsonb_set(ig_slides, array[(p_n - 1)::text, 'path'], to_jsonb(p_path)), array[(p_n - 1)::text, 'at'], to_jsonb(now()::text)),
         ig_imagen_at = now()
   where id = p_id and p_n >= 1 and p_n <= jsonb_array_length(ig_slides);
end;
$$;
revoke all on function public.publicacion_ig_slide_path(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.publicacion_ig_slide_path(uuid, integer, text) to service_role;

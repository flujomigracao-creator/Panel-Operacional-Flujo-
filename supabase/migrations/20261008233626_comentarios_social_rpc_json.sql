drop function if exists public.social_comentario_reservar(text, text, text, text, text, text, boolean);

-- Devuelve {"id": "<uuid>"} si el comentario es nuevo y {"id": null} si ya estaba registrado (así el workflow no lo procesa dos veces).
create or replace function public.social_comentario_reservar(
  p_plataforma text, p_comment_id text, p_post_id text, p_autor_id text, p_autor_nombre text, p_texto text, p_es_respuesta boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  insert into comentarios_social (organization_id, plataforma, comment_id, post_id, autor_id, autor_nombre, texto, es_respuesta)
  values ('00000000-0000-0000-0000-000000000001', p_plataforma, p_comment_id, p_post_id, p_autor_id, p_autor_nombre,
          left(coalesce(p_texto, ''), 4000), coalesce(p_es_respuesta, false))
  on conflict (plataforma, comment_id) do nothing
  returning id into v_id;
  return jsonb_build_object('id', v_id);
end;
$$;

-- Interruptores del bot, siempre con valores (por defecto: activo y con borrado).
create or replace function public.social_bot_config()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('activo', true, 'borrar', true)
         || coalesce((select value from organization_settings
                       where organization_id = '00000000-0000-0000-0000-000000000001' and key = 'social_bot' limit 1), '{}'::jsonb);
$$;

revoke all on function public.social_comentario_reservar(text, text, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.social_bot_config() from public, anon, authenticated;
grant execute on function public.social_comentario_reservar(text, text, text, text, text, text, boolean) to service_role;
grant execute on function public.social_bot_config() to service_role;

create table if not exists public.comentarios_social (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  plataforma text not null check (plataforma in ('facebook', 'instagram')),
  comment_id text not null,
  post_id text,
  autor_id text,
  autor_nombre text,
  texto text not null,
  es_respuesta boolean not null default false,
  clase text check (clase in ('elogio', 'interes', 'queja_legitima', 'malo', 'neutro')),
  confianza numeric,
  motivo text,
  accion text check (accion in ('responder', 'borrar', 'tarea', 'ninguna')),
  resultado jsonb not null default '{}'::jsonb,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'procesado', 'error', 'omitido')),
  error text,
  creado_at timestamptz not null default now(),
  procesado_at timestamptz,
  unique (plataforma, comment_id)
);

create index if not exists comentarios_social_org_creado_idx on public.comentarios_social (organization_id, creado_at desc);

alter table public.comentarios_social enable row level security;
drop policy if exists tenant_select on public.comentarios_social;
create policy tenant_select on public.comentarios_social for select to authenticated
  using (organization_id = (select private.get_user_org_id()));
revoke all on public.comentarios_social from anon;
revoke insert, update, delete on public.comentarios_social from authenticated;
grant select on public.comentarios_social to authenticated;
grant all on public.comentarios_social to service_role;

create or replace function public.social_comentario_reservar(
  p_plataforma text, p_comment_id text, p_post_id text, p_autor_id text, p_autor_nombre text, p_texto text, p_es_respuesta boolean default false)
returns uuid
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
  return v_id;
end;
$$;

create or replace function public.social_comentario_resolver(
  p_id uuid, p_clase text, p_confianza numeric, p_motivo text, p_accion text, p_resultado jsonb, p_estado text,
  p_error text default null, p_enlace text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare c comentarios_social;
begin
  update comentarios_social
     set clase = p_clase, confianza = p_confianza, motivo = left(p_motivo, 300), accion = p_accion,
         resultado = coalesce(p_resultado, '{}'::jsonb), estado = p_estado, error = left(p_error, 500), procesado_at = now()
   where id = p_id
   returning * into c;
  if c.id is not null and p_accion = 'tarea' then
    insert into tasks (organization_id, kind, title, details, priority, source, dedupe_key, metadata)
    values (c.organization_id, 'outro',
            (case when c.clase = 'queja_legitima' then 'Responder queja en ' else 'Revisar comentario en ' end) || initcap(c.plataforma) || ' — ' || coalesce(nullif(c.autor_nombre, ''), 'sin nombre'),
            '«' || left(c.texto, 300) || '» (' || coalesce(c.motivo, '') || ')',
            (case when c.clase = 'queja_legitima' then 'high' else 'normal' end)::task_priority,
            'social_comentario', 'comentario:' || c.id,
            jsonb_build_object('url', p_enlace, 'plataforma', c.plataforma, 'comment_id', c.comment_id));
  end if;
end;
$$;

revoke all on function public.social_comentario_reservar(text, text, text, text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.social_comentario_resolver(uuid, text, numeric, text, text, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.social_comentario_reservar(text, text, text, text, text, text, boolean) to service_role;
grant execute on function public.social_comentario_resolver(uuid, text, numeric, text, text, jsonb, text, text, text) to service_role;

-- Interruptor del bot (se cambia desde el panel): activo = actúa; borrar = puede eliminar comentarios malos.
insert into public.organization_settings (organization_id, key, value)
select '00000000-0000-0000-0000-000000000001', 'social_bot', '{"activo": true, "borrar": true}'::jsonb
where not exists (select 1 from public.organization_settings where organization_id = '00000000-0000-0000-0000-000000000001' and key = 'social_bot');

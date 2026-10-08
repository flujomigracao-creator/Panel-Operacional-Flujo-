-- Publicaciones de la página de Facebook: cola de borradores → aprobada → publicada.
-- La publicación automática en Facebook no está conectada todavía (falta el permiso pages_manage_posts en el token de Meta):
-- mientras tanto el equipo copia el texto, publica y marca «publicada». Aislada por organización (RLS).

create table if not exists public.publicaciones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  programada_at timestamptz not null,
  franja text not null check (franja in ('manana', 'tarde', 'noche')),
  tipo text,
  tema text,
  texto text not null,
  imagen_idea text,
  fuente text,
  estado text not null default 'borrador' check (estado in ('borrador', 'aprobada', 'publicada', 'descartada')),
  publicada_at timestamptz,
  enlace_publicacion text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists publicaciones_org_programada_idx on public.publicaciones (organization_id, programada_at);
create index if not exists publicaciones_org_estado_idx on public.publicaciones (organization_id, estado);

drop trigger if exists set_updated_at on public.publicaciones;
create trigger set_updated_at before update on public.publicaciones
  for each row execute function public.set_updated_at();

alter table public.publicaciones enable row level security;

drop policy if exists tenant_isolation on public.publicaciones;
create policy tenant_isolation on public.publicaciones for all to authenticated
  using (organization_id = (select private.get_user_org_id()))
  with check (organization_id = (select private.get_user_org_id()));

revoke all on public.publicaciones from anon;
grant select, insert, update, delete on public.publicaciones to authenticated;
grant all on public.publicaciones to service_role;

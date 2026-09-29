-- Centro de control de Nora: lo que Nora sabe se administra desde el panel.
-- Solo cambios aditivos: columnas nuevas, estados nuevos, triggers, dos tablas de registro y funciones.
-- No se borra ni se reescribe ningún dato existente.

-- ── Reglas: prioridad (crítica / importante / normal) ─────────────────────────────
alter table public.nora_reglas
  add column if not exists prioridad text not null default 'normal',
  add column if not exists importacion_id uuid;
do $$ begin
  alter table public.nora_reglas add constraint nora_reglas_prioridad_check check (prioridad in ('critica','importante','normal'));
exception when duplicate_object then null; end $$;

-- ── Respuestas: origen, lote de importación y quién editó ─────────────────────────
alter table public.nora_respuestas_aprobadas
  add column if not exists fuente text not null default 'manual',
  add column if not exists importacion_id uuid,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;
-- Lo nuevo nace como borrador: nunca entra solo como conocimiento aprobado.
alter table public.nora_respuestas_aprobadas alter column estado set default 'borrador';

-- ── Casos históricos: problema y fuente ───────────────────────────────────────────
alter table public.nora_casos
  add column if not exists problema text,
  add column if not exists fuente text not null default 'manual',
  add column if not exists importacion_id uuid;

-- ── Aprendizajes: pregunta/respuesta/resultado/feedback y estado "corregir" ────────
alter table public.nora_aprendizajes
  add column if not exists pregunta text,
  add column if not exists respuesta text,
  add column if not exists resultado text,
  add column if not exists feedback text,
  add column if not exists respuesta_id uuid references public.nora_respuestas_aprobadas(id) on delete set null;
alter table public.nora_aprendizajes drop constraint if exists nora_aprendizajes_estado_check;
alter table public.nora_aprendizajes add constraint nora_aprendizajes_estado_check
  check (estado in ('pendiente','aprobada','corregir','descartada'));

alter table public.nora_dudas
  add column if not exists respuesta_id uuid references public.nora_respuestas_aprobadas(id) on delete set null;

-- ── Documentos: estado del procesamiento y fragmentos con vector de 384 (gte-small) ─
alter table public.knowledge_documents
  add column if not exists fuente text,
  add column if not exists procesamiento text not null default 'pendiente',
  add column if not exists procesamiento_error text,
  add column if not exists fragmentos integer not null default 0,
  add column if not exists procesado_at timestamptz;
do $$ begin
  alter table public.knowledge_documents add constraint knowledge_documents_procesamiento_check
    check (procesamiento in ('pendiente','procesando','procesado','error'));
exception when duplicate_object then null; end $$;

-- knowledge_embeddings (1536) queda como está; los fragmentos llevan su propio vector del modelo de Nora.
alter table public.knowledge_chunks
  add column if not exists embedding extensions.vector(384),
  add column if not exists model text;

-- ── Al editar un texto, su vector deja de valer (nunca se busca con un vector viejo) ──
create or replace function public.nora_conocimiento_editado()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  if tg_table_name = 'nora_respuestas_aprobadas' then
    if (new.pregunta, new.respuesta, new.tramite) is distinct from (old.pregunta, old.respuesta, old.tramite) then
      new.embedding := null;
    end if;
    if new.estado = 'aprobada' and old.estado is distinct from 'aprobada' then
      new.approved_by := coalesce(auth.uid(), new.approved_by);
    end if;
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  elsif tg_table_name = 'nora_casos' then
    if (new.tramite, new.pais, new.ciudad, new.problema, new.resumen, new.solucion, new.resultado)
       is distinct from (old.tramite, old.pais, old.ciudad, old.problema, old.resumen, old.solucion, old.resultado) then
      new.embedding := null;
    end if;
    if new.estado = 'aprobado' and old.estado is distinct from 'aprobado' then
      new.approved_by := coalesce(auth.uid(), new.approved_by);
    end if;
  elsif tg_table_name = 'nora_memorias' then
    if new.contenido is distinct from old.contenido then
      new.embedding := null;
    end if;
  elsif tg_table_name = 'knowledge_documents' then
    if new.content is distinct from old.content and new.procesamiento is not distinct from old.procesamiento then
      new.procesamiento := 'pendiente';
      new.version := coalesce(old.version, 1) + 1;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_nora_editado on public.nora_respuestas_aprobadas;
create trigger trg_nora_editado before update on public.nora_respuestas_aprobadas
  for each row execute function public.nora_conocimiento_editado();
drop trigger if exists trg_nora_editado on public.nora_casos;
create trigger trg_nora_editado before update on public.nora_casos
  for each row execute function public.nora_conocimiento_editado();
drop trigger if exists trg_nora_editado on public.nora_memorias;
create trigger trg_nora_editado before update on public.nora_memorias
  for each row execute function public.nora_conocimiento_editado();
drop trigger if exists trg_nora_editado on public.knowledge_documents;
create trigger trg_nora_editado before update on public.knowledge_documents
  for each row execute function public.nora_conocimiento_editado();

create or replace function public.nora_regla_editada()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_nora_regla_editada on public.nora_reglas;
create trigger trg_nora_regla_editada before update on public.nora_reglas
  for each row execute function public.nora_regla_editada();

-- ── Actividad reciente de Nora ────────────────────────────────────────────────────
create table if not exists public.nora_actividad (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entidad text not null,
  entidad_id uuid,
  accion text not null,
  titulo text,
  actor uuid,
  created_at timestamptz not null default now()
);
create index if not exists nora_actividad_org_fecha on public.nora_actividad (organization_id, created_at desc);
alter table public.nora_actividad enable row level security;
drop policy if exists nora_actividad_member on public.nora_actividad;
create policy nora_actividad_member on public.nora_actividad for select to authenticated
  using (exists (select 1 from public.organization_members om where om.organization_id = nora_actividad.organization_id and om.user_id = auth.uid()));

create or replace function public.nora_registrar_actividad()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r jsonb := to_jsonb(coalesce(new, old));
  o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  entidad text := case tg_table_name
    when 'nora_respuestas_aprobadas' then 'respuesta' when 'nora_reglas' then 'regla'
    when 'nora_casos' then 'caso' when 'knowledge_documents' then 'documento'
    when 'nora_memorias' then 'memoria' when 'nora_aprendizajes' then 'aprendizaje' end;
  accion text;
  titulo text := left(coalesce(r->>'pregunta', r->>'texto', r->>'resumen', r->>'title', r->>'contenido', r->>'leccion', ''), 140);
  estado_nuevo text := coalesce(r->>'estado', r->>'status');
  estado_viejo text := coalesce(o->>'estado', o->>'status');
begin
  if tg_op = 'INSERT' then
    accion := 'creado';
  elsif tg_op = 'DELETE' then
    accion := 'eliminado';
  else
    -- Solo cambios que importan a una persona (no los vectores ni las marcas de tiempo).
    if (r - array['embedding','tiene_embedding','model','updated_at','updated_by','approved_by','revisado_at','revisado_por','procesamiento_error','fragmentos','procesado_at'])
       = (o - array['embedding','tiene_embedding','model','updated_at','updated_by','approved_by','revisado_at','revisado_por','procesamiento_error','fragmentos','procesado_at']) then
      return null;
    end if;
    if estado_nuevo is distinct from estado_viejo then
      accion := case estado_nuevo
        when 'aprobada' then 'aprobado' when 'aprobado' then 'aprobado' when 'published' then 'activado'
        when 'archivada' then 'archivado' when 'archivado' then 'archivado' when 'archived' then 'archivado'
        when 'descartada' then 'descartado' when 'corregir' then 'para corregir' when 'draft' then 'desactivado'
        else 'editado' end;
    elsif (r->>'activa') is distinct from (o->>'activa') then
      accion := case when (r->>'activa')::boolean then 'activado' else 'desactivado' end;
    elsif (r->>'procesamiento') is distinct from (o->>'procesamiento') then
      if r->>'procesamiento' not in ('procesado','error') then return null; end if;
      accion := case r->>'procesamiento' when 'procesado' then 'procesado' else 'error al procesar' end;
    else
      accion := 'editado';
    end if;
  end if;
  insert into public.nora_actividad (organization_id, entidad, entidad_id, accion, titulo, actor)
  values ((r->>'organization_id')::uuid, entidad, (r->>'id')::uuid, accion, titulo, auth.uid());
  return null;
end $$;
revoke all on function public.nora_registrar_actividad() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['nora_respuestas_aprobadas','nora_reglas','nora_casos','knowledge_documents','nora_memorias','nora_aprendizajes'] loop
    execute format('drop trigger if exists trg_nora_actividad on public.%I', t);
    execute format('create trigger trg_nora_actividad after insert or update or delete on public.%I for each row execute function public.nora_registrar_actividad()', t);
  end loop;
end $$;

-- ── Qué conocimiento usó Nora en cada respuesta ───────────────────────────────────
create table if not exists public.nora_fuentes_usadas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kommo_lead_id bigint,
  client_id uuid references public.clients(id) on delete set null,
  consulta text,
  fuentes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists nora_fuentes_usadas_lead on public.nora_fuentes_usadas (organization_id, kommo_lead_id, created_at desc);
alter table public.nora_fuentes_usadas enable row level security;
drop policy if exists nora_fuentes_usadas_member on public.nora_fuentes_usadas;
create policy nora_fuentes_usadas_member on public.nora_fuentes_usadas for select to authenticated
  using (exists (select 1 from public.organization_members om where om.organization_id = nora_fuentes_usadas.organization_id and om.user_id = auth.uid()));

-- ── Búsqueda de conocimiento en el orden de prioridad de Nora ─────────────────────
-- 1 información oficial (documentos activos y procesados) · 2 respuestas aprobadas ·
-- (3 reglas: van siempre enteras en el catálogo) · 4 casos aprobados · lecciones aprobadas ·
-- 5 memoria del cliente actual (solo de ese cliente, nunca de otros).
-- La prioridad desempata entre textos parecidos: un caso histórico nunca le gana a la información oficial
-- con la misma relevancia.
create or replace function public.nora_rag_search(query_embedding extensions.vector, match_organization_id uuid, match_client_id uuid default null, match_count integer default 12)
returns table(source_type text, source_id uuid, content text, similarity double precision, priority integer, metadata jsonb)
language sql stable set search_path to 'public', 'extensions', 'pg_temp' as $$
  with candidates(source_type,source_id,content,similarity,priority,metadata) as (
    select 'document'::text, kc.id, kc.content,
      1-(kc.embedding <=> query_embedding), 100,
      jsonb_build_object('documento', kd.title, 'documento_id', kd.id, 'categoria', kd.category)
    from public.knowledge_chunks kc join public.knowledge_documents kd on kd.id = kc.knowledge_document_id
    where kc.organization_id=match_organization_id and kd.status='published' and kd.procesamiento='procesado' and kc.embedding is not null
    union all
    select 'approved_answer'::text, r.id, 'Cuando el cliente pregunta: "' || r.pregunta || '", se le responde: ' || r.respuesta,
      1-(r.embedding <=> query_embedding), 95,
      jsonb_build_object('tramite',r.tramite,'idioma',r.idioma,'tono',r.tono)
    from public.nora_respuestas_aprobadas r
    where r.organization_id=match_organization_id and r.estado='aprobada' and r.embedding is not null
    union all
    select 'case'::text, c.id, concat_ws(E'\n', 'Antecedente (caso histórico, no es una regla):', c.tramite, c.pais, c.ciudad, c.problema, c.resumen, c.solucion, c.resultado),
      1-(c.embedding <=> query_embedding), 80,
      jsonb_build_object('tramite',c.tramite,'pais',c.pais,'ciudad',c.ciudad)
    from public.nora_casos c
    where c.organization_id=match_organization_id and c.estado='aprobado' and c.embedding is not null
    union all
    select 'lesson'::text, a.id, a.leccion,
      1-(a.embedding <=> query_embedding), 75,
      jsonb_build_object('tipo', a.tipo)
    from public.nora_aprendizajes a
    where a.organization_id=match_organization_id and a.estado='aprobada' and a.embedding is not null
    union all
    select 'memory'::text, m.id, m.contenido,
      1-(m.embedding <=> query_embedding), 60+m.importancia,
      jsonb_build_object('tipo',m.tipo,'client_id',m.client_id)
    from public.nora_memorias m
    where match_client_id is not null and m.organization_id=match_organization_id and m.client_id=match_client_id
      and m.activa=true and m.embedding is not null
  )
  select source_type,source_id,content,similarity,priority,metadata
  from candidates
  where similarity >= 0.80
  order by similarity + priority/1000.0 desc
  limit least(greatest(match_count,1),30);
$$;
revoke execute on function public.nora_rag_search(extensions.vector, uuid, uuid, integer) from public, anon;
grant execute on function public.nora_rag_search(extensions.vector, uuid, uuid, integer) to authenticated, service_role;

-- ── Reglas en el catálogo de Nora: primero las críticas ───────────────────────────
create or replace function public.nora_catalogo()
returns jsonb language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select jsonb_build_object(
    'tramites', (select coalesce(jsonb_agg(jsonb_build_object(
           'tramite_enum_id', p.tramite_enum_id,
           'nombre', p.tramite_nombre,
           'precio_brl', p.precio,
           'lo_que_hacemos', p.guion,
           'datos_necesarios', (select string_agg(kp.contenido, E'\n\n---\n\n')
                                  from comercial_tramite_plantilla m join kommo_plantillas kp on kp.id = m.plantilla_id
                                 where m.tramite_enum_id = p.tramite_enum_id)) order by p.en_lista desc, p.orden), '[]'::jsonb)
                  from comercial_audios_pitch p),
    'reglas', (select coalesce(jsonb_agg(case when r.prioridad = 'critica' then 'CRÍTICA (respetar siempre): ' || r.texto else r.texto end
                                         order by case r.prioridad when 'critica' then 0 when 'importante' then 1 else 2 end, r.created_at), '[]'::jsonb)
                 from nora_reglas r where r.activa));
$$;

-- ── Estado del vector visible para el panel sin descargar el vector ─────────────────
alter table public.nora_respuestas_aprobadas add column if not exists tiene_embedding boolean generated always as (embedding is not null) stored;
alter table public.nora_casos add column if not exists tiene_embedding boolean generated always as (embedding is not null) stored;
alter table public.nora_memorias add column if not exists tiene_embedding boolean generated always as (embedding is not null) stored;
alter table public.nora_aprendizajes add column if not exists tiene_embedding boolean generated always as (embedding is not null) stored;
alter table public.knowledge_chunks add column if not exists tiene_embedding boolean generated always as (embedding is not null) stored;

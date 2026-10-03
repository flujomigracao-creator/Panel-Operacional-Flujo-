-- Catálogo de opciones de segmentación de Meta tal como las devuelve la cuenta (nombre exacto + ID), para no adivinarlas.
-- Se llenó el 2026-10-03 leyendo la API de Meta (targetingbrowse / search) y añadiendo a mano género, edad y emplazamientos.
create table if not exists public.meta_opciones_segmentacion (
  clase text not null,            -- behaviors | interests | life_events | industries | family_statuses | locale | country | region | emplazamiento | genero | edad ...
  meta_id text not null,
  nombre text not null,
  tipo text,
  ruta text,                      -- «Comportamientos > Expatriados»
  tamano_min bigint,
  tamano_max bigint,
  descripcion text,
  actualizado_at timestamptz not null default now(),
  primary key (clase, meta_id)
);
create index if not exists meta_opciones_nombre_idx on public.meta_opciones_segmentacion (clase, lower(nombre));
alter table public.meta_opciones_segmentacion enable row level security;
drop policy if exists "opciones lectura autenticados" on public.meta_opciones_segmentacion;
create policy "opciones lectura autenticados" on public.meta_opciones_segmentacion for select to authenticated using (true);
grant select on public.meta_opciones_segmentacion to authenticated;
grant all on public.meta_opciones_segmentacion to service_role;

alter table public.publicaciones add column if not exists imagen_path text;
alter table public.publicaciones add column if not exists imagen_at timestamptz;

-- Interruptor de las imágenes automáticas (se puede apagar sin tocar código).
insert into public.organization_settings (organization_id, key, value)
select '00000000-0000-0000-0000-000000000001', 'publicaciones_imagenes', '{"activo": true, "max_por_dia": 10}'::jsonb
where not exists (select 1 from public.organization_settings where organization_id = '00000000-0000-0000-0000-000000000001' and key = 'publicaciones_imagenes');

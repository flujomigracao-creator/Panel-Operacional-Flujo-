-- Venezolanos por regiones migratorias + mensaje de WhatsApp propio de cada anuncio.
--  1) creatives.whatsapp_message: texto con el que se abre el chat al tocar el anuncio (p. ej. «Quiero renovar mi refugio»).
--     Vacío = el mensaje por defecto del servicio (nunca «quiero más información»).
--  2) Público de adquisición VE_FRONTERA_POLOS_ADQ: Brasil solo en los estados fronterizos con Venezuela y donde más
--     venezolanos se han reubicado, 21–65, español, comportamiento «Vivieron en Venezuela». Las regiones se resuelven por
--     nombre contra meta_opciones_segmentacion (clase region); si falta una, el público no se publica.

alter table public.creatives add column if not exists whatsapp_message text;
comment on column public.creatives.whatsapp_message is 'Mensaje que el cliente envía por defecto al tocar el anuncio (Click-to-WhatsApp, autofill_message).';

insert into public.publicos_definiciones
  (organization_id, codigo, nombre, tipo, pais, servicio, intencion, prioridad, ubicacion, idiomas, edad_min, edad_max, excluye, fuente_datos, reglas_seguridad, estado, comportamientos, es_control, notas)
select
  '00000000-0000-0000-0000-000000000001', 'VE_FRONTERA_POLOS_ADQ', 'Venezuela · Frontera y polos migratorios · Adquisición', 'adquisicion', 'VE', null, 'COLD', 1,
  '{"paises": ["BR"], "regiones": ["Roraima", "Amazonas", "Estado de São Paulo", "Paraná", "Santa Catarina", "Río Grande del Sur"]}'::jsonb,
  '{es}', 21, 65, '{}',
  'Meta: solo los estados Roraima y Amazonas (frontera con Venezuela) y São Paulo, Paraná, Santa Catarina y Rio Grande do Sul (donde más venezolanos se han reubicado) + idioma español + 21–65 años + comportamiento «Vivieron en Venezuela (anteriormente expatriados)». Sin lista de personas.',
  array[
    'Usa solo opciones que Meta ofrece hoy; si una región o el comportamiento no aparece en el catálogo, el público no se publica (no se sustituye por otra).',
    'Los textos de los anuncios no deben afirmar ni insinuar nacionalidad ni estatus migratorio de quien los ve: hablan del servicio.',
    'Se aplica dentro del conjunto de anuncios: no crea públicos guardados ni gasta por sí mismo.'
  ],
  'borrador',
  '[{"buscar": "Vivieron en Venezuela", "empieza": "Vivieron en Venezuela"}]'::jsonb,
  false,
  'Público para los experimentos V4 de Venezuela (Residencia y Refúgio). Alcance estimado en Ads Manager 2026-10-06: 1,0–1,2 M.'
where not exists (select 1 from public.publicos_definiciones where organization_id = '00000000-0000-0000-0000-000000000001' and codigo = 'VE_FRONTERA_POLOS_ADQ');

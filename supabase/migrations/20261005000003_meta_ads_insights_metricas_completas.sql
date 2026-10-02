-- Métricas completas de Meta Ads por anuncio y día. Todo lo que Meta devuelva queda SIEMPRE en `raw`
-- (acciones, valores, costos por acción, video, etc.); estas columnas son atajos tipados para consultar rápido.
-- (Versionada desde producción: aplicada como 20261002014619.)
alter table public.meta_ads_insights
  add column if not exists alcance bigint,
  add column if not exists frecuencia numeric,
  add column if not exists clics_enlace bigint,
  add column if not exists cpm numeric,
  add column if not exists cpc numeric,
  add column if not exists ctr numeric,
  add column if not exists video_reproducciones bigint,
  add column if not exists ranking_calidad text,
  add column if not exists ranking_engagement text,
  add column if not exists ranking_conversion text;

create or replace function public.meta_ads_guardar_insights(p_organization_id uuid, p_filas jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_filas integer;
begin
  if jsonb_typeof(p_filas) is distinct from 'array' then
    raise exception 'p_filas debe ser un array';
  end if;

  insert into public.meta_ads_insights as i
    (organization_id, fecha, ad_id, ad_name, adset_id, adset_name, campaign_id, campaign_name, moneda,
     gasto, impresiones, clics, conversaciones, leads_meta, raw, actualizado_at,
     alcance, frecuencia, clics_enlace, cpm, cpc, ctr, video_reproducciones,
     ranking_calidad, ranking_engagement, ranking_conversion)
  select p_organization_id,
         (f->>'date_start')::date,
         f->>'ad_id', f->>'ad_name', f->>'adset_id', f->>'adset_name', f->>'campaign_id', f->>'campaign_name',
         f->>'account_currency',
         coalesce((f->>'spend')::numeric, 0),
         (f->>'impressions')::bigint,
         (f->>'clicks')::bigint,
         (select sum((a->>'value')::numeric)::integer from jsonb_array_elements(coalesce(f->'actions', '[]')) a
           where a->>'action_type' = 'onsite_conversion.messaging_conversation_started_7d'),
         (select sum((a->>'value')::numeric)::integer from jsonb_array_elements(coalesce(f->'actions', '[]')) a
           where a->>'action_type' = 'lead'),
         f,
         now(),
         nullif(f->>'reach','')::bigint,
         nullif(f->>'frequency','')::numeric,
         nullif(f->>'inline_link_clicks','')::bigint,
         nullif(f->>'cpm','')::numeric,
         nullif(f->>'cpc','')::numeric,
         nullif(f->>'ctr','')::numeric,
         (select sum((a->>'value')::numeric)::bigint from jsonb_array_elements(coalesce(f->'video_play_actions', '[]')) a),
         nullif(f->>'quality_ranking',''),
         nullif(f->>'engagement_rate_ranking',''),
         nullif(f->>'conversion_rate_ranking','')
  from jsonb_array_elements(p_filas) f
  where coalesce(f->>'ad_id', '') <> '' and coalesce(f->>'date_start', '') <> ''
  on conflict (organization_id, fecha, ad_id) do update set
    ad_name = excluded.ad_name, adset_id = excluded.adset_id, adset_name = excluded.adset_name,
    campaign_id = excluded.campaign_id, campaign_name = excluded.campaign_name, moneda = excluded.moneda,
    gasto = excluded.gasto, impresiones = excluded.impresiones, clics = excluded.clics,
    conversaciones = excluded.conversaciones, leads_meta = excluded.leads_meta,
    alcance = excluded.alcance, frecuencia = excluded.frecuencia, clics_enlace = excluded.clics_enlace,
    cpm = excluded.cpm, cpc = excluded.cpc, ctr = excluded.ctr, video_reproducciones = excluded.video_reproducciones,
    ranking_calidad = excluded.ranking_calidad, ranking_engagement = excluded.ranking_engagement,
    ranking_conversion = excluded.ranking_conversion,
    raw = excluded.raw, actualizado_at = now();
  get diagnostics v_filas = row_count;

  return jsonb_build_object('ok', true, 'filas', v_filas);
end;
$$;

revoke all on function public.meta_ads_guardar_insights(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.meta_ads_guardar_insights(uuid, jsonb) to service_role;

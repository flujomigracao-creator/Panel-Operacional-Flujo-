-- RPC que usa n8n ("Meta Ads - Sincronizar Gasto") para guardar los insights diarios por anuncio.
-- Recibe las filas tal como las devuelve la Marketing API (level=ad, time_increment=1) y hace upsert
-- por (organization_id, fecha, ad_id): Meta corrige los días recientes, así que se re-cargan siempre.
-- Solo service_role (la credencial de Supabase de n8n) puede ejecutarla.
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
     gasto, impresiones, clics, conversaciones, leads_meta, raw, actualizado_at)
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
         now()
  from jsonb_array_elements(p_filas) f
  where coalesce(f->>'ad_id', '') <> '' and coalesce(f->>'date_start', '') <> ''
  on conflict (organization_id, fecha, ad_id) do update set
    ad_name = excluded.ad_name, adset_id = excluded.adset_id, adset_name = excluded.adset_name,
    campaign_id = excluded.campaign_id, campaign_name = excluded.campaign_name, moneda = excluded.moneda,
    gasto = excluded.gasto, impresiones = excluded.impresiones, clics = excluded.clics,
    conversaciones = excluded.conversaciones, leads_meta = excluded.leads_meta,
    raw = excluded.raw, actualizado_at = now();
  get diagnostics v_filas = row_count;

  return jsonb_build_object('ok', true, 'filas', v_filas);
end;
$$;

revoke execute on function public.meta_ads_guardar_insights(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.meta_ads_guardar_insights(uuid, jsonb) to service_role;

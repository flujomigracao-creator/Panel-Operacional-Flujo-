-- Sincronización automática de Meta Ads (n8n cada 5 min): guarda el estado de campañas/conjuntos/anuncios
-- y la bitácora con la misma lógica que la Edge Function `asistente` (upsert por la PK de la tabla).
-- (Versionada desde producción: aplicada como 20261002014041.)
create or replace function public.meta_ads_guardar_estado(p_organization_id uuid, p_entidades jsonb, p_log jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_filas integer := 0;
begin
  if jsonb_typeof(p_entidades) is distinct from 'array' then
    raise exception 'p_entidades debe ser un array';
  end if;

  insert into public.meta_ads_entities as e
    (organization_id, entity_type, entity_id, parent_id, name, status, effective_status,
     daily_budget, lifetime_budget, objective, account_id, creative_name, synced_at, last_synced_at)
  select p_organization_id,
         f->>'entity_type', f->>'entity_id', nullif(f->>'parent_id',''), f->>'name', f->>'status', f->>'effective_status',
         nullif(f->>'daily_budget','')::numeric, nullif(f->>'lifetime_budget','')::numeric,
         f->>'objective', f->>'account_id', f->>'creative_name', now(), now()
  from jsonb_array_elements(p_entidades) f
  where f->>'entity_type' in ('campaign','adset','ad')
    and coalesce(f->>'entity_id','') <> '' and coalesce(f->>'account_id','') <> ''
  on conflict (account_id, entity_type, entity_id) do update set
    parent_id = excluded.parent_id, name = excluded.name, status = excluded.status,
    effective_status = excluded.effective_status, daily_budget = excluded.daily_budget,
    lifetime_budget = excluded.lifetime_budget, objective = excluded.objective,
    creative_name = excluded.creative_name, synced_at = now(), last_synced_at = now();
  get diagnostics v_filas = row_count;

  if p_log is not null and jsonb_typeof(p_log) = 'object' then
    insert into public.meta_ads_sync_log (organization_id, account_id, ok, campanas, conjuntos, anuncios, errores, iniciado_en, terminado_en)
    values (p_organization_id, p_log->>'account_id', coalesce((p_log->>'ok')::boolean, false),
            coalesce((p_log->>'campanas')::int, 0), coalesce((p_log->>'conjuntos')::int, 0), coalesce((p_log->>'anuncios')::int, 0),
            coalesce(p_log->'errores', '[]'::jsonb), coalesce((p_log->>'iniciado_en')::timestamptz, now()), now());
  end if;

  return jsonb_build_object('ok', true, 'filas', v_filas);
end;
$$;

revoke all on function public.meta_ads_guardar_estado(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.meta_ads_guardar_estado(uuid, jsonb, jsonb) to service_role;

-- Realtime: el panel se actualiza solo cuando llegan métricas, cambia el estado o entra un lead/pago.
-- Las políticas RLS panel_read siguen mandando: solo ve lo que ya podía leer.
do $$
declare t text;
begin
  foreach t in array array['meta_ads_insights','meta_ads_entities','meta_ads_sync_log','comercial_leads','payments'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

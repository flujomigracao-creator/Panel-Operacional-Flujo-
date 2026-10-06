-- meta_ads_insights: 'panel_read' (using true) anulaba el aislamiento por organización de 'tenant_isolation'
-- (las políticas permisivas se combinan con OR). Se elimina; tenant_isolation cubre a los usuarios de la organización.
drop policy if exists panel_read on public.meta_ads_insights;

-- campaign_hypotheses / campaign_measurements / campaign_variants: lectura abierta a cualquier autenticado.
-- Ahora solo ven filas de experimentos de su organización (mismo criterio que campaign_experiments.panel_read).
drop policy if exists panel_read on public.campaign_hypotheses;
create policy panel_read on public.campaign_hypotheses for select to authenticated
  using (exists (select 1 from public.campaign_experiments e
                 where e.id = campaign_hypotheses.experiment_id
                   and (e.organization_id is null or e.organization_id = (select private.get_user_org_id()))));

drop policy if exists panel_read on public.campaign_measurements;
create policy panel_read on public.campaign_measurements for select to authenticated
  using (exists (select 1 from public.campaign_experiments e
                 where e.id = campaign_measurements.experiment_id
                   and (e.organization_id is null or e.organization_id = (select private.get_user_org_id()))));

drop policy if exists panel_read on public.campaign_variants;
create policy panel_read on public.campaign_variants for select to authenticated
  using (exists (select 1 from public.campaign_experiments e
                 where e.id = campaign_variants.experiment_id
                   and (e.organization_id is null or e.organization_id = (select private.get_user_org_id()))));

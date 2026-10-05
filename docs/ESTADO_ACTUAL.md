# Estado actual

## Meta Ads Intelligence

Proyecto Supabase objetivo: OPERACIONAL - PCBR (kxtshulqjkkgcrxhegiv).

La migracion 20261003040608_create_meta_ads_intelligence_foundation.sql queda versionada en este repositorio. Define atribucion, eventos de funnel, conversiones CAPI, RLS y la vista meta_ads_funnel_summary.

La confirmacion financiera real es payments.status = paid. El trigger de la migracion crea de forma idempotente:

1. payment_confirmed en meta_ads_funnel_events.
2. Una conversion pending en meta_ads_conversion_events.

La Edge Function meta-capi procesa solo conversiones pendientes o fallidas, bloquea el registro antes de enviarlo, usa secretos de Supabase y cambia a sent solo tras una respuesta valida de Meta.

Estado de pruebas: las pruebas locales de la integracion y la suite existente pasaron el 2026-10-03. No se ejecuto prueba end-to-end contra Meta ni se desplego la migracion o la funcion desde este entorno.

Pendiente de despliegue: aplicar la migracion en el proyecto, desplegar meta-capi, configurar META_ADS_TOKEN, META_PIXEL_ID y META_CAPI_RUNNER_SECRET, y programar su invocacion autenticada. Las campanas permanecen sin cambios.

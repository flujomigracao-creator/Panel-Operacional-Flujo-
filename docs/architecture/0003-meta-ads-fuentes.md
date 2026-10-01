# 0003 — Fuentes de datos de Meta Ads (Centro de Inteligencia)

Definición de la fuente de verdad de cada dato. Si algún día cambia una fuente, se cambia
esta tabla y el código que la consulta, no al revés.

| Dato | Fuente | Quién la escribe | Notas |
|---|---|---|---|
| Métricas históricas (gasto, impresiones, clics, conversaciones por día) | `public.meta_ads_insights` | pipeline de Meta (n8n) | Esquema **en español**: `fecha`, `gasto`, `impresiones`, `clics`, `conversaciones`, `campaign_id`, `campaign_name`, `adset_id`, `ad_id`, `moneda`. **No** tiene `date`, `spend`, `status`, `leads` ni presupuestos. |
| Estado actual de campañas | `public.meta_ads_entities` (`entity_type='campaign'`) | Edge Function `asistente` → Graph API | `status`, `effective_status`, `daily_budget`, `lifetime_budget`, `objective`, `synced_at`. Sin esto el estado queda **null** (nunca `'ACTIVE'` inventado). |
| Conjuntos (ad sets) | `public.meta_ads_entities` (`entity_type='adset'`) | ídem | `parent_id` = `campaign_id`. |
| Anuncios | `public.meta_ads_entities` (`entity_type='ad'`) | ídem | `parent_id` = `adset_id`. |
| Leads atribuidos a Meta Ads | `public.meta_ads_referidos` | webhook de Meta | La tabla **solo** tiene `ad_id`, `raw` y `body` (payload crudo). No hay `created_at` ni `campaign_id`: la atribución se resuelve leyendo el payload y cruzando `ad_id → campaign_id`. |
| Leads comerciales | `public.comercial_leads` | CRM / Kommo / panel | `lead_source` declara procedencia ("meta", "instagram"…), pero **no** dice qué campaña. |
| Clientes y pagos | `clients`, `payments`, `client_services` | operación | `payments.status = 'paid'` para ingresos. |
| Análisis con IA | Edge Function `asistente` | Groq | `accion: 'mensaje'` para conversar; `accion: 'ads_data'` para datos estructurados y sincronización. |

## Reglas

1. **El dashboard no llama a la Edge Function.** Si `asistente` devuelve 400, las métricas se
   siguen viendo: se leen de Supabase. El asistente solo se usa con "Analizar con Asistente".
2. **El frontend nunca habla con Meta.** La Graph API se llama desde la Edge Function con
   `META_ADS_TOKEN` / `META_AD_ACCOUNT_ID` (secretos de Supabase) y el resultado se persiste
   en `meta_ads_entities`.
3. **Nada de leads inventados.** Un lead comercial no cuenta como lead de Meta Ads. Solo se
   atribuye a una campaña con evidencia real (payload del webhook o cruce `ad_id`). Lo demás
   queda como "no atribuido".
4. **Fechas en hora de São Paulo.** El "hoy" se resuelve con fecha local en el navegador y con
   `America/Sao_Paulo` en la Edge Function: `toISOString()` puede devolver mañana por la noche.

## Migraciones

- `20260930000001_meta_ads_insights_access.sql` — `GRANT SELECT` de `meta_ads_insights` a
  `authenticated`/`service_role` (la tabla no lo tenía) e índice por `fecha`.
- `20260930000002_meta_ads_entities.sql` — crea `meta_ads_entities` (caché del estado actual
  que devuelve la Graph API), con índices, RLS por organización y escritura solo de
  `service_role`.
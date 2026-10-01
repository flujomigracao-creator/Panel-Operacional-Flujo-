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

## Sincronización real con Meta Ads

```
Frontend → Edge Function `asistente` (accion: 'ads_sync') → Meta Graph API → meta_ads_entities
```

- **Endpoints**: `v20.0/{account_id}/campaigns`, `/adsets`, `/ads` (versión que ya usa el proyecto).
- **Campos**: `id, name, status, effective_status, daily_budget, lifetime_budget, objective,
  account_id` (+ `adset_id`/`campaign_id` en sus colecciones y `creative{name}` en anuncios).
- **Paginación**: se sigue `paging.next` hasta agotar las páginas (tope de seguridad: 25).
- **Presupuestos**: la Graph API entrega centavos; se guardan en **BRL** (`10000 → R$ 100,00`),
  que es la unidad del panel.
- **Identidad**: `UPSERT` sobre `(entity_type, entity_id)`. Los ids de Meta son únicos por
  cuenta, así que sincronizar muchas veces nunca duplica campañas.
- **Sin datos inventados**: si Meta falla, la caché **no se toca** y el panel sigue viendo el
  último estado válido.
- **Bitácora**: cada intento (bueno o fallido) se guarda en `meta_ads_sync_log` con `endpoint`,
  `http_status`, `mensaje` y marca de tiempo. El panel muestra "Última sincronización: …" o
  "nunca", y el aviso solo desaparece cuando hay datos reales.
- **Credenciales**: `META_ADS_TOKEN` / `META_AD_ACCOUNT_ID` viven **solo** en los secretos de
  Supabase (Edge Functions). Nunca en el frontend.

Comprobación rápida sin credenciales: `supabase functions invoke asistente --data '{"accion":"ads_sync"}'`
devuelve `ok:false` con el motivo (p. ej. credenciales ausentes) y lo deja registrado en la bitácora.

## Migraciones

- `20260930000001_meta_ads_insights_access.sql` — `GRANT SELECT` de `meta_ads_insights` a
  `authenticated`/`service_role` (la tabla no lo tenía) e índice por `fecha`.
- `20260930000002_meta_ads_entities.sql` — crea `meta_ads_entities` (estado actual de campañas,
  conjuntos y anuncios sincronizado desde la Graph API), con índices, RLS por organización y
  escritura solo de `service_role`.
- `20260930000003_meta_ads_sync_log.sql` — añade `last_synced_at` a `meta_ads_entities` y crea
  `meta_ads_sync_log` (bitácora de sincronizaciones con endpoint, código HTTP y mensaje).
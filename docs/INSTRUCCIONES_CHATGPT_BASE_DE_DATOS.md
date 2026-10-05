# Instrucciones para ChatGPT — ordenar la base de datos de Flujo de Migração

Pega este documento junto con `docs/AUDITORIA_PANEL_PRINCIPAL.md` y el archivo `schema-only.sql` (volcado sin datos).
No compartas claves, `.env`, tokens ni datos personales.

## Contexto

- Supabase (Postgres), proyecto `rumpfqevyspdmhaggxtq`, una organización hoy, multi-organización a futuro.
- Aislamiento por `organization_id` y la función `private.get_user_org_id()`.
- El panel React lee con el rol `authenticated`; las Edge Functions y n8n usan `service_role`.
- La base real tiene ~200 migraciones aplicadas; el repo solo tiene 12 (ver auditoría).

## Reglas de negocio (fijas)

- Lead único = una oportunidad por servicio. Misma persona con CPF y residencia = 2 oportunidades.
- Trámite bloqueado = pausado, o con documento rechazado, o 7 días sin movimiento. Debe exponerse el motivo.
- Cobrado = `payments.status = 'paid'` por `paid_at`. No mezclar con valor potencial ni facturación.
- Zona horaria de todos los períodos: `America/Sao_Paulo`.
- No atribuir ventas a Meta sin enlace verificable lead ↔ anuncio (`meta_ad_id`, `ctwa_clid`).

## Reglas de trabajo (obligatorias)

1. Entrega **solo SQL propuesto y explicación**. No ejecutes nada en producción.
2. Todo cambio como migración idempotente y reversible (incluye el SQL de rollback).
3. Primero se prueba en una **rama de Supabase**, nunca directo en producción.
4. No elimines tablas ni columnas. Para lo obsoleto: marcar con `comment on table ... 'DEPRECADA: ...'` y listar dependencias (vistas, funciones, Edge Functions, código del repo).
5. No debilites ninguna política RLS. Los cambios solo pueden restringir.
6. Vistas siempre `with (security_invoker = true)`. Funciones `SECURITY DEFINER` solo si es imprescindible, con `set search_path = ''` o fijo, `revoke ... from public, anon` y validación de organización dentro.
7. No leas ni exportes datos personales (nombres, teléfonos, CPF, mensajes). Los controles usan solo conteos y agregados.
8. Antes de cada cambio, indica: qué objetos toca, qué código del panel lo usa, y cómo comprobar que no se rompió.

## Tareas, en este orden

### 1. Línea base
Genera una migración base `00000000000000_baseline.sql` a partir de `schema-only.sql` (esquemas `public` y `private`) para que el repo pueda reconstruir la base. Ordena dependencias y quita comentarios de volcado. No incluir datos.

### 2. Seguridad / RLS
Revisa y propone el SQL para estas políticas SELECT con `USING (true)` (hoy cualquier usuario autenticado lee todas las filas):
`meta_ads_insights`, `campaign_hypotheses`, `campaign_measurements`, `campaign_variants`, `kommo_tramites`, `nora_estrategias_confianza`, `nora_experimentos_confianza`.
Reemplázalas por `organization_id = (select private.get_user_org_id())`. Si una tabla no tiene `organization_id`, indica cómo derivarlo por su relación (p. ej. experimento → organización) sin romper lecturas actuales.

Para las políticas con `organization_id IS NULL` (`ad_trends`, `campaign_experiments`, `campaign_learnings`, `creative_*`, `creatives`, `meta_ads_entities`, `meta_ads_sync_log`): decide si ese acceso a filas sin organización es intencional. Si no lo es, propón una migración para asignar la organización a esas filas y quitar la condición. No borres filas.

Revisa las funciones `inscricoes_cpf_pendentes()` y `registrar_comprovante_cpf(...)`: confirma que filtran por la organización del usuario. Si no, propón el cambio.

Las 5 tablas con RLS y sin políticas: `clientes`, `comercial_imagenes_revisadas`, `comercial_leads_respaldo_20261003`, `comercial_tramite_plantilla`, `nora_casos_analizados`. Para cada una indica si algo las usa (vistas, funciones, Edge Functions, `src/`) y si procede una política o deprecarla.

### 3. Duplicados y modelo
Familias a resolver sin borrar: `clients` vs `clientes` (esta última está vacía), `comercial_leads` vs la vista `crm_leads`, `conversations` vs `crm_conversations`. Para cada familia: tabla vigente, qué depende de la otra, plan de retirada por fases.

Oportunidades: hay 2 pares (cliente + servicio) repetidos en `comercial_leads` y 67 leads sin `client_id`. Propón:
- una consulta de control (solo conteos) que los liste por `id` y no por datos personales,
- una restricción única parcial `(organization_id, client_id, tramite_enum_id)` sobre oportunidades abiertas, aplicable solo tras resolver los duplicados,
- un procedimiento seguro para vincular los leads sin contacto.

### 4. Métricas del panel (vistas de servidor)
Crea vistas `security_invoker` (o funciones `SECURITY INVOKER` con parámetros de período) para:

- `panel_oportunidades(desde, hasta)`: oportunidades únicas por servicio.
- `panel_conversion(desde, hasta)`: oportunidades del cohorte con pago `paid`.
- `panel_cobrado(desde, hasta)`: suma de `payments` `paid` por `paid_at`, en `America/Sao_Paulo`, más conteo; una sola definición para Inicio, Finanzas y Laboratorio.
- `panel_tramites_bloqueados`: `client_services` activos con columna `motivo` ∈ `pausado | documento_rechazado | sin_movimiento_7d` (si hay más de uno, prioriza en ese orden y devuelve los demás en un array).
- `panel_conversaciones_pendientes`: conteo y lista con tope explícito, sin cortar el total.
- `panel_salud_integraciones`: última ejecución y último error de `meta_ads_sync_log`, `automation_runs`, `kommo_*`, y estado `ok | atrasado | error | sin_datos`.
- `panel_meta_rendimiento(desde, hasta)`: gasto, conversaciones y coste por conversación desde `meta_ads_insights`; coste por cliente solo para leads con `meta_ad_id`/`ctwa_clid` y pago, con `con_atribucion` y `total` visibles.

Cada vista devuelve `valor`, `periodo_desde`, `periodo_hasta`, `actualizado_at`, `estado`.
Incluye consultas de control (agregadas) para comparar cada vista con las tablas base.

### 5. Atribución Meta (decisión pendiente)
El repo contiene la migración `20261003040608_create_meta_ads_intelligence_foundation.sql` y la Edge Function `meta-capi`, pero esa migración **no está aplicada** y el modelo real usa `eventos_comerciales`, `meta_ads_referidos` y `meta_embudo*`.
- Compara ambos modelos y recomienda uno (preferir el que ya tiene datos).
- Detecta pagos `paid` sin evento `pago_confirmado` (14 vs 7 hoy) y propón un backfill idempotente.
- Explica por qué solo 1 de 7 `pago_confirmado` figura enviado a Meta.
- No apliques la migración del repo tal cual.

### 6. Rendimiento
El asesor reporta 63 claves foráneas sin índice. Prioriza solo las usadas por las vistas de la tarea 4 y por `HomeView` (`client_services`, `payments`, `crm_conversations`, `tasks`, `documents`). Entrega `create index concurrently if not exists`.

### 7. Configuración
Activar protección de contraseñas filtradas en Supabase Auth; mover `pg_trgm` a otro esquema (p. ej. `extensions`) comprobando antes que ninguna función dependa de `public.pg_trgm`.

## Entregable esperado

Un único documento con:
1. Migraciones propuestas, numeradas, con SQL y rollback.
2. Por cada migración: objetos tocados, código afectado, riesgo y prueba de verificación.
3. Consultas de control (solo agregados) y resultado esperado.
4. Orden de aplicación y qué probar en la rama antes de producción.
5. Lista de decisiones que necesitan confirmación de Víctor.

No ejecutes nada. Cuando Víctor apruebe una migración, se aplica primero en una rama de Supabase.

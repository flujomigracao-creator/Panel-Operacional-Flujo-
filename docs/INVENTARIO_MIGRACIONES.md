# Inventario de migraciones: producción frente al repositorio

Fecha: 2026-10-05 · Proyecto: `rumpfqevyspdmhaggxtq` (confirmado: es el que usa el panel desplegado en Easypanel; la URL aparece en el bundle publicado).
Método: solo lectura (`supabase_migrations.schema_migrations` + listado de archivos del repositorio). No se ha aplicado ni exportado nada.

## Resultado

| Dato | Valor |
|---|---|
| Migraciones registradas en producción | **201** (`20260911190001` → `20261005114607`) |
| Con SQL guardado en el historial de Supabase | **201 de 201** (≈ 879 KB) |
| Con archivo equivalente (por nombre) en el repositorio | 25 |
| **Sin archivo en el repositorio** | **176** (≈ 724 KB de SQL) |
| Archivos del repositorio sin registro en producción (por nombre) | 7 |

Conclusión: **la historia completa es recuperable** (el SQL está en Supabase), pero **hoy el repositorio no puede reconstruir la base**: le faltan el 88 % de las migraciones, y entre las que tiene hay desajustes de nombre y de fecha.

## Archivos del repositorio sin registro en producción (por nombre)

- `campaign_science_v5_creatives`, `create_meta_ads_intelligence_foundation`: vienen de otra línea de trabajo cuyo texto apunta a **otro proyecto** (`kxtshulqjkkgcrxhegiv`). Nunca se aplicaron aquí con ese nombre. Decidir si se descartan o se adaptan.
- `meta_ads_entities`, `meta_ads_insights_access`, `meta_ads_sync_log`, `publicos_meta`, `whatsapp_waba_id`: probablemente se aplicaron en producción con otro nombre (p. ej. `meta_ads_atribucion`, `publicos_catalogo_minimo`). Hay que comprobar objeto por objeto, no por nombre.
- Además hay archivos con numeración propia (`20261007…`, ya commiteados o en revisión) cuyas versiones en producción son `20261003…`: mismos cambios, distinta fecha. Al importar, **prevalece la versión de producción**.

## Migraciones más grandes que faltan en el repositorio

`20260924204911 operacional_pipeline_core` (38 KB) · `20260925053729 tramitador_cpf_por_persona` (20 KB) · `20261003020310 eventos_comerciales_y_pago_picpay` (16 KB) · `20260929150431 nora_conocimiento` (14 KB) · `20260913235635 add_agendamento_pf_service_and_document_upsert` (13 KB).

## Lo que NO demuestra este inventario

- Que aplicar las 201 en orden sobre una base vacía reproduzca el esquema actual: puede haber cambios hechos fuera de migraciones (desde el panel de Supabase), dependencias de extensiones, datos semilla o secretos.
- Que no haya objetos en producción que ninguna migración creó. Hay que **comparar el esquema real** (tablas, columnas, funciones, vistas, políticas, triggers, índices, extensiones) con el resultado de aplicar las migraciones en una base de pruebas.

## Plan (sin tocar producción)

1. **Exportar** el SQL de las 201 migraciones al repositorio con sus versiones reales (carpeta de instantánea, sin ejecutar nada). Vía recomendada: Supabase CLI, `supabase login` → `supabase link --project-ref rumpfqevyspdmhaggxtq` → `supabase migration fetch`.
2. **Reconciliar** nombres y versiones con los 32 archivos existentes (prevalece producción).
3. **Reconstruir en una base de pruebas** (rama de Supabase o Postgres local; una rama de Supabase tiene coste y requiere confirmación).
4. **Comparar el esquema** reconstruido con el de producción y listar diferencias.
5. **Pruebas funcionales y de aislamiento entre organizaciones** sobre la base reconstruida (el test de RLS usado el 2026-10-05 sirve de plantilla).
6. **Documentar** el procedimiento de instalación y recuperación.

## Rendimiento (medido, no supuesto)

- `resumen_inicio_v2`: ≈ 70–120 ms con cualquier período (1 a 366 días). `resumen_embudo`: ≈ 5 ms. `atribucion_pagos()`: ≈ 1–3 ms. La vista `crm_conversations` (conversaciones sin responder): ≈ 17 ms con 2.510 mensajes; es la que crecerá con el volumen.
- Datos: 281 oportunidades, 16 pagos, 223 conversaciones.
- Índices existentes relevantes: `payments(client_id)`, `payments(client_service_id)`, `client_services(client_id)`, `clients(organization_id, phone_key)` (único), `comercial_leads(organization_id, …)`. **Falta** un índice sobre `comercial_leads(client_id)`; con este volumen no es medible. **Decisión: no crear índices ahora.** Revisar con `EXPLAIN ANALYZE` cuando las oportunidades superen unos miles o `resumen_inicio_v2` pase de ≈ 300 ms.

## Cambios posteriores al inventario (2026-10-05)

Aplicados en producción y versionados aquí: `resumen_inicio_v2_identidad_telefone_chave` (20261005114607), `resumen_inicio_v2_sin_servicio_activas` (20261005114808), `tareas_sin_servicio` (20261005115108) y `cron_tareas_sin_servicio` (20261005115140).
Se activó la extensión **pg_cron** (antes no estaba) y existe un trabajo `tareas_sin_servicio` (cada hora, en punto). Para reconstruir desde cero hay que habilitar pg_cron antes de aplicar `cron_tareas_sin_servicio`.

### Regla de tareas para oportunidades sin servicio elegido (decidida el 2026-10-05)
48 h de espera desde la creación · reintento cada 48 h, máximo 3 tareas por oportunidad y ninguna nueva mientras la anterior siga abierta · cola común (la tabla `tasks` no tiene responsable). No se crea tarea si la oportunidad está perdida o perdida por silencio, ya se envió a Operacional, el cliente ya pagó, está en «Seguimiento (Sin Respuesta)» (ya la sigue Nora) o la conversación está viva. Primera ejecución: 6 tareas (de 58 oportunidades activas sin servicio; 101 más ya estaban perdidas).

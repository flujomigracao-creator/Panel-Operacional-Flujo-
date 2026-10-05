# Auditoría del panel principal — 2026-10-05

Alcance: solo lectura. Código del repo + catálogo del proyecto Supabase `rumpfqevyspdmhaggxtq`.
No se leyeron datos personales (solo recuentos y agregados). No se cambió nada en producción.

## Qué está verificado y qué no

| Fuente | Estado |
|---|---|
| Código del repo (HomeView, DashboardView, servicios, migraciones) | Leído |
| `npm test` | 42/42 pasan |
| `oxlint` | Solo avisos (Centro de Inteligencia). Lista completa no revisada |
| Build | No ejecutado |
| Catálogo Supabase `rumpfqevyspdmhaggxtq` (tablas, políticas, funciones, vistas, asesor de seguridad, migraciones) | Leído |
| Proyecto `kxtshulqjkkgcrxhegiv` | Sin permisos desde el conector; no verificado |
| Qué proyecto usa el panel desplegado | No verificado. `.env.example` apunta a `rumpf...`; el valor real está en la variable de build `VITE_SUPABASE_URL` |

Nota: `docs/ESTADO_ACTUAL.md` dice que el proyecto objetivo es `kxtshulqjkkgcrxhegiv`, pero el único proyecto accesible y con el esquema completo es `rumpf...`. Hay que corregir el documento o confirmar cuál es el de producción.

## Reglas de negocio fijadas

- Lead único = una oportunidad por servicio (misma persona con CPF y residencia = 2).
- Trámite bloqueado = pausado, o documento rechazado, o 7 días sin movimiento. El panel muestra cuál motivo aplica.
- Períodos con zona `America/Sao_Paulo`.
- Cobrado = `payments.status = 'paid'` por `paid_at`.

## Hallazgos

### P0

1. **Deriva repo ↔ producción.** El repo tiene 12 migraciones; la base tiene unas 200. Tablas base (`clients`, `payments`, `client_services`, `tasks`, `documents`, `pendentes_hoje`, etc.) no están versionadas. El repo no permite reconstruir la base.
2. **La migración `20261003040608_create_meta_ads_intelligence_foundation.sql` del repo no está aplicada** en `rumpf...`. Las tablas `meta_ads_attribution`, `meta_ads_funnel_events`, `meta_ads_conversion_events` no existen; la base ya tiene otro modelo (`eventos_comerciales`, `meta_ads_referidos`, `meta_embudo*`). La Edge Function `meta-capi` y `docs/ESTADO_ACTUAL.md` describen un modelo distinto del que corre. Aplicarla tal cual crearía un segundo sistema paralelo de atribución.
3. **`DashboardView` llama a `get_dashboard_stats`, que no existe** en la base (0 funciones). Esa pantalla falla con "Error al cargar las estadísticas". Además usa el modelo viejo (`clientes`, `entradas`); `clientes` tiene 0 filas.
4. **Fuga entre organizaciones latente.** Políticas SELECT con `USING (true)` para cualquier usuario autenticado: `meta_ads_insights`, `campaign_hypotheses`, `campaign_measurements`, `campaign_variants`, `kommo_tramites`, `nora_estrategias_confianza`, `nora_experimentos_confianza`. Hoy hay 1 sola organización, así que no hay fuga real, pero se activa en cuanto exista una segunda. Las políticas de `ad_trends`, `campaign_experiments`, `creatives`, `meta_ads_entities`, `meta_ads_sync_log` y otras permiten `organization_id IS NULL`; hoy `meta_ads_insights` no tiene filas con org nula.
5. **Errores de carga mostrados como "sin actividad"** en `HomeView.jsx:43-45`: ignora `isError`/`isFetching`. Si falla una consulta, muestra "Nadie esperando respuesta" o "0 trámites en curso".

### P1

6. **Totales cortados sin aviso.** Conversaciones limitadas a 300 (`CONVERSATIONS_LIMIT`) y trámites a `PAGE_SIZE`; los totales de Inicio se calculan en el navegador. Hoy hay ~199 conversaciones y 29 trámites, así que aún no se nota.
2. **Duplicación de oportunidades.** `comercial_leads` tiene 260 filas; 2 combinaciones cliente+servicio repetidas (violan la regla "una por servicio") y 67 leads sin `client_id` (sin contacto vinculado, no se pueden deduplicar por persona). `comercial_leads` y `crm_leads` (vista) son dos nombres para el mismo dato: usar la vista nativa del CRM como fuente única.
3. **Conversión incompleta hacia Meta.** `eventos_comerciales`: 258 `lead_creado`, 47 `servicio_elegido`, 7 `pago_confirmado` pero solo 1 enviado a Meta. `payments` paid = 14 vs 7 eventos de pago: hay pagos sin evento. Atribución por anuncio: 77 de 260 leads tienen `meta_ad_id`.
4. **Dos definiciones de "cobrado".** `financeService.js` (mes con tope superior) y `labService.js:111` (sin tope superior; el límite del mes sale de la hora del navegador).
5. **"Bloqueado" no unificado.** `tramites.js` mezcla pausado/rechazado con "sin movimiento 7 días" bajo un mismo bloque de Inicio; falta devolver el motivo como campo.

### P2

11. 5 tablas con RLS y sin políticas: `clientes`, `comercial_imagenes_revisadas`, `comercial_leads_respaldo_20261003`, `comercial_tramite_plantilla`, `nora_casos_analizados`. Revisar cuáles se pueden eliminar o documentar (la de respaldo y `clientes` son candidatas).
2. 2 funciones `SECURITY DEFINER` ejecutables por `authenticated`: `inscricoes_cpf_pendentes()`, `registrar_comprovante_cpf(...)`. Ambas tienen `search_path` fijado y `anon` no puede ejecutarlas. Falta revisar que validen la organización.
3. Protección de contraseñas filtradas desactivada; extensión `pg_trgm` en `public`.
4. 63 claves foráneas sin índice (según el asesor de rendimiento; no revisado en detalle).
5. Dos importaciones del cliente Supabase (`src/supabaseClient.js`, 50 usos; `@shared/config/supabaseClient`, 10): solo re-export, sin riesgo funcional.
6. Dashboard estadístico duplica Inicio con otro modelo: decidir qué migrar y retirar.

### Lo que está bien

- 26 de 26 vistas públicas con `security_invoker=true`.
- `payments`: 14 pagadas, todas con `client_service_id` y `paid_at`; 0 duplicados por trámite+monto; 0 pagos PicPay válidos sin vincular.
- Todas las tablas públicas tienen RLS activado.
- `insights` de Meta del 2026-09-12 al 2026-10-04 (última fecha: ayer); sin filas con organización nula.

## Arquitectura objetivo de Inicio

Una sola vista de servidor por indicador (security_invoker), consumida por Inicio. Sin lógica de negocio en el navegador.

| Indicador | Fuente |
|---|---|
| Oportunidades (leads únicos) | `crm_leads` agrupado por cliente + servicio, período en `America/Sao_Paulo` |
| Conversión | oportunidades con pago `paid` / oportunidades del mismo cohorte |
| Cobrado | `payments` `paid`, por `paid_at`, cuenta única compartida con Finanzas y Laboratorio |
| Trámites bloqueados | `client_services` activos con columna `motivo` ∈ {pausado, documento_rechazado, sin_movimiento_7d} |
| Conversaciones pendientes | `crm_conversations` con `unread_count > 0` (conteo en servidor, sin tope de 300) |
| Salud de integraciones | `meta_ads_sync_log`, `automation_runs`, `kommo_*`, última ejecución y errores |
| Gasto / coste por conversación | `meta_ads_insights` (gasto, conversaciones) |
| Coste por cliente adquirido | Solo cuando `meta_ad_id`/`ctwa_clid` enlazan lead → pago; mostrar "n con atribución de N" |

Cada indicador devuelve `valor`, `periodo`, `actualizado_at` y `estado` (`ok` | `sin_datos` | `error` | `atrasado`).

## Plan por tareas

### Supabase (a cargo de ChatGPT, ver `docs/INSTRUCCIONES_CHATGPT_BASE_DE_DATOS.md`)
1. Línea base: exportar el esquema real al repo como migración base.
2. Cerrar políticas `USING (true)` y `organization_id IS NULL` donde corresponda.
3. Decidir el destino de la migración `20261003040608` (no aplicar tal cual).
4. Vistas/RPC de métricas con la regla de la sección anterior.
5. Resolver duplicados de oportunidades y leads sin cliente.

### Código
1. Estados de error, vacío y atrasado en Inicio.
2. Resumen ejecutivo con filtro de período y comparación.
3. Retirar o migrar `DashboardView` y `get_dashboard_stats`.
4. Unificar "cobrado" y "bloqueado" en una sola fuente.
5. Integrar rendimiento de Meta Ads con límites de atribución visibles.

### Pruebas
- Comparar totales del panel con consultas de control; probar períodos vacíos, error de red, datos atrasados; probar con un usuario de otra organización (cuando exista) para confirmar aislamiento.

### Despliegue
- Aplicar migraciones primero en una rama de Supabase; mantener reversión; publicar el panel como versión revisable.

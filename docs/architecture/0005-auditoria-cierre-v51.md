# 0005 — Auditoría y cierre V5.1 (2026-10-01)

Estados: OK / PENDIENTE / BLOQUEADO. Todo lo marcado OK se comprobó contra la base o el código reales.

| Punto | Estado | Evidencia |
|---|---|---|
| GitHub = origen | OK | `main`, HEAD = `origin/main` tras el push |
| Hotfix `nullableStr` / args null-safe | OK | Ya en `ads.ts` del repo (fusionado en `c020bed`); producción v23 lo tiene |
| Hotfixes solo-de-producción sin versionar | OK (ninguno) | Diff v23 vs repo: lo único exclusivo de prod son líneas que el repo reemplazó (anotaciones de tipo, rama de anuncio) |
| Edge Function `asistente` = GitHub | **PENDIENTE** | Prod v23 sin código V5/V5.1 (`creatives.ts`, `creative_logic.ts`, acciones `creative_*`). Despliegue: workflow manual `deploy-functions.yml` o CLI |
| Edge Function `estado-meta` | OK | v4 desplegada, `verify_jwt` true, contenido idéntico al repo |
| Tablas V4/V5 y vistas | OK | Existen con RLS; lecturas como `authenticated` correctas (entities 8, sync_log 3, insights 25, experiments 2, variants 4) |
| 404 de `meta_ads_entities` / `meta_ads_sync_log` | OK | Existen, el frontend usa esos nombres, policies permiten leer |
| `ReferenceError: referidos` | OK | No existe; `no-undef` solo marca globales de Deno/navegador; tests y build pasan |
| Token de Meta | **BLOQUEADO** | Error 190/463: expiró 2026-10-01 07:00 PDT |
| Permisos `ads_read` / `ads_management` | BLOQUEADO | No comprobables con token vencido |
| Lectura Meta, sync, insights, escritura controlada | BLOQUEADO | Dependen del token |
| Facturación | PENDIENTE DE VERIFICACIÓN | No se afirma resuelta ni bloqueada |
| `META_PAGE_ID`, clave de imágenes | PENDIENTE | No configurados |
| Atribución (`meta_ads_referidos`) | ESPERANDO TRÁFICO REAL | Mecanismo listo: referido → trigger → `comercial_leads.meta_ad_id` → vista `lead_atribucion_anuncio` |
| Pestaña "Negocio" | No creada | No aporta función distinta de Resumen/Aprendizajes |
| Generación automática de variantes | Desactivada | Falta evidencia; flujo humano → hipótesis → experimento |

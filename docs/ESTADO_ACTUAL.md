# Estado actual del sistema (2026-10-02)

Verificado el 2026-10-02 contra GitHub, Supabase (`rumpfqevyspdmhaggxtq`) y el panel en producción.

## Fuentes de verdad

| Capa | Dónde vive | Cómo se despliega |
|---|---|---|
| Panel (React + Vite) | Este repositorio, rama `main` | Easypanel (VPS Hostinger), `Dockerfile` + nginx; deploy manual o Auto Deploy |
| Edge Functions | `supabase/functions/*` | Producción carga el código de GitHub **fijado a un commit** (`asistente`, `generar-creativo` → `5c26b4a`). Para actualizar: cambiar el SHA y redesplegar, o el workflow manual `Deploy Edge Functions` |
| Base de datos | `supabase/migrations/*` | Aplicadas a mano en Supabase; el repositorio debe tener cada migración de producción |
| Automatizaciones | n8n en Easypanel | Fuera del repositorio |

## Edge Functions en producción

`asistente`, `generar-creativo`, `kommo-canal`, `nora-conocimiento`, `nora-memoria`, `llenar-declaracion-cpf`, `whatsapp-webhook`, `whatsapp-plantillas`, `enviar-whatsapp-cliente`, `enviar-whatsapp-atendente`, `mover-etapa-comercial`, `estado-kommo`, `estado-conexiones`, `estado-meta`, `crm-sync-kommo`, `kommo-sync`.

Desplegada en producción y **sin código en el repositorio**: `diag-whatsapp` (herramienta de diagnóstico; pendiente decidir si se retira).

## Flujo de creativos → Meta (ya operativo)

```
Nora / Centro de Inteligencia
  → conceptos → prompt → imagen (OpenAI, gpt-image-2) → Storage → creatives
  → aprobar → experimento (campaign_experiments / campaign_variants)
  → propuesta (ai_proposals, tipo ads_experimento_v4) → confirmación humana
  → Meta: campaña + conjuntos + anuncios, siempre en PAUSED
  → IDs de Meta guardados → meta_ads_insights / meta_ads_referidos
  → vista experiment_trazabilidad (variante → creativo → generación → campaña → conjunto → anuncio → leads → pagos)
```

Reglas ya implementadas: tope de 40 imágenes generadas por día, creación siempre PAUSED, presupuesto de creación máximo R$ 250/día, cambio máximo R$ 150 por operación, y declarar ganador solo con datos suficientes (si no, resultado insuficiente/tendencia).

## Pendientes conocidos

- Cancelar propuestas duplicadas en `campaign_experiments` con estado `pending_approval` (RNM y CPF repetidas).
- Activar Leaked Password Protection en Supabase Auth (ajuste del panel de Auth).
- Revisar y clasificar tablas duplicadas (`clients`/`clientes`, `comercial_leads`/`crm_leads`, `conversations`/`crm_conversations`) como ACTUAL, COMPATIBILIDAD, LEGACY o FUTURA antes de eliminar nada.
- Renovar el token de WhatsApp antes del 2026-11-25.

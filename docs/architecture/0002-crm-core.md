# CRM propio: Supabase como núcleo, Kommo como integración

## Fuente de verdad

| Dato | Dueño | Kommo |
|---|---|---|
| Contactos (`clients`), trámites (`client_services`), documentos, pagos, tareas | Supabase | no participa |
| Etapa, responsable, etiquetas, notas y actividad de un lead | Supabase (`comercial_leads`, `crm_lead_tags`, `crm_lead_events`) | la etapa se sincroniza hacia Kommo |
| Embudos y etapas (`crm_pipelines`, `crm_stages`) | Supabase; `kommo_pipeline_id` / `kommo_status_id` son solo el mapeo | referencia |
| Mensajes entrantes de WhatsApp | llegan por webhook a `messages` | origen (mientras exista el canal) |
| Mensajes salientes | Supabase (`enviar-whatsapp-cliente`, WhatsApp Cloud API directo) | no participa |

## Flujo de cambio de etapa

1. `crm_move_lead_stage(lead, stage, idempotency_key)` (RPC, `SECURITY INVOKER`, respeta RLS): actualiza el lead
   y escribe un evento en `crm_lead_events`. Repetir la misma clave devuelve el mismo evento.
2. El panel llama a la edge function `crm-sync-kommo { event_id }`, que mueve el lead en Kommo y marca el
   evento `synced` / `failed` / `skipped`. Un evento reemplazado por uno posterior se marca `skipped`.
3. Si Kommo falla, el cambio queda guardado en Supabase y el Funil muestra "N sin sincronizar" con reintento.

## Frontend

El frontend lee la vista `crm_leads` (nombres neutrales, `security_invoker`), no `comercial_leads`.
n8n sigue escribiendo `comercial_leads`; ese contrato no cambió.

## Pendiente conocido

- `mover_etapa_lead_comercial` (RPC legado) y la edge function `mover-etapa-comercial` siguen con `ORG_ID`
  fijo; los usa la vista antigua "Nora/Comercial". La ruta nueva (`crm-sync-kommo`) no lo tiene.
- Crear el lead en Kommo desde el panel (hoy un lead creado en el panel no tiene `external_id`).
- Vistas de Trámites y Documentos como pantallas propias (hoy viven en la ficha del contacto).

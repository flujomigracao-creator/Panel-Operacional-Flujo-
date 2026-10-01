# 0006 · Auditoría V6 — seguridad e inventario (2026-10-01)

Solo lectura: no se borró ni cambió ningún dato. Las decisiones están marcadas como **mantener**, **revisar** o **pendiente del dueño**.

## 1. Sincronía GitHub ↔ producción
| Función | Versión | Origen desplegado | JWT |
|---|---|---|---|
| `asistente` | v29 | cargador fijado a `d835b98` | sí |
| `generar-creativo` | v18 | cargador fijado a `d835b98` | sí |
| `enviar-whatsapp-cliente` | v24 | cargador fijado a `9e3b307` | sí |

Sin cambios en `asistente`/`_shared`/`generar-creativo` desde `d835b98`: producción = repositorio para esas tres.

**Brecha cerrada (2026-10-01):** el código desplegado de `kommo-canal`, `llenar-declaracion-cpf`, `nora-conocimiento` y `diag-firma` se descargó de Supabase y está ahora en el repositorio (sin secretos). `diag-whatsapp` es un stub que responde 410 y no se copió. `diag-firma` (eco de prueba, sin referencias) se retiró de producción y del repo.

## 2. Funciones sin JWT (`verify_jwt = false`)
- `whatsapp-webhook`: público por diseño (Meta); valida el `phone_number_id` y la firma opcional (`WHATSAPP_APP_SECRET`). **Revisar:** hacer obligatoria la firma.
- `kommo-canal`: valida la firma HMAC de Kommo; las acciones `flush`/`sincronizar_plantillas` no reciben datos y solo procesan colas. **Mantener.**
- `enviar-whatsapp-atendente`, `whatsapp-plantillas`, `nora-memoria`: exigen service role (se comprueba contra la API admin de Auth). **Mantener.**

## 3. Avisos del Security Advisor
- **RLS sin políticas** (`comercial_imagenes_revisadas`, `comercial_tramite_plantilla`, `nora_casos_analizados`): las usan funciones del servidor (`comercial_registrar_imagen`, `nora_registrar_aprendizajes`, etc.). Sin políticas = ningún usuario accede directo; es el comportamiento deseado. **Mantener** (opcional: política explícita de denegar todo para silenciar el aviso).
- **`clientes`** (0 filas): tabla distinta de `clients`, sin uso en el servidor. **LEGACY / candidata a borrar**, pendiente del dueño.
- **`SECURITY DEFINER` `inscricoes_cpf_pendentes` y `registrar_comprovante_cpf`:** revisadas. Ambas toman la organización de `private.get_user_org_id()` (no de un parámetro), filtran por esa organización y `registrar_comprovante_cpf` exige que la ruta de Storage empiece por el id de la organización y que la persona pertenezca al trámite. **Mantener**; el aviso es esperado.
- **Contraseñas filtradas desactivadas:** se activa en Supabase → Auth → Providers → Email. **Acción del dueño** (no se puede por SQL).
- **`pg_trgm` en `public`:** aviso menor; mover de esquema exige revisar índices que lo usan. **Pendiente.**

## 4. Inventario de tablas públicas (filas a la fecha)
**ACTUAL (con datos):** `messages`, `message_attachments`, `inbound_media`, `conversations`, `clients`, `client_services`, `service_stages`, `service_fields`, `client_service_*`, `documents`, `document_types`, `payments`, `tasks`, `services`, `comercial_leads`, `comercial_*`, `crm_lead_events`, `crm_stages`, `crm_pipelines`, `pipeline_stages`, `nora_*` con datos, `ai_conversations`, `ai_messages`, `ai_proposals`, `meta_ads_*` con datos, `creative_*`, `campaign_*`, `ad_trends`, `whatsapp_plantillas`, `channel_integrations`, `organization*`, `profiles`, roles y permisos.

**COMPATIBILIDAD (Kommo/n8n):** `kommo_canal_*`, `kommo_outbox`, `kommo_plantillas`, `kommo_tramites`, `whatsapp_contactos_nuevos`, `automation_runs`, `tramitador_execucoes`. No tocar sin revisar los flujos de n8n.

**FUTURO (existen, 0 filas, sin uso todavía):** finanzas (`expenses`, `financial_accounts`, `financial_categories`, `invoices`, `transactions`), conocimiento (`knowledge_*`), métricas (`daily_metrics`, `monthly_metrics`, `business_summaries`, `client_summaries`, `conversation_summaries`), notificaciones (`push_tokens`, `notification_preferences`), `appointments`, `tags`, `client_tags`, `crm_lead_tags`, `client_addresses`, `client_contacts`, `client_notes`, `client_relations`, `client_activity`, `conversation_participants`, `ai_feedback`, `ai_sources`, `nora_casos`, `nora_memorias`, `campaign_learnings`.

**Esperando tráfico real:** `meta_ads_referidos` (0 filas): sin anuncio con referral de WhatsApp no hay atribución.

**LEGACY candidata:** `clientes`.

## 5. Fuente de verdad (una por concepto)
| Concepto | Tabla |
|---|---|
| Cliente | `clients` |
| Venta / lead comercial | `comercial_leads` |
| Trámite | `client_services` (+ `service_stages`) |
| Mensajes | `messages` |
| Pago | `payments` |
| Meta | `meta_ads_insights` + `meta_ads_entities` |
| Atribución | `meta_ads_referidos` → `origen_leads` |
| Experimentos | `campaign_experiments` |
| Plantillas de WhatsApp | `whatsapp_plantillas` (sincronizadas con Meta) |

## 6. Siguientes pasos propuestos (en orden)
1. ~~Traer al repo el código de las funciones sin fuente~~ (hecho).
2. Activar protección de contraseñas filtradas (dueño).
3. `diag-firma` retirada. `clientes` (vacía, sin FKs/vistas/funciones) se conserva por ahora: 8 componentes legacy del panel (ClientView, ClientViewEditModal, ClientViewExtractionModal, GlobalBotListener, MantenimientoSettings, useClientViewEdit) aún la consultan; borrarla exige retirar antes ese código.
4. Resolver facturación de WhatsApp (error 131042), token de Meta y referral de anuncios.
5. Embudo Nora → pago por servicio y estado de salud del sistema.

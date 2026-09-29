# CRM propio: Supabase como núcleo, Kommo como integración

## Modelo: contacto ≠ lead ≠ trámite

```text
CONTACTO (clients)                 una persona, sin duplicar (clave: contacto de Kommo o teléfono → phone_key)
 ├── LEAD (comercial_leads)        una oportunidad de venta; varios por persona (ej. RNM y CPF)
 │     ├── etapa  → crm_stages     (embudo: crm_pipelines)
 │     ├── etiquetas → crm_lead_tags
 │     └── actividad → crm_lead_events (creado, etapa, responsable, datos, etiquetas, notas)
 ├── TRÁMITE (client_services)     el proceso post-venta; puede nacer de un lead (kommo_lead_id)
 │     ├── documentos → documents
 │     └── pagos → payments
 ├── CONVERSACIÓN (conversations → messages)
 └── TAREAS (tasks)
```

## Fuente de verdad: una sola tabla para escribir, una vista para leer

`crm_leads` **no es una tabla**: es una vista (`security_invoker`) sobre `comercial_leads` que expone nombres
neutrales y resuelve la etapa contra `crm_stages`. No hay dos fuentes de verdad:

| Operación | Dónde |
|---|---|
| Leer leads | vista `crm_leads` |
| Crear lead | RPC `crm_create_lead` → inserta en `comercial_leads` |
| Cambiar responsable / trámite / valor | RPC `crm_update_leads` → `comercial_leads` |
| Cambiar etapa | RPC `crm_move_lead_stage` (idempotente) → `comercial_leads` + evento |
| Etiquetas, notas | tablas `crm_lead_tags`, `crm_lead_events` |
| Leer chats | vista `crm_conversations` (último mensaje y mensajes sin responder) |

n8n y el webhook de Kommo siguen escribiendo `comercial_leads` como siempre (`sincronizar_lead_comercial`); ese
contrato no cambió. Lo que tiene que pasar **siempre**, escriba quien escriba, lo hacen triggers en la base:

- `trg_crm_link_contact` (antes de insertar/actualizar un lead): vincula el lead con su contacto. Busca por
  contacto de Kommo y después por teléfono (`phone_key`, el mismo criterio que `vincular_kommo`); si no existe,
  crea el contacto con estado `lead`. Los clientes simulados de Nora (`+55 00…`) no se crean como personas.
  Nunca bloquea la escritura del lead: ante un error, el lead queda sin contacto y se registra un aviso.
- `trg_crm_log_events` (después): registra "Lead creado", cambios de etapa hechos fuera del panel (origen
  `automatizacion`), responsable y cambios de trámite/valor.
- `trg_crm_lead_tags_log`: registra etiquetas agregadas o quitadas.
- `clients_link_kommo_history` (ya existía): al crear un contacto con contacto de Kommo, le asigna sus
  conversaciones y mensajes anteriores.

## Qué es de Supabase y qué se sincroniza con Kommo

| Dato | Dueño | Kommo |
|---|---|---|
| Contactos, trámites, documentos, pagos, tareas | Supabase | no participa |
| Responsable, etiquetas, notas, actividad del lead | Supabase | no se envía |
| Etapa del lead | Supabase | se sincroniza hacia Kommo (`crm-sync-kommo`) y llega desde Kommo (n8n) |
| Embudos y etapas | Supabase; `kommo_pipeline_id` / `kommo_status_id` son solo el mapeo | referencia |
| Mensajes entrantes de WhatsApp | llegan por webhook (`whatsapp-webhook`) a `messages` | se copian al chat del canal personalizado |
| Mensajes salientes (panel, Nora) | `enviar-whatsapp-cliente` / `enviar-whatsapp-atendente` (WhatsApp Cloud API directo) | se copian al chat del canal personalizado |
| Mensajes que un operador escribe en Kommo | canal personalizado → n8n → `kommo-canal` → WhatsApp Cloud API → `messages` | origen |

## Canal personalizado de Kommo (Chats API)

El número de WhatsApp es propio (Cloud API), así que Kommo no ve las conversaciones por sí solo. El canal
"Flujo Migracao WhatsApp" (`amo.ext.36958507`) las copia a Kommo y deja responder desde ahí:

- **Hacia Kommo:** el trigger `trg_kommo_canal_encolar` encola en `kommo_canal_outbox` cada mensaje con origen
  `whatsapp_cloud_api` (cliente, Nora, panel) y despierta a `kommo-canal { action: 'flush' }` con pg_net. La función
  crea el chat en amoJo (uno por número: `wa:<telefone_chave>`, en `kommo_canal_chats`), lo vincula al contacto de
  Kommo (`/api/v4/contacts/chats`, así el mensaje cae en su lead) e importa el mensaje. Un número nuevo espera hasta
  30 min a que n8n cree su lead (para no duplicar el contacto); los errores se reintentan con espera creciente.
  Los clientes simulados (`+55 00…`) no se copian.
- **Desde Kommo:** Kommo manda el webhook a la URL registrada en el canal, que es de n8n
  (`/webhook/kommo-canal-personalizado/<scope_id>`, workflow "Kommo Canal Personalizado - Webhook Saliente").
  n8n reenvía el cuerpo original en base64 con la firma a `kommo-canal`, que la verifica, manda por WhatsApp, lo
  registra con origen `kommo_canal_whatsapp` (no vuelve a Kommo), marca el lead como atendido y avisa a Kommo si
  falló el envío. `kommo_canal_recibidos` evita procesar dos veces un reintento de Kommo.
- **Activación:** nada se copia hasta `channel_integrations.kommo_canal_enabled = true` (solo el servidor). El primer
  `flush` conecta el canal a la cuenta y guarda `kommo_scope_id`. Secreto: `KOMMO_CHANNEL_SECRET`.

## Cambio de etapa (Funil, panel del lead, acciones masivas)

1. `crm_move_lead_stage(lead, etapa, clave)` actualiza el lead y escribe el evento con `sync_status = pending`
   (o `skipped` si el lead no existe en Kommo). Repetir la misma clave devuelve el mismo evento.
2. El panel llama a `crm-sync-kommo { event_id }`: mueve el lead en Kommo y marca el evento `synced` o `failed`.
   Un evento reemplazado por un cambio posterior se marca `skipped`.
3. Si Kommo falla, el cambio queda guardado en Supabase; el Funil muestra "N sin sincronizar con Kommo" y el panel
   del lead muestra "Reintentar".

## Multi-organización

- Todo lo que usa el panel se aísla con RLS por `organization_id` (`private.get_user_org_id()`), sin `USING(true)`.
- Las vistas nuevas son `security_invoker`, así que heredan la RLS de sus tablas.
- El panel ya no depende de `ORG_ID`: la organización sale de `organization_members` del usuario.
- Pendiente (ingesta automática): 31 funciones SQL que llama n8n, los webhooks `whatsapp-webhook`,
  `enviar-whatsapp-atendente` y los valores por defecto de `organization_id` en `comercial_leads`, `nora_*`,
  `kommo_plantillas`, `tramitador_execucoes` y `whatsapp_contactos_nuevos` siguen asumiendo la organización
  original. Para una segunda organización hace falta saber a qué organización pertenece cada número de WhatsApp y
  cada cuenta de Kommo (tabla de integraciones por organización) y pasar ese dato a esas funciones.

## Pendiente

- Crear el lead en Kommo desde el panel (hoy un lead creado en el panel no tiene `external_id` y no se sincroniza).
- Invitaciones y permisos del equipo desde el panel.

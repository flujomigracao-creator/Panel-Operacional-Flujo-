# Atribución de Meta Ads: anuncio → lead → cliente → pago

Objetivo: saber cuánto costó cada cliente que pagó, por anuncio y campaña, no solo cuántos leads trajo.
Migración: `supabase/migrations/20260929000007_meta_ads_atribucion.sql`.

```text
Anuncio "clic a WhatsApp" ──► whatsapp-webhook ──► meta_ads_referidos (referral: ad_id, ctwa_clid)
                                                        │ triggers
                                                        ▼
                                           comercial_leads.meta_ad_id ──► client_id ──► payments
                                                        │
Meta Marketing API ──(n8n, diario)──► meta_ads_insights ┘  (gasto, campaña, conjunto por ad_id)
                                                        ▼
                                              vista meta_ads_resultados
```

## Cómo se asigna el anuncio a un lead

- **Número nuevo** (caso normal): llega el mensaje con `referral` → se guarda en `meta_ads_referidos`.
  Cuando n8n crea el lead, el trigger `comercial_lead_tomar_referido` le pone el referido más reciente de
  ese teléfono (últimos 30 días).
- **Lead que ya existía**: el trigger `meta_ads_referido_a_lead` asigna el anuncio a sus leads abiertos
  que todavía no tienen uno.
- Primer toque: nunca se pisa un `meta_ad_id` ya asignado; ganados (142) y perdidos (143) no se tocan.
- Solo llegan referidos de anuncios que abren WhatsApp directo al número de Cloud API. Los leads de
  formularios de Meta o de otros canales quedan sin `meta_ad_id`.

## Carga de gasto (n8n → `meta_ads_insights`)

Una fila por anuncio y día; upsert por `(organization_id, fecha, ad_id)`. Fuente sugerida:

```
GET /v23.0/act_<AD_ACCOUNT_ID>/insights
  ?level=ad&time_increment=1&date_preset=last_7d
  &fields=ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,spend,impressions,clicks,actions,account_currency
```

| Columna | Campo de Meta |
|---|---|
| `fecha` | `date_start` |
| `gasto` | `spend` |
| `conversaciones` | `actions[onsite_conversion.messaging_conversation_started_7d]` |
| `leads_meta` | `actions[lead]` |
| `moneda` | `account_currency` |
| `raw` | la fila completa |

Traer siempre los últimos 7 días (Meta corrige datos de días recientes) y hacer upsert. Token: usuario del
sistema del Business Manager con permiso `ads_read`, guardado como credencial de n8n (nunca en `VITE_*`).

## Lectura

`meta_ads_resultados` da los totales históricos por anuncio: gasto, leads, ganados, clientes que pagaron,
ingresos, costo por lead, costo por cliente y retorno. Cada cliente cuenta para un solo anuncio (el de su
primer lead atribuido). Para un período concreto, consultar `meta_ads_insights` y `comercial_leads`
filtrando por fecha.

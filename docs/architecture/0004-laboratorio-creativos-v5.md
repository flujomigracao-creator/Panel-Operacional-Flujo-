# 0004 — Laboratorio de Creativos (Motor Científico V5)

Se construye sobre el V4; no hay un segundo asistente ni tablas duplicadas.

| Dato | Fuente |
|---|---|
| Creativos (imagen, copy, prompt usado, IDs de Meta) | `creatives` + bucket privado `creatives` |
| Biblioteca de prompts con versiones | `creative_prompts` (cada cambio de texto = versión nueva) |
| Resultados por creativo / por prompt | vistas `creative_resultados`, `prompt_resultados` (`security_invoker`) |
| Experimentos, variantes, mediciones, hipótesis, aprendizajes | tablas V4 (`campaign_variants.creative_asset_id` enlaza el creativo) |
| Propuestas con confirmación humana | `ai_proposals` (`ads_publicar_creativo`, `ads_experimento_v4`) |

## Cadena de atribución (ya existente en la base)
`meta_ads_referidos(ad_id, telefono_chave)` → trigger `meta_ads_referido_a_lead` / `comercial_lead_tomar_referido` →
`comercial_leads.meta_ad_id` → `client_id` → `payments(status='paid')`. La vista `meta_ads_resultados` la resume por anuncio;
`creative_resultados` la une a `creatives.ad_id`. Un 0 en leads/clientes puede significar "sin atribución todavía".
Los triggers viven en la base y no en estas migraciones.

## Reglas
- Sin datos = `NULL`, nunca 0 inventado. `ad_id` solo se vincula si existe en `meta_ads_entities`; un anuncio ↔ un creativo.
- Meta: siempre propuesta → confirmación → ejecución → `automation_runs`. Los anuncios nacen `PAUSED`.
- Ganador (`evaluarGanador`, `creative_logic.ts`): exige ≥1000 impresiones por variante, ≥3 días, ≥10 conversaciones, ventaja ≥20 %.
  Métrica = costo por cliente pagante si hay ≥3 pagos; si no, costo por conversación (y se dice). Solo `ganador` escribe en `campaign_learnings`.
- Tope de 40 imágenes generadas por día (costo).

## Secretos (Supabase → Edge Functions)
`OPENAI_API_KEY` o `GEMINI_API_KEY` (generación de imagen; opcional `IMAGE_MODEL`), `META_PAGE_ID` (publicar anuncios),
más los de Meta ya existentes. Sin proveedor de imagen se pueden subir imágenes propias.

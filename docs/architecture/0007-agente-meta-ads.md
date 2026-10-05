# 0007 — Agente Meta Ads de FLUJO (documento técnico de implementación)

Estado: propuesta, 2026-10-02. Parte del plan de 15 fases del dueño; este documento lo baja a tablas, funciones y tareas
concretas **sobre lo que ya existe** (ver 0003, 0004 y 0005). Nivel de autonomía de arranque: **Nivel 2 (propone, el dueño confirma)**.

## Principio rector

El agente existe para conseguir **clientes pagados al menor costo sostenible**, respetando la capacidad operativa y aprendiendo de
resultados reales. Nunca optimiza por métricas de Meta (clics, leads de Meta, engagement) como fin.

Si no hay datos suficientes, la única respuesta válida es: **"No hay suficiente información para tomar esta decisión"**.

## 1. Qué ya existe (no reconstruir)

| Necesidad del plan | Ya existe | Brecha |
|---|---|---|
| Entidades Meta (campaña/conjunto/anuncio) | `meta_ads_entities` (sync n8n cada 5 min) | Falta público, país, edad, placement y evento de optimización por conjunto |
| Métricas diarias por anuncio | `meta_ads_insights` (+ `raw` completo), `meta_ads_desglose` (edad/sexo, ubicación, región, dispositivo) | — |
| Atribución Meta → WhatsApp | `meta_ads_referidos` (por `ad_id`, `ctwa_clid`) → `origen_leads` | Solo cubre conversaciones con referral; el resto es "sin atribución", nunca se inventa |
| Lead → propuesta → pago → cliente | `origen_leads` (`ganado`, `pagos`, `ingresos`), `comercial_leads`, `payments` | Falta contar **calificados** y **propuestas** por anuncio de forma explícita |
| Resultados por creativo | vista `creative_resultados` | Falta CAC y ROAS por campaña/conjunto |
| Experimentos y memoria | `campaign_experiments`, `campaign_variants`, `campaign_measurements`, `campaign_hypotheses`, `campaign_learnings` | Falta regla formal de confianza y de reevaluación |
| Trazabilidad completa | vista `experiment_trazabilidad` | — |
| Propuesta + confirmación + PAUSED | `ai_proposals` + `asistente` (`ads.ts`) | — |
| Límites de gasto | R$ 250/día de creación, R$ 150 por operación, +50% máximo | Falta tope por capacidad operativa |

**Decisión de diseño:** el plan propone tablas nuevas `meta_campaigns`, `meta_adsets` y `meta_ads`. **No crearlas.** Duplicarían
`meta_ads_entities` y `meta_ads_insights` y crearían dos fuentes de verdad. En su lugar: **vistas** sobre las tablas actuales
(sección 3). Solo se agregan columnas a `meta_ads_entities` para lo que falta (público, país, ciudad, edad, placement, optimización).

## 2. Cinco capas de conocimiento del agente

Orden de prioridad al decidir (de menor a mayor peso):

```
1. Conocimiento general de Meta (reglas del Excel, guías)      → referencia
2. Reglas de remarketing                                        → referencia
3. Reglas de performance                                        → referencia
4. Datos históricos de FLUJO (campaign_learnings, mediciones)   → evidencia propia
5. Decisión del agente                                          → siempre justificada con 4
```

Las reglas externas son **hipótesis a contrastar**, nunca órdenes. Si los datos propios las contradicen con muestra suficiente, gana el dato propio y se registra como aprendizaje.

### Tablas nuevas de conocimiento

```sql
-- Identidad del negocio: hechos comerciales que el agente NO puede inventar. Una fila por hecho, con vigencia.
create table public.agente_negocio_hechos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  categoria text not null check (categoria in ('servicio','precio','publico','geografia','proceso','pago','definicion')),
  clave text not null,                -- p.ej. 'cpf.precio', 'definicion.lead_calificado'
  valor text not null,
  vigente_desde date not null default current_date,
  vigente_hasta date,
  fuente text not null,               -- 'catalogo_tramites', 'dueño', ...
  unique (organization_id, clave, vigente_desde)
);

-- Biblioteca de reglas de marketing (las 60 del Excel + reglas propias)
create table public.agente_reglas_marketing (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  codigo text not null,               -- 'R-001'
  capa text not null check (capa in ('meta_general','remarketing','performance','flujo')),
  regla text not null,
  condicion jsonb,                    -- cuándo aplica (servicio, objetivo, etapa)
  fuente text not null,               -- 'excel_60_reglas', 'aprendizaje_propio'
  estado text not null default 'referencia' check (estado in ('referencia','confirmada_con_datos','contradicha_con_datos','descartada')),
  evidencia jsonb,
  unique (organization_id, codigo)
);
```

Los precios no se copian: `agente_negocio_hechos` los lee de `comercial_audios_pitch.precio` / catálogo vigente, y el agente cita la fila, no la memoria del modelo.

## 3. Modelo de datos analítico (vistas, no tablas)

```sql
-- Embudo real por anuncio y período. Todo lo sin evidencia es NULL (nunca 0 inventado).
meta_embudo_anuncio(ad_id, adset_id, campaign_id, desde, hasta,
  gasto, impresiones, alcance, frecuencia, clics, cpm, ctr, cpc,
  conversaciones_meta,                 -- de meta_ads_insights
  conversaciones_atribuidas,           -- de meta_ads_referidos
  leads, calificados, propuestas,      -- de origen_leads / comercial_leads (por etapa)
  pix_enviados, pagos, clientes, ingresos,
  cac, roas, conv_lead_a_pago)
```

- `meta_embudo_campania` y `meta_embudo_conjunto`: la misma vista agregada por nivel.
- `calificado` y `propuesta` se derivan de la **etapa** del lead (`comercial_leads.etapa_position`); la regla de qué etapa cuenta como cada cosa vive en `agente_negocio_hechos` (`definicion.lead_calificado`, etc.), no en el código.
- **Atribución parcial:** el embudo muestra siempre `conversaciones_atribuidas / conversaciones_meta`. Si la cobertura es baja, el CAC se marca `confianza = baja` y el agente lo dice.

## 4. Motor de decisión

Función `decidir_campania(campaign_id, periodo)` (en la Edge Function `asistente`, módulo nuevo `meta_decision.ts`; sin IA para el cálculo, la IA solo redacta la explicación).

Estados: `ESCALAR`, `MANTENER`, `OBSERVAR`, `OPTIMIZAR`, `REDUCIR`, `PAUSAR`, `REESTRUCTURAR`, **`INSUFICIENTE`**.

Reglas duras:

1. **Muestra mínima antes de cualquier decisión de gasto:** configurable en `organization_settings` (valor inicial propuesto: ≥ 7 días activos **y** ≥ R$ 150 gastados **y** ≥ 30 conversaciones atribuidas). Por debajo → `INSUFICIENTE` u `OBSERVAR`, nunca `PAUSAR`/`ESCALAR`.
2. Nunca decide con una sola métrica. El estado sale de una matriz que combina CAC, conversión lead→pago, frecuencia, tendencia y volumen.
3. `ESCALAR` exige además capacidad operativa disponible (sección 6) y tope de +50% por operación (ya vigente).
4. `PAUSAR` por "gasta sin conversiones" exige gasto ≥ 2× el CAC objetivo sin ninguna conversación atribuida; si hay problema de tracking conocido → `REESTRUCTURAR`, no `PAUSAR`.
5. Cada decisión se guarda con sus insumos (`agente_decisiones`) para auditarla.

```sql
create table public.agente_decisiones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  nivel text not null,                      -- 'campaign'|'adset'|'ad'
  entity_id text not null,
  estado text not null,                     -- ESCALAR|MANTENER|...|INSUFICIENTE
  confianza text not null check (confianza in ('baja','media','alta')),
  insumos jsonb not null,                   -- métricas exactas usadas y su cobertura de atribución
  razones jsonb not null,
  regla_ids text[],                         -- reglas de agente_reglas_marketing consultadas
  proposal_id uuid references public.ai_proposals(id),
  creado_at timestamptz not null default now(),
  reevaluar_despues jsonb                   -- p.ej. {"nuevos_leads": 50}
);
```

## 5. Aprendizaje y creative intelligence

- Reusar `campaign_hypotheses` / `campaign_learnings`. Agregar a `campaign_learnings`: `reevaluar_despues jsonb` y `estado` (`vigente|reevaluar|obsoleto`).
- **Clasificación de creativos:** columnas `hook_tipo` (PROBLEMA, BENEFICIO, URGENCIA, SEGURIDAD, PRECIO, FACILIDAD, EXPERIENCIA, DOCUMENTACION), `angulo` y `publico_nacionalidad` en `creatives` (valores en enum/check; el director creativo ya produce hook y concepto, solo falta fijarlos en un vocabulario cerrado).
- **Un experimento solo declara ganador por conversión a pago**, no por CTR. Si A gana en CTR y B en pagos, el resultado debe decir exactamente eso y proponer B si la muestra alcanza; si no, `INCONCLUSO`.
- Cada aprendizaje guarda `sample_size`, `confianza` y cuándo reevaluar.

## 6. Capacidad operativa y presupuesto inteligente

```sql
create table public.capacidad_operativa (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  servicio text not null,
  casos_activos_max integer not null,        -- lo fija el dueño
  casos_nuevos_semana_max integer not null,
  actualizado_at timestamptz not null default now(),
  primary key (organization_id, servicio)
);
```

La recomendación de presupuesto compara `casos_activos` (de `client_services`) contra `casos_activos_max` y proyecta clientes esperados = presupuesto ÷ CAC histórico. Si la proyección supera la capacidad → no escalar y explicarlo. **Este dato lo define el dueño; el agente no lo supone.**

## 7. Remarketing (Fase 9) — alcance honesto

Requiere crear **públicos personalizados** vía Marketing API (permiso `ads_management` ya usado). Dependencias a confirmar antes de construir:

- Visitantes web 1/7/14/30 días: exige Pixel/CAPI instalado en una web. **Hoy el flujo es clic a WhatsApp; no hay web con pixel confirmada.**
- Segmentos de WhatsApp (inició, no respondió, recibió Pix, no pagó): hay que subir listas de teléfonos como público de clientes (hash SHA-256). Datos personales de terceros: requiere decisión del dueño sobre consentimiento y política de datos.
- Clientes que pagaron → exclusión automática: es el caso más seguro y de mayor valor; empezar por ahí.

## 8. Alertas (Fase 10)

Tabla `agente_alertas(id, organization_id, severidad 'critica'|'atencion'|'oportunidad', tipo, entity_id, mensaje, insumos jsonb, creada_at, resuelta_at)`. Un job n8n cada hora evalúa reglas sobre las vistas del punto 3 y escribe alertas; el panel las lee por Realtime (ya hay Realtime sobre las tablas de Meta). Alertas críticas adicionales de infraestructura: `meta_ads_sync_log` sin sincronización > 30 min, WhatsApp sin mensajes entrantes, anuncio rechazado (`effective_status`).

Antirruido: una alerta abierta por (tipo, entity_id); no se repite hasta resolverse.

## 9. Panel Meta Ads (Fase 13)

El Centro de Inteligencia ya tiene Resumen, Métricas, Meta Ads, Creativos, Experimentos y Campañas. Trabajo restante:

1. Reemplazar KPIs con el embudo real (CAC, ROAS, conversión lead→pago) alimentado por `meta_embudo_*`.
2. Panel de **Alertas** y de **Recomendaciones** (lee `agente_decisiones` pendientes, con botón de enviar a confirmación).
3. Mostrar siempre la cobertura de atribución junto a CAC/ROAS.

## 10. Seguridad y control humano

- Nivel 2: el agente **solo crea `ai_proposals`**; ejecutar exige confirmación del dueño (ya vigente). Subir a Nivel 3 solo con decisión explícita y solo para cambios pequeños con tope configurable.
- Prohibido (validado en código, no solo en el prompt): inventar métricas/conversiones/clientes/precios; atribuir sin evidencia; borrar campañas; escalar > +50%; decidir con una sola métrica; tratar una regla externa como verdad.
- Toda decisión y alerta guarda sus insumos.
- Migraciones nuevas: `security definer` con `search_path` fijado, `revoke` a `anon`/`authenticated`, RLS con `panel_read` (mismo patrón que `meta_ads_desglose`).

## 11. Tareas por sprint

Cada sprint termina con: pruebas en verde (`npm test`), migración en `supabase/migrations`, commit, push y `HEAD == origin/main`.

| Sprint | Entregable | Criterio de aceptación |
|---|---|---|
| 1 | `agente_negocio_hechos` + `agente_reglas_marketing`; carga de las 60 reglas del Excel y de las definiciones comerciales | **Hecho en parte (2026-10-02):** tablas, 60 reglas con su aplicabilidad (19 aplica, 18 parcial, 7 requiere web, 15 fuera de alcance, 1 sin contenido), embudo y vista `agente_precios_vigentes`. **Falta:** que `asistente` consulte estas tablas, y las definiciones de calificado/propuesta/Pix. |
| 2 | Columnas extra en `meta_ads_entities` (público, país, edad, placement, optimización) + sync | Datos visibles en `meta_ads_entities` tras una sincronización |
| 3 | Definiciones calificado/propuesta/Pix por etapa; vista `meta_embudo_anuncio` | Totales de la vista coinciden con `origen_leads` en una auditoría manual |
| 4 | `meta_embudo_campania/conjunto`, CAC y ROAS reales + cobertura de atribución | Caso de ejemplo del plan (campañas A y B) reproducido con datos sintéticos en prueba |
| 5 | `meta_decision.ts` + `agente_decisiones` | Pruebas: muestra insuficiente → `INSUFICIENTE`; una métrica buena sola no escala |
| 6 | Vocabulario cerrado de hooks/ángulos/públicos en `creatives` | Cada creativo nuevo queda clasificado |
| 7 | Regla de ganador por pago + `reevaluar_despues` en aprendizajes | Experimento con A mejor CTR y B mejores pagos devuelve la conclusión correcta (prueba) |
| 8 | Públicos de exclusión de clientes pagados (primero); luego segmentos WhatsApp, previa decisión de datos | Público creado en PAUSED/inactivo y revisado por el dueño |
| 9 | `agente_alertas` + job n8n horario | Alerta crítica simulada aparece en el panel una sola vez |
| 10 | Panel de embudo, alertas y recomendaciones | Revisión visual con el dueño en producción |
| 11 | Memoria histórica: reevaluación automática de aprendizajes | Aprendizaje marcado `reevaluar` cuando se cumple su condición |
| 12 | Nivel 3 (opcional) | Decisión explícita del dueño; tope y registro de cada acción |

## 12. Datos que solo el dueño puede dar

1. El **Excel de las 60 reglas** (no está en el repositorio ni en el equipo).
2. Capacidad operativa por servicio (`capacidad_operativa`).
3. CAC objetivo y margen por servicio.
4. Definición exacta de lead calificado y de qué etapas cuentan como propuesta y Pix.
5. Política de uso de teléfonos para públicos de remarketing.
6. Si existe una web con Pixel/CAPI.

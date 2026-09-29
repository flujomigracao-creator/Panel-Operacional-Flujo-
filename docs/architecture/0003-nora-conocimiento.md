# 0003 — Centro de control de Nora (conocimiento)

Todo lo que Nora sabe se administra desde el panel (`#nora`). Supabase queda como infraestructura detrás.
Código separado del operacional y del CRM: `src/features/nora/`.

## Fuentes y estados

| Fuente | Tabla | Nora la usa cuando… |
|---|---|---|
| Información oficial | `knowledge_documents` → `knowledge_chunks` | `status = published` y `procesamiento = procesado` |
| Respuestas | `nora_respuestas_aprobadas` | `estado = aprobada` (lo nuevo nace `borrador`) |
| Reglas | `nora_reglas` | `activa`; van siempre enteras en `nora_catalogo()`, ordenadas por `prioridad` (critica → importante → normal) |
| Casos históricos | `nora_casos` | `estado = aprobado`; son antecedentes, nunca reglas |
| Lecciones | `nora_aprendizajes` | `estado = aprobada` (se muestra como "Correcto") |
| Memoria del cliente | `nora_memorias` | `activa` y **solo** para el `client_id` de esa conversación |

Nada entra solo: importaciones y altas automáticas (`nora-memoria` `guardar_*`) quedan en borrador / pendiente / inactivo.

## Búsqueda (RAG)

`nora_rag_search(vector, org, client, n)`: similitud coseno con vectores gte-small (384) + desempate por prioridad
(`similitud + prioridad/1000`): documento 100 · respuesta 95 · caso 80 · lección 75 · memoria 60+importancia.
Umbral 0.80 (con este modelo, textos no relacionados rondan 0.83–0.90: el orden es lo que decide).

- `nora-memoria` (n8n, clave de servicio): `buscar` con `kommo_lead_id` → org y cliente del lead, busca en todo,
  devuelve el mismo formato de siempre (`resultados: [{ tipo, leccion }]`) y registra en `nora_fuentes_usadas`.
  Sin `kommo_lead_id` se comporta como antes (solo lecciones).
- `nora-conocimiento` (panel, sesión del usuario): `embeber`, `procesar_documento`, `probar`.

## Vectores nunca viejos

Trigger `nora_conocimiento_editado`: si cambia el texto, `embedding = null` (documentos: `procesamiento = pendiente`).
La búsqueda ignora lo que no tiene vector; se recalcula al guardar (panel) o antes de cada búsqueda de Nora.
`tiene_embedding` (columna generada) muestra el estado sin descargar el vector.

## Registro

- `nora_actividad`: trigger en las seis tablas; ignora cambios que solo tocan vectores o marcas de tiempo.
- `nora_fuentes_usadas`: qué conocimiento le llegó a Nora en cada respuesta ("Por qué Nora respondió esto").

Ambas: lectura para miembros de la organización; escritura solo desde la base / funciones del servidor.

## Privacidad

`src/features/nora/privacy.js` detecta y quita CPF, teléfonos, emails, números de documento, contraseñas e IDs
largos al importar, y avisa en los editores. Las memorias nunca pasan al conocimiento general.

# Auditoría de seguridad (Supabase `rumpfqevyspdmhaggxtq`) — 5 y 6 de octubre de 2026

Método: solo lectura salvo las dos correcciones indicadas. Fuentes: advisors de Supabase, `pg_policies`, definiciones de funciones, logs de la API (24 h) y pruebas con roles simulados (`set local role`) dentro de funciones temporales.

## Corregido y verificado

| Hallazgo | Corrección | Verificación |
|---|---|---|
| `meta_ads_insights`: política `panel_read` con `using (true)` anulaba `tenant_isolation` | Se eliminó (`20261005112238_rls_aislamiento_meta_y_campanas`) | Usuario de la organización ve las 76 filas; usuario ajeno ve 0 |
| `campaign_hypotheses/measurements/variants`: lectura abierta a cualquier autenticado | Solo experimentos de la propia organización (misma regla que `campaign_experiments`) | Org: 11/15/29 filas; ajeno: 0 |
| `comercial_audios_pitch`: lectura anónima (guiones y precios del pitch) | Se retiró `anon` (`20261006003605_cerrar_lectura_anonima_pitch`) | anon: *permission denied*; autenticado y service_role ven las 9 filas |

Evidencia para cerrar la lectura anónima (logs de API, 24 h, 42 lecturas): 22 de n8n con `service_role`, 14 de Edge Functions con clave de servicio y 6 del panel con usuario autenticado. Ninguna anónima.

## Revisado y aceptado (no se cambia)

- **`inscricoes_cpf_pendentes()` y `registrar_comprovante_cpf(...)`**: `SECURITY DEFINER` ejecutables por `authenticated`. Es intencionado: las usa la extensión de Chrome del tramitador CPF con la sesión del usuario (`extension-cpf/background.js`). Cada una obtiene la organización de quien llama (`private.get_user_org_id()`), falla si no hay organización, filtra por ella y `registrar_comprovante_cpf` exige que la ruta del archivo empiece por el id de la organización. Revocar el permiso rompería la extensión. Riesgo residual: cualquier miembro de la organización puede llamarlas (no hay control por rol).
- **5 tablas con RLS activo y sin políticas** (`clientes`, `comercial_imagenes_revisadas`, `comercial_leads_respaldo_20261003`, `comercial_tramite_plantilla`, `nora_casos_analizados`): denegación total para `anon` y `authenticated`; solo las lee `service_role`. Es el comportamiento seguro. `clientes` es el modelo antiguo y `comercial_leads_respaldo_20261003` es una copia de seguridad con datos personales: conviene decidir su retirada, no se ha tocado.
- **Catálogos con lectura abierta a autenticados** (`permissions`, `role_permissions`, `pipeline_stages`, `kommo_tramites`, `publicos_catalogo`, `meta_opciones_segmentacion`): datos de referencia sin información de clientes.

## Pendiente

1. **Protección contra contraseñas filtradas** desactivada: es un ajuste del panel de Supabase Auth (Authentication → Providers/Policies); no se puede cambiar desde SQL. Acción del propietario.
2. **`pg_trgm` en el esquema `public`** (advertencia menor): moverlo puede romper índices o funciones que dependen de él; no se ha tocado.
3. **`nora_estrategias_confianza` y `nora_experimentos_confianza`**: su política se llama `tenant_isolation` pero es `using (true)` y las tablas no tienen `organization_id`. Con una sola organización no hay fuga; hay que añadir la columna y la política antes de dar de alta otra organización.
4. **Pruebas de aislamiento con una segunda organización real**: las pruebas hechas simulan un usuario sin organización, no una segunda organización con datos.
5. **Flujo de punta a punta** (oportunidad → conversación → servicio → pago → Operacional → métricas): no se ha ejecutado, porque los disparadores de `comercial_leads` pueden enviar mensajes por `pg_net`; hace falta un entorno de pruebas.

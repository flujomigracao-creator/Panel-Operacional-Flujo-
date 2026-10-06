# Nora comercial — Fase 1: auditoría (6 oct 2026)

Solo lectura: no se cambió nada en producción en esta fase.

## Flujo real hoy
- n8n `qzvzfCHfIVmNPs9L` (v. publicada `b756e772`): Preparar Contexto (idioma fijo `es`) → IA → Parsear Respuesta IA (frenos: gestión y ciudad antes de pagar; pedido de humano → mensaje fijo + pausa + tarea) → `enviar-whatsapp-atendente` v54.
- Webhook `whatsapp-webhook` v36: botones `tramite:`, `motivo:`, `variante:`, `pagar:ya` (solo exige gestión/ciudad; ya no pausa).
- Precio: `services.default_price` → `comercial_audios_pitch.precio` → trigger `trg_comercial_leads_precio` (ciudad especial = 100).

## Verificado en la prueba del lead 2889479
| Caso | Resultado |
|---|---|
| Propuesta + botón "Quiero pagar ya" (texto) | OK, R$ 119 |
| "Quiero pagar" escrito → PIX + lista de datos | OK, una sola vez |
| "Ya pagué" sin comprobante | OK, pide comprobante |
| "Quiero una persona" | OK: mensaje, `atendente_pausado=true`, tarea `nora-supervisor-…` creada |

## Hallazgos (por prioridad)
1. **Bienvenida fija contradice la regla de identidad (8bb5f8fb).** El texto fijo dice "soy Nora del equipo de FLUJO Migração"; la regla exige "asistente virtual", mencionar la alta demanda y que puede pedir una persona.
2. **No existe detección de asesor humano que entra al chat.** Ninguna función de la base pausa a Nora cuando sale un mensaje humano (solo hay pausa por switch de Kommo, por pedido del cliente y por `comercial_pausar_supervisor`). La regla 02debefd (aviso final único) no tiene código que la dispare.
3. **Regla 5570eb82 (pago con tarjeta)** usa voseo y "consultás con tu supervisor"; choca con la regla de español neutro y con el mensaje nuevo de derivación ("un asesor…").
4. **Texto de la tarea de derivación** sigue diciendo "Nora le dijo que lo consultaba con el supervisor" (cosmético, en `comercial_pausar_supervisor`).
5. **Regla d57eb7eb (cambio de idioma)** está obsoleta: Nora responde siempre en español. `61e1e26f` ("idioma_cliente") es redundante con eso.
6. **Botón real "Quiero pagar ya"** sigue sin probarse (firma de Meta); doble toque / duplicados no verificados.
7. **Pendientes anteriores:** `comercial_mover_a_perdido` usa etapas muertas; guion de audio CPF dice 90; plantilla `motivo_no_contrato` sin aprobar.
8. **Datos de prueba** sin limpiar (leads simulados 5500…, incl. 2889479).

## Reglas activas (resumen)
Críticas: tarifario oficial, ciudad antes del precio, identidad, venta consultiva, solicitud de humano, cierre y pago, entrada de asesor. Importantes: flujo CPF (Nora hoy no ofrece CPF), multi-persona, respuesta directa, renovación sin aclarar, servicios disponibles. Normales: tono, pago nunca confirmado, históricas anonimizadas.

## Implementado el 6 oct 2026 (A–D) y verificado con el lead simulado 2889479
- A. Bienvenida (nodo Parsear Bienvenida): "asistente virtual", alta demanda, puede pedir una persona. Publicado.
- B. Trigger `trg_nora_pausar_por_asesor` + edge function `nora-asesor-aviso`: mensaje humano (`sender_type='agent'`) → pausa solo ese lead y aviso único. Probado: 1 pausa, 1 aviso, sin repetición.
- C. Reglas 5570eb82 (tarjeta → asesor), 61e1e26f (siempre español), d57eb7eb desactivada; mensajes de derivación y tarea dicen "asesor".
- D. Segundo toque de "Quiero pagar ya" ya no reenvía PIX/lista: responde que ya se enviaron y pide el comprobante. Probado.
- Sin probar: el botón real de WhatsApp (firma de Meta) y la bienvenida en audio nueva (hay que regenerar para un cliente nuevo).

## Propuesta original de siguientes pasos
- A. Alinear bienvenida fija con la regla de identidad (texto + guion de audio).
- B. Detectar asesor humano que escribe → pausar ese lead + un solo aviso final.
- C. Limpiar reglas 3 y 5, texto de la tarea y usar un solo texto de derivación.
- D. Anti-duplicados del botón de pago y prueba real con tu número.

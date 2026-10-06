# Experimentos V4 · Venezolanos (Residencia y Refúgio)

Estado: preparado el 2026-10-06. Falta generar los 4 creativos y proponer los experimentos desde el panel/Nora.

## Público

`VE_FRONTERA_POLOS_ADQ` (migración `20261008000001`). Brasil **solo** en: Roraima, Amazonas (frontera con Venezuela),
São Paulo, Paraná, Santa Catarina y Rio Grande do Sul (donde más venezolanos se han reubicado) · 21–65 · español ·
comportamiento «Vivieron en Venezuela». Un solo código vale para todas las variantes de un experimento, así que la
**única** variable que cambia es el ángulo del anuncio. Las regiones salen del catálogo `meta_opciones_segmentacion`
(clase `region`); si Meta no tiene una, el conjunto no se publica (no se sustituye).

## Mensaje de WhatsApp por anuncio

Cada creativo lleva `whatsapp_message`: el chat se abre con ese texto ya escrito (Click-to-WhatsApp, `page_welcome_message`
con `autofill_message`). Sin texto propio se usa el del servicio; nunca «quiero más información».

## Experimento VE-1 · Residencia

- Servicio: **Residência Permanente** · variable probada: **ángulo** · métrica: costo por cliente · público: `VE_FRONTERA_POLOS_ADQ`.
- Pregunta: ¿convierte mejor «hacer mi residencia» o «agendar para renovarla»?
- **Control**: ángulo «hacer residencia» → mensaje `Quiero hacer mi residencia`.
- **Variante A**: ángulo «agendamiento para renovar la residencia» → mensaje `Quiero comenzar mi agendamiento para renovar mi residencia`.

## Experimento VE-2 · Refúgio

- Servicio: **Refúgio** · variable probada: **ángulo** · métrica: costo por cliente · público: `VE_FRONTERA_POLOS_ADQ`.
- Pregunta: ¿convierte mejor «hacer el refugio» o «renovar el refugio»?
- **Control**: ángulo «hacer refugio» → mensaje `Quiero hacer mi refugio`.
- **Variante A**: ángulo «renovar refugio» → mensaje `Quiero renovar mi refugio`.

## Reglas

- Una sola variable por experimento (ángulo): misma imagen base, estilo, CTA y público; cambian titular, texto y mensaje.
- Los textos hablan del servicio, no del lector (Meta restringe afirmar nacionalidad o estatus migratorio).
- Todo se publica en PAUSED; el pago de la cuenta y el acceso a la página 1305008052698060 deben estar resueltos.
- Los dos experimentos corren por separado (no se mezclan servicios en uno).

## Cómo crearlos

1. Laboratorio de Creativos → crear 2 creativos por experimento (servicio, concepto y «Mensaje de WhatsApp» como arriba;
   puede activarse «Aparezco yo»). Aprobarlos.
2. Pedir a Nora: «Crea el experimento VE-1 con estos 2 creativos, variable ángulo, público VE_FRONTERA_POLOS_ADQ, R$20 al día»
   (y lo mismo para VE-2). Confirmar la propuesta; publicar desde el panel.

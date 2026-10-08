-- Semilla: 21 borradores de la semana del 8 al 14 de octubre de 2026 (3 por día: 7:30, 12:30 y 20:30, hora de Brasil).
-- Basados en las guías internas del equipo; las tasas no aparecen. Idempotente.
insert into public.publicaciones (organization_id, programada_at, franja, tipo, tema, texto, imagen_idea, fuente)
select v.* from (values
  ('00000000-0000-0000-0000-000000000001'::uuid, '2026-10-08 07:30:00-03'::timestamptz, 'manana', $p$Guía$p$, $p$CPF$p$, $p$📌 Lo que necesitas para pedir tu CPF en Brasil

1️⃣ Selfie sosteniendo el pasaporte junto al rostro
2️⃣ Foto legible del protocolo de refugio (si lo tienes)
3️⃣ Foto de la página principal del pasaporte, con tus datos
4️⃣ Nombre completo de tu madre
5️⃣ Si es para un menor: acta de nacimiento legible

Las fotos deben verse claras. Si salen borrosas, hay que repetirlas.

¿Dudas con tu trámite? Escríbenos por WhatsApp 👉 https://wa.me/5548984553306?text=Hola%2C%20vi%20su%20publicaci%C3%B3n%20sobre%20el%20CPF$p$, $p$Tarjeta con la lista de 5 elementos y un icono por cada uno$p$, $p$Guía interna de Flujo de Migração (datos para solicitar el CPF)$p$),
  ('00000000-0000-0000-0000-000000000001'::uuid, '2026-10-08 12:30:00-03'::timestamptz, 'tarde', $p$Pregunta$p$, $p$CPF$p$, $p$¿Ya tienes tu CPF?

✅ Sí, ya lo tengo
⏳ Lo estoy tramitando
❌ Todavía no

Responde en comentarios. Si te falta algún documento, te decimos cuál.$p$, $p$Fondo liso con la pregunta grande y tres respuestas$p$, $p$Sin fuente: interacción$p$),
  ('00000000-0000-0000-0000-000000000001'::uuid, '2026-10-08 20:30:00-03'::timestamptz, 'noche', $p$Guía$p$, $p$CPF$p$, $p$📸 El error más común al pedir el CPF: la selfie.

Sostén el pasaporte junto a tu rostro, con buena luz, y que se lean los datos. Sin gorra ni filtros.

Guarda esta publicación para cuando la necesites.

¿Dudas con tu trámite? Escríbenos por WhatsApp 👉 https://wa.me/5548984553306?text=Hola%2C%20vi%20su%20publicaci%C3%B3n%20sobre%20el%20CPF$p$, $p$Foto de selfie con pasaporte como ejemplo de encuadre (con permiso o ilustración)$p$, $p$Guía interna de Flujo de Migração$p$),
  ('00000000-0000-0000-0000-000000000001'::uuid, '2026-10-09 07:30:00-03'::timestamptz, 'manana', $p$Guía$p$, $p$Agendamiento del RNM$p$, $p$🗓️ Datos para agendar tu RNM en la Policía Federal

1. Correo electrónico
2. Teléfono
3. CPF
4. Foto del protocolo de refugio (si tienes)
5. Foto del RNM o protocolo de RNM (si tienes)
6. Foto del pasaporte
7. Estado civil
8. Dirección actual completa (calle, número, barrio, ciudad, estado y CEP)
9. Lugar de entrada a Brasil
10. Fecha de entrada a Brasil
11. Ocupación actual

Tenerlo todo junto acelera el proceso.

¿Dudas con tu trámite? Escríbenos por WhatsApp 👉 https://wa.me/5548984553306?text=Hola%2C%20vi%20su%20publicaci%C3%B3n%20sobre%20el%20agendamiento%20del%20RNM$p$, $p$Lista numerada del 1 al 11 en dos columnas$p$, $p$Guía interna de Flujo de Migração (datos para agendamiento de RNM)$p$),
  ('00000000-0000-0000-0000-000000000001'::uuid, '2026-10-09 12:30:00-03'::timestamptz, 'tarde', $p$Dato$p$, $p$Agendamiento del RNM$p$, $p$¿Para qué sirve el agendamiento del RNM?

✔️ Solicitar la 1ª vía
✔️ Pedir la 2ª vía
✔️ Corregir datos

En los tres casos se empieza con la cita en la Policía Federal.$p$, $p$Tres iconos: primera vía, segunda vía, corregir datos$p$, $p$Guía interna de Flujo de Migração$p$),
  ('00000000-0000-0000-0000-000000000001'::uuid, '2026-10-09 20:30:00-03'::timestamptz, 'noche', $p$Reel (30 s)$p$, $p$Agendamiento del RNM$p$, $p$Guion del Reel (30 segundos):

[0-3 s] «Antes de pedir tu cita en la Policía Federal, ten esto listo.»
[3-12 s] Pasaporte, CPF y foto del protocolo o RNM, claras y legibles.
[12-22 s] Tu dirección completa con CEP y la fecha y lugar de entrada a Brasil.
[22-30 s] «Escríbenos y te decimos qué te falta.»

Texto de la publicación:
¿Tienes todo listo para tu cita? Mira el vídeo y guárdalo.

¿Dudas con tu trámite? Escríbenos por WhatsApp 👉 https://wa.me/5548984553306?text=Hola%2C%20vi%20su%20publicaci%C3%B3n%20sobre%20el%20agendamiento$p$, $p$Vídeo vertical: «3 cosas antes de pedir tu cita»$p$, $p$Guía interna de Flujo de Migração$p$),
  ('00000000-0000-0000-0000-000000000001'::uuid, '2026-10-10 07:30:00-03'::timestamptz, 'manana', $p$Guía$p$, $p$Refugio y renovación$p$, $p$📄 Cita en la Policía Federal para refugio (primera vez o renovación)

→ Nombre completo
→ CPF
→ Correo y teléfono
→ Fecha de nacimiento
→ Nombres completos de tus padres
→ Dirección actual con CEP
→ Foto del protocolo de refugio (si es renovación)
→ Foto del RNM plástico o protocolo de RNM (si tienes)

En cuanto tengamos estos datos, solicitamos tu cita.

¿Dudas con tu trámite? Escríbenos por WhatsApp 👉 https://wa.me/5548984553306?text=Hola%2C%20vi%20su%20publicaci%C3%B3n%20sobre%20refugio$p$, $p$Tarjeta «Refugio: lista de datos» con casillas$p$, $p$Guía interna de Flujo de Migração (agendamiento de refugio y renovación)$p$),
  ('00000000-0000-0000-0000-000000000001'::uuid, '2026-10-10 12:30:00-03'::timestamptz, 'tarde', $p$Recordatorio$p$, $p$Refugio y renovación$p$, $p$⏰ ¿Tu protocolo de refugio está por vencer?

No esperes al último día. La renovación empieza con la cita en la Policía Federal, y conseguir fecha puede tardar.

Revisa hoy la fecha de tu protocolo.

¿Dudas con tu trámite? Escríbenos por WhatsApp 👉 https://wa.me/5548984553306?text=Hola%2C%20vi%20su%20publicaci%C3%B3n%20sobre%20la%20renovaci%C3%B3n%20de%20refugio$p$, $p$Calendario con un círculo en rojo$p$, $p$Guía interna de Flujo de Migração$p$),
  ('00000000-0000-0000-0000-000000000001'::uuid, '2026-10-10 20:30:00-03'::timestamptz, 'noche', $p$Caso real$p$, $p$Refugio y renovación$p$, $p$[RELLENAR con un caso real y autorizado. No inventar.]

«[Nombre o iniciales] nos escribió el [fecha] con [situación]. Hoy [resultado].»

Si tú también estás así, escríbenos.$p$, $p$Foto o captura con permiso del cliente (sin datos personales)$p$, $p$Pendiente: necesita un caso real autorizado$p$),
  ('00000000-0000-0000-0000-000000000001'::uuid, '2026-10-11 07:30:00-03'::timestamptz, 'manana', $p$Guía$p$, $p$Cambio de dirección$p$, $p$🏠 ¿Te mudaste? Actualiza tu dirección en la Policía Federal

Necesitas:
1️⃣ Correo electrónico
2️⃣ CPF
3️⃣ Foto legible del protocolo de RNM
4️⃣ Estado civil
5️⃣ Provincia de nacimiento
6️⃣ Dirección nueva completa con CEP
7️⃣ Foto de una factura de agua, luz o internet

En cuanto lo envíes, iniciamos el proceso.

¿Dudas con tu trámite? Escríbenos por WhatsApp 👉 https://wa.me/5548984553306?text=Hola%2C%20vi%20su%20publicaci%C3%B3n%20sobre%20el%20cambio%20de%20direcci%C3%B3n$p$, $p$Casa con flecha y lista de 7 datos$p$, $p$Guía interna de Flujo de Migração (cambio de dirección en la PF)$p$),
  ('00000000-0000-0000-0000-000000000001'::uuid, '2026-10-11 12:30:00-03'::timestamptz, 'tarde', $p$Dato$p$, $p$Cambio de dirección$p$, $p$💡 Dato que mucha gente no sabe

La factura de agua, luz o internet para el cambio de dirección NO tiene que estar a tu nombre.

¿Te lo habían dicho distinto? Cuéntanos.$p$, $p$Factura con el nombre tachado y un visto$p$, $p$Guía interna de Flujo de Migração$p$),
  ('00000000-0000-0000-0000-000000000001'::uuid, '2026-10-11 20:30:00-03'::timestamptz, 'noche', $p$Encuesta$p$, $p$Cambio de dirección$p$, $p$Pregunta del día 🗳️

¿Qué trámite te cuesta más entender?

1️⃣ CPF
2️⃣ Agendar cita en la Policía Federal
3️⃣ Refugio y renovación
4️⃣ Cambio de dirección

Responde con el número. Hacemos una guía del más votado.$p$, $p$Fondo liso con cuatro opciones$p$, $p$Sin fuente: interacción$p$),
  ('00000000-0000-0000-0000-000000000001'::uuid, '2026-10-12 07:30:00-03'::timestamptz, 'manana', $p$Guía$p$, $p$Verificar tu RNM por QR$p$, $p$📱 Cómo ver tu situación migratoria con el QR de tu RNE/CRNM

1️⃣ Dale la vuelta al documento y busca el código QR
2️⃣ Abre la cámara del celular y apunta al QR
3️⃣ Toca el enlace que aparece
4️⃣ Espera a que cargue la información
5️⃣ Haz una captura de pantalla

Si quieres que revisemos tu situación, envíanos esa captura.

¿Dudas con tu trámite? Escríbenos por WhatsApp 👉 https://wa.me/5548984553306?text=Hola%2C%20vi%20su%20publicaci%C3%B3n%20sobre%20verificar%20mi%20RNM$p$, $p$Reverso de un RNM con el QR marcado (sin datos personales)$p$, $p$Guía interna de Flujo de Migração (verificar la validez del RNM)$p$),
  ('00000000-0000-0000-0000-000000000001'::uuid, '2026-10-12 12:30:00-03'::timestamptz, 'tarde', $p$Aviso$p$, $p$Verificar tu RNM por QR$p$, $p$🔒 Importante

Para revisar tu situación migratoria solo hace falta la captura de la consulta del QR.

Nunca compartas contraseñas ni códigos de acceso con nadie, tampoco con nosotros.$p$, $p$Candado y la frase «Nunca contraseñas»$p$, $p$Guía interna de Flujo de Migração$p$),
  ('00000000-0000-0000-0000-000000000001'::uuid, '2026-10-12 20:30:00-03'::timestamptz, 'noche', $p$Reel (20 s)$p$, $p$Verificar tu RNM por QR$p$, $p$Guion del Reel (20 segundos):

[0-4 s] «¿Sabes si tu RNM sigue vigente? Se ve en 10 segundos.»
[4-14 s] Mostrar el reverso, apuntar la cámara al QR y abrir el enlace.
[14-20 s] «Haz captura y mándanosla si tienes dudas.»

Texto de la publicación:
Mira cómo verificar tu RNM con el celular.

¿Dudas con tu trámite? Escríbenos por WhatsApp 👉 https://wa.me/5548984553306?text=Hola%2C%20vi%20su%20publicaci%C3%B3n%20sobre%20verificar%20mi%20RNM$p$, $p$Vídeo vertical grabando el QR con el celular$p$, $p$Guía interna de Flujo de Migração$p$),
  ('00000000-0000-0000-0000-000000000001'::uuid, '2026-10-13 07:30:00-03'::timestamptz, 'manana', $p$Guía$p$, $p$Residencia permanente (Mercosur)$p$, $p$📋 Residencia permanente por el Acuerdo Mercosur: documentos para la cita

• RNM/CRNM actual (el de la residencia temporal)
• Pasaporte
• Acta de nacimiento o matrimonio con Apostilla de La Haya
• Certificado de antecedentes penales de tu país con Apostilla de La Haya, emitido hace menos de 90 días
• Comprobante de medios de subsistencia: recibo de sueldo, CTPS digital o extractos bancarios de los últimos 3 meses
• CPF, correo, teléfono, estado civil, dirección y ocupación

Las tasas se pagan antes de la cita.

¿Dudas con tu trámite? Escríbenos por WhatsApp 👉 https://wa.me/5548984553306?text=Hola%2C%20vi%20su%20publicaci%C3%B3n%20sobre%20la%20residencia%20permanente$p$, $p$Lista con sellos de «Apostilla» y «menos de 90 días»$p$, $p$Guía interna de Flujo de Migração (agendamiento de residencia permanente, Acuerdo Mercosur)$p$),
  ('00000000-0000-0000-0000-000000000001'::uuid, '2026-10-13 12:30:00-03'::timestamptz, 'tarde', $p$Pregunta$p$, $p$Residencia permanente (Mercosur)$p$, $p$Pregunta rápida 🧠

¿Cuántos días puede tener como máximo tu certificado de antecedentes penales el día de la cita?

A) 30 días
B) 90 días
C) 1 año

Respuesta mañana en los comentarios.$p$, $p$Pregunta grande con tres opciones$p$, $p$Guía interna de Flujo de Migração$p$),
  ('00000000-0000-0000-0000-000000000001'::uuid, '2026-10-13 20:30:00-03'::timestamptz, 'noche', $p$Guía$p$, $p$Residencia permanente (Mercosur)$p$, $p$✈️ ¿Viviste fuera de Brasil en los últimos 2 años?

Si la respuesta es sí, además de los antecedentes de tu país necesitamos los antecedentes penales del país donde viviste, también con Apostilla.

Avísanos desde el principio para no perder tiempo.

¿Dudas con tu trámite? Escríbenos por WhatsApp 👉 https://wa.me/5548984553306?text=Hola%2C%20vi%20su%20publicaci%C3%B3n%20sobre%20la%20residencia%20permanente$p$, $p$Mapa simple con dos países y una flecha$p$, $p$Guía interna de Flujo de Migração$p$),
  ('00000000-0000-0000-0000-000000000001'::uuid, '2026-10-14 07:30:00-03'::timestamptz, 'manana', $p$Presentación$p$, $p$Cómo trabajamos y resumen$p$, $p$¿Cómo trabajamos en Flujo de Migração?

1️⃣ Nos escribes por WhatsApp y te decimos qué trámite necesitas
2️⃣ Te enviamos la lista exacta de datos y documentos
3️⃣ Cuando los recibimos, iniciamos tu solicitud

Sin vueltas. Y te contamos cada avance.

¿Dudas con tu trámite? Escríbenos por WhatsApp 👉 https://wa.me/5548984553306?text=Hola%2C%20vi%20su%20publicaci%C3%B3n%20sobre%20c%C3%B3mo%20trabajan$p$, $p$Tres pasos en horizontal$p$, $p$Proceso del equipo$p$),
  ('00000000-0000-0000-0000-000000000001'::uuid, '2026-10-14 12:30:00-03'::timestamptz, 'tarde', $p$Encuesta$p$, $p$Cómo trabajamos y resumen$p$, $p$Ayúdanos a elegir las guías de la próxima semana 🙌

¿Qué quieres que expliquemos?

1️⃣ Naturalización
2️⃣ Reunión familiar
3️⃣ Autorización de viaje para menores
4️⃣ Cómo verificar documentos
5️⃣ Otro (cuéntanos en comentarios)$p$, $p$Fondo liso con cinco opciones$p$, $p$Sin fuente: interacción$p$),
  ('00000000-0000-0000-0000-000000000001'::uuid, '2026-10-14 20:30:00-03'::timestamptz, 'noche', $p$Resumen$p$, $p$Cómo trabajamos y resumen$p$, $p$📚 Resumen de la semana

• CPF: qué documentos pedir
• Agendar el RNM: los 11 datos
• Refugio y renovación
• Cambio de dirección
• Verificar tu RNM con el QR
• Residencia permanente (Mercosur)

Guarda y comparte con alguien que lo necesite.

¿Dudas con tu trámite? Escríbenos por WhatsApp 👉 https://wa.me/5548984553306?text=Hola%2C%20vi%20su%20publicaci%C3%B3n%20sobre%20las%20gu%C3%ADas%20de%20la%20semana$p$, $p$Carrusel de 6 tarjetas, una por trámite de la semana$p$, $p$Guía interna de Flujo de Migração$p$)
) as v(organization_id, programada_at, franja, tipo, tema, texto, imagen_idea, fuente)
where not exists (select 1 from public.publicaciones p where p.organization_id = v.organization_id and p.texto = v.texto);

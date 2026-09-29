# Campañas de prueba — octubre 2026

Estado: **especificación lista, sin crear en Meta.** Diseñadas según `REGLAS.md`: una campaña por servicio, un
solo conjunto, anuncios que prueban hipótesis distintas, y todo con nombres que Claude puede leer para cruzar
Meta → Kommo → Nora → pago. No se incluyen los anuncios que ya existen.

Cuenta: `act_1266868385524004` · Página: `1305008052698060` · Instagram: `17841430321105923` ·
Destino: **WhatsApp** (el mismo número que recibe el webhook de Supabase, para que quede el anuncio de origen).

## Convención de nombres

| Nivel | Formato | Ejemplo |
|---|---|---|
| Campaña | `SERVICIO \| PÚBLICO \| DESTINO \| AAAA-MM \| tipo` | `CPF \| Expats CU-VE-CO \| WhatsApp \| 2026-10 \| Prueba de conceptos` |
| Conjunto | `SERVICIO \| PÚBLICO EDAD \| GEO \| UBICACIONES` | `CPF \| Expats 21-50 \| Ciudades + estados \| Ubicaciones automáticas` |
| Anuncio | `SERVICIO \| LETRA-HIPÓTESIS \| formato` | `CPF \| A-Problema \| imagen` |

La letra + hipótesis en el nombre del anuncio permite agrupar resultados por hipótesis (todas las "Problema",
todas las "Confianza") en el análisis.

## Ajustes de las dos campañas (iguales salvo servicio)

| Campo | Valor | Motivo |
|---|---|---|
| Objetivo | Interacción (`OUTCOME_ENGAGEMENT`), conversaciones en WhatsApp | El mismo de las campañas actuales |
| Presupuesto | **R$ 23/día por campaña** (total R$ 46, igual al gasto actual). Ajustable | El presupuesto real lo decide el dueño |
| Estrategia de puja | Menor costo, sin tope | Como las actuales |
| Optimización | Conversaciones · facturación por impresiones | |
| Edad | 21–50 | Como la campaña original de Agendamiento |
| Comportamientos | Vivió en Cuba, Colombia o Venezuela (expats). **Sin** segunda condición obligatoria | La campaña original (solo expats) costó R$ 1,59/conversación; la copia con condición extra R$ 6,51 |
| Ubicación | Ciudades +40 km: Balneário Camboriú, Campinas, Florianópolis, Itajaí, Manaus, Porto Alegre, Camboriú, São Paulo · Estados: Mato Grosso, Rio de Janeiro | Igual que la original |
| Idiomas | 7 y 23 (los de las campañas actuales) | |
| Estado al crear | Campaña **pausada**; conjunto y anuncios activos | Se activa con un solo interruptor, después de revisar |

## Mensaje precargado (una línea por servicio)

En cada anuncio, en la configuración de WhatsApp → mensaje de bienvenida → **mensaje autocompletado**:

| Servicio | Mensaje autocompletado |
|---|---|
| CPF | `Hola, quiero hacer mi CPF` |
| Agendamiento PF | `Hola, necesito agendar mi cita en la Polícia Federal` |

Así el detector de Nora identifica el trámite en el primer mensaje, sin mostrar la lista de botones, y el lead
llega con `servicio` ya cargado (hoy solo el 18 % lo tiene).

## Anuncios — CPF (campaña 1)

Texto en español neutro (tú), sin precios (Nora los da; ver "Riesgos"). Un anuncio = una hipótesis.

| Anuncio | Hipótesis | Texto principal | Título | Imagen sugerida |
|---|---|---|---|---|
| `CPF \| A-Problema \| imagen` | Nombrar el problema atrae a quien de verdad lo tiene | ¿Todavía no tienes tu CPF? Sin él, muchos trámites en Brasil se te complican. Te ayudamos a solicitarlo por WhatsApp, en español. | ¿Aún sin CPF en Brasil? | Persona frente a un trámite trabado / documento con un signo de pregunta |
| `CPF \| B-Beneficio \| imagen` | Explicar para qué sirve genera más interés | Tu CPF es uno de los primeros documentos que necesitas en Brasil. Escríbenos y te explicamos qué necesitas para solicitarlo. | Tu primer documento en Brasil | Tarjeta/documento CPF con íconos de lo que habilita |
| `CPF \| C-Facilidad \| imagen` | Prometer menos burocracia mejora la tasa de conversación | Solicita tu CPF sin perder horas con la burocracia. Nosotros te orientamos y gestionamos el trámite; tú lo haces desde WhatsApp. | CPF sin complicaciones | Celular con chat de WhatsApp + reloj |
| `CPF \| D-Recién llegado \| imagen` | Hablarle al que acaba de llegar segmenta mejor | ¿Llegaste hace poco a Brasil y necesitas tu CPF? Escríbenos por WhatsApp y te explicamos cómo es el proceso paso a paso. | Recién llegado a Brasil | Maleta/bandera de Brasil + documento |
| `CPF \| E-Confianza \| imagen` | Un cliente desconfiado responde a garantías (varios leads preguntaron "¿es estafa?") | En Flujo de Migração cada trámite lo lleva un equipo con supervisor. Empresa registrada, pago seguro por PIX y garantía de devolución si no podemos completarlo. | Empresa registrada · Pago por PIX | Sello/escudo de confianza + logo |

## Anuncios — Agendamiento PF (campaña 2)

| Anuncio | Hipótesis | Texto principal | Título | Imagen sugerida |
|---|---|---|---|---|
| `AGEND-PF \| A-Problema \| imagen` | Nombrar el problema | ¿Necesitas ir a la Polícia Federal y no sabes cómo conseguir tu cita? Conseguir el agendamiento puede ser complicado. | ¿Sin cita en la Polícia Federal? | Calendario vacío + edificio de la PF |
| `AGEND-PF \| B-Solución \| imagen` | Presentar la solución directa | Nosotros gestionamos tu agendamiento en la Polícia Federal y te orientamos durante todo el proceso, en español. | Agendamos tu cita en la PF | Calendario con check |
| `AGEND-PF \| C-Trámite \| imagen` | Nombrar el trámite atrae al que ya sabe qué necesita (RNM, refugio) | ¿Necesitas una cita en la PF para tu RNM o tu refugio? Nos encargamos del agendamiento. Escríbenos y dinos qué trámite necesitas. | Cita en la PF para RNM y refugio | Documento RNM + calendario |
| `AGEND-PF \| D-Facilidad \| imagen` | Evitar el esfuerzo repetido | Olvídate de intentar sacar tu cita una y otra vez. Escríbenos por WhatsApp y nos ocupamos del agendamiento. | Nos ocupamos de tu cita | Persona relajada con el celular |
| `AGEND-PF \| E-Confianza \| imagen` | Garantías | Flujo de Migração es una empresa registrada: equipo con supervisor, pago seguro por PIX y garantía de devolución si no podemos completar el trámite. | Empresa registrada · Pago por PIX | Sello de confianza |

Cada anuncio: botón **Enviar mensaje por WhatsApp**, formato feed (1:1 o 4:5) + versión vertical 9:16 para
historias.

## Cómo se evalúa cada prueba (regla 17)

| Elemento | Definición |
|---|---|
| Variable que cambia | El ángulo del mensaje (A–E) |
| Variable controlada | Público, ubicación, presupuesto, servicio, mensaje precargado y destino |
| Métrica principal | Conversaciones que llegan a **servicio identificado** y a **propuesta**, por anuncio (`meta_ads_resultados` + `comercial_leads.meta_ad_id`); el pago confirma cuando haya volumen |
| Período | 5 días mínimo, o 20 conversaciones por anuncio; antes no se declara ganador (regla 18) |
| Nunca | Pausar un anuncio por CTR o CPL solos |

Con R$ 23/día por campaña y 5 anuncios, cada anuncio recibe pocas conversaciones al día: si al 5.º día ninguno
tiene 20, **se prolonga la prueba o se reduce a 3 anuncios**, no se concluye antes.

## Riesgos y cosas a verificar antes de activar

- **Precio en el anuncio vs. precio de Nora.** Los anuncios actuales dicen "por R$ 50" (Agendamiento) y "R$ 100"
  (CPF), y Nora cotiza R$ 79–90. Si el cliente ve un precio distinto en el chat, es una causa posible de
  abandono. Estos anuncios nuevos no llevan precio; conviene alinear el precio de los actuales antes de
  compararlos con los nuevos.
- **Políticas de Meta.** No afirmar ni insinuar atributos personales ("¿Eres extranjero?", "¿Eres cubano?"):
  los textos de arriba lo evitan.
- **Imágenes.** Este repositorio no tiene creativos: las imágenes sugeridas son una guía. Solo un anuncio por
  hipótesis, con la misma calidad visual entre ellos, para que la diferencia sea el mensaje.
- **Saldo de la cuenta.** Con el pago pendiente (R$ 73,64) ningún anuncio se muestra.
- **Anuncios actuales.** Esta especificación no toca las campañas activas; decidir por separado cuándo pausar
  "Agendamiento PF – Copia" para no duplicar gasto.

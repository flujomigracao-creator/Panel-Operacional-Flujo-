# Agente de CPF (Tramitador CPF) — cómo funciona todo

El trámite **CPF para Estrangeiros** corre casi solo. El operador hace tres cosas:
pedir los documentos al cliente, marcar el captcha de la Receita y enviar el correo
que queda en Gmail. Todo lo demás lo hacen los agentes.

> Los agentes operativos **no hablan con los clientes**. Quien habla con el cliente es el
> operador, por Kommo.

---

## El recorrido de un caso

```
Kommo (lead en Operacional)
   │  1. Receptor de Kommo registra el trámite y guarda cada mensaje/foto
   ▼
Agente de recepción (n8n, cada minuto)
   │  2. Reconoce cada foto, valida que se lea y extrae los datos
   ▼
Caso completo (documentos + datos de cada persona)
   │  3. Tramitador te avisa: tarea "Inscribir CPF en la Receita" + campana del panel
   ▼
Extensión de Chrome (en tu navegador)
   │  4. Abre la página de la Receita y la LLENA sola
   │  5. TÚ marcas el captcha y presionas "Enviar"
   │  6. "Guardar comprovante en el caso" (PDF + nº de protocolo)
   ▼
Tramitador CPF (n8n, cada 5 minutos)
   │  7. Llena la Declaração de Condição Fiscal con la firma del cliente
   │  8. Arma el correo a la Receita con los adjuntos y lo deja en Gmail → Borradores
   ▼
Operador
      9. Revisa el borrador, adjunta el comprobante de dirección si falta, y envía
```

### Documentos que lleva el correo a la Receita

| # | Documento | De dónde sale |
|---|-----------|---------------|
| 1 | Foto de la **frente** del documento con foto (pasaporte) | El cliente, por Kommo |
| 2 | **Protocolo de refugio** | El cliente, por Kommo |
| 3 | **Selfie** con el pasaporte al lado del rostro | El cliente, por Kommo |
| 4 | **Declaração de Condição Fiscal** llenada y firmada | La genera el Tramitador |
| 5 | **Comprovante de inscripción** en el sitio de la Receita | La extensión, después del captcha |
| 6 | **Comprobante de dirección** | Si el cliente lo mandó va solo; si no, lo adjunta el operador en el borrador |

El verso del documento **no** se envía. La firma para la declaración es la foto de la firma
del cliente en papel blanco.

---

## Varias personas en un mismo trámite

Un lead de Kommo = un trámite, pero puede incluir a varias personas (una familia).

- **Personas que hacen el trámite:** el titular + los participantes con rol
  *dependiente*, *cónyuge* o *hijo*. Los roles *representante*, *chamante* y *otro*
  solo acompañan (ej. quien pagó).
- Cada persona tiene **sus propios documentos** y **sus propios datos** (nombre, fecha
  de nacimiento, padres, pasaporte, sexo, protocolo de la Receita). La dirección, la
  ciudad y el email son del trámite y se comparten.
- Cada persona recibe **su propia inscripción, su declaración y su correo**.
- **Menores de edad:** si el menor no tiene firma propia, la declaración se firma con la
  firma del padre o la madre que está en el mismo trámite (se reconoce por el nombre de
  la madre/padre en los datos del menor).
- El trámite pasa a "Pronto para envio" cuando **todas** sus personas tienen su correo.

---

## Qué hace cada pieza

### n8n

| Flujo | ID | Qué hace |
|-------|----|----------|
| Kommo - Receptor de Eventos | `gkd4u9ThCbhfT665` | Recibe los webhooks de Kommo: guarda mensajes y adjuntos, registra el trámite al entrar a Operacional. |
| Kommo - Agente de Recepción de Documentos | `ygwNnG8CflyuYv3C` | Cada minuto: clasifica cada foto con IA (visión), valida legibilidad, la sube a Drive y extrae datos. |
| **Tramitador CPF** | `s25whQgYvrURalkZ` | Cada 5 minutos: toma **una persona** lista, llena la declaración, arma el correo y cierra el caso. |

Pasos internos del Tramitador (nodos):
1. **Tomar caso** → `tramitador_cpf_proximo()` (reserva una persona para que nunca se procese dos veces).
2. **Descargar plantilla** → la Declaração oficial desde Drive (`1KDBUDOU6YsChGV9TrMh0kvtuoNrmVGMH`).
3. **Descargar firma** → la foto de la firma de la persona (o del responsable si es menor).
4. **Llenar declaración** → función `llenar-declaracion-cpf` (ver abajo).
5. **Lista de documentos / Descargar** → adjuntos desde Drive y el comprovante desde Storage o Drive.
6. **Armar correo** → texto en portugués (modelo del correo de FLUJO), asunto bilingüe.
7. **Crear correo en Gmail** → borrador (o envío directo si se activa el modo automático).
8. **Guardar PDF en Drive** → copia de la declaración en la carpeta del cliente.
9. **Cerrar caso** → `tramitador_cpf_concluir()`; si algo falla, **Registrar error**.

### Supabase

| Pieza | Para qué sirve |
|-------|----------------|
| `llenar-declaracion-cpf` (Edge Function) | Llena los campos del PDF oficial, marca residente / no residente y estampa la firma con **fondo transparente** dentro de la celda "Assinatura". Si el procesado con transparencia falla por cualquier motivo (foto atípica), cae automáticamente a incrustar la firma tal cual, sin transparencia — nunca se pierde una firma real por esto. Solo la puede llamar n8n (service role). |
| `tramitador_execucoes` | Una fila por persona tramitada: `processando`, `borrador`, `enviado`, `erro`, `bloqueado`. Garantiza que nadie se tramite dos veces. |
| `tramitador_cpf_proximo()` | Busca la próxima persona lista. Si le falta el comprovante, crea la tarea de inscripción y la notificación (una sola vez). |
| `tramitador_cpf_concluir()` | Marca el resultado, guarda los campos, mueve la etapa cuando todas las personas terminaron, crea la tarea "Enviar solicitud…" o la de error. |
| `private.caso_cpf_resumo(trámite, persona)` | Junta datos + documentos + firma + comprovante de una persona y dice qué falta. |
| `private.pessoas_do_caso(trámite)` | Lista las personas que hacen el trámite. |
| `private.salvar_campo_pessoa(...)` | Guarda un dato en el trámite (titular) o en la ficha de la persona. |
| `client_service_person_fields` | Datos personales de las personas que no son el titular. |
| `inscricoes_cpf_pendentes()` | Lo que ve la extensión: personas listas para inscribir en la Receita. |
| `registrar_comprovante_cpf(...)` | Lo que llama la extensión al guardar el comprovante. |
| `organization_settings` → `tramitador_cpf` | Configuración: `modo_envio` (`borrador` / `automatico`), `destinatario`, `activo`, `plantilla_drive_id`. |

### Panel

- **Hoy**: tareas "Inscribir CPF en la Receita" (botón **Abrir en la Receita**, ya llenada para esa persona) y "Enviar solicitud de CPF" (botón **Gmail**).
- **Laboratorio**: motor "Tramitador CPF" con su estado.
- `/extension-flujo-cpf.zip`: descarga de la extensión.

### Extensión de Chrome (`extension-cpf/`)

- Revisa cada 2 minutos si hay una persona lista para inscribir y **abre la Receita llenada**.
- Llena: nombre, nacimiento, tipo y número de documento, nacionalidad, sexo, madre,
  país de residencia, CEP, municipio, UF, calle (con ViaCEP), número, complemento,
  barrio, email y celular.
- En el comprovante: botón **Guardar comprovante en el caso** (lo imprime como PDF, lee
  el código de atendimento y lo guarda en Supabase).
- Instalación: ver `extension-cpf/LEEME.md`.

---

## Qué hacer si…

| Situación | Qué pasa | Qué hacer |
|-----------|----------|-----------|
| Falta un documento o dato | El caso espera en silencio (el agente de recepción los va pidiendo en la nota de Kommo). | Pedirlo al cliente por Kommo. |
| Documentos completos | Tarea "Inscribir CPF en la Receita" + campana. | Abrir en la Receita, captcha, Enviar, Guardar comprovante. |
| Correo listo | Tarea "Enviar solicitud de CPF a la Receita". | Revisar en Gmail → Borradores, adjuntar comprobante de dirección si falta, enviar. |
| Algo falló (firma ilegible, Drive, Gmail) | Tarea "Tramitador CPF no pudo completar" con el motivo. | Corregir el dato/documento; el Tramitador reintenta solo (máx. 3 veces). |
| Menor sin padre/madre en el trámite | Espera: falta la firma. | Agregar al responsable como participante o pedir su firma. |

## Pruebas

Los casos cuyo titular tiene `lead_source = 'prueba_tramitador'` son de prueba: su correo
va siempre a `flujomigracao@gmail.com`, nunca a la Receita.

Casos probados de punta a punta (2026-09-25): adulto solo; familia de 3 con un menor (su
declaración la firma la madre, detectado solo); no residente (radio correcto); sin protocolo
de refugio (espera en silencio, sin tarea falsa); sin comprovante (crea la tarea de inscripción,
y al llamar `registrar_comprovante_cpf` —la misma función que usa la extensión— se cierra sola
y el Tramitador continúa); firma en un archivo que no es imagen (falla con un mensaje claro y
tarea de aviso, no se cuelga). También se reprocesó un caso real (dos personas, una menor) con
la firma corregida.

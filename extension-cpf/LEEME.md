# Extensión FLUJO – Inscripción CPF Receita

La página de la Receita tiene captcha y el panel (otro sitio) no puede escribir en ella: esta
extensión es la que la abre y la llena dentro de tu Chrome. Todo se controla desde el panel.

## Instalar (una vez)
1. En el panel, en **Hoy**, toca **Extensión** en una tarea "Inscribir CPF" (o baja `/extension-flujo-cpf.zip`) y descomprime el archivo en una carpeta fija.
2. En Chrome abre `chrome://extensions` y activa **Modo de desarrollador**.
3. **Cargar descomprimida** → elige esa carpeta.
4. Haz clic en el ícono de la extensión y entra con tu email y contraseña del panel.

## Cómo trabaja
- En cuanto un cliente de CPF completa sus documentos, el caso queda listo para inscribir.
- Cada 2 minutos la extensión revisa: si hay un CPF listo, **abre la Receita y la llena sola**. Con varios clientes, los atiende uno tras otro (se puede apagar en el menú de la extensión).
- Desde el panel, **Abrir en la Receita** abre la misma página ya llenada con ese cliente.
- Tú: revisas, marcas **Sou humano** y presionas **Enviar**. En el comprovante, **Guardar comprovante en el caso**.
- En pocos minutos el Tramitador deja el correo a la Receita en Gmail (Borradores) con todos los adjuntos.

Al guardar el comprovante, Chrome muestra un aviso breve de "depuración": es la extensión imprimiendo la página como PDF.

El código fuente vive en `extension-cpf/` del repositorio del panel. Después de cambiarlo, regenera
`public/extension-flujo-cpf.zip` para que el panel ofrezca la versión nueva.

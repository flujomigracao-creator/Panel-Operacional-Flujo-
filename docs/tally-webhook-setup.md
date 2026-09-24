# Configuración del Webhook de Tally.so

Este documento explica cómo configurar Tally.so para que envíe automáticamente las respuestas de los formularios a tu base de datos Supabase.

## 1. Configurar el campo oculto `cliente_id` en Tally

Para que el sistema sepa a qué cliente pertenece cada formulario, necesitamos usar un "Hidden Field" (campo oculto) en Tally.

1. Abre tu formulario en modo edición en Tally.
2. Añade un nuevo bloque y selecciona **Hidden Fields**.
3. Añade un campo llamado exactamente **`cliente_id`**.
4. ¡Listo! El dashboard se encargará de pasar este parámetro automáticamente en la URL cuando el usuario haga clic en "Copiar Link" desde el panel.

## 2. Configurar el Webhook en Tally

Una vez que tengas tu Edge Function desplegada en Supabase, debes configurar Tally para que envíe los datos allí:

1. Ve a la pestaña **Integrations** de tu formulario en Tally.
2. Haz clic en **Connect** en la opción **Webhooks**.
3. En el campo **Endpoint URL**, pega la URL de tu Edge Function. Debería verse algo como:
   `https://tu-proyecto.supabase.co/functions/v1/tally-webhook`
4. Opcional (pero recomendado): Tally generará un **Signing Secret**. Cópialo.
5. Haz clic en **Connect** o **Save**.

## 3. Configurar el Signing Secret en el Dashboard (Opcional)

Si copiaste el Signing Secret en el paso anterior, debes agregarlo a la base de datos para que la Edge Function pueda validar que los requests son genuinos.

1. Inserta el Signing Secret en la tabla `configuraciones_app`. Puedes hacerlo corriendo este comando SQL en Supabase:

```sql
INSERT INTO configuraciones_app (clave, valor)
VALUES ('tally_signing_secret', 'tu_signing_secret_aqui')
ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor;
```

Si no configuras el secret, el endpoint funcionará igual pero aceptará cualquier request POST.

## 4. Probar la integración

1. Copia un link de formulario desde el perfil de un cliente en el dashboard. El link incluirá `?cliente_id=X`.
2. Llena el formulario de prueba y envíalo.
3. Actualiza el perfil del cliente en el dashboard y expande la sección "Formularios Externos".
4. Deberías ver tu formulario completado allí, y al hacer clic en el botón con forma de "ojo", podrás ver todas las respuestas.

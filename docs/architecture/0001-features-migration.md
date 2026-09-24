# ADR 0001: Migración a `src/features/<dominio>`

## Contexto

El proyecto tuvo, en un momento, tres árboles de carpetas paralelos: el legacy
(`src/components/`, `src/services/`, `src/hooks/`, `src/context/`), una copia
por dominio bajo `src/features/*` creada en un solo commit de "reestructuración",
y una capa transversal `src/shared/*`. La copia en `src/features/*` se hizo
copiando archivos sin ajustar las rutas de import relativas a la nueva
profundidad de carpetas. Como resultado, 8 de los 10 dominios quedaron
completamente muertos (sin consumidores, con imports rotos que no habrían
compilado si algo los hubiera importado) y además **desactualizados**
respecto al legacy: mientras la copia rota permanecía intacta, el código
legacy real seguía recibiendo funcionalidad nueva. En un caso concreto, un
cambio de scoping por `organization_id` llegó únicamente a la copia muerta y
nunca al archivo legacy que de verdad se ejecuta — un riesgo de seguridad
silencioso que solo se detectó por auditoría manual.

Esos 8 dominios fueron eliminados (ver historial de `refactor/consolidate-architecture`).
Solo `features/auth` y `features/notifications` sobrevivieron: son el único
ejemplo de una migración hecha correctamente (rutas ajustadas, cableados en
`AppProviders.jsx`/`AppLayout.jsx`, sin duplicado paralelo).

## Regla

`src/features/<dominio>` es el patrón objetivo para dominios nuevos o para
migrar dominios existentes, pero solo bajo esta disciplina:

1. **Mover, no copiar.** Usar `git mv`, nunca copiar-pegar y dejar el
   original en su lugar.
2. **Arreglar los imports en el mismo commit.** Un dominio movido debe
   compilar (`npm run build`) antes de cerrar el commit que lo mueve.
3. **Nunca dejar dos copias vivas del mismo archivo.** Si un dominio se migra
   parcialmente, el legacy debe dejar de existir para esa pieza en el mismo
   cambio — no coexistir "por si acaso".
4. **Usar los alias de ruta** (`@`, `@shared`, `@features`, configurados en
   `vite.config.js` y `jsconfig.json`) en el código nuevo movido a
   `features/`, en vez de rutas relativas frágiles — la fragilidad de las
   rutas relativas fue la causa raíz original de que la migración anterior
   quedara rota sin que nadie lo notara.

## Estado actual de los árboles

- `src/features/{auth,notifications}` — patrón correcto, dominio por dominio.
- `src/{components,services,hooks,context}` — hogar principal de la lógica de
  negocio existente; no se migra en bloque, solo dominio por dominio cuando
  se toque con intención.
- `src/shared/*` — capa transversal (ui, hooks, services, config, errors).

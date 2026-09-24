# Panel Operacional — FLUJO Migração

Panel desde donde se dirige la operación de trámites migratorios:
Kommo es el canal de atención, Supabase + Google Drive guardan los datos del
cliente y n8n ejecuta las automatizaciones. El panel muestra lo que necesita
intervención humana y permite actuar sobre ello.

## Stack

React 19 + Vite + Tailwind, Supabase (auth, base de datos, tiempo real).

## Desarrollo

```bash
cp .env.example .env.local   # completar la clave publicable de Supabase
npm ci --legacy-peer-deps
npm run dev
```

`--legacy-peer-deps` es necesario porque `react-quill` todavía no declara
soporte para React 19.

## Despliegue (Easypanel)

App desde este repositorio con el `Dockerfile` incluido (build + nginx en el
puerto 80). En **Build Args** cargar:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY` (clave publicable, `sb_publishable_…`)

Nunca poner claves `service_role`, de IA ni tokens de servicios en variables
`VITE_*`: todo lo que empieza con `VITE_` queda visible en el navegador.

## Estado de la migración

El panel viene de una versión anterior con otro esquema de base de datos. Las
vistas se reactivan una por una a medida que se adaptan al modelo de FLUJO
(`clients`, `client_services`, `documents`, `messages`, `tasks`), ver
`MIGRATED_VIEWS` en `src/app/AppLayout.jsx`. Hoy activa: **Hoy** (bandeja de
pendientes, vista `pendentes_hoje`).

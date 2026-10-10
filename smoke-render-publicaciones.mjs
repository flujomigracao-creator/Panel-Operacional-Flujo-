// Prueba de humo de Publicaciones (npm run test:render): renderiza PublicacionesView de verdad (SSR) con datos y con errores.
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const stubPlugin = {
  name: 'stubs', enforce: 'pre',
  load(id) {
    const clean = id.split('?')[0];
    if (/supabaseClient(\.js)?$/.test(clean)) return 'export const supabase = new Proxy({}, { get: () => () => { throw new Error("supabase stub"); } }); export default supabase;';
  },
};
const server = await createServer({
  configFile: false, logLevel: 'error', appType: 'custom', server: { middlewareMode: true },
  plugins: [stubPlugin, react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)), '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)), '@features': fileURLToPath(new URL('./src/features', import.meta.url)) } },
});
let fallos = 0;
try {
  const React = (await import('react')).default;
  const { renderToString } = await import('react-dom/server');
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const { default: Vista } = await server.ssrLoadModule('/src/features/publicaciones/components/PublicacionesView.jsx');

  const futuro = (h) => new Date(Date.now() + h * 3600 * 1000).toISOString();
  const filas = [
    { id: 'a', programada_at: futuro(24), franja: 'manana', tipo: 'Guía', tema: 'CPF', texto: '📌 Lo que necesitas para pedir tu CPF', imagen_idea: 'Tarjeta con 5 iconos', fuente: 'Guía interna', estado: 'borrador', publicada_at: null, enlace_publicacion: null, updated_at: 'x1' },
    { id: 'b', programada_at: futuro(30), franja: 'tarde', tipo: 'Pregunta', tema: 'CPF', texto: '¿Ya tienes tu CPF?', imagen_idea: null, fuente: null, estado: 'aprobada', publicada_at: null, enlace_publicacion: null, updated_at: 'x2' },
    { id: 'c', programada_at: futuro(-48), franja: 'noche', tipo: 'Dato', tema: 'RNM', texto: 'Texto ya publicado', imagen_idea: null, fuente: null, estado: 'publicada', publicada_at: futuro(-47), enlace_publicacion: 'https://facebook.com/x', updated_at: 'x3' },
    { id: 'd', programada_at: futuro(-5), franja: 'manana', tipo: 'Guía', tema: 'RNM', texto: 'Borrador con la hora vencida', imagen_idea: null, fuente: null, estado: 'borrador', publicada_at: null, enlace_publicacion: null, updated_at: 'x4' },
  ];
  const montar = (fn) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
    fn(qc);
    return renderToString(React.createElement(QueryClientProvider, { client: qc }, React.createElement(Vista)));
  };
  const setError = (qc) => qc.getQueryCache().build(qc, { queryKey: ['publicaciones'], queryFn: () => 0 }).setState({ status: 'error', error: new Error('falló'), fetchStatus: 'idle', data: undefined });
  const comprobar = (nombre, html, debe, nodebe = []) => {
    const plano = html.replace(/<!-- -->/g, '');
    const mal = [...debe.filter((t) => !plano.includes(t)).map((t) => `falta «${t}»`), ...nodebe.filter((t) => plano.includes(t)).map((t) => `sobra «${t}»`)];
    console.log(mal.length ? `FALLA  ${nombre}: ${mal.join('; ')}` : `ok     ${nombre}`);
    if (mal.length) fallos++;
  };

  comprobar('con datos (filtro pendientes)', montar((qc) => qc.setQueryData(['publicaciones'], filas)),
    ['Publicaciones', 'Lo que necesitas para pedir tu CPF', 'Copiar texto', 'Aprobar', 'Hora vencida', 'Borrador con la hora vencida', 'se publican solas en la página de Facebook', 'Pendientes · 3'],
    ['Texto ya publicado', 'No se pudieron cargar']);
  comprobar('lista vacía', montar((qc) => qc.setQueryData(['publicaciones'], [])), ['Todavía no hay publicaciones', 'Nueva publicación']);
  comprobar('con error: aviso y reintento, sin decir que no hay nada', montar((qc) => setError(qc)), ['No se pudieron cargar las publicaciones', 'Reintentar'], ['Todavía no hay publicaciones']);
  comprobar('sin datos aún (no revienta)', montar(() => {}), ['Publicaciones']);
} catch (e) {
  console.error('EXCEPCIÓN al renderizar:', e?.stack || e);
  fallos++;
} finally {
  await server.close();
}
process.exit(fallos ? 1 : 0);

// Prueba de humo de Comentarios (npm run test:render): renderiza ComentariosView de verdad (SSR) con datos, vacío y con errores.
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
  const { default: Vista } = await server.ssrLoadModule('/src/features/social/components/ComentariosView.jsx');

  const ahora = new Date().toISOString();
  const filas = [
    { id: '1', plataforma: 'facebook', comment_id: 'c1', autor_nombre: 'Ana', texto: 'Gracias, muy útil', clase: 'elogio', confianza: 0.97, motivo: 'agradece', accion: 'responder', estado: 'procesado', error: null, creado_at: ahora },
    { id: '2', plataforma: 'instagram', comment_id: 'c2', autor_nombre: 'spammer', texto: 'Gana dinero rápido en mi enlace', clase: 'malo', confianza: 0.99, motivo: 'spam', accion: 'borrar', estado: 'procesado', error: null, creado_at: ahora },
    { id: '3', plataforma: 'facebook', comment_id: 'c3', autor_nombre: 'Luis', texto: 'Llevo semanas sin respuesta', clase: 'queja_legitima', confianza: 0.9, motivo: 'reclamo', accion: 'tarea', estado: 'error', error: 'privado: falló', creado_at: ahora },
  ];
  const montar = (fn) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
    fn(qc);
    return renderToString(React.createElement(QueryClientProvider, { client: qc }, React.createElement(Vista)));
  };
  const setError = (qc, key) => qc.getQueryCache().build(qc, { queryKey: [key], queryFn: () => 0 }).setState({ status: 'error', error: new Error('falló'), fetchStatus: 'idle', data: undefined });
  const comprobar = (nombre, html, debe, nodebe = []) => {
    const plano = html.replace(/<!-- -->/g, '');
    const mal = [...debe.filter((t) => !plano.includes(t)).map((t) => `falta «${t}»`), ...nodebe.filter((t) => plano.includes(t)).map((t) => `sobra «${t}»`)];
    console.log(mal.length ? `FALLA  ${nombre}: ${mal.join('; ')}` : `ok     ${nombre}`);
    if (mal.length) fallos++;
  };

  comprobar('con datos', montar((qc) => { qc.setQueryData(['comentarios_social'], filas); qc.setQueryData(['social_bot'], { activo: true, borrar: false }); }),
    ['Comentarios', 'Gracias, muy útil', 'Borrado', 'Pasó a una persona', 'Todos · 3', 'Con error · 1', 'Bot activo', 'Puede borrar comentarios malos', 'privado: falló'],
    ['No se pudieron']);
  comprobar('vacío', montar((qc) => { qc.setQueryData(['comentarios_social'], []); qc.setQueryData(['social_bot'], { activo: true, borrar: true }); }), ['Todavía no hay comentarios']);
  comprobar('error al cargar: aviso, sin decir que no hay nada', montar((qc) => { setError(qc, 'comentarios_social'); setError(qc, 'social_bot'); }),
    ['No se pudieron cargar los comentarios', 'Reintentar', 'No se pudieron leer los interruptores'], ['Todavía no hay comentarios']);
  comprobar('sin datos aún (no revienta)', montar(() => {}), ['Comentarios']);
} catch (e) {
  console.error('EXCEPCIÓN al renderizar:', e?.stack || e);
  fallos++;
} finally {
  await server.close();
}
process.exit(fallos ? 1 : 0);

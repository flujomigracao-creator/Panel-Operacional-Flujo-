// Prueba de humo del Inicio (npm run test:render): renderiza HomeView de verdad (SSR) con datos reales y con errores, para cazar fallos de ejecución
// que el build y las pruebas de lógica no ven (p. ej. variables usadas antes de declararse).
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

const stubs = {
  supabaseClient: 'export const supabase = new Proxy({}, { get: () => () => { throw new Error("supabase stub"); } }); export default supabase;',
  AuthContext: 'export const useAuth = () => ({ userProfile: { nombre: "Víctor Prueba" } });',
};
const stubPlugin = {
  name: 'stubs', enforce: 'pre',
  load(id) {
    const clean = id.split('?')[0];
    if (/supabaseClient(\.js)?$/.test(clean)) return stubs.supabaseClient;
    if (/features[\\/]auth[\\/]context[\\/]AuthContext(\.jsx?)?$/.test(clean)) return stubs.AuthContext;
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
  const { default: HomeView } = await server.ssrLoadModule('/src/features/crm/components/HomeView.jsx');
  const { periodoDeFiltro } = await server.ssrLoadModule('/src/features/crm/resumenInicio.js');
  const p = periodoDeFiltro('7d');

  const v2 = {
    version: 2, generado_en: new Date().toISOString(), zona: 'America/Sao_Paulo',
    resultados_periodo: {
      oportunidades: { actual: { oportunidades: 264, personas: 253, con_anuncio: 78, sin_atribucion: 186, sin_servicio_elegido: 159, sin_servicio_activas: 58, sin_servicio_perdidas: 101, pagadas: 3, maduras_7d: 142, pagadas_7d: 0, maduras_30d: 0, pagadas_30d: 0, pagadas_con_anuncio: 2, ingresos_con_anuncio: 129 }, previo: null },
      cobrado: { actual: { n: 16, total: 1365, atribuido: 5, ambiguo: 0, sin_coincidencia: 2, sin_oportunidad: 9 }, previo: null },
      gasto: { actual: { total: 564.01, conversaciones: 177 }, previo: null },
      ingresos_por_servicio: [{ servicio: 'RNM (1ª vía)', total: 229, n: 3 }],
    },
    situacion_actual: { potencial: { n: 143, total: 9508, sin_actividad_7d: 109, sin_actividad_14d: 0 }, conversaciones_pendientes: 39, meta_sync: { ultimo_ok: new Date().toISOString(), ultimo_resultado: true } },
  };
  const emb = {
    version: 1, embudo: { actual: { oportunidades: 264, con_servicio: 113, propuesta: 141, pago: 3, iniciado: 5, iniciado_sin_pago: 2, perdidas: 171 }, previo: null },
    costos_conocidos: { gastos_registrados: { n: 0, total: 0 }, catalogo: { servicios: 10, con_precio: 9, con_costo: 0 } },
  };

  const montar = (fn) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
    for (const k of [['crm', 'tramites'], ['crm', 'conversations'], ['pendentes_hoje'], ['crm', 'leads'], ['crm', 'pipelines'], ['crm', 'team'], ['crm', 'tags'], ['crm', 'lead_tags']]) qc.setQueryData(k, []);
    fn(qc);
    return renderToString(React.createElement(QueryClientProvider, { client: qc }, React.createElement(HomeView, { onNavigate() {}, onOpenChat() {}, onNavigateToClient() {}, onOpenTramite() {} })));
  };
  const setError = (qc, key) => qc.getQueryCache().build(qc, { queryKey: key, queryFn: () => 0 }).setState({ status: 'error', error: new Error('falló'), fetchStatus: 'idle', data: undefined });
  const comprobar = (nombre, html, debe, nodebe = []) => {
    const mal = [...debe.filter((t) => !html.includes(t)).map((t) => `falta «${t}»`), ...nodebe.filter((t) => html.includes(t)).map((t) => `sobra «${t}»`)];
    console.log(mal.length ? `FALLA  ${nombre}: ${mal.join('; ')}` : `ok     ${nombre}`);
    if (mal.length) fallos++;
  };

  // 1) todo con datos
  const h1 = montar((qc) => { qc.setQueryData(['inicio', 'resumen', p.desde, p.hasta], v2); qc.setQueryData(['inicio', 'embudo', p.desde, p.hasta], emb); });
  comprobar('datos completos', h1, ['Resumen de la empresa', 'Resultados del período seleccionado', 'Oportunidades (una por servicio)', '264', 'Embudo comercial', 'Propuesta enviada', 'Resultado tras publicidad', 'No es margen neto', 'Situación actual', 'Propuestas abiertas', 'Al día'], ['Error<', 'Cargando…']);

  // 2) resumen falla, embudo bien: solo caen las tarjetas del resumen
  const h2 = montar((qc) => { setError(qc, ['inicio', 'resumen', p.desde, p.hasta]); qc.setQueryData(['inicio', 'embudo', p.desde, p.hasta], emb); });
  comprobar('resumen con error, embudo ok', h2, ['Error', 'Reintentar', 'Embudo comercial', 'Propuesta enviada', '141'], ['Resultado tras publicidad: ']);

  // 3) embudo falla, resumen bien: las cifras del resumen siguen y la economía dice que no pudo comprobar costos
  const h3 = montar((qc) => { qc.setQueryData(['inicio', 'resumen', p.desde, p.hasta], v2); setError(qc, ['inicio', 'embudo', p.desde, p.hasta]); });
  comprobar('embudo con error, resumen ok', h3, ['264', 'Resultado tras publicidad', 'no se pudo comprobar qué costos hay registrados', 'Reintentar']);

  // 4) formato de respuesta inesperado (función antigua): debe ser error, no ceros
  const h4 = montar((qc) => { qc.setQueryData(['inicio', 'resumen', p.desde, p.hasta], { leads: {}, cobrado: {} }); qc.setQueryData(['inicio', 'embudo', p.desde, p.hasta], emb); });
  comprobar('formato inesperado = error', h4, ['Error', 'Reintentar']);

  // 5) sin datos de ninguna fuente todavía: no debe romper
  const h5 = montar(() => {});
  comprobar('sin datos aún (no revienta)', h5, ['Resumen de la empresa']);
} catch (e) {
  console.error('EXCEPCIÓN al renderizar:', e?.stack || e);
  fallos++;
} finally {
  await server.close();
}
process.exit(fallos ? 1 : 0);

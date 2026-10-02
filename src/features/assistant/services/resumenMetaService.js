import { supabase } from '@shared/config/supabaseClient';
import { resolverPeriodos, construirResumen, isoDia } from './resumenMeta';

// PostgREST corta en 1000 filas por consulta: se pagina para no truncar el período en silencio.
export async function leerTodo(armar) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await armar().range(desde, desde + 999);
    if (error) throw error;
    filas.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return filas;
}

/** Todas las columnas de meta_ads_insights (incluido `raw` con cada acción de Meta) del período pedido. */
export async function getInsightsCompletos(rango) {
  const periodo = resolverPeriodos(rango);
  const filas = await leerTodo(() =>
    supabase
      .from('meta_ads_insights')
      .select(
        'fecha, campaign_id, campaign_name, adset_id, adset_name, ad_id, ad_name, gasto, impresiones, alcance, clics, clics_enlace, conversaciones, leads_meta, video_reproducciones, ranking_calidad, ranking_engagement, ranking_conversion, raw'
      )
      .gte('fecha', periodo.desde)
      .lte('fecha', periodo.hasta)
      .order('fecha', { ascending: true })
  );
  return { periodo, filas };
}

/** Tablas cuyo cambio debe refrescar el Resumen en vivo (Supabase Realtime, respeta RLS). */
export const TABLAS_EN_VIVO = ['meta_ads_insights', 'meta_ads_desglose', 'meta_ads_entities', 'meta_ads_sync_log', 'comercial_leads', 'payments'];

/** Suscripción Realtime: llama a `alCambiar` en cada cambio. Devuelve la función para cancelar. */
export function suscribirCambios(alCambiar) {
  const canal = supabase.channel('resumen-meta-en-vivo');
  for (const table of TABLAS_EN_VIVO) canal.on('postgres_changes', { event: '*', schema: 'public', table }, alCambiar);
  canal.subscribe();
  return () => supabase.removeChannel(canal);
}

/**
 * Lee de Supabase lo necesario para el período pedido Y el período previo (comparación),
 * y devuelve el Resumen ya calculado. Cada fuente que falle se reporta en `avisos`
 * sin tumbar la pantalla: lo que no se pudo leer no se rellena con ceros.
 */
export async function getResumenMeta(rango) {
  const periodo = resolverPeriodos(rango);
  const desde = periodo.previo.desde;
  const hasta = periodo.hasta;
  const avisos = [];

  const intentar = async (nombre, fn, vacio = []) => {
    try {
      return await fn();
    } catch (err) {
      console.error(`[Resumen Meta] ${nombre}:`, err?.message || err);
      avisos.push(nombre);
      return vacio;
    }
  };

  const [insights, leads, pagos, leadsMeta, entidades, syncs, desglose] = await Promise.all([
    intentar('métricas de Meta Ads', () =>
      leerTodo(() =>
        supabase
          .from('meta_ads_insights')
          .select('fecha, ad_id, campaign_id, campaign_name, gasto, impresiones, clics, clics_enlace, conversaciones')
          .gte('fecha', desde)
          .lte('fecha', hasta)
          .order('fecha', { ascending: true })
      )
    ),
    intentar('leads del CRM', () =>
      leerTodo(() =>
        supabase
          .from('comercial_leads')
          .select('id, client_id, created_at, propuesta_enviada, meta_ad_id')
          .gte('created_at', `${desde}T00:00:00`)
          .lte('created_at', `${isoDia(new Date(new Date(`${hasta}T00:00:00`).getTime() + 86400000 * 2))}T00:00:00`)
          .order('created_at', { ascending: true })
      )
    ),
    intentar('cobros', () =>
      leerTodo(() =>
        supabase
          .from('payments')
          .select('client_id, amount, paid_at')
          .eq('status', 'paid')
          .gte('paid_at', `${desde}T00:00:00`)
          .order('paid_at', { ascending: true })
      )
    ),
    intentar('atribución de leads a anuncios', () =>
      leerTodo(() =>
        supabase.from('comercial_leads').select('client_id, meta_ad_id').not('meta_ad_id', 'is', null).order('id')
      )
    ),
    intentar('estado de campañas', () =>
      leerTodo(() =>
        supabase
          .from('meta_ads_entities')
          .select('entity_type, entity_id, name, status, effective_status')
          .eq('entity_type', 'campaign')
          .order('entity_id')
      )
    ),
    intentar('bitácora de sincronización', async () => {
      const { data, error } = await supabase
        .from('meta_ads_sync_log')
        .select('terminado_en, iniciado_en')
        .eq('ok', true)
        .order('iniciado_en', { ascending: false })
        .limit(1);
      if (error) throw error;
      return data || [];
    }),
    intentar('desgloses de Meta Ads', () =>
      leerTodo(() =>
        supabase
          .from('meta_ads_desglose')
          .select('fecha, tipo, clave, gasto, impresiones, clics, conversaciones')
          .gte('fecha', periodo.desde)
          .lte('fecha', hasta)
          .order('fecha', { ascending: true })
      )
    ),
  ]);

  const ultimaSyncOk = syncs[0]?.terminado_en || syncs[0]?.iniciado_en || null;
  // Si la bitácora no se pudo leer, no se alerta de "sync atrasada" (no hay base para afirmarlo).
  const bitacoraLeida = !avisos.includes('bitácora de sincronización');
  const datos = { insights, leads, pagos, leadsMeta, entidades, desglose, ultimaSyncOk: bitacoraLeida ? ultimaSyncOk : undefined };
  return { ...construirResumen(datos, rango), avisos, datos, ultimaSyncOk };
}

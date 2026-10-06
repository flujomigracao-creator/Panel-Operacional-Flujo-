-- Genera cada 5 minutos los eventos de compra (pago corroborado por comprobante). El envío a Meta lo hace el workflow de n8n cada 10 minutos.
-- Para pausar:  select cron.unschedule('eventos_pago_corroborado');
select cron.unschedule(jobid) from cron.job where jobname = 'eventos_pago_corroborado';
select cron.schedule('eventos_pago_corroborado', '*/5 * * * *', $$select private.generar_eventos_pago_corroborado()$$);

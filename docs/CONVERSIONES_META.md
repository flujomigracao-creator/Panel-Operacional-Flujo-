# Compras que se envían al conjunto de datos de Meta

Decisión del dueño (2026-10-06): **una compra es un pago corroborado**, por una de dos vías:

1. **Correo de PicPay** enlazado a un pago (vía original; `private.vincular_picpay`, fuente `picpay_gmail`).
2. **Comprobante del cliente con el mismo monto** (±R$ 0,02) para un pago registrado por el equipo (`private.generar_eventos_pago_corroborado`, fuente `comprobante_cliente`, cada 5 minutos con pg_cron).

Qué se envía y cuándo (workflow de n8n cada 10 minutos → función `enviar-conversion-meta`): evento `Purchase` de mensajería (WhatsApp) solo si el lead tiene `ctwa_clid` (clic a un anuncio), valor > 0 y el evento tiene menos de 6 días. Cada evento sale una sola vez (`enviado_meta_at`, `event_id` = `dedupe_key`).

Por qué existía el hueco (octubre 2026): el evento solo nacía de un correo de PicPay; el último llegó el 2 de octubre, así que los pagos posteriores (leads en «Logrado con éxito») no llegaban a Meta. Lo que **no** cuenta como compra: un lead movido a «Logrado con éxito» con un importe pero sin comprobante ni correo (el importe lo escribe una persona).

Guarda anti-duplicado: si el mismo pago llega por las dos vías (comprobante y, después, correo de PicPay), solo se registra el primer evento (mismo cliente y lead, monto ±R$ 0,02, ±7 días, fuente distinta).

Sin `ctwa_clid` el evento existe (cuenta en el embudo del panel) pero no se envía a Meta.

Simular qué eventos generaría hoy la regla (no crea nada):
```sql
select p.amount, s.name servicio, cs.kommo_lead_id, (l.meta_ctwa_clid is not null) con_anuncio
from payments p join client_services cs on cs.id = p.client_service_id
left join services s on s.id = cs.service_id left join comercial_leads l on l.kommo_lead_id = cs.kommo_lead_id
where p.status = 'paid' and p.amount > 0 and coalesce(p.paid_at, p.created_at) > now() - interval '6 days' and cs.kommo_lead_id is not null
  and not exists (select 1 from pagos_picpay pp where pp.payment_id = p.id and not coalesce(pp.descartado, false))
  and exists (select 1 from comprobantes_cliente cc where cc.client_id = p.client_id and cc.monto is not null and abs(cc.monto - p.amount) < 0.02)
  and not exists (select 1 from eventos_comerciales e where e.dedupe_key = 'pago-pay-' || p.id);
```
Límite conocido: el único evento enviado hasta ahora (2026-10-03, R$ 79) no se ha visto en el Administrador de eventos de Meta; la API respondió `events_received: 1`. Los de comprobante son los siguientes en comprobarse allí.

-- Eventos de COMPRA para Meta desde pagos registrados por el equipo y CORROBORADOS por un comprobante del cliente.
-- Decisión del dueño (2026-10-06): compra = pago corroborado por comprobante con el mismo monto o por correo de PicPay.
-- Hasta hoy el evento 'pago_confirmado' solo nacía de un correo de PicPay (private.vincular_picpay); el último llegó el 2 de octubre,
-- así que los pagos posteriores (leads en «Logrado con éxito») nunca llegaban al conjunto de datos de Meta.
--
--  · private.generar_eventos_pago_corroborado(p_dias): para cada pago 'paid' con monto > 0 de los últimos p_dias días, de un trámite con
--    lead de Kommo, que NO esté ya enlazado a un correo de PicPay y que tenga un comprobante del mismo cliente con el mismo monto (±0,02),
--    registra el evento con la vía común private.registrar_evento (fuente 'comprobante_cliente', dedupe_key 'pago-pay-<payment_id>').
--    El anuncio (ctwa_clid) lo aporta el lead exacto del trámite (vista eventos_comerciales_atribuidos); sin ctwa el evento existe pero no se envía.
--  · Guarda anti-duplicado: si el mismo pago llega por otra fuente (p. ej. el correo de PicPay después del comprobante), no se inserta
--    un segundo evento (mismo cliente y lead, monto ±0,02, ±7 días, fuente distinta) para no contar ni enviar la compra dos veces.
--  · pg_cron cada 5 minutos. El envío a Meta lo hace el workflow de n8n existente (cada 10 min, solo eventos con ctwa_clid, valor > 0 y ≤ 6 días).

create or replace function private.generar_eventos_pago_corroborado(p_dias int default 6)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int := 0;
  r record;
begin
  for r in
    select p.id, p.client_id, p.amount, coalesce(p.paid_at, p.created_at) as cuando, cs.kommo_lead_id, s.name as servicio
    from payments p
    join client_services cs on cs.id = p.client_service_id
    left join services s on s.id = cs.service_id
    where p.status = 'paid'
      and p.amount > 0
      and coalesce(p.paid_at, p.created_at) > now() - make_interval(days => p_dias)
      and cs.kommo_lead_id is not null
      and not exists (select 1 from pagos_picpay pp where pp.payment_id = p.id and not coalesce(pp.descartado, false))
      and exists (select 1 from comprobantes_cliente cc
                   where cc.client_id = p.client_id and cc.monto is not null and abs(cc.monto - p.amount) < 0.02)
      and not exists (select 1 from eventos_comerciales e where e.dedupe_key = 'pago-pay-' || p.id)
  loop
    perform private.registrar_evento(r.kommo_lead_id, r.client_id, 'pago_confirmado', r.cuando, r.amount, r.servicio,
                                     'comprobante_cliente', 'pago-pay-' || r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function private.trg_evento_pago_duplicado()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.evento = 'pago_confirmado' and new.client_id is not null and new.kommo_lead_id is not null and exists (
       select 1 from eventos_comerciales e
        where e.evento = 'pago_confirmado'
          and e.client_id = new.client_id
          and e.kommo_lead_id = new.kommo_lead_id
          and e.fuente is distinct from new.fuente
          and abs(coalesce(e.valor, 0) - coalesce(new.valor, 0)) < 0.02
          and abs(extract(epoch from (e.ocurrio_at - new.ocurrio_at))) < 7 * 86400) then
    return null;  -- el mismo pago ya tiene su evento por otra fuente: no se duplica
  end if;
  return new;
end;
$$;

drop trigger if exists trg_evento_pago_duplicado on public.eventos_comerciales;
create trigger trg_evento_pago_duplicado before insert on public.eventos_comerciales
  for each row execute function private.trg_evento_pago_duplicado();

revoke all on function private.generar_eventos_pago_corroborado(int) from public, anon, authenticated;
grant execute on function private.generar_eventos_pago_corroborado(int) to service_role;

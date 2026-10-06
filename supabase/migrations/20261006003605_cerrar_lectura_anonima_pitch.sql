-- comercial_audios_pitch (guiones y precios del pitch): se retira la lectura anónima que 20261006000001 conservó
-- temporalmente. Verificado en los logs de la API (24 h): solo la leen n8n (service_role), las Edge Functions (clave de
-- servicio) y el panel (usuario autenticado); ninguna lectura anónima. Los autenticados siguen leyendo.
drop policy if exists pitch_read on public.comercial_audios_pitch;
create policy pitch_read on public.comercial_audios_pitch for select to authenticated using (true);
revoke select on public.comercial_audios_pitch from anon;

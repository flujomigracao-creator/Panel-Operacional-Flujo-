-- Aplicada en producción el 2026-10-06 (nora_pausa_por_asesor_humano).
-- Cuando un humano (messages.sender_type = 'agent') escribe al cliente de un lead que Nora atiende (Triagem/Comercial),
-- Nora se pausa solo para ese lead y se dispara un único aviso final (edge function nora-asesor-aviso).
alter table public.comercial_leads add column if not exists asesor_tomo_at timestamptz, add column if not exists aviso_asesor_at timestamptz;
-- (función public.nora_pausar_por_asesor() y trigger trg_nora_pausar_por_asesor: ver definición vigente en la base)

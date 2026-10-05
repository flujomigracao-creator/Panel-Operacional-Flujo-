-- Id público de la cuenta de WhatsApp Business (WABA) para listar plantillas aprobadas desde el panel.
alter table public.channel_integrations add column if not exists whatsapp_waba_id text;
update public.channel_integrations set whatsapp_waba_id = '1128909686157374'
  where organization_id = '00000000-0000-0000-0000-000000000001' and whatsapp_waba_id is null;

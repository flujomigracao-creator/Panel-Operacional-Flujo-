-- El receptor de eventos de Kommo (n8n) también recibe los mensajes del canal personalizado "Flujo Migracao
-- WhatsApp" (origen amo.ext.36958507). Esos mensajes ya están en `messages`: son los que copió kommo-canal desde
-- WhatsApp, o los que un operador escribió en Kommo y kommo-canal ya registró al mandarlos. Registrarlos de nuevo
-- los duplicaba en el panel (en una conversación de canal 'kommo') y en el buffer del agente de recepción.
create or replace function public.registrar_mensagem_kommo(p_message_id text, p_direction text, p_chat_id text DEFAULT NULL::text, p_talk_id text DEFAULT NULL::text, p_contact_id bigint DEFAULT NULL::bigint, p_lead_id bigint DEFAULT NULL::bigint, p_text text DEFAULT NULL::text, p_origin text DEFAULT NULL::text, p_author_name text DEFAULT NULL::text, p_author_type text DEFAULT NULL::text, p_attachment_type text DEFAULT NULL::text, p_attachment_url text DEFAULT NULL::text, p_attachment_name text DEFAULT NULL::text, p_storage_path text DEFAULT NULL::text, p_mime_type text DEFAULT NULL::text, p_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_raw jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org_id uuid := '00000000-0000-0000-0000-000000000001';
  v_channel public.conversation_channel;
  v_client_id uuid;
  v_conv_id uuid;
  v_msg_id uuid;
  v_dir public.message_direction;
  v_sender public.sender_type;
  v_type public.message_type;
  v_at timestamptz := coalesce(p_created_at, now());
  v_inbound jsonb;
begin
  -- Canal personalizado propio: el mensaje ya está registrado (ver comentario arriba).
  if p_origin = 'amo.ext.36958507' then
    return jsonb_build_object('ok', true, 'duplicado', true, 'motivo', 'canal_personalizado_propio');
  end if;

  select id into v_msg_id from public.messages where organization_id = v_org_id and external_message_id = p_message_id;
  if v_msg_id is not null then
    return jsonb_build_object('ok', true, 'duplicado', true, 'message_id', v_msg_id);
  end if;

  v_channel := case
    when p_origin ilike any (array['%waba%', '%whatsapp%', '%wz%']) then 'whatsapp'
    when p_origin ilike '%instagram%' then 'instagram'
    when p_origin ilike any (array['%facebook%', '%messenger%']) then 'messenger'
    when p_origin ilike '%telegram%' then 'telegram'
    else 'kommo' end::public.conversation_channel;

  v_dir := case when p_direction ilike 'in%' then 'inbound' else 'outbound' end::public.message_direction;
  v_sender := case
    when v_dir = 'inbound' then 'client'
    when p_author_type ilike any (array['%bot%', '%robot%', '%salesbot%']) then 'ai'
    when p_author_type ilike any (array['%system%', '%integration%']) then 'system'
    else 'agent' end::public.sender_type;
  v_type := case
    when p_attachment_type ilike any (array['%picture%', '%image%', '%photo%', '%sticker%']) then 'image'
    when p_attachment_type ilike any (array['%voice%', '%audio%']) then 'audio'
    when p_attachment_type ilike '%video%' then 'video'
    when p_attachment_type ilike any (array['%file%', '%document%']) then 'document'
    when p_attachment_type ilike '%location%' then 'location'
    when p_attachment_type is not null then 'other'
    else 'text' end::public.message_type;

  if p_contact_id is not null then
    select id into v_client_id from public.clients where organization_id = v_org_id and kommo_contact_id = p_contact_id;
  end if;

  -- conversación = chat de Kommo
  select id into v_conv_id from public.conversations
  where organization_id = v_org_id and channel = v_channel
    and external_conversation_id = coalesce(p_chat_id, 'contact:' || p_contact_id::text, 'lead:' || p_lead_id::text);

  if v_conv_id is null then
    insert into public.conversations (organization_id, client_id, channel, external_conversation_id, status, started_at,
                                      kommo_contact_id, kommo_lead_id, kommo_talk_id)
    values (v_org_id, v_client_id, v_channel, coalesce(p_chat_id, 'contact:' || p_contact_id::text, 'lead:' || p_lead_id::text),
            'open', v_at, p_contact_id, p_lead_id, p_talk_id)
    returning id into v_conv_id;
  else
    update public.conversations
       set client_id = coalesce(client_id, v_client_id),
           kommo_contact_id = coalesce(kommo_contact_id, p_contact_id),
           kommo_lead_id = coalesce(p_lead_id, kommo_lead_id),
           kommo_talk_id = coalesce(p_talk_id, kommo_talk_id),
           status = 'open'
     where id = v_conv_id;
  end if;

  insert into public.messages (organization_id, conversation_id, client_id, direction, sender_type, message_type, content,
                               external_message_id, metadata, created_at, kommo_contact_id, kommo_lead_id, author_name)
  values (v_org_id, v_conv_id, v_client_id, v_dir, v_sender, v_type, p_text, p_message_id,
          jsonb_build_object('origin', p_origin, 'author_type', p_author_type, 'talk_id', p_talk_id, 'raw', coalesce(p_raw, '{}'::jsonb)),
          v_at, p_contact_id, p_lead_id, p_author_name)
  returning id into v_msg_id;

  if p_attachment_url is not null or p_storage_path is not null then
    insert into public.message_attachments (organization_id, message_id, storage_path, file_name, mime_type, kind, source_url)
    values (v_org_id, v_msg_id, coalesce(p_storage_path, p_attachment_url), p_attachment_name, p_mime_type, p_attachment_type, p_attachment_url);
  end if;

  if v_client_id is not null and v_dir = 'inbound' then
    update public.clients set last_contact_at = v_at where id = v_client_id;
  end if;

  -- entrantes con lead también van al buffer del agente de recepción
  if v_dir = 'inbound' and p_lead_id is not null then
    v_inbound := public.registrar_inbound(
      p_lead_id,
      case v_type when 'image' then 'image' when 'document' then 'document' when 'audio' then 'audio'
                  when 'video' then 'video' when 'text' then 'text' else 'other' end,
      p_text, coalesce(p_storage_path, p_attachment_url), p_attachment_name, p_mime_type, p_message_id, v_at);
  end if;

  return jsonb_build_object('ok', true, 'duplicado', false, 'message_id', v_msg_id, 'conversation_id', v_conv_id,
                            'client_id', v_client_id, 'direction', v_dir, 'sender_type', v_sender, 'message_type', v_type);
end;
$function$;

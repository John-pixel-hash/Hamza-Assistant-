-- TikTok is a supported reply platform and must be storable on messages.
alter table public.messages drop constraint if exists messages_channel_check;
alter table public.messages add constraint messages_channel_check
  check (channel is null or channel in
    ('fiverr','email','whatsapp','instagram','tiktok','call','linkedin','upwork','other'));

-- ============================================================================
-- Hamza Assistant - Phase 0 storage
-- Private bucket for client screenshots, briefs, and attachments.
-- Nothing is public. Files are reachable only through short lived signed URLs
-- generated server side, and only by the owner.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'attachments',
  'attachments',
  false,
  26214400, -- 25 MB
  array[
    'image/png','image/jpeg','image/webp','image/gif',
    'application/pdf','text/plain','text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do nothing;

-- Objects are stored under {user_id}/... so a path prefix check is a sufficient
-- ownership test. The leading folder must equal the authenticated user id.

drop policy if exists attachments_read   on storage.objects;
drop policy if exists attachments_write  on storage.objects;
drop policy if exists attachments_update on storage.objects;
drop policy if exists attachments_delete on storage.objects;

create policy attachments_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy attachments_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy attachments_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy attachments_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

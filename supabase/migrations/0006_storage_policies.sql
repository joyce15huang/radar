-- =============================================================================
-- Personal Daily Digest — Storage policies for the post-images bucket
-- Run AFTER 0005. If these error with a permissions message on `storage.objects`
-- (some hosted projects restrict it), skip this file and instead add an
-- "authenticated INSERT" policy on the post-images bucket via the Storage → Policies
-- dashboard UI. The bucket itself was created in 0005 / the dashboard.
-- =============================================================================

drop policy if exists "post-images authenticated upload" on storage.objects;
create policy "post-images authenticated upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'post-images');

drop policy if exists "post-images public read" on storage.objects;
create policy "post-images public read" on storage.objects
  for select using (bucket_id = 'post-images');

drop policy if exists "post-images owner delete" on storage.objects;
create policy "post-images owner delete" on storage.objects
  for delete to authenticated using (bucket_id = 'post-images' and owner = auth.uid());

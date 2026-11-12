-- 在新建的 Supabase 專案 SQL Editor 執行。此檔沒有管理密鑰。
-- 私有 bucket；透過經 Auth 驗證的 JWT 做 RLS，不使用 service_role 繞過政策。
begin;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hengyan-private', 'hengyan-private', false, 16000000, array['application/json'])
on conflict (id) do update set public = false, file_size_limit = 16000000, allowed_mime_types = array['application/json'];

drop policy if exists hengyan_read_own on storage.objects;
create policy hengyan_read_own on storage.objects for select to authenticated
using (bucket_id = 'hengyan-private' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists hengyan_insert_own on storage.objects;
create policy hengyan_insert_own on storage.objects for insert to authenticated
with check (bucket_id = 'hengyan-private' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists hengyan_update_own on storage.objects;
create policy hengyan_update_own on storage.objects for update to authenticated
using (bucket_id = 'hengyan-private' and (storage.foldername(name))[1] = (select auth.uid()::text))
with check (bucket_id = 'hengyan-private' and (storage.foldername(name))[1] = (select auth.uid()::text));

drop policy if exists hengyan_delete_own on storage.objects;
create policy hengyan_delete_own on storage.objects for delete to authenticated
using (bucket_id = 'hengyan-private' and (storage.foldername(name))[1] = (select auth.uid()::text));
commit;

-- Cleanup of expired documents (docs/CONTRACT.md, section 2 "Cleanup"). Service-role only.
-- The scheduled workflow: 1) public.expired_documents() -> 2) removes each storage_path through the Storage API ->
-- 3) public.purge_expired_documents(ids) deletes the rows that are still expired. Applications keep cv_label; their
-- document ids become null through "on delete set null".
-- The functions are SECURITY INVOKER and rely on the service_role bypassing RLS; no end user can run them.

create or replace function public.expired_documents()
returns table (id uuid, user_id uuid, storage_path text)
language sql
stable
set search_path = ''
as $$
  select d.id, d.user_id, d.storage_path
  from public.documents d
  where d.expires_at is not null and d.expires_at < now()
  order by d.expires_at, d.id;
$$;

create or replace function public.purge_expired_documents(document_ids uuid[])
returns integer
language plpgsql
set search_path = ''
as $$
declare
  purged integer;
begin
  delete from public.documents d
  where d.id = any (document_ids) and d.expires_at is not null and d.expires_at < now();
  get diagnostics purged = row_count;
  return purged;
end;
$$;

revoke all on function public.expired_documents() from public, anon, authenticated;
revoke all on function public.purge_expired_documents(uuid[]) from public, anon, authenticated;
grant execute on function public.expired_documents() to service_role;
grant execute on function public.purge_expired_documents(uuid[]) to service_role;

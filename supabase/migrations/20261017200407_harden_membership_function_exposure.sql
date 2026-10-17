-- Keep SECURITY DEFINER membership helpers out of the exposed public API schema.
-- RLS policies retain their function dependencies when PostgreSQL moves the functions.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

alter function public.is_org_member(uuid) set schema private;
alter function public.has_org_role(uuid, public.membership_role[]) set schema private;

revoke all on function private.is_org_member(uuid) from public, anon;
revoke all on function private.has_org_role(uuid, public.membership_role[]) from public, anon;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_role(uuid, public.membership_role[]) to authenticated;

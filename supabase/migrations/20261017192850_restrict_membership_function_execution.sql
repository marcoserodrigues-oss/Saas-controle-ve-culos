-- Prevent anonymous and public execution; policies continue to use these functions.
revoke execute on function public.is_org_member(uuid) from public, anon;
revoke execute on function public.has_org_role(uuid, public.membership_role[]) from public, anon;

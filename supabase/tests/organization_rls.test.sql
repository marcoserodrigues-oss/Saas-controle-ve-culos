-- Cross-organization and role-based RLS tests; isolated local database only.
begin;
select plan(8);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  ('b1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'qa-owner-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb),
  ('b1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'qa-owner-b@example.test', '', now(), '{}'::jsonb, '{}'::jsonb),
  ('b1000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'qa-viewer-a@example.test', '', now(), '{}'::jsonb, '{}'::jsonb);

insert into public.organizations (id, name)
values
  ('b2000000-0000-4000-8000-000000000001', 'RLS Organization A'),
  ('b2000000-0000-4000-8000-000000000002', 'RLS Organization B');

insert into public.organization_members (organization_id, user_id, role, is_active)
values
  ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'owner', true),
  ('b2000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'owner', true),
  ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000003', 'viewer', true);

insert into public.vehicles (id, organization_id, code, description)
values
  ('b3000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'RLS-A', 'Vehicle in organization A'),
  ('b3000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000002', 'RLS-B', 'Vehicle in organization B');

insert into public.audit_events (id, organization_id, actor_user_id, action, entity_table, entity_id)
values
  ('b4000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'qa_test', 'vehicles', 'b3000000-0000-4000-8000-000000000001'),
  ('b4000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 'qa_test', 'vehicles', 'b3000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);

select is((select count(*)::int from public.vehicles), 1, 'member sees only vehicles in their organization');
select is((select count(*)::int from public.vehicles where organization_id = 'b2000000-0000-4000-8000-000000000002'), 0, 'member cannot read another organization vehicles');
select throws_ok($$
  insert into public.vehicles (organization_id, code, description)
  values ('b2000000-0000-4000-8000-000000000002', 'RLS-CROSS', 'Cross-tenant insert must fail');
$$, '42501', null, 'member cannot insert into another organization');
select is((select count(*)::int from public.audit_events), 1, 'audit events are visible only within the member organization');
select throws_ok($$
  insert into public.audit_events (organization_id, actor_user_id, action, entity_table)
  values ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'tamper', 'vehicles');
$$, '42501', null, 'authenticated client cannot insert audit events');

select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000003', true);
select is((select count(*)::int from public.vehicles), 1, 'viewer can read vehicles in their organization');
select throws_ok($$
  insert into public.vehicles (organization_id, code, description)
  values ('b2000000-0000-4000-8000-000000000001', 'RLS-VIEWER', 'Viewer write must fail');
$$, '42501', null, 'viewer cannot insert operational records');

select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000002', true);
select is((select count(*)::int from public.audit_events), 1, 'second organization member sees only its own audit events');

select * from finish();
rollback;

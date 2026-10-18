-- Isolated pgTAP regression tests for the fuel authorization guard.
begin;
select plan(20);

insert into public.organizations (id, name)
values ('a1000000-0000-4000-8000-000000000001', 'Fleetwise QA');

insert into public.vehicles (id, organization_id, code, description, status)
values
  ('a2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'QA-01', 'QA vehicle one', 'active'),
  ('a2000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'QA-02', 'QA vehicle two', 'active');

insert into public.drivers (id, organization_id, name, status)
values ('a4000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'QA Driver', 'active');

insert into public.suppliers (id, organization_id, name, supplier_type, status)
values ('a5000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'QA Fuel Station', 'fuel_station', 'active');

insert into public.fuel_authorizations
  (id, organization_id, authorization_code, vehicle_id, valid_from, valid_until, max_liters, max_amount_cents, status)
values
  ('a3000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'QA-OK', 'a2000000-0000-4000-8000-000000000001', '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z', 50, 100000, 'active'),
  ('a3000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'QA-LITERS', 'a2000000-0000-4000-8000-000000000001', '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z', 50, 100000, 'active'),
  ('a3000000-0000-4000-8000-000000000003', 'a1000000-0000-4000-8000-000000000001', 'QA-AMOUNT', 'a2000000-0000-4000-8000-000000000001', '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z', 50, 100000, 'active'),
  ('a3000000-0000-4000-8000-000000000004', 'a1000000-0000-4000-8000-000000000001', 'QA-DATE', 'a2000000-0000-4000-8000-000000000001', '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z', 50, 100000, 'active'),
  ('a3000000-0000-4000-8000-000000000005', 'a1000000-0000-4000-8000-000000000001', 'QA-VEHICLE', 'a2000000-0000-4000-8000-000000000001', '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z', 50, 100000, 'active'),
  ('a3000000-0000-4000-8000-000000000006', 'a1000000-0000-4000-8000-000000000001', 'QA-DRIVER-SUPPLIER', 'a2000000-0000-4000-8000-000000000001', '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z', 50, 100000, 'active'),
  ('a3000000-0000-4000-8000-000000000007', 'a1000000-0000-4000-8000-000000000001', 'QA-INACTIVE', 'a2000000-0000-4000-8000-000000000001', '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z', 50, 100000, 'inactive');

update public.fuel_authorizations
   set driver_id = 'a4000000-0000-4000-8000-000000000001',
       supplier_id = 'a5000000-0000-4000-8000-000000000001'
 where id = 'a3000000-0000-4000-8000-000000000006';

select lives_ok($$
  insert into public.fuel_events
    (organization_id, vehicle_id, authorization_id, occurred_at, meter_value, liters, unit_price_cents, fueling_kind, status)
  values
    ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', '2026-06-01T12:00:00Z', 1000, 40, 1000, 'full', 'active');
$$, 'allows a fueling within authorization limits');

select is(
  (select consumed_liters from public.fuel_authorizations where id = 'a3000000-0000-4000-8000-000000000001'),
  40::numeric,
  'consumed liters counter refreshes after a successful fueling'
);

select is(
  (select consumed_amount_cents from public.fuel_authorizations where id = 'a3000000-0000-4000-8000-000000000001'),
  40000::bigint,
  'consumed amount counter refreshes after a successful fueling'
);

select throws_ok($$
  insert into public.fuel_events
    (organization_id, vehicle_id, authorization_id, occurred_at, meter_value, liters, unit_price_cents, fueling_kind, status)
  values
    ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000002', '2026-06-01T12:00:00Z', 1000, 51, 1000, 'full', 'active');
$$, '23514', null, 'rejects a fueling that exceeds the liters limit');

select throws_ok($$
  insert into public.fuel_events
    (organization_id, vehicle_id, authorization_id, occurred_at, meter_value, liters, unit_price_cents, fueling_kind, status)
  values
    ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000003', '2026-06-01T12:00:00Z', 1000, 10, 10001, 'full', 'active');
$$, '23514', null, 'rejects a fueling that exceeds the amount limit');

select throws_ok($$
  insert into public.fuel_events
    (organization_id, vehicle_id, authorization_id, occurred_at, meter_value, liters, unit_price_cents, fueling_kind, status)
  values
    ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000004', '2026-06-01T12:00:00Z', 1000, 10, 1000, 'full', 'active');
$$, '23514', null, 'rejects a fueling outside the authorization validity window');

select throws_ok($$
  insert into public.fuel_events
    (organization_id, vehicle_id, authorization_id, occurred_at, meter_value, liters, unit_price_cents, fueling_kind, status)
  values
    ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000002', 'a3000000-0000-4000-8000-000000000005', '2026-06-01T12:00:00Z', 1000, 10, 1000, 'full', 'active');
$$, '23514', null, 'rejects a vehicle that does not match the authorization');

select lives_ok($$
  update public.fuel_events
     set status = 'cancelled'
   where authorization_id = 'a3000000-0000-4000-8000-000000000001';
$$, 'cancelling a fueling is allowed and releases the authorization consumption');

select is(
  (select consumed_liters from public.fuel_authorizations where id = 'a3000000-0000-4000-8000-000000000001'),
  0::numeric,
  'cancelled fueling is removed from consumed liters');

select is(
  (select consumed_amount_cents from public.fuel_authorizations where id = 'a3000000-0000-4000-8000-000000000001'),
  0::bigint,
  'cancelled fueling is removed from consumed amount');


select lives_ok($$
  insert into public.fuel_events
    (organization_id, vehicle_id, authorization_id, occurred_at, meter_value, liters, unit_price_cents, fueling_kind, status)
  values
    ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', '2026-06-02T12:00:00Z', 1040, 50, 1000, 'full', 'active');
$$, 'authorization capacity can be reused after cancelling the prior fueling');

select throws_ok($qa$
  insert into public.fuel_events
    (organization_id, vehicle_id, driver_id, supplier_id, authorization_id, occurred_at, meter_value, liters, unit_price_cents, fueling_kind, status)
  values
    ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', null, 'a5000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000006', '2026-06-01T12:00:00Z', 1000, 10, 1000, 'full', 'active');
$qa$, '23514', null, 'rejects a driver that does not match the authorization');

select throws_ok($qa$
  insert into public.fuel_events
    (organization_id, vehicle_id, driver_id, supplier_id, authorization_id, occurred_at, meter_value, liters, unit_price_cents, fueling_kind, status)
  values
    ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000001', null, 'a3000000-0000-4000-8000-000000000006', '2026-06-01T12:00:00Z', 1000, 10, 1000, 'full', 'active');
$qa$, '23514', null, 'rejects a supplier that does not match the authorization');

select throws_ok($qa$
  insert into public.fuel_events
    (organization_id, vehicle_id, authorization_id, occurred_at, meter_value, liters, unit_price_cents, fueling_kind, status)
  values
    ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000007', '2026-06-01T12:00:00Z', 1000, 10, 1000, 'full', 'active');
$qa$, '23514', null, 'rejects a fueling against an inactive authorization');

select lives_ok($qa$
  update public.fuel_events
     set authorization_id = null
   where authorization_id = 'a3000000-0000-4000-8000-000000000001'
     and status = 'active';
$qa$, 'detaching an authorization from a fueling is allowed');

select is(
  (select consumed_liters from public.fuel_authorizations where id = 'a3000000-0000-4000-8000-000000000001'),
  0::numeric,
  'detaching a fueling releases the prior authorization consumption');

select lives_ok($qa$
  insert into public.fuel_events
    (organization_id, vehicle_id, authorization_id, occurred_at, meter_value, liters, unit_price_cents, fueling_kind, status)
  values
    ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', '2026-06-03T12:00:00Z', 1090, 20, 1000, 'full', 'inactive');
$qa$, 'inactive fueling records do not consume authorization capacity');

select is(
  (select consumed_liters from public.fuel_authorizations where id = 'a3000000-0000-4000-8000-000000000001'),
  0::numeric,
  'inactive fueling does not increase consumed liters');

select lives_ok($qa$
  insert into public.fuel_events
    (organization_id, vehicle_id, authorization_id, occurred_at, meter_value, liters, unit_price_cents, fueling_kind, status)
  values
    ('a1000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001', 'a3000000-0000-4000-8000-000000000001', '2026-06-04T12:00:00Z', 1090, 40, 1000, 'full', 'active');
$qa$, 'active fueling can use the remaining authorization capacity');

select throws_ok($qa$
  update public.fuel_events
     set status = 'active'
   where organization_id = 'a1000000-0000-4000-8000-000000000001'
     and authorization_id = 'a3000000-0000-4000-8000-000000000001'
     and status = 'inactive';
$qa$, '23514', null, 'reactivating an inactive fueling cannot exceed the authorization limit');

select * from finish();
rollback;

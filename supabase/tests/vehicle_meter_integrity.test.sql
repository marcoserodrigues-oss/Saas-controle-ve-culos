-- Regression tests for the shared vehicle meter baseline and tire layout catalogue.
begin;
select plan(6);

insert into public.organizations (id, name)
values ('b1000000-0000-4000-8000-000000000001', 'Meter integrity QA');

insert into public.vehicles (id, organization_id, code, description, kind, meter_kind, initial_meter, status)
values ('b2000000-0000-4000-8000-000000000001',
        'b1000000-0000-4000-8000-000000000001',
        'METER-QA-01', 'Meter QA truck', 'vehicle', 'odometer', 1000, 'active');

select lives_ok($$
  insert into public.fuel_events
    (organization_id, vehicle_id, occurred_at, meter_value, liters, unit_price_cents, fueling_kind, status)
  values
    ('b1000000-0000-4000-8000-000000000001',
     'b2000000-0000-4000-8000-000000000001',
     '2026-10-19T10:00:00Z', 1200, 40, 1000, 'full', 'active');
$$, 'accepts a reading greater than the initial meter');

select throws_ok($$
  insert into public.fuel_events
    (organization_id, vehicle_id, occurred_at, meter_value, liters, unit_price_cents, fueling_kind, status)
  values
    ('b1000000-0000-4000-8000-000000000001',
     'b2000000-0000-4000-8000-000000000001',
     '2026-10-19T10:01:00Z', 1100, 40, 1000, 'full', 'active');
$$, '23514', null, 'rejects a fueling reading lower than a prior reading');

select lives_ok($$
  insert into public.work_orders
    (organization_id, vehicle_id, order_number, category, description, opened_at, meter_at_open, status)
  values
    ('b1000000-0000-4000-8000-000000000001',
     'b2000000-0000-4000-8000-000000000001',
     'METER-QA-OS-001', 'preventive', 'Meter validation test', '2026-10-19T10:02:00Z', 1300, 'open');
$$, 'accepts a maintenance reading greater than a fueling reading');

select throws_ok($$
  insert into public.fuel_events
    (organization_id, vehicle_id, occurred_at, meter_value, liters, unit_price_cents, fueling_kind, status)
  values
    ('b1000000-0000-4000-8000-000000000001',
     'b2000000-0000-4000-8000-000000000001',
     '2026-10-19T10:03:00Z', 1250, 40, 1000, 'full', 'active');
$$, '23514', null, 'rejects a fueling reading lower than a maintenance reading');

select throws_ok($$
  insert into public.work_orders
    (organization_id, vehicle_id, order_number, category, description, opened_at, meter_at_open, meter_at_close, status)
  values
    ('b1000000-0000-4000-8000-000000000001',
     'b2000000-0000-4000-8000-000000000001',
     'METER-QA-OS-002', 'preventive', 'Closing meter validation test', '2026-10-19T10:04:00Z', 1400, 1350, 'closed');
$$, '23514', null, 'rejects a work order closing reading lower than its opening reading');

select is(
  (select jsonb_array_length(layout) from public.tire_layout_templates where code='truck-6x2'),
  10,
  'the truck 6x2 layout contains all ten tire positions'
);

select * from finish();
rollback;

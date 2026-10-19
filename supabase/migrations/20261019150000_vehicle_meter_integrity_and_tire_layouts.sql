-- Fleetwise: shared meter baseline, monotonic readings, and complete tire layout templates.
-- Existing assets are backfilled from the earliest known operational reading; new assets must
-- provide an explicit baseline in the application form.

alter table public.vehicles
  add column if not exists initial_meter numeric;

with readings as (
  select organization_id, vehicle_id, meter_value as meter, occurred_at as at from public.fuel_events where status <> 'cancelled'
  union all
  select organization_id, vehicle_id, meter_at_open, opened_at from public.work_orders where meter_at_open is not null
  union all
  select organization_id, vehicle_id, meter_at_close, coalesce(closed_at, opened_at) from public.work_orders where meter_at_close is not null
  union all
  select organization_id, vehicle_id, meter_value, occurred_at from public.tire_events where vehicle_id is not null and meter_value is not null
), first_reading as (
  select distinct on (organization_id, vehicle_id) organization_id, vehicle_id, meter
  from readings
  order by organization_id, vehicle_id, at asc, meter asc
)
update public.vehicles v
set initial_meter = coalesce(fr.meter, 0)
from (select v2.id, fr.meter from public.vehicles v2 left join first_reading fr on fr.organization_id=v2.organization_id and fr.vehicle_id=v2.id) backfill
left join first_reading fr on fr.vehicle_id=backfill.id
where v.id=backfill.id and v.initial_meter is null;

alter table public.vehicles alter column initial_meter set default 0;
alter table public.vehicles alter column initial_meter set not null;
alter table public.vehicles add constraint vehicles_initial_meter_nonnegative check (initial_meter >= 0);

create or replace function public.validate_vehicle_meter_monotonic()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_vehicle uuid;
  v_initial numeric;
  v_latest numeric;
  v_reading numeric;
  v_open numeric;
  v_close numeric;
begin
  if tg_table_name = 'fuel_events' then
    if tg_op = 'UPDATE' and new.vehicle_id is not distinct from old.vehicle_id and new.meter_value is not distinct from old.meter_value then return new; end if;
    if new.status = 'cancelled' then return new; end if;
    v_org := new.organization_id; v_vehicle := new.vehicle_id; v_reading := new.meter_value;
  elsif tg_table_name = 'tire_events' then
    if tg_op = 'UPDATE' and new.vehicle_id is not distinct from old.vehicle_id and new.meter_value is not distinct from old.meter_value then return new; end if;
    if new.vehicle_id is null or new.meter_value is null then return new; end if;
    v_org := new.organization_id; v_vehicle := new.vehicle_id; v_reading := new.meter_value;
  elsif tg_table_name = 'work_orders' then
    if tg_op = 'UPDATE' and new.vehicle_id is not distinct from old.vehicle_id and new.meter_at_open is not distinct from old.meter_at_open and new.meter_at_close is not distinct from old.meter_at_close then return new; end if;
    v_org := new.organization_id; v_vehicle := new.vehicle_id; v_open := new.meter_at_open; v_close := new.meter_at_close;
  else
    return new;
  end if;

  -- Serialize readings per vehicle to avoid two concurrent modules accepting conflicting values.
  select initial_meter into v_initial
  from public.vehicles
  where id = v_vehicle and organization_id = v_org
  for update;

  if not found then
    raise exception 'Veículo/equipamento não encontrado para validar a leitura.' using errcode = '23503';
  end if;

  select max(meter) into v_latest from (
    select f.meter_value as meter
    from public.fuel_events f
    where f.organization_id=v_org and f.vehicle_id=v_vehicle and f.status <> 'cancelled'
      and (tg_table_name <> 'fuel_events' or f.id <> new.id)
    union all
    select w.meter_at_open from public.work_orders w
    where w.organization_id=v_org and w.vehicle_id=v_vehicle and w.meter_at_open is not null
      and (tg_table_name <> 'work_orders' or w.id <> new.id)
    union all
    select w.meter_at_close from public.work_orders w
    where w.organization_id=v_org and w.vehicle_id=v_vehicle and w.meter_at_close is not null
      and (tg_table_name <> 'work_orders' or w.id <> new.id)
    union all
    select t.meter_value from public.tire_events t
    where t.organization_id=v_org and t.vehicle_id=v_vehicle and t.meter_value is not null
      and (tg_table_name <> 'tire_events' or t.id <> new.id)
  ) all_readings;

  v_latest := greatest(coalesce(v_latest, v_initial), v_initial);

  if tg_table_name = 'work_orders' then
    if v_open is not null and v_open < v_latest then
      raise exception 'Leitura de abertura (%) inferior à última leitura válida do veículo (%).', v_open, v_latest using errcode = '23514';
    end if;
    if v_close is not null and v_close < greatest(v_latest, coalesce(v_open, v_initial)) then
      raise exception 'Leitura de fechamento (%) inferior à última leitura válida ou à abertura (%).', v_close, greatest(v_latest, coalesce(v_open, v_initial)) using errcode = '23514';
    end if;
  elsif v_reading is not null and v_reading < v_latest then
    raise exception 'Leitura (%) inferior à última leitura válida do veículo (%).', v_reading, v_latest using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_fuel_event_meter on public.fuel_events;
create trigger validate_fuel_event_meter before insert or update of vehicle_id, meter_value, status on public.fuel_events
for each row execute function public.validate_vehicle_meter_monotonic();

drop trigger if exists validate_work_order_meter on public.work_orders;
create trigger validate_work_order_meter before insert or update of vehicle_id, meter_at_open, meter_at_close on public.work_orders
for each row execute function public.validate_vehicle_meter_monotonic();

drop trigger if exists validate_tire_event_meter on public.tire_events;
create trigger validate_tire_event_meter before insert or update of vehicle_id, meter_value on public.tire_events
for each row execute function public.validate_vehicle_meter_monotonic();

-- Restore complete position maps for the built-in templates; coordinates use a 0..100 canvas.
update public.tire_layout_templates
set layout = '[{"code":"F1","label":"Dianteiro esquerdo","axle":1,"side":"left","slot":"outer","x":30,"y":18},{"code":"F2","label":"Dianteiro direito","axle":1,"side":"right","slot":"outer","x":70,"y":18},{"code":"D1E","label":"Tração eixo 1 externo esquerdo","axle":2,"side":"left","slot":"outer","x":20,"y":48},{"code":"D1I","label":"Tração eixo 1 interno esquerdo","axle":2,"side":"left","slot":"inner","x":34,"y":48},{"code":"D2I","label":"Tração eixo 1 interno direito","axle":2,"side":"right","slot":"inner","x":66,"y":48},{"code":"D2E","label":"Tração eixo 1 externo direito","axle":2,"side":"right","slot":"outer","x":80,"y":48},{"code":"T1E","label":"Traseiro eixo 3 externo esquerdo","axle":3,"side":"left","slot":"outer","x":20,"y":78},{"code":"T1I","label":"Traseiro eixo 3 interno esquerdo","axle":3,"side":"left","slot":"inner","x":34,"y":78},{"code":"T2I","label":"Traseiro eixo 3 interno direito","axle":3,"side":"right","slot":"inner","x":66,"y":78},{"code":"T2E","label":"Traseiro eixo 3 externo direito","axle":3,"side":"right","slot":"outer","x":80,"y":78}]'::jsonb
where code='truck-6x2' and (layout is null or jsonb_array_length(layout)=0);

update public.tire_layout_templates
set layout = '[{"code":"F1","label":"Dianteiro esquerdo","axle":1,"side":"left","slot":"outer","x":30,"y":18},{"code":"F2","label":"Dianteiro direito","axle":1,"side":"right","slot":"outer","x":70,"y":18},{"code":"D1E","label":"Tração eixo 1 externo esquerdo","axle":2,"side":"left","slot":"outer","x":20,"y":45},{"code":"D1I","label":"Tração eixo 1 interno esquerdo","axle":2,"side":"left","slot":"inner","x":34,"y":45},{"code":"D2I","label":"Tração eixo 1 interno direito","axle":2,"side":"right","slot":"inner","x":66,"y":45},{"code":"D2E","label":"Tração eixo 1 externo direito","axle":2,"side":"right","slot":"outer","x":80,"y":45}]'::jsonb
where code='tractor-4x2' and (layout is null or jsonb_array_length(layout)=0);

update public.tire_layout_templates
set layout = '[{"code":"A1E","label":"Eixo 1 externo esquerdo","axle":1,"side":"left","slot":"outer","x":20,"y":25},{"code":"A1I","label":"Eixo 1 interno esquerdo","axle":1,"side":"left","slot":"inner","x":34,"y":25},{"code":"A2I","label":"Eixo 1 interno direito","axle":1,"side":"right","slot":"inner","x":66,"y":25},{"code":"A2E","label":"Eixo 1 externo direito","axle":1,"side":"right","slot":"outer","x":80,"y":25},{"code":"B1E","label":"Eixo 2 externo esquerdo","axle":2,"side":"left","slot":"outer","x":20,"y":50},{"code":"B1I","label":"Eixo 2 interno esquerdo","axle":2,"side":"left","slot":"inner","x":34,"y":50},{"code":"B2I","label":"Eixo 2 interno direito","axle":2,"side":"right","slot":"inner","x":66,"y":50},{"code":"B2E","label":"Eixo 2 externo direito","axle":2,"side":"right","slot":"outer","x":80,"y":50},{"code":"C1E","label":"Eixo 3 externo esquerdo","axle":3,"side":"left","slot":"outer","x":20,"y":75},{"code":"C1I","label":"Eixo 3 interno esquerdo","axle":3,"side":"left","slot":"inner","x":34,"y":75},{"code":"C2I","label":"Eixo 3 interno direito","axle":3,"side":"right","slot":"inner","x":66,"y":75},{"code":"C2E","label":"Eixo 3 externo direito","axle":3,"side":"right","slot":"outer","x":80,"y":75}]'::jsonb
where code='trailer-3axle' and (layout is null or jsonb_array_length(layout)=0);

update public.tire_layout_templates
set layout = '[{"code":"F1","label":"Dianteiro esquerdo","axle":1,"side":"left","slot":"outer","x":30,"y":25},{"code":"F2","label":"Dianteiro direito","axle":1,"side":"right","slot":"outer","x":70,"y":25},{"code":"R1","label":"Traseiro esquerdo","axle":2,"side":"left","slot":"outer","x":30,"y":70},{"code":"R2","label":"Traseiro direito","axle":2,"side":"right","slot":"outer","x":70,"y":70}]'::jsonb
where code='car-4-tires' and (layout is null or jsonb_array_length(layout)=0);

update public.tire_layout_templates
set layout = '[{"code":"F1","label":"Dianteiro esquerdo","axle":1,"side":"left","slot":"outer","x":30,"y":25},{"code":"F2","label":"Dianteiro direito","axle":1,"side":"right","slot":"outer","x":70,"y":25},{"code":"R1","label":"Traseiro esquerdo","axle":2,"side":"left","slot":"outer","x":30,"y":70},{"code":"R2","label":"Traseiro direito","axle":2,"side":"right","slot":"outer","x":70,"y":70}]'::jsonb
where code='pickup-4-tires' and (layout is null or jsonb_array_length(layout)=0);

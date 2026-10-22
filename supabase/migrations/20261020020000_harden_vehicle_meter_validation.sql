-- Harden vehicle odometer/hourmeter integrity across fuel, maintenance and tire events.
-- This migration is versioned on the development branch only. Do not apply to production
-- until QA integration tests and an explicit release approval are complete.

create or replace function public.validate_vehicle_meter_monotonic()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
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
    if new.status = 'cancelled' then
      return new;
    end if;

    if tg_op = 'UPDATE'
       and new.organization_id is not distinct from old.organization_id
       and new.vehicle_id is not distinct from old.vehicle_id
       and new.meter_value is not distinct from old.meter_value
       and new.status is not distinct from old.status then
      return new;
    end if;

    v_org := new.organization_id;
    v_vehicle := new.vehicle_id;
    v_reading := new.meter_value;

  elsif tg_table_name = 'tire_events' then
    if tg_op = 'UPDATE'
       and new.organization_id is not distinct from old.organization_id
       and new.vehicle_id is not distinct from old.vehicle_id
       and new.meter_value is not distinct from old.meter_value then
      return new;
    end if;

    if new.vehicle_id is null then
      return new;
    end if;

    if new.meter_value is null then
      raise exception 'Informe a leitura do hodômetro/horímetro para eventos de pneus vinculados a um veículo.'
        using errcode = '23514';
    end if;

    v_org := new.organization_id;
    v_vehicle := new.vehicle_id;
    v_reading := new.meter_value;

  elsif tg_table_name = 'work_orders' then
    if new.status = 'cancelled' then
      return new;
    end if;

    if tg_op = 'UPDATE'
       and new.organization_id is not distinct from old.organization_id
       and new.vehicle_id is not distinct from old.vehicle_id
       and new.meter_at_open is not distinct from old.meter_at_open
       and new.meter_at_close is not distinct from old.meter_at_close
       and new.status is not distinct from old.status then
      return new;
    end if;

    v_org := new.organization_id;
    v_vehicle := new.vehicle_id;
    v_open := new.meter_at_open;
    v_close := new.meter_at_close;
  else
    return new;
  end if;

  -- Serialize meter writes for this vehicle to prevent concurrent conflicting readings.
  select v.initial_meter
    into v_initial
    from public.vehicles v
   where v.id = v_vehicle
     and v.organization_id = v_org
   for update;

  if not found then
    raise exception 'Veículo/equipamento não encontrado para validar a leitura.'
      using errcode = '23503';
  end if;

  select max(meter)
    into v_latest
    from (
      select f.meter_value as meter
        from public.fuel_events f
       where f.organization_id = v_org
         and f.vehicle_id = v_vehicle
         and f.status <> 'cancelled'
         and (tg_table_name <> 'fuel_events' or f.id <> new.id)

      union all

      select w.meter_at_open as meter
        from public.work_orders w
       where w.organization_id = v_org
         and w.vehicle_id = v_vehicle
         and w.status <> 'cancelled'
         and w.meter_at_open is not null
         and (tg_table_name <> 'work_orders' or w.id <> new.id)

      union all

      select w.meter_at_close as meter
        from public.work_orders w
       where w.organization_id = v_org
         and w.vehicle_id = v_vehicle
         and w.status <> 'cancelled'
         and w.meter_at_close is not null
         and (tg_table_name <> 'work_orders' or w.id <> new.id)

      union all

      select t.meter_value as meter
        from public.tire_events t
       where t.organization_id = v_org
         and t.vehicle_id = v_vehicle
         and t.meter_value is not null
         and (tg_table_name <> 'tire_events' or t.id <> new.id)
    ) all_readings;

  v_latest := greatest(coalesce(v_latest, v_initial), v_initial);

  if tg_table_name = 'work_orders' then
    if v_open is not null and v_open < v_latest then
      raise exception 'Leitura de abertura (%) inferior à última leitura válida do veículo (%).',
        v_open, v_latest using errcode = '23514';
    end if;

    if v_close is not null
       and v_close < greatest(v_latest, coalesce(v_open, v_initial)) then
      raise exception 'Leitura de fechamento (%) inferior à última leitura válida ou à abertura (%).',
        v_close, greatest(v_latest, coalesce(v_open, v_initial))
        using errcode = '23514';
    end if;
  elsif v_reading is not null and v_reading < v_latest then
    raise exception 'Leitura (%) inferior à última leitura válida do veículo (%).',
      v_reading, v_latest using errcode = '23514';
  end if;

  return new;
end;
$function$;

create or replace function public.validate_vehicle_meter_baseline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_min numeric;
  v_has_history boolean;
begin
  if tg_op = 'UPDATE' and new.meter_kind is distinct from old.meter_kind then
    select exists (
      select 1
        from public.fuel_events f
       where f.organization_id = new.organization_id
         and f.vehicle_id = new.id
         and f.status <> 'cancelled'
      union all
      select 1
        from public.work_orders w
       where w.organization_id = new.organization_id
         and w.vehicle_id = new.id
         and w.status <> 'cancelled'
      union all
      select 1
        from public.tire_events t
       where t.organization_id = new.organization_id
         and t.vehicle_id = new.id
    ) into v_has_history;

    if v_has_history then
      raise exception 'Não é possível alterar o tipo de medidor depois que o ativo possui histórico operacional.'
        using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.initial_meter is distinct from old.initial_meter then
    select min(meter)
      into v_min
      from (
        select f.meter_value as meter
          from public.fuel_events f
         where f.organization_id = new.organization_id
           and f.vehicle_id = new.id
           and f.status <> 'cancelled'
        union all
        select w.meter_at_open as meter
          from public.work_orders w
         where w.organization_id = new.organization_id
           and w.vehicle_id = new.id
           and w.status <> 'cancelled'
           and w.meter_at_open is not null
        union all
        select w.meter_at_close as meter
          from public.work_orders w
         where w.organization_id = new.organization_id
           and w.vehicle_id = new.id
           and w.status <> 'cancelled'
           and w.meter_at_close is not null
        union all
        select t.meter_value as meter
          from public.tire_events t
         where t.organization_id = new.organization_id
           and t.vehicle_id = new.id
           and t.meter_value is not null
      ) history;

    if v_min is not null and new.initial_meter > v_min then
      raise exception 'A leitura inicial (%) não pode ser maior que a primeira leitura registrada (%).',
        new.initial_meter, v_min using errcode = '23514';
    end if;
  end if;

  return new;
end;
$function$;

drop trigger if exists validate_vehicle_meter_baseline on public.vehicles;
create trigger validate_vehicle_meter_baseline
before update of initial_meter, meter_kind on public.vehicles
for each row execute function public.validate_vehicle_meter_baseline();

-- Trigger functions are invoked by PostgreSQL triggers; they should not be exposed as RPCs.
revoke all on function public.validate_vehicle_meter_monotonic() from public, anon, authenticated;
revoke all on function public.validate_vehicle_meter_baseline() from public, anon, authenticated;

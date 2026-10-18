-- Enforce fuel authorization limits atomically in PostgreSQL, not only in the UI.
-- Locking the authorization row serializes concurrent settlements for the same authorization.
create or replace function public.enforce_fuel_authorization_limits()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_authorization public.fuel_authorizations%rowtype;
  v_exclude_id uuid;
  v_consumed_liters numeric(18,3);
  v_consumed_amount_cents bigint;
  v_new_amount_cents bigint;
begin
  if new.authorization_id is null or new.status = 'cancelled' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    v_exclude_id := old.id;
  end if;

  select *
    into v_authorization
    from public.fuel_authorizations
   where id = new.authorization_id
     and organization_id = new.organization_id
   for update;

  if not found then
    raise exception 'Autorização de combustível não encontrada nesta organização.'
      using errcode = '23503';
  end if;

  if v_authorization.status <> 'active' then
    raise exception 'A autorização não está ativa.'
      using errcode = '23514';
  end if;

  if new.occurred_at < v_authorization.valid_from
     or new.occurred_at > v_authorization.valid_until then
    raise exception 'Data do abastecimento fora da validade da autorização.'
      using errcode = '23514';
  end if;

  if new.vehicle_id <> v_authorization.vehicle_id
     or (v_authorization.driver_id is not null and new.driver_id is distinct from v_authorization.driver_id)
     or (v_authorization.supplier_id is not null and new.supplier_id is distinct from v_authorization.supplier_id) then
    raise exception 'Veículo, motorista ou fornecedor não corresponde à autorização.'
      using errcode = '23514';
  end if;

  select coalesce(sum(fe.liters), 0),
         coalesce(sum(coalesce(fe.total_cents, round(fe.liters * fe.unit_price_cents)::bigint)), 0)::bigint
    into v_consumed_liters, v_consumed_amount_cents
    from public.fuel_events fe
   where fe.organization_id = new.organization_id
     and fe.authorization_id = new.authorization_id
     and fe.status <> 'cancelled'
     and (v_exclude_id is null or fe.id <> v_exclude_id);

  v_new_amount_cents := round(new.liters * new.unit_price_cents)::bigint;

  if v_authorization.max_liters is not null
     and v_consumed_liters + new.liters > v_authorization.max_liters + 0.0005 then
    raise exception 'Abastecimento excede o limite de litros autorizado (% L).', v_authorization.max_liters
      using errcode = '23514';
  end if;

  if v_authorization.max_amount_cents is not null
     and v_consumed_amount_cents + v_new_amount_cents > v_authorization.max_amount_cents then
    raise exception 'Abastecimento excede o valor autorizado (% centavos).', v_authorization.max_amount_cents
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_fuel_authorization_limits() from public, anon, authenticated;

drop trigger if exists fuel_events_enforce_authorization_limits on public.fuel_events;
create trigger fuel_events_enforce_authorization_limits
before insert or update of organization_id, vehicle_id, driver_id, supplier_id, authorization_id, occurred_at, liters, unit_price_cents, status
on public.fuel_events
for each row
execute function public.enforce_fuel_authorization_limits();

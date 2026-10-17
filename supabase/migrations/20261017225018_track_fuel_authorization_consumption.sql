-- Keep authorization consumption totals in sync with non-cancelled fuel events.
-- The return-slip workflow links the actual fueling record through fuel_events.authorization_id.
create index if not exists fuel_events_authorization_consumption_idx
  on public.fuel_events (organization_id, authorization_id)
  where authorization_id is not null and status <> 'cancelled';

create or replace function public.refresh_fuel_authorization_consumption(p_authorization_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_authorization_id is null then
    return;
  end if;

  update public.fuel_authorizations as fa
  set consumed_liters = coalesce((
        select sum(fe.liters)
        from public.fuel_events as fe
        where fe.organization_id = fa.organization_id
          and fe.authorization_id = fa.id
          and fe.status <> 'cancelled'
      ), 0),
      consumed_amount_cents = coalesce((
        select sum(coalesce(fe.total_cents, round(fe.liters * fe.unit_price_cents)::bigint))
        from public.fuel_events as fe
        where fe.organization_id = fa.organization_id
          and fe.authorization_id = fa.id
          and fe.status <> 'cancelled'
      ), 0)
  where fa.id = p_authorization_id;
end;
$$;

create or replace function public.sync_fuel_authorization_consumption()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_old_authorization_id uuid;
  v_new_authorization_id uuid;
begin
  if tg_op <> 'INSERT' then
    v_old_authorization_id := old.authorization_id;
  end if;

  if tg_op <> 'DELETE' then
    v_new_authorization_id := new.authorization_id;
  end if;

  if v_old_authorization_id is not null
     and v_old_authorization_id is distinct from v_new_authorization_id then
    perform public.refresh_fuel_authorization_consumption(v_old_authorization_id);
  end if;

  if v_new_authorization_id is not null then
    perform public.refresh_fuel_authorization_consumption(v_new_authorization_id);
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.refresh_fuel_authorization_consumption(uuid) from public, anon, authenticated;
revoke all on function public.sync_fuel_authorization_consumption() from public, anon, authenticated;

drop trigger if exists fuel_events_sync_authorization_consumption on public.fuel_events;
create trigger fuel_events_sync_authorization_consumption
after insert or update or delete on public.fuel_events
for each row execute function public.sync_fuel_authorization_consumption();

-- Repair any totals that may predate this trigger.
update public.fuel_authorizations as fa
set consumed_liters = coalesce((
      select sum(fe.liters)
      from public.fuel_events as fe
      where fe.organization_id = fa.organization_id
        and fe.authorization_id = fa.id
        and fe.status <> 'cancelled'
    ), 0),
    consumed_amount_cents = coalesce((
      select sum(coalesce(fe.total_cents, round(fe.liters * fe.unit_price_cents)::bigint))
      from public.fuel_events as fe
      where fe.organization_id = fa.organization_id
        and fe.authorization_id = fa.id
        and fe.status <> 'cancelled'
    ), 0);

create or replace function public.send_tire_to_retread(
  p_tire_id uuid,
  p_vehicle_id uuid,
  p_meter_value numeric,
  p_occurred_at timestamptz,
  p_dismount_cost_cents bigint,
  p_retread_estimate_cents bigint,
  p_supplier_id uuid default null,
  p_reason text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_tire public.tires%rowtype;
  v_source record;
  v_dismount_event_id uuid;
  v_retread_event_id uuid;
  v_reason text;
begin
  if p_occurred_at is null or p_occurred_at > now() + interval '1 minute' then
    raise exception 'Data do envio inválida.' using errcode = '22007';
  end if;
  if p_meter_value is null or p_meter_value < 0 then
    raise exception 'Informe uma leitura válida do hodômetro/horímetro.' using errcode = '22003';
  end if;
  if coalesce(p_dismount_cost_cents, -1) < 0 or coalesce(p_retread_estimate_cents, -1) < 0 then
    raise exception 'Os custos não podem ser negativos.' using errcode = '22003';
  end if;

  select * into v_tire
  from public.tires
  where id = p_tire_id
  for update;

  if not found then
    raise exception 'Pneu não encontrado.' using errcode = 'P0002';
  end if;
  if not private.has_org_role(v_tire.organization_id, array['owner','admin','manager','operator']::public.membership_role[]) then
    raise exception 'Você não tem permissão para movimentar pneus nesta organização.' using errcode = '42501';
  end if;
  if v_tire.status <> 'mounted' then
    raise exception 'O envio direto exige que o pneu esteja montado. Atualize o inventário e tente novamente.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.vehicles
    where id = p_vehicle_id and organization_id = v_tire.organization_id
  ) then
    raise exception 'Veículo/equipamento não pertence à organização do pneu.' using errcode = '23503';
  end if;
  if p_supplier_id is not null and not exists (
    select 1 from public.suppliers
    where id = p_supplier_id and organization_id = v_tire.organization_id
  ) then
    raise exception 'A recapadora selecionada não pertence à organização.' using errcode = '23503';
  end if;

  select e.vehicle_id, e.position_id, e.occurred_at
    into v_source
  from public.tire_events e
  where e.organization_id = v_tire.organization_id
    and e.tire_id = v_tire.id
    and e.event_type in ('mount','rotation','transfer')
  order by e.occurred_at desc, e.created_at desc, e.id desc
  limit 1;

  if v_source.position_id is null then
    raise exception 'Não foi possível identificar a posição atual do pneu.' using errcode = '23503';
  end if;
  if v_source.vehicle_id is distinct from p_vehicle_id then
    raise exception 'A leitura precisa pertencer ao veículo onde o pneu está montado.' using errcode = '22023';
  end if;
  if p_occurred_at < v_source.occurred_at then
    raise exception 'A data do envio não pode ser anterior à montagem atual.' using errcode = '22007';
  end if;

  v_reason := coalesce(nullif(trim(p_reason), ''), 'Envio para recapagem pelo layout visual');

  insert into public.tire_events (
    organization_id, tire_id, vehicle_id, position_id, event_type,
    occurred_at, meter_value, cost_cents, supplier_id, reason, notes, created_by
  ) values (
    v_tire.organization_id, v_tire.id, v_source.vehicle_id, v_source.position_id, 'dismount',
    p_occurred_at, p_meter_value, p_dismount_cost_cents, p_supplier_id,
    'Desmontagem para envio à recapagem', p_notes, (select auth.uid())
  ) returning id into v_dismount_event_id;

  insert into public.tire_events (
    organization_id, tire_id, vehicle_id, position_id, event_type,
    occurred_at, meter_value, cost_cents, supplier_id, related_tire_event_id,
    reason, notes, created_by
  ) values (
    v_tire.organization_id, v_tire.id, p_vehicle_id, null, 'retread_sent',
    p_occurred_at, p_meter_value, p_retread_estimate_cents, p_supplier_id, v_dismount_event_id,
    v_reason, p_notes, (select auth.uid())
  ) returning id into v_retread_event_id;

  update public.tire_events
  set related_tire_event_id = v_retread_event_id
  where id = v_dismount_event_id and organization_id = v_tire.organization_id;

  update public.tires
  set status = 'retread', updated_at = now()
  where id = v_tire.id and organization_id = v_tire.organization_id;

  return jsonb_build_object(
    'success', true,
    'tire_id', v_tire.id,
    'dismount_event_id', v_dismount_event_id,
    'retread_event_id', v_retread_event_id,
    'status', 'retread'
  );
end;
$$;

revoke all on function public.send_tire_to_retread(uuid, uuid, numeric, timestamptz, bigint, bigint, uuid, text, text) from public;
grant execute on function public.send_tire_to_retread(uuid, uuid, numeric, timestamptz, bigint, bigint, uuid, text, text) to authenticated;

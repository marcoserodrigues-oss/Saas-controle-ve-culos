-- Visual tire layout catalog and atomic mount/rotation/swap workflow.
create table if not exists public.tire_layout_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  asset_kind public.asset_kind not null default 'vehicle',
  diagram_type text not null default 'truck' check (diagram_type in ('truck','tractor','trailer','bus','equipment')),
  axle_count integer not null check (axle_count > 0 and axle_count <= 12),
  tire_count integer not null check (tire_count > 0 and tire_count <= 64),
  description text,
  layout jsonb not null default '[]'::jsonb check (jsonb_typeof(layout) = 'array'),
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);
create unique index if not exists tire_layout_templates_system_code_key
  on public.tire_layout_templates(code) where organization_id is null;
create unique index if not exists tire_layout_templates_org_code_key
  on public.tire_layout_templates(organization_id, code) where organization_id is not null;
create index if not exists tire_layout_templates_active_idx
  on public.tire_layout_templates(is_active, asset_kind, name);

alter table public.vehicles
  add column if not exists tire_layout_template_id uuid
  references public.tire_layout_templates(id) on delete set null;

alter table public.tire_layout_templates enable row level security;
drop policy if exists tire_layout_templates_select_available on public.tire_layout_templates;
create policy tire_layout_templates_select_available
  on public.tire_layout_templates for select to authenticated
  using (organization_id is null or private.is_org_member(organization_id));
drop policy if exists tire_layout_templates_insert_org_admins on public.tire_layout_templates;
create policy tire_layout_templates_insert_org_admins
  on public.tire_layout_templates for insert to authenticated
  with check (organization_id is not null and private.has_org_role(organization_id, array['owner','admin','manager']::public.membership_role[]));
drop policy if exists tire_layout_templates_update_org_admins on public.tire_layout_templates;
create policy tire_layout_templates_update_org_admins
  on public.tire_layout_templates for update to authenticated
  using (organization_id is not null and private.has_org_role(organization_id, array['owner','admin','manager']::public.membership_role[]))
  with check (organization_id is not null and private.has_org_role(organization_id, array['owner','admin','manager']::public.membership_role[]));
drop policy if exists tire_layout_templates_delete_org_admins on public.tire_layout_templates;
create policy tire_layout_templates_delete_org_admins
  on public.tire_layout_templates for delete to authenticated
  using (organization_id is not null and private.has_org_role(organization_id, array['owner','admin']::public.membership_role[]));

insert into public.tire_layout_templates
  (code,name,asset_kind,diagram_type,axle_count,tire_count,description,layout,is_system,is_active)
values
('CAM-4X2-6','Caminhão 4x2 — 6 pneus','vehicle'::public.asset_kind,'truck',2,6,'Eixo dianteiro simples e eixo traseiro com rodagem dupla.', '[{"code":"E1-LE","label":"Eixo 1 · esquerdo","axle":1,"side":"left","slot":"single","x":29,"y":23},{"code":"E1-D","label":"Eixo 1 · direito","axle":1,"side":"right","slot":"single","x":71,"y":23},{"code":"E2-LE","label":"Eixo 2 · esquerdo externo","axle":2,"side":"left","slot":"outer","x":20,"y":68},{"code":"E2-LI","label":"Eixo 2 · esquerdo interno","axle":2,"side":"left","slot":"inner","x":29,"y":68},{"code":"E2-RI","label":"Eixo 2 · direito interno","axle":2,"side":"right","slot":"inner","x":71,"y":68},{"code":"E2-RE","label":"Eixo 2 · direito externo","axle":2,"side":"right","slot":"outer","x":80,"y":68}]'::jsonb,true,true),
('CAV-6X2-8','Cavalo mecânico 6x2 — 8 pneus','vehicle'::public.asset_kind,'tractor',3,8,'Eixo direcional simples, tração com rodagem dupla e terceiro eixo simples.', '[{"code":"E1-LE","label":"Eixo 1 · esquerdo","axle":1,"side":"left","slot":"single","x":29,"y":18},{"code":"E1-D","label":"Eixo 1 · direito","axle":1,"side":"right","slot":"single","x":71,"y":18},{"code":"E2-LE","label":"Eixo 2 · esquerdo externo","axle":2,"side":"left","slot":"outer","x":20,"y":47},{"code":"E2-LI","label":"Eixo 2 · esquerdo interno","axle":2,"side":"left","slot":"inner","x":29,"y":47},{"code":"E2-RI","label":"Eixo 2 · direito interno","axle":2,"side":"right","slot":"inner","x":71,"y":47},{"code":"E2-RE","label":"Eixo 2 · direito externo","axle":2,"side":"right","slot":"outer","x":80,"y":47},{"code":"E3-LE","label":"Eixo 3 · esquerdo","axle":3,"side":"left","slot":"single","x":29,"y":77},{"code":"E3-D","label":"Eixo 3 · direito","axle":3,"side":"right","slot":"single","x":71,"y":77}]'::jsonb,true,true),
('CAV-6X4-10','Cavalo mecânico 6x4 — 10 pneus','vehicle'::public.asset_kind,'tractor',3,10,'Eixo direcional simples e dois eixos traseiros com rodagem dupla.', '[{"code":"E1-LE","label":"Eixo 1 · esquerdo","axle":1,"side":"left","slot":"single","x":29,"y":17},{"code":"E1-D","label":"Eixo 1 · direito","axle":1,"side":"right","slot":"single","x":71,"y":17},{"code":"E2-LE","label":"Eixo 2 · esquerdo externo","axle":2,"side":"left","slot":"outer","x":20,"y":47},{"code":"E2-LI","label":"Eixo 2 · esquerdo interno","axle":2,"side":"left","slot":"inner","x":29,"y":47},{"code":"E2-RI","label":"Eixo 2 · direito interno","axle":2,"side":"right","slot":"inner","x":71,"y":47},{"code":"E2-RE","label":"Eixo 2 · direito externo","axle":2,"side":"right","slot":"outer","x":80,"y":47},{"code":"E3-LE","label":"Eixo 3 · esquerdo externo","axle":3,"side":"left","slot":"outer","x":20,"y":74},{"code":"E3-LI","label":"Eixo 3 · esquerdo interno","axle":3,"side":"left","slot":"inner","x":29,"y":74},{"code":"E3-RI","label":"Eixo 3 · direito interno","axle":3,"side":"right","slot":"inner","x":71,"y":74},{"code":"E3-RE","label":"Eixo 3 · direito externo","axle":3,"side":"right","slot":"outer","x":80,"y":74}]'::jsonb,true,true),
('SR-2AX-8','Semirreboque — 2 eixos / 8 pneus','vehicle'::public.asset_kind,'trailer',2,8,'Dois eixos de rodagem dupla, quatro pneus por eixo.', '[{"code":"E1-LE","label":"Eixo 1 · esquerdo externo","axle":1,"side":"left","slot":"outer","x":20,"y":43},{"code":"E1-LI","label":"Eixo 1 · esquerdo interno","axle":1,"side":"left","slot":"inner","x":29,"y":43},{"code":"E1-RI","label":"Eixo 1 · direito interno","axle":1,"side":"right","slot":"inner","x":71,"y":43},{"code":"E1-RE","label":"Eixo 1 · direito externo","axle":1,"side":"right","slot":"outer","x":80,"y":43},{"code":"E2-LE","label":"Eixo 2 · esquerdo externo","axle":2,"side":"left","slot":"outer","x":20,"y":69},{"code":"E2-LI","label":"Eixo 2 · esquerdo interno","axle":2,"side":"left","slot":"inner","x":29,"y":69},{"code":"E2-RI","label":"Eixo 2 · direito interno","axle":2,"side":"right","slot":"inner","x":71,"y":69},{"code":"E2-RE","label":"Eixo 2 · direito externo","axle":2,"side":"right","slot":"outer","x":80,"y":69}]'::jsonb,true,true),
('SR-3AX-12','Semirreboque — 3 eixos / 12 pneus','vehicle'::public.asset_kind,'trailer',3,12,'Três eixos com rodagem dupla, quatro pneus por eixo.', '[{"code":"E1-LE","label":"Eixo 1 · esquerdo externo","axle":1,"side":"left","slot":"outer","x":20,"y":37},{"code":"E1-LI","label":"Eixo 1 · esquerdo interno","axle":1,"side":"left","slot":"inner","x":29,"y":37},{"code":"E1-RI","label":"Eixo 1 · direito interno","axle":1,"side":"right","slot":"inner","x":71,"y":37},{"code":"E1-RE","label":"Eixo 1 · direito externo","axle":1,"side":"right","slot":"outer","x":80,"y":37},{"code":"E2-LE","label":"Eixo 2 · esquerdo externo","axle":2,"side":"left","slot":"outer","x":20,"y":53},{"code":"E2-LI","label":"Eixo 2 · esquerdo interno","axle":2,"side":"left","slot":"inner","x":29,"y":53},{"code":"E2-RI","label":"Eixo 2 · direito interno","axle":2,"side":"right","slot":"inner","x":71,"y":53},{"code":"E2-RE","label":"Eixo 2 · direito externo","axle":2,"side":"right","slot":"outer","x":80,"y":53},{"code":"E3-LE","label":"Eixo 3 · esquerdo externo","axle":3,"side":"left","slot":"outer","x":20,"y":69},{"code":"E3-LI","label":"Eixo 3 · esquerdo interno","axle":3,"side":"left","slot":"inner","x":29,"y":69},{"code":"E3-RI","label":"Eixo 3 · direito interno","axle":3,"side":"right","slot":"inner","x":71,"y":69},{"code":"E3-RE","label":"Eixo 3 · direito externo","axle":3,"side":"right","slot":"outer","x":80,"y":69}]'::jsonb,true,true)
on conflict (code) where organization_id is null do nothing;

create or replace function public.move_tire_to_position(
  p_tire_id uuid,
  p_target_position_id uuid,
  p_meter_value numeric default null,
  p_occurred_at timestamptz default now(),
  p_reason text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_tire public.tires%rowtype;
  v_target public.vehicle_tire_positions%rowtype;
  v_source_location record;
  v_occupied public.tires%rowtype;
  v_occupied_location record;
  v_event_id uuid;
  v_related_event_id uuid;
  v_event_type public.tire_event_kind;
  v_related_event_type public.tire_event_kind;
  v_reason text;
  v_occurs_at timestamptz;
begin
  if p_occurred_at is null or p_occurred_at > now() + interval '1 minute' then
    raise exception 'Data do movimento inválida.' using errcode = '22007';
  end if;
  if p_meter_value is not null and p_meter_value < 0 then
    raise exception 'A leitura do hodômetro/horímetro não pode ser negativa.' using errcode = '22003';
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
  if v_tire.status not in ('in_stock','mounted') then
    raise exception 'Somente pneus em estoque ou montados podem ser movimentados pelo desenho.' using errcode = '22023';
  end if;

  select * into v_target
  from public.vehicle_tire_positions
  where id = p_target_position_id
    and organization_id = v_tire.organization_id
    and is_active = true
  for update;
  if not found then
    raise exception 'A posição não está ativa ou não pertence à organização do pneu.' using errcode = '23503';
  end if;

  if v_tire.status = 'mounted' then
    select e.vehicle_id, e.position_id
    into v_source_location
    from public.tire_events e
    where e.organization_id = v_tire.organization_id
      and e.tire_id = v_tire.id
      and e.event_type in ('mount','rotation','transfer')
    order by e.occurred_at desc, e.created_at desc, e.id desc
    limit 1;
    if v_source_location.position_id is null then
      raise exception 'Não foi possível identificar a posição atual do pneu.' using errcode = '23503';
    end if;
    if v_source_location.position_id = v_target.id then
      raise exception 'O pneu já está nesta posição.' using errcode = '22023';
    end if;
  end if;

  select t.* into v_occupied
  from public.tires t
  cross join lateral (
    select e.position_id
    from public.tire_events e
    where e.organization_id = t.organization_id
      and e.tire_id = t.id
      and e.event_type in ('mount','rotation','transfer')
    order by e.occurred_at desc, e.created_at desc, e.id desc
    limit 1
  ) latest_position
  where t.organization_id = v_tire.organization_id
    and t.status = 'mounted'
    and t.id <> v_tire.id
    and latest_position.position_id = v_target.id
  order by t.id
  limit 1
  for update of t;

  v_occurs_at := p_occurred_at;
  v_reason := coalesce(nullif(trim(p_reason),''), 'Movimentação pelo desenho de pneus');

  if found then
    if v_tire.status <> 'mounted' then
      raise exception 'A posição está ocupada. Monte primeiro o pneu selecionado em uma posição vazia.' using errcode = '23505';
    end if;
    select e.vehicle_id, e.position_id
    into v_occupied_location
    from public.tire_events e
    where e.organization_id = v_occupied.organization_id
      and e.tire_id = v_occupied.id
      and e.event_type in ('mount','rotation','transfer')
    order by e.occurred_at desc, e.created_at desc, e.id desc
    limit 1;

    v_event_type := case when v_source_location.vehicle_id = v_target.vehicle_id then 'rotation'::public.tire_event_kind else 'transfer'::public.tire_event_kind end;
    v_related_event_type := case when v_occupied_location.vehicle_id = v_source_location.vehicle_id then 'rotation'::public.tire_event_kind else 'transfer'::public.tire_event_kind end;

    insert into public.tire_events
      (organization_id,tire_id,vehicle_id,position_id,event_type,occurred_at,meter_value,reason,notes,created_by)
    values
      (v_tire.organization_id,v_tire.id,v_target.vehicle_id,v_target.id,v_event_type,v_occurs_at,p_meter_value,v_reason,p_notes,(select auth.uid()))
    returning id into v_event_id;

    insert into public.tire_events
      (organization_id,tire_id,vehicle_id,position_id,event_type,occurred_at,meter_value,reason,notes,related_tire_event_id,created_by)
    values
      (v_occupied.organization_id,v_occupied.id,v_source_location.vehicle_id,v_source_location.position_id,v_related_event_type,v_occurs_at + interval '1 millisecond',null,
       'Rodízio/troca de posição com pneu ' || v_tire.serial_number,p_notes,v_event_id,(select auth.uid()))
    returning id into v_related_event_id;

    update public.tire_events set related_tire_event_id = v_related_event_id
    where id = v_event_id and organization_id = v_tire.organization_id;

    return jsonb_build_object('success',true,'action','swap','tire_id',v_tire.id,'other_tire_id',v_occupied.id,
      'event_id',v_event_id,'related_event_id',v_related_event_id,'position_id',v_target.id);
  else
    if v_tire.status = 'in_stock' then
      v_event_type := 'mount'::public.tire_event_kind;
    else
      v_event_type := case when v_source_location.vehicle_id = v_target.vehicle_id then 'rotation'::public.tire_event_kind else 'transfer'::public.tire_event_kind end;
    end if;

    insert into public.tire_events
      (organization_id,tire_id,vehicle_id,position_id,event_type,occurred_at,meter_value,reason,notes,created_by)
    values
      (v_tire.organization_id,v_tire.id,v_target.vehicle_id,v_target.id,v_event_type,v_occurs_at,p_meter_value,v_reason,p_notes,(select auth.uid()))
    returning id into v_event_id;

    if v_tire.status = 'in_stock' then
      update public.tires set status = 'mounted', updated_at = now()
      where id = v_tire.id and organization_id = v_tire.organization_id;
    end if;

    return jsonb_build_object('success',true,'action',case when v_event_type = 'mount' then 'mount' else 'move' end,
      'tire_id',v_tire.id,'event_id',v_event_id,'position_id',v_target.id);
  end if;
end;
$function$;

revoke all on function public.move_tire_to_position(uuid,uuid,numeric,timestamptz,text,text) from public, anon;
grant execute on function public.move_tire_to_position(uuid,uuid,numeric,timestamptz,text,text) to authenticated;

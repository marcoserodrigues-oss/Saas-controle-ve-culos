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

create or replace function private.enforce_vehicle_layout_template_scope()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_template_org uuid;
begin
  if new.tire_layout_template_id is null then
    return new;
  end if;

  select t.organization_id into v_template_org
  from public.tire_layout_templates t
  where t.id = new.tire_layout_template_id;

  if not found then
    raise exception 'Esquema de pneus não encontrado.' using errcode = '23503';
  end if;

  if v_template_org is not null and v_template_org <> new.organization_id then
    raise exception 'O esquema de pneus pertence a outra organização.' using errcode = '23503';
  end if;

  return new;
end;
$function$;

drop trigger if exists vehicles_layout_template_scope on public.vehicles;
create trigger vehicles_layout_template_scope
before insert or update of tire_layout_template_id, organization_id
on public.vehicles
for each row execute function private.enforce_vehicle_layout_template_scope();

revoke all on function private.enforce_vehicle_layout_template_scope() from public, anon, authenticated;

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
  p_meter_value numeric DEFAULT null,
  p_occurred_at timestamptz DEFAULT now(),
  p_reason text DEFAULT null,
  p_notes text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
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
BEGIN
  IF p_occurred_at IS NULL OR p_occurred_at > now() + interval '1 minute' THEN
    RAISE EXCEPTION 'Data do movimento inválida.' USING errcode = '22007';
  END IF;
  IF p_meter_value IS NOT NULL AND p_meter_value < 0 THEN
    RAISE EXCEPTION 'A leitura do hodômetro/horímetro não pode ser negativa.' USING errcode = '22003';
  END IF;
  SELECT * INTO v_tire FROM public.tires WHERE id = p_tire_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pneu não encontrado.' USING errcode = 'P0002'; END IF;
  IF NOT private.has_org_role(v_tire.organization_id, array['owner','admin','manager','operator']::public.membership_role[]) THEN
    RAISE EXCEPTION 'Você não tem permissão para movimentar pneus nesta organização.' USING errcode = '42501';
  END IF;
  IF v_tire.status NOT IN ('in_stock','mounted') THEN
    RAISE EXCEPTION 'Somente pneus em estoque ou montados podem ser movimentados pelo desenho.' USING errcode = '22023';
  END IF;

  SELECT * INTO v_target FROM public.vehicle_tire_positions
  WHERE id = p_target_position_id AND organization_id = v_tire.organization_id AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'A posição não está ativa ou não pertence à organização do pneu.' USING errcode = '23503'; END IF;

  IF v_tire.status = 'mounted' THEN
    SELECT e.vehicle_id, e.position_id, e.occurred_at INTO v_source_location
    FROM public.tire_events e
    WHERE e.organization_id = v_tire.organization_id AND e.tire_id = v_tire.id
      AND e.event_type IN ('mount','rotation','transfer')
    ORDER BY e.occurred_at DESC, e.created_at DESC, e.id DESC LIMIT 1;
    IF v_source_location.position_id IS NULL THEN RAISE EXCEPTION 'Não foi possível identificar a posição atual do pneu.' USING errcode = '23503'; END IF;
    IF p_occurred_at < v_source_location.occurred_at THEN
      RAISE EXCEPTION 'A data do movimento não pode ser anterior ao último posicionamento do pneu.' USING errcode = '22007';
    END IF;
    IF v_source_location.position_id = v_target.id THEN RAISE EXCEPTION 'O pneu já está nesta posição.' USING errcode = '22023'; END IF;
  END IF;

  SELECT t.* INTO v_occupied
  FROM public.tires t
  CROSS JOIN LATERAL (
    SELECT e.position_id FROM public.tire_events e
    WHERE e.organization_id = t.organization_id AND e.tire_id = t.id
      AND e.event_type IN ('mount','rotation','transfer')
    ORDER BY e.occurred_at DESC, e.created_at DESC, e.id DESC LIMIT 1
  ) latest_position
  WHERE t.organization_id = v_tire.organization_id AND t.status = 'mounted'
    AND t.id <> v_tire.id AND latest_position.position_id = v_target.id
  ORDER BY t.id LIMIT 1 FOR UPDATE OF t;

  v_reason := coalesce(nullif(trim(p_reason),''), 'Movimentação pelo desenho de pneus');
  IF FOUND THEN
    IF v_tire.status <> 'mounted' THEN RAISE EXCEPTION 'A posição está ocupada. Selecione o pneu que já está montado para fazer o rodízio.' USING errcode = '23505'; END IF;
    SELECT e.vehicle_id, e.position_id, e.occurred_at INTO v_occupied_location
    FROM public.tire_events e WHERE e.organization_id = v_occupied.organization_id AND e.tire_id = v_occupied.id
      AND e.event_type IN ('mount','rotation','transfer')
    ORDER BY e.occurred_at DESC, e.created_at DESC, e.id DESC LIMIT 1;
    IF p_occurred_at < v_occupied_location.occurred_at THEN
      RAISE EXCEPTION 'A data do rodízio não pode ser anterior ao último posicionamento do pneu que será trocado.' USING errcode = '22007';
    END IF;

    v_event_type := CASE WHEN v_source_location.vehicle_id = v_target.vehicle_id THEN 'rotation'::public.tire_event_kind ELSE 'transfer'::public.tire_event_kind END;
    v_related_event_type := CASE WHEN v_occupied_location.vehicle_id = v_source_location.vehicle_id THEN 'rotation'::public.tire_event_kind ELSE 'transfer'::public.tire_event_kind END;

    INSERT INTO public.tire_events (organization_id,tire_id,vehicle_id,position_id,event_type,occurred_at,meter_value,reason,notes,created_by)
    VALUES (v_tire.organization_id,v_tire.id,v_target.vehicle_id,v_target.id,v_event_type,p_occurred_at,p_meter_value,v_reason,p_notes,(select auth.uid()))
    RETURNING id INTO v_event_id;
    INSERT INTO public.tire_events (organization_id,tire_id,vehicle_id,position_id,event_type,occurred_at,meter_value,reason,notes,related_tire_event_id,created_by)
    VALUES (v_occupied.organization_id,v_occupied.id,v_source_location.vehicle_id,v_source_location.position_id,v_related_event_type,p_occurred_at + interval '1 millisecond',case when v_source_location.vehicle_id = v_target.vehicle_id then p_meter_value else null end,
      'Rodízio/troca de posição com pneu ' || v_tire.serial_number,p_notes,v_event_id,(select auth.uid()))
    RETURNING id INTO v_related_event_id;
    UPDATE public.tire_events SET related_tire_event_id = v_related_event_id WHERE id = v_event_id AND organization_id = v_tire.organization_id;
    RETURN jsonb_build_object('success',true,'action','swap','tire_id',v_tire.id,'other_tire_id',v_occupied.id,'event_id',v_event_id,'related_event_id',v_related_event_id,'position_id',v_target.id);
  ELSE
    IF v_tire.status = 'in_stock' THEN v_event_type := 'mount'::public.tire_event_kind;
    ELSE v_event_type := CASE WHEN v_source_location.vehicle_id = v_target.vehicle_id THEN 'rotation'::public.tire_event_kind ELSE 'transfer'::public.tire_event_kind END; END IF;
    INSERT INTO public.tire_events (organization_id,tire_id,vehicle_id,position_id,event_type,occurred_at,meter_value,reason,notes,created_by)
    VALUES (v_tire.organization_id,v_tire.id,v_target.vehicle_id,v_target.id,v_event_type,p_occurred_at,p_meter_value,v_reason,p_notes,(select auth.uid()))
    RETURNING id INTO v_event_id;
    IF v_tire.status = 'in_stock' THEN
      UPDATE public.tires SET status = 'mounted', updated_at = now() WHERE id = v_tire.id AND organization_id = v_tire.organization_id;
    END IF;
    RETURN jsonb_build_object('success',true,'action',CASE WHEN v_event_type = 'mount' THEN 'mount' ELSE 'move' END,'tire_id',v_tire.id,'event_id',v_event_id,'position_id',v_target.id);
  END IF;
END;
$function$;
revoke all on function public.move_tire_to_position(uuid,uuid,numeric,timestamptz,text,text) FROM PUBLIC, anon;
grant execute on function public.move_tire_to_position(uuid,uuid,numeric,timestamptz,text,text) to authenticated;

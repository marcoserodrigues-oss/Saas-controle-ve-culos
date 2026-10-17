-- Initial schema for Fleetwise. Apply with: supabase db push
-- Every operational row belongs to an organization; RLS restricts access to active members.
create extension if not exists pgcrypto;

create type public.membership_role as enum ('owner','admin','manager','operator','viewer');
create type public.asset_kind as enum ('vehicle','equipment');
create type public.meter_kind as enum ('odometer','hourmeter');
create type public.record_status as enum ('active','inactive','cancelled');
create type public.fuel_type as enum ('diesel','gasoline','ethanol','gnv','electric','other');
create type public.fueling_kind as enum ('full','partial');
create type public.tire_event_kind as enum ('purchase','mount','dismount','rotation','transfer','retread_sent','retread_returned','repair','inspection','scrap','adjustment');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 160),
  legal_name text,
  tax_id text,
  timezone text not null default 'America/Sao_Paulo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.membership_role not null default 'viewer',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members(user_id, is_active);

create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer
set search_path = '' as $$
  select exists (select 1 from public.organization_members m
    where m.organization_id = p_org and m.user_id = (select auth.uid()) and m.is_active);
$$;
create or replace function public.has_org_role(p_org uuid, p_roles public.membership_role[])
returns boolean language sql stable security definer
set search_path = '' as $$
  select exists (select 1 from public.organization_members m
    where m.organization_id = p_org and m.user_id = (select auth.uid())
      and m.is_active and m.role = any(p_roles));
$$;

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  plate text,
  description text not null,
  kind public.asset_kind not null default 'vehicle',
  meter_kind public.meter_kind not null default 'odometer',
  fuel_type public.fuel_type not null default 'diesel',
  make text, model text,
  model_year integer check (model_year is null or model_year between 1900 and 2200),
  vin text,
  capacity_liters numeric(12,3) check (capacity_liters is null or capacity_liters > 0),
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, plate),
  unique (organization_id, vin),
  unique (id, organization_id)
);
create index vehicles_org_status_idx on public.vehicles(organization_id, status);

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) >= 2),
  document_number text, license_number text, license_category text,
  license_expiry date, phone text, email text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, document_number),
  unique (id, organization_id)
);
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  tax_id text,
  supplier_type text not null default 'other' check (supplier_type in ('fuel_station','maintenance','tire','parts','other')),
  phone text, email text,
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, tax_id),
  unique (id, organization_id)
);

create table public.fuel_authorizations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  authorization_code text not null,
  vehicle_id uuid not null, driver_id uuid, supplier_id uuid,
  valid_from timestamptz not null, valid_until timestamptz not null,
  max_liters numeric(12,3) check (max_liters is null or max_liters > 0),
  max_amount_cents bigint check (max_amount_cents is null or max_amount_cents >= 0),
  consumed_liters numeric(12,3) not null default 0 check (consumed_liters >= 0),
  consumed_amount_cents bigint not null default 0 check (consumed_amount_cents >= 0),
  status public.record_status not null default 'active',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (valid_until > valid_from),
  unique (organization_id, authorization_code),
  foreign key (vehicle_id, organization_id) references public.vehicles(id, organization_id),
  foreign key (driver_id, organization_id) references public.drivers(id, organization_id),
  foreign key (supplier_id, organization_id) references public.suppliers(id, organization_id),
  unique (id, organization_id)
);
create table public.fuel_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vehicle_id uuid not null, driver_id uuid, supplier_id uuid, authorization_id uuid,
  occurred_at timestamptz not null,
  meter_value numeric(14,2) not null check (meter_value >= 0),
  liters numeric(12,3) not null check (liters > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  total_cents bigint generated always as (round(liters * unit_price_cents)::bigint) stored,
  fueling_kind public.fueling_kind not null,
  document_number text, notes text,
  status public.record_status not null default 'active',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (vehicle_id, organization_id) references public.vehicles(id, organization_id),
  foreign key (driver_id, organization_id) references public.drivers(id, organization_id),
  foreign key (supplier_id, organization_id) references public.suppliers(id, organization_id),
  foreign key (authorization_id, organization_id) references public.fuel_authorizations(id, organization_id),
  unique (id, organization_id)
);
create index fuel_events_vehicle_date_idx on public.fuel_events(organization_id, vehicle_id, occurred_at desc) where status = 'active';

create table public.meter_reading_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vehicle_id uuid not null, fuel_event_id uuid not null,
  previous_value numeric(14,2) not null,
  revised_value numeric(14,2) not null check (revised_value >= 0),
  reason text not null check (length(trim(reason)) >= 8),
  revised_by uuid not null references auth.users(id),
  revised_at timestamptz not null default now(),
  foreign key (vehicle_id, organization_id) references public.vehicles(id, organization_id),
  foreign key (fuel_event_id, organization_id) references public.fuel_events(id, organization_id)
);

create table public.maintenance_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vehicle_id uuid not null,
  title text not null,
  interval_km numeric(14,2) check (interval_km is null or interval_km > 0),
  interval_hours numeric(14,2) check (interval_hours is null or interval_hours > 0),
  interval_days integer check (interval_days is null or interval_days > 0),
  last_done_at date, last_done_meter numeric(14,2),
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  foreign key (vehicle_id, organization_id) references public.vehicles(id, organization_id),
  unique (id, organization_id)
);
create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vehicle_id uuid not null, supplier_id uuid,
  order_number text not null,
  category text not null check (category in ('preventive','corrective','inspection','tire')),
  description text not null,
  opened_at timestamptz not null default now(), closed_at timestamptz,
  meter_at_open numeric(14,2) check (meter_at_open is null or meter_at_open >= 0),
  meter_at_close numeric(14,2) check (meter_at_close is null or meter_at_close >= 0),
  labor_cost_cents bigint not null default 0 check (labor_cost_cents >= 0),
  parts_cost_cents bigint not null default 0 check (parts_cost_cents >= 0),
  status text not null default 'open' check (status in ('open','in_progress','waiting_parts','closed','cancelled')),
  created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  check (closed_at is null or closed_at >= opened_at),
  check (meter_at_close is null or meter_at_open is null or meter_at_close >= meter_at_open),
  foreign key (vehicle_id, organization_id) references public.vehicles(id, organization_id),
  foreign key (supplier_id, organization_id) references public.suppliers(id, organization_id),
  unique (organization_id, order_number), unique (id, organization_id)
);

create table public.tires (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  serial_number text not null, brand text, model text, size text not null,
  purchase_date date,
  purchase_cost_cents bigint not null default 0 check (purchase_cost_cents >= 0),
  status text not null default 'in_stock' check (status in ('in_stock','mounted','retread','repair','scrapped','sold')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, serial_number), unique (id, organization_id)
);
create table public.vehicle_tire_positions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vehicle_id uuid not null, position_code text not null, position_label text not null,
  is_active boolean not null default true, created_at timestamptz not null default now(),
  foreign key (vehicle_id, organization_id) references public.vehicles(id, organization_id),
  unique (vehicle_id, position_code), unique (id, organization_id)
);
create table public.tire_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  tire_id uuid not null, vehicle_id uuid, position_id uuid,
  event_type public.tire_event_kind not null,
  occurred_at timestamptz not null default now(),
  meter_value numeric(14,2) check (meter_value is null or meter_value >= 0),
  cost_cents bigint not null default 0 check (cost_cents >= 0),
  supplier_id uuid, related_tire_event_id uuid references public.tire_events(id),
  notes text, reason text, created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  foreign key (tire_id, organization_id) references public.tires(id, organization_id),
  foreign key (vehicle_id, organization_id) references public.vehicles(id, organization_id),
  foreign key (position_id, organization_id) references public.vehicle_tire_positions(id, organization_id),
  foreign key (supplier_id, organization_id) references public.suppliers(id, organization_id)
);
create index tire_events_tire_date_idx on public.tire_events(organization_id, tire_id, occurred_at);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  vehicle_id uuid, supplier_id uuid, work_order_id uuid,
  expense_date date not null, category text not null, description text not null,
  amount_cents bigint not null check (amount_cents >= 0),
  source_type text not null default 'manual' check (source_type in ('manual','fuel_event','work_order','tire_event')),
  source_id uuid,
  status public.record_status not null default 'active',
  created_by uuid references auth.users(id), created_at timestamptz not null default now(),
  foreign key (vehicle_id, organization_id) references public.vehicles(id, organization_id),
  foreign key (supplier_id, organization_id) references public.suppliers(id, organization_id),
  foreign key (work_order_id, organization_id) references public.work_orders(id, organization_id),
  check ((source_type = 'manual' and source_id is null) or (source_type <> 'manual' and source_id is not null))
);
create unique index expenses_source_once_idx on public.expenses(organization_id, source_type, source_id) where source_id is not null and status <> 'cancelled';

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id),
  action text not null, entity_table text not null, entity_id uuid,
  reason text, before_data jsonb, after_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_org_time_idx on public.audit_events(organization_id, created_at desc);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.vehicles enable row level security;
alter table public.drivers enable row level security;
alter table public.suppliers enable row level security;
alter table public.fuel_authorizations enable row level security;
alter table public.fuel_events enable row level security;
alter table public.meter_reading_revisions enable row level security;
alter table public.maintenance_plans enable row level security;
alter table public.work_orders enable row level security;
alter table public.tires enable row level security;
alter table public.vehicle_tire_positions enable row level security;
alter table public.tire_events enable row level security;
alter table public.expenses enable row level security;
alter table public.audit_events enable row level security;

create policy "members can read their organizations" on public.organizations
for select to authenticated using (public.is_org_member(id));
create policy "admins can update organization" on public.organizations
for update to authenticated using (public.has_org_role(id, array['owner','admin']::public.membership_role[]))
with check (public.has_org_role(id, array['owner','admin']::public.membership_role[]));
create policy "members can read membership" on public.organization_members
for select to authenticated using (public.is_org_member(organization_id));

do $policies$
declare t text;
begin
  foreach t in array array['vehicles','drivers','suppliers','fuel_authorizations','fuel_events','meter_reading_revisions','maintenance_plans','work_orders','tires','vehicle_tire_positions','tire_events','expenses'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.is_org_member(organization_id))', t || '_select_members', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.has_org_role(organization_id, array[''owner'',''admin'',''manager'',''operator'']::public.membership_role[]))', t || '_insert_operators', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.has_org_role(organization_id, array[''owner'',''admin'',''manager'',''operator'']::public.membership_role[])) with check (public.has_org_role(organization_id, array[''owner'',''admin'',''manager'',''operator'']::public.membership_role[]))', t || '_update_operators', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.has_org_role(organization_id, array[''owner'',''admin'']::public.membership_role[]))', t || '_delete_admins', t);
  end loop;
end $policies$;

create policy "audit readable by org members" on public.audit_events
for select to authenticated using (public.is_org_member(organization_id));
-- No client insert/update/delete policy for audit_events. Trusted server-side code must write audit records.

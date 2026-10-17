import { supabase } from "./supabase";

export type FleetVehicle = {
  id: string;
  code: string;
  plate: string | null;
  description: string;
  kind: string;
  meter_kind: string;
  status: string;
  fuel_type: string;
};

export type FleetFuelEvent = {
  id: string;
  vehicle_id: string;
  occurred_at: string;
  meter_value: number | string | null;
  liters: number | string;
  unit_price_cents: number | string;
  total_cents: number | string | null;
  fueling_kind: string;
  status: string;
};

export type FleetWorkOrder = {
  id: string;
  vehicle_id: string;
  order_number: string;
  category: string;
  description: string;
  opened_at: string;
  closed_at: string | null;
  labor_cost_cents: number | string | null;
  parts_cost_cents: number | string | null;
  status: string;
};

export type FleetTire = {
  id: string;
  serial_number: string;
  size: string;
  status: string;
  purchase_date: string | null;
  purchase_cost_cents: number | string;
};

export type FleetTireEvent = {
  id: string;
  tire_id: string;
  vehicle_id: string | null;
  event_type: string;
  occurred_at: string;
  cost_cents: number | string | null;
  reason: string | null;
  notes: string | null;
};

export type FleetExpense = {
  id: string;
  vehicle_id: string | null;
  expense_date: string;
  category: string;
  description: string;
  amount_cents: number | string;
  source_type: string | null;
  source_id: string | null;
};

export type FleetMaintenancePlan = {
  id: string;
  vehicle_id: string;
  title: string;
  interval_days: number | null;
  last_done_at: string | null;
  status: string;
};

export type FleetDriver = {
  id: string;
  name: string;
  license_expiry: string | null;
  status: string;
};

export type FleetAnalyticsData = {
  vehicles: FleetVehicle[];
  fuelEvents: FleetFuelEvent[];
  workOrders: FleetWorkOrder[];
  tires: FleetTire[];
  tireEvents: FleetTireEvent[];
  standaloneExpenses: FleetExpense[];
  maintenancePlans: FleetMaintenancePlan[];
  drivers: FleetDriver[];
};

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

async function fetchPage<T>(query: PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<PageResult<T>> {
  const { data, error } = await query;
  return { data: data as T[] | null, error: error ? { message: error.message } : null };
}

async function fetchAllPages<T>(loadPage: (from: number, to: number) => Promise<PageResult<T>>): Promise<T[]> {
  const result: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const page = await loadPage(from, from + pageSize - 1);
    if (page.error) throw new Error(page.error.message);
    const batch = page.data ?? [];
    result.push(...batch);
    if (batch.length < pageSize) return result;
  }
}

function rangeFilter(query: any, startIso: string, endExclusiveIso: string, column: string) {
  return query.gte(column, startIso).lt(column, endExclusiveIso);
}

export async function loadFleetAnalytics(
  organizationId: string,
  startIso: string,
  endExclusiveIso: string
): Promise<FleetAnalyticsData> {
  if (!supabase) throw new Error("Banco de dados não configurado. Confira a conexão do Fleetwise.");

  const db = supabase;
  const [vehicles, fuelEvents, workOrders, tires, tireEvents, standaloneExpenses, maintenancePlans, drivers] = await Promise.all([
    fetchAllPages<FleetVehicle>((from, to) => fetchPage<FleetVehicle>(
      db.from("vehicles")
        .select("id,code,plate,description,kind,meter_kind,status,fuel_type")
        .eq("organization_id", organizationId)
        .neq("status", "cancelled")
        .order("description")
        .range(from, to)
    )),
    fetchAllPages<FleetFuelEvent>((from, to) => fetchPage<FleetFuelEvent>(
      rangeFilter(
        db.from("fuel_events")
          .select("id,vehicle_id,occurred_at,meter_value,liters,unit_price_cents,total_cents,fueling_kind,status")
          .eq("organization_id", organizationId)
          .neq("status", "cancelled"),
        startIso, endExclusiveIso, "occurred_at"
      ).order("occurred_at", { ascending: false }).order("id", { ascending: false }).range(from, to)
    )),
    fetchAllPages<FleetWorkOrder>((from, to) => fetchPage<FleetWorkOrder>(
      db.from("work_orders")
        .select("id,vehicle_id,order_number,category,description,opened_at,closed_at,labor_cost_cents,parts_cost_cents,status")
        .eq("organization_id", organizationId)
        .neq("status", "cancelled")
        .order("opened_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, to)
    )),
    fetchAllPages<FleetTire>((from, to) => fetchPage<FleetTire>(
      db.from("tires")
        .select("id,serial_number,size,status,purchase_date,purchase_cost_cents")
        .eq("organization_id", organizationId)
        .order("serial_number")
        .range(from, to)
    )),
    fetchAllPages<FleetTireEvent>((from, to) => fetchPage<FleetTireEvent>(
      rangeFilter(
        db.from("tire_events")
          .select("id,tire_id,vehicle_id,event_type,occurred_at,cost_cents,reason,notes")
          .eq("organization_id", organizationId),
        startIso, endExclusiveIso, "occurred_at"
      ).order("occurred_at", { ascending: false }).order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to)
    )),
    fetchAllPages<FleetExpense>((from, to) => fetchPage<FleetExpense>(
      rangeFilter(
        db.from("expenses")
          .select("id,vehicle_id,expense_date,category,description,amount_cents,source_type,source_id")
          .eq("organization_id", organizationId)
          .neq("status", "cancelled")
          .is("work_order_id", null)
          .is("source_id", null),
        startIso.slice(0, 10), endExclusiveIso.slice(0, 10), "expense_date"
      ).order("expense_date", { ascending: false }).order("id", { ascending: false }).range(from, to)
    )),
    fetchAllPages<FleetMaintenancePlan>((from, to) => fetchPage<FleetMaintenancePlan>(
      db.from("maintenance_plans")
        .select("id,vehicle_id,title,interval_days,last_done_at,status")
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .order("title")
        .range(from, to)
    )),
    fetchAllPages<FleetDriver>((from, to) => fetchPage<FleetDriver>(
      db.from("drivers")
        .select("id,name,license_expiry,status")
        .eq("organization_id", organizationId)
        .neq("status", "cancelled")
        .order("name")
        .range(from, to)
    ))
  ]);

  return { vehicles, fuelEvents, workOrders, tires, tireEvents, standaloneExpenses, maintenancePlans, drivers };
}

export function asNumber(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function fuelCostCents(row: FleetFuelEvent): number {
  const total = row.total_cents === null ? Number.NaN : asNumber(row.total_cents);
  return Number.isFinite(total) ? total : Math.round(asNumber(row.liters) * asNumber(row.unit_price_cents));
}

export function workOrderCostCents(row: FleetWorkOrder): number {
  return asNumber(row.labor_cost_cents) + asNumber(row.parts_cost_cents);
}

export function tireEventCostCents(row: FleetTireEvent): number {
  return asNumber(row.cost_cents);
}

export function formatBrlCents(cents: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

export function formatNumber(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits }).format(value);
}

export function localDateInput(value = new Date()): string {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

export function dateStartIso(localDate: string): string {
  return new Date(localDate + "T00:00:00").toISOString();
}

export function dateEndExclusiveIso(localDate: string): string {
  const end = new Date(localDate + "T00:00:00");
  end.setDate(end.getDate() + 1);
  return end.toISOString();
}

export function dateDaysAgo(days: number, now = new Date()): string {
  const day = new Date(now);
  day.setHours(12, 0, 0, 0);
  day.setDate(day.getDate() - Math.max(0, days - 1));
  return localDateInput(day);
}

export type VehicleCostRow = {
  vehicleId: string;
  vehicleName: string;
  plate: string;
  fuelCents: number;
  maintenanceCents: number;
  tireCents: number;
  otherCents: number;
  totalCents: number;
};

export function buildVehicleCostRows(data: FleetAnalyticsData): VehicleCostRow[] {
  const map = new Map<string, VehicleCostRow>();
  for (const vehicle of data.vehicles) {
    map.set(vehicle.id, {
      vehicleId: vehicle.id,
      vehicleName: vehicle.description,
      plate: vehicle.plate ?? "",
      fuelCents: 0,
      maintenanceCents: 0,
      tireCents: 0,
      otherCents: 0,
      totalCents: 0
    });
  }
  const ensureVehicle = (vehicleId: string | null): VehicleCostRow | undefined => vehicleId ? map.get(vehicleId) : undefined;
  for (const row of data.fuelEvents) {
    const bucket = ensureVehicle(row.vehicle_id);
    if (bucket) bucket.fuelCents += fuelCostCents(row);
  }
  for (const row of data.workOrders) {
    if (row.status !== "closed") continue;
    const bucket = ensureVehicle(row.vehicle_id);
    if (bucket) bucket.maintenanceCents += workOrderCostCents(row);
  }
  for (const row of data.tireEvents) {
    const bucket = ensureVehicle(row.vehicle_id);
    if (bucket) bucket.tireCents += tireEventCostCents(row);
  }
  for (const row of data.standaloneExpenses) {
    const bucket = ensureVehicle(row.vehicle_id);
    if (bucket) bucket.otherCents += asNumber(row.amount_cents);
  }
  for (const row of map.values()) {
    row.totalCents = row.fuelCents + row.maintenanceCents + row.tireCents + row.otherCents;
  }
  return [...map.values()].sort((a, b) => b.totalCents - a.totalCents || a.vehicleName.localeCompare(b.vehicleName, "pt-BR"));
}

export type CostBreakdown = { fuelCents: number; maintenanceCents: number; tireCents: number; otherCents: number };

export function buildCostBreakdown(data: FleetAnalyticsData): CostBreakdown {
  return {
    fuelCents: data.fuelEvents.reduce((sum, row) => sum + fuelCostCents(row), 0),
    maintenanceCents: data.workOrders.filter(row => row.status === "closed").reduce((sum, row) => sum + workOrderCostCents(row), 0),
    tireCents: data.tireEvents.reduce((sum, row) => sum + tireEventCostCents(row), 0),
    otherCents: data.standaloneExpenses.reduce((sum, row) => sum + asNumber(row.amount_cents), 0)
  };
}

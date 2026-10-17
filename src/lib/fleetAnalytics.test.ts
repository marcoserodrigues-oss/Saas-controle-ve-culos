import { describe, expect, it } from "vitest";
import {
  buildCostBreakdown,
  buildVehicleCostRows,
  type FleetAnalyticsData
} from "./fleetAnalytics";

function sampleData(): FleetAnalyticsData {
  return {
    vehicles: [
      { id: "v1", code: "VEI-0001", plate: "ABC1D23", description: "Caminhão 1", kind: "vehicle", meter_kind: "odometer", status: "active", fuel_type: "diesel" },
      { id: "v2", code: "VEI-0002", plate: null, description: "Van", kind: "vehicle", meter_kind: "odometer", status: "inactive", fuel_type: "diesel" }
    ],
    fuelEvents: [
      { id: "f1", vehicle_id: "v1", occurred_at: "2026-10-01T12:00:00.000Z", meter_value: 1000, liters: 100, unit_price_cents: 600, total_cents: 60000, fueling_kind: "full", status: "active" },
      { id: "f2", vehicle_id: "v2", occurred_at: "2026-10-02T12:00:00.000Z", meter_value: 500, liters: 50, unit_price_cents: 500, total_cents: null, fueling_kind: "partial", status: "active" }
    ],
    workOrders: [
      { id: "w1", vehicle_id: "v1", order_number: "OS-0001", category: "corrective", description: "Reparo concluído", opened_at: "2026-10-01T10:00:00.000Z", closed_at: "2026-10-02T10:00:00.000Z", labor_cost_cents: 20000, parts_cost_cents: 30000, status: "closed" },
      { id: "w2", vehicle_id: "v2", order_number: "OS-0002", category: "corrective", description: "Em andamento", opened_at: "2026-10-01T10:00:00.000Z", closed_at: null, labor_cost_cents: 40000, parts_cost_cents: 10000, status: "in_progress" }
    ],
    tires: [
      { id: "t1", serial_number: "PNE-0001", size: "295/80 R22.5", status: "mounted", purchase_date: "2026-10-01", purchase_cost_cents: 90000 }
    ],
    tireEvents: [
      { id: "te1", tire_id: "t1", vehicle_id: "v1", event_type: "retread_sent", occurred_at: "2026-10-05T10:00:00.000Z", cost_cents: 15000, reason: "Recapagem", notes: null },
      { id: "te2", tire_id: "t1", vehicle_id: null, event_type: "purchase", occurred_at: "2026-10-01T10:00:00.000Z", cost_cents: 90000, reason: "Compra", notes: null }
    ],
    standaloneExpenses: [
      { id: "e1", vehicle_id: "v2", expense_date: "2026-10-03", category: "Pedágio", description: "Pedágio", amount_cents: 2500, source_type: null, source_id: null },
      { id: "e2", vehicle_id: null, expense_date: "2026-10-04", category: "Taxa", description: "Taxa sem veículo", amount_cents: 1500, source_type: null, source_id: null }
    ],
    maintenancePlans: [],
    drivers: []
  };
}

describe("fleet analytics aggregation", () => {
  it("uses stored fuel totals and falls back to liters times unit price when the total is missing", () => {
    const costs = buildCostBreakdown(sampleData());
    expect(costs.fuelCents).toBe(85000);
  });

  it("counts only completed work orders as maintenance cost", () => {
    const costs = buildCostBreakdown(sampleData());
    expect(costs.maintenanceCents).toBe(50000);
  });

  it("groups event costs by vehicle and keeps unassigned tire events out of vehicle totals", () => {
    const rows = buildVehicleCostRows(sampleData());
    expect(rows[0].vehicleId).toBe("v1");
    expect(rows[0].fuelCents).toBe(60000);
    expect(rows[0].maintenanceCents).toBe(50000);
    expect(rows[0].tireCents).toBe(15000);
    expect(rows[0].otherCents).toBe(0);
    expect(rows[0].totalCents).toBe(125000);
    expect(rows[1].vehicleId).toBe("v2");
    expect(rows[1].fuelCents).toBe(25000);
    expect(rows[1].maintenanceCents).toBe(0);
    expect(rows[1].otherCents).toBe(2500);
    expect(rows[1].totalCents).toBe(27500);
  });
});

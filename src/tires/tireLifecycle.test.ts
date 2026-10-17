import { describe, expect, it } from "vitest";
import { calculateTireLifecycleReport, type TireLifecycleEvent } from "./tireLifecycle";

const base = Date.parse("2026-10-17T12:00:00.000Z");
const event = (
  id: string,
  event_type: string,
  day: number,
  vehicle_id: string | null,
  meter_value: number | null,
  cost_cents = 0,
  reason: string | null = null
): TireLifecycleEvent => ({
  id,
  tire_id: "tire-1",
  event_type,
  occurred_at: new Date(base + day * 86400000).toISOString(),
  created_at: new Date(base + day * 86400000 + 1000).toISOString(),
  vehicle_id,
  meter_value,
  cost_cents,
  reason
});

describe("calculateTireLifecycleReport", () => {
  it("calculates complete cycles, retreads, cost per recorded kilometer, and a cautious remaining-kilometers estimate", () => {
    const tires = [{ id: "tire-1", status: "mounted", purchase_cost_cents: 50000 }];
    const events = [
      event("01", "purchase", 0, null, null, 50000),
      event("02", "mount", 1, "truck-1", 100),
      event("03", "dismount", 10, "truck-1", 1000),
      event("04", "mount", 11, "truck-1", 1100),
      event("05", "dismount", 20, "truck-1", 2000),
      event("06", "retread_sent", 21, null, null, 10000),
      event("07", "retread_returned", 22, null, null),
      event("08", "mount", 23, "truck-1", 2050),
      event("09", "rotation", 24, "truck-1", 2500)
    ];

    const result = calculateTireLifecycleReport(tires, events, base + 25 * 86400000).get("tire-1");
    expect(result).toBeDefined();
    expect(result?.km).toBe(2250);
    expect(result?.cycles).toBe(2);
    expect(result?.measuredCycles).toBe(2);
    expect(result?.retreadCount).toBe(1);
    expect(result?.retreadCostCents).toBe(10000);
    expect(result?.totalCostCents).toBe(60000); // purchase cost is not doubled by the purchase event
    expect(result?.costPerKmCents).toBeCloseTo(60000 / 2250);
    expect(result?.averageKmPerCycle).toBe(900);
    expect(result?.currentCycleKm).toBe(450);
    expect(result?.estimatedKmRemaining).toBe(450);
  });

  it("does not forecast replacement when the active cycle has missing meter readings", () => {
    const tires = [{ id: "tire-1", status: "mounted", purchase_cost_cents: 50000 }];
    const events = [
      event("01", "mount", 1, "truck-1", 100),
      event("02", "dismount", 10, "truck-1", 1000),
      event("03", "mount", 11, "truck-1", 1100),
      event("04", "dismount", 20, "truck-1", 2000),
      event("05", "mount", 21, "truck-1", null)
    ];

    const result = calculateTireLifecycleReport(tires, events, base + 25 * 86400000).get("tire-1");
    expect(result?.measuredCycles).toBe(2);
    expect(result?.estimatedKmRemaining).toBeNull();
  });

  it("does not compare odometer values between different vehicles", () => {
    const tires = [{ id: "tire-1", status: "mounted", purchase_cost_cents: 50000 }];
    const events = [
      event("01", "mount", 1, "truck-1", 100),
      event("02", "dismount", 10, "truck-1", 1000),
      event("03", "mount", 11, "truck-1", 1100),
      event("04", "dismount", 20, "truck-1", 2000),
      event("05", "mount", 21, "truck-1", 2050),
      event("06", "transfer", 22, "truck-2", 20)
    ];

    const result = calculateTireLifecycleReport(tires, events, base + 25 * 86400000).get("tire-1");
    expect(result?.km).toBe(1800);
    expect(result?.estimatedKmRemaining).toBeNull();
  });

  it("returns no cost-per-kilometer value when no valid distance was recorded", () => {
    const tires = [{ id: "tire-1", status: "in_stock", purchase_cost_cents: 10000 }];
    const result = calculateTireLifecycleReport(tires, [], base).get("tire-1");
    expect(result?.costPerKmCents).toBeNull();
    expect(result?.estimatedKmRemaining).toBeNull();
  });
});

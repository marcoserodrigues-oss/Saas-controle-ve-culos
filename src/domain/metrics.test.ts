import { describe, expect, it } from "vitest";
import {
  calculateFuelConsumptionByVehicle,
  calculateFuelMetric,
  calculateTireCostPerKm,
  getValidMeterDelta,
  multiplyMoneyCents
} from "./metrics";

describe("fuel and meter domain calculations", () => {
  it("calculates tank-to-tank road consumption and fuel cost per km", () => {
    const result = calculateFuelMetric({
      start: 10_000,
      end: 10_400,
      unit: "odometer",
      liters: 40,
      attributedCostCents: 24_000,
      startReadingValid: true,
      endReadingValid: true,
      boundedByFullTanks: true
    });

    // Oracle values are independently specified from the acceptance example.
    expect(result?.distanceOrHours).toBe(400);
    expect(result?.consumption).toBe(10);
    expect(result?.costCents).toBe(24_000);
    expect(result?.costPerUnitCents).toBe(60);
    expect(result?.unit).toBe("km/l");
  });

  it("calculates equipment consumption in liters per hour", () => {
    const result = calculateFuelMetric({
      start: 1_000,
      end: 1_010,
      unit: "hourmeter",
      liters: 50,
      startReadingValid: true,
      endReadingValid: true,
      boundedByFullTanks: true
    });
    expect(result?.distanceOrHours).toBe(10);
    expect(result?.consumption).toBe(5);
    expect(result?.unit).toBe("l/h");
  });

  it("does not report consumption for incomplete or invalid intervals", () => {
    expect(calculateFuelMetric({
      start: 100, end: 200, unit: "odometer", liters: 20,
      startReadingValid: true, endReadingValid: true, boundedByFullTanks: false
    })).toBeNull();
    expect(getValidMeterDelta({ start: 200, end: 199, unit: "odometer" })).toBeNull();
    expect(getValidMeterDelta({ start: 200, end: 200, unit: "hourmeter" })).toBeNull();
  });

  it("uses integer cents for exact monetary multiplication", () => {
    expect(multiplyMoneyCents(3, 1990) + multiplyMoneyCents(2, 1005)).toBe(7_980);
  });

  it("calculates tire life-cycle cost per valid kilometer", () => {
    // R$ 1.200,00 + 2 × R$ 350,00 = R$ 1.900,00 over 100.000 km.
    expect(calculateTireCostPerKm(120_000, [35_000, 35_000], 100_000)).toBe(1.9);
    expect(calculateTireCostPerKm(120_000, [35_000, 35_000], 0)).toBeNull();
  });
});


describe("tank-to-tank fuel consumption", () => {
  it("includes partial refills between two full tanks and only counts intervals ending in range", () => {
    const result = calculateFuelConsumptionByVehicle(
      [{ id: "truck", meter_kind: "odometer" }],
      [
        { id: "a", vehicle_id: "truck", occurred_at: "2026-01-01T10:00:00Z", meter_value: 1000, liters: 40, fueling_kind: "full" },
        { id: "b", vehicle_id: "truck", occurred_at: "2026-01-05T10:00:00Z", meter_value: 1200, liters: 10, fueling_kind: "partial" },
        { id: "c", vehicle_id: "truck", occurred_at: "2026-01-10T10:00:00Z", meter_value: 1500, liters: 30, fueling_kind: "full" },
        { id: "d", vehicle_id: "truck", occurred_at: "2026-01-20T10:00:00Z", meter_value: 1800, liters: 30, fueling_kind: "full" }
      ],
      "2026-01-01T00:00:00Z",
      "2026-01-15T00:00:00Z"
    ).get("truck");
    expect(result?.validIntervals).toBe(1);
    expect(result?.distanceOrHours).toBe(500);
    expect(result?.liters).toBe(40);
    expect(result?.consumption).toBe(12.5);
    expect(result?.unit).toBe("km/l");
  });

  it("rejects intervals containing missing or decreasing readings and calculates hourmeter consumption", () => {
    const result = calculateFuelConsumptionByVehicle(
      [{ id: "generator", meter_kind: "hourmeter" }],
      [
        { id: "a", vehicle_id: "generator", occurred_at: "2026-01-01T10:00:00Z", meter_value: 100, liters: 40, fueling_kind: "full" },
        { id: "b", vehicle_id: "generator", occurred_at: "2026-01-05T10:00:00Z", meter_value: null, liters: 10, fueling_kind: "partial" },
        { id: "c", vehicle_id: "generator", occurred_at: "2026-01-10T10:00:00Z", meter_value: 150, liters: 30, fueling_kind: "full" },
        { id: "d", vehicle_id: "generator", occurred_at: "2026-01-15T10:00:00Z", meter_value: 160, liters: 20, fueling_kind: "full" }
      ],
      "2026-01-01T00:00:00Z",
      "2026-02-01T00:00:00Z"
    ).get("generator");
    expect(result?.validIntervals).toBe(1);
    expect(result?.distanceOrHours).toBe(10);
    expect(result?.liters).toBe(20);
    expect(result?.consumption).toBe(2);
    expect(result?.unit).toBe("l/h");
  });
});

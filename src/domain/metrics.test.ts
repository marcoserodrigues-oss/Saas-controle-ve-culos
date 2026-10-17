import { describe, expect, it } from "vitest";
import {
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

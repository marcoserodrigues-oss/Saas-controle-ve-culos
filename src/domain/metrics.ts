export type MeterKind = "odometer" | "hourmeter";

export interface MeterInterval {
  start: number;
  end: number;
  unit: MeterKind;
}

export interface FuelIntervalInput extends MeterInterval {
  liters: number;
  attributedCostCents?: number;
  startReadingValid: boolean;
  endReadingValid: boolean;
  boundedByFullTanks: boolean;
}

export interface FuelMetric {
  distanceOrHours: number;
  consumption: number;
  costCents?: number;
  costPerUnitCents?: number;
  unit: "km/l" | "l/h";
}

export function getValidMeterDelta(interval: MeterInterval): number | null {
  if (!Number.isFinite(interval.start) || !Number.isFinite(interval.end)) return null;
  if (interval.start < 0 || interval.end <= interval.start) return null;
  return interval.end - interval.start;
}

/**
 * Returns a metric only for a valid interval bounded by full-tank records.
 * Partial refills are intentionally not sufficient to produce a reliable average.
 */
export function calculateFuelMetric(input: FuelIntervalInput): FuelMetric | null {
  if (!input.startReadingValid || !input.endReadingValid || !input.boundedByFullTanks) return null;
  if (!Number.isFinite(input.liters) || input.liters <= 0) return null;

  const delta = getValidMeterDelta(input);
  if (delta === null) return null;

  if (input.unit === "odometer") {
    return {
      distanceOrHours: delta,
      consumption: delta / input.liters,
      ...(Number.isSafeInteger(input.attributedCostCents) && input.attributedCostCents! >= 0
        ? { costCents: input.attributedCostCents, costPerUnitCents: input.attributedCostCents! / delta }
        : {}),
      unit: "km/l"
    };
  }

  return {
    distanceOrHours: delta,
    consumption: input.liters / delta,
    ...(Number.isSafeInteger(input.attributedCostCents) && input.attributedCostCents! >= 0
      ? { costCents: input.attributedCostCents, costPerUnitCents: input.attributedCostCents! / delta }
      : {}),
    unit: "l/h"
  };
}

export function multiplyMoneyCents(quantity: number, unitPriceCents: number): number {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    throw new Error("A quantidade deve ser um inteiro não negativo nesta operação financeira.");
  }
  if (!Number.isSafeInteger(unitPriceCents) || unitPriceCents < 0) {
    throw new Error("O preço unitário em centavos deve ser um inteiro não negativo.");
  }
  const total = quantity * unitPriceCents;
  if (!Number.isSafeInteger(total)) throw new Error("Total excede o limite numérico seguro.");
  return total;
}

export function calculateTireCostPerKm(
  acquisitionCostCents: number,
  serviceCostsCents: number[],
  validKilometers: number
): number | null {
  const costs = [acquisitionCostCents, ...serviceCostsCents];
  if (costs.some((cost) => !Number.isSafeInteger(cost) || cost < 0)) {
    throw new Error("Custos devem ser valores inteiros não negativos em centavos.");
  }
  if (!Number.isFinite(validKilometers) || validKilometers <= 0) return null;
  return costs.reduce((sum, cost) => sum + cost, 0) / validKilometers;
}

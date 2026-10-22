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


export type FuelConsumptionEvent = {
  id: string;
  vehicle_id: string;
  occurred_at: string;
  created_at?: string | null;
  meter_value: number | string | null;
  liters: number | string;
  fueling_kind: string;
  status?: string;
};

export type VehicleFuelConsumption = {
  vehicleId: string;
  consumption: number | null;
  unit: "km/l" | "l/h";
  validIntervals: number;
  liters: number;
  distanceOrHours: number;
};

/**
 * Calculates tank-to-tank consumption for intervals whose ending full-tank fill
 * falls inside the selected date range. Partial fills between full tanks are
 * included; missing or decreasing meter readings invalidate that interval.
 */
export function calculateFuelConsumptionByVehicle(
  vehicles: { id: string; meter_kind: string }[],
  events: FuelConsumptionEvent[],
  startIso: string,
  endExclusiveIso: string
): Map<string, VehicleFuelConsumption> {
  const byVehicle = new Map<string, FuelConsumptionEvent[]>();
  for (const event of events) {
    if (event.status === "cancelled") continue;
    const rows = byVehicle.get(event.vehicle_id) ?? [];
    rows.push(event);
    byVehicle.set(event.vehicle_id, rows);
  }

  const result = new Map<string, VehicleFuelConsumption>();
  for (const vehicle of vehicles) {
    const unit = vehicle.meter_kind === "hourmeter" ? "l/h" : "km/l";
    const rows = [...(byVehicle.get(vehicle.id) ?? [])].sort((a, b) => {
      const occurred = new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime();
      if (occurred !== 0) return occurred;
      const created = new Date(a.created_at ?? a.occurred_at).getTime()
        - new Date(b.created_at ?? b.occurred_at).getTime();
      return created || a.id.localeCompare(b.id);
    });

    let lastFull: FuelConsumptionEvent | null = null;
    let lastMeter: number | null = null;
    let intervalLiters = 0;
    let intervalValid = true;
    let validIntervals = 0;
    let totalLiters = 0;
    let totalDistanceOrHours = 0;

    for (const event of rows) {
      const meter = event.meter_value === null || event.meter_value === undefined || event.meter_value === ""
        ? null : Number(event.meter_value);
      const liters = Number(event.liters);
      const validMeter = meter !== null && Number.isFinite(meter) && meter >= 0;
      const validLiters = Number.isFinite(liters) && liters > 0;

      if (!lastFull) {
        if (event.fueling_kind === "full" && validMeter) {
          lastFull = event;
          lastMeter = meter;
          intervalLiters = 0;
          intervalValid = true;
        }
        continue;
      }

      if (!validMeter) {
        intervalValid = false;
      } else if (lastMeter !== null && meter! < lastMeter) {
        intervalValid = false;
      }

      if (validLiters) intervalLiters += liters;
      else intervalValid = false;

      if (event.fueling_kind === "full") {
        const endTime = new Date(event.occurred_at).getTime();
        const startTime = new Date(startIso).getTime();
        const endTimeExclusive = new Date(endExclusiveIso).getTime();
        const delta = validMeter && lastFull.meter_value !== null
          ? meter! - Number(lastFull.meter_value)
          : null;
        if (
          intervalValid && delta !== null && Number.isFinite(delta) && delta > 0 &&
          intervalLiters > 0 && Number.isFinite(endTime) &&
          endTime >= startTime && endTime < endTimeExclusive
        ) {
          validIntervals += 1;
          totalLiters += intervalLiters;
          totalDistanceOrHours += delta;
        }
        // A full-tank event starts a new interval even when the prior interval was invalid.
        lastFull = validMeter ? event : null;
        lastMeter = validMeter ? meter : null;
        intervalLiters = 0;
        intervalValid = true;
      } else if (validMeter) {
        lastMeter = meter;
      }
    }

    const consumption = totalDistanceOrHours > 0 && totalLiters > 0
      ? unit === "km/l" ? totalDistanceOrHours / totalLiters : totalLiters / totalDistanceOrHours
      : null;
    result.set(vehicle.id, {
      vehicleId: vehicle.id,
      consumption,
      unit,
      validIntervals,
      liters: totalLiters,
      distanceOrHours: totalDistanceOrHours
    });
  }
  return result;
}

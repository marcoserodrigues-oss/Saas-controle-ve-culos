export type TireLifecycleAsset = {
  id: string;
  status: string;
  purchase_cost_cents: number | string | null;
};

export type TireLifecycleEvent = {
  id: string;
  tire_id: string;
  event_type: string;
  occurred_at: string;
  created_at?: string | null;
  vehicle_id: string | null;
  meter_value: number | string | null;
  cost_cents: number | string | null;
  reason?: string | null;
};

export type TireLifecycleMetrics = {
  km: number;
  cycles: number;
  measuredCycles: number;
  completedDays: number;
  activeDays: number;
  lastMountAt: string | null;
  lastEndAt: string | null;
  retreadCount: number;
  retreadCostCents: number;
  totalCostCents: number;
  costPerKmCents: number | null;
  averageKmPerCycle: number | null;
  currentCycleKm: number | null;
  estimatedKmRemaining: number | null;
};

function numericValue(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function isMountAdjustment(event: TireLifecycleEvent): boolean {
  return event.event_type === "adjustment" && event.reason?.startsWith("Ajuste para Montado") === true;
}

function isEndAdjustment(event: TireLifecycleEvent): boolean {
  return event.event_type === "adjustment"
    && event.reason?.startsWith("Ajuste para ") === true
    && !isMountAdjustment(event);
}

export function calculateTireLifecycleReport(
  tires: TireLifecycleAsset[],
  events: TireLifecycleEvent[],
  now = Date.now()
): Map<string, TireLifecycleMetrics> {
  const ordered = [...events].sort((a, b) => {
    const occurredDiff = new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime();
    if (occurredDiff !== 0) return occurredDiff;
    const createdDiff = new Date(a.created_at ?? a.occurred_at).getTime()
      - new Date(b.created_at ?? b.occurred_at).getTime();
    return createdDiff || a.id.localeCompare(b.id);
  });

  const eventsByTire = new Map<string, TireLifecycleEvent[]>();
  for (const event of ordered) {
    const list = eventsByTire.get(event.tire_id) ?? [];
    list.push(event);
    eventsByTire.set(event.tire_id, list);
  }

  const report = new Map<string, TireLifecycleMetrics>();
  for (const tire of tires) {
    let cycleStart: string | null = null;
    let segmentVehicle: string | null = null;
    let segmentMeter: number | null = null;
    let km = 0;
    let currentCycleKm = 0;
    let currentCycleDistanceComplete = false;
    let currentCycleHasValidSegment = false;
    let cycles = 0;
    let completedDays = 0;
    let lastMountAt: string | null = null;
    let lastEndAt: string | null = null;
    let retreadCount = 0;
    let retreadCostCents = 0;
    let eventCostCents = 0;
    const measuredCycleKms: number[] = [];
    const tireEvents = eventsByTire.get(tire.id) ?? [];

    // When a recapagem returns, its final cost replaces the estimate/contracted
    // amount entered on the send event. Pair each return with the oldest pending
    // send so reports never count both values as separate expenses.
    const supersededRetreadSendIds = new Set<string>();
    const pendingRetreadSends: TireLifecycleEvent[] = [];
    for (const event of tireEvents) {
      if (event.event_type === "retread_sent") pendingRetreadSends.push(event);
      else if (event.event_type === "retread_returned" && pendingRetreadSends.length) {
        const pairedSend = pendingRetreadSends.shift();
        if (pairedSend) supersededRetreadSendIds.add(pairedSend.id);
      }
    }

    for (const event of tireEvents) {
      const meter = numericValue(event.meter_value);
      const eventCost = numericValue(event.cost_cents) ?? 0;
      const supersededEstimate = event.event_type === "retread_sent" && supersededRetreadSendIds.has(event.id);

      // Acquisition cost is already stored on tires.purchase_cost_cents; excluding
      // "purchase" events avoids counting the same purchase twice. A completed
      // recapagem uses the return's final cost instead of its earlier estimate.
      if (event.event_type !== "purchase" && !supersededEstimate) eventCostCents += eventCost;
      if (event.event_type === "retread_sent") retreadCount += 1;
      if ((event.event_type === "retread_sent" && !supersededEstimate) || event.event_type === "retread_returned") {
        retreadCostCents += eventCost;
      }

      const isMount = event.event_type === "mount" || isMountAdjustment(event);
      if (isMount) {
        cycleStart = event.occurred_at;
        lastMountAt = event.occurred_at;
        segmentVehicle = event.vehicle_id;
        segmentMeter = meter;
        currentCycleKm = 0;
        currentCycleHasValidSegment = false;
        currentCycleDistanceComplete = Boolean(segmentVehicle && segmentMeter !== null);
        continue;
      }

      const isMove = event.event_type === "rotation" || event.event_type === "transfer";
      if (isMove && cycleStart) {
        if (segmentVehicle && segmentVehicle === event.vehicle_id && segmentMeter !== null && meter !== null && meter >= segmentMeter) {
          const delta = meter - segmentMeter;
          km += delta;
          currentCycleKm += delta;
          currentCycleHasValidSegment = true;
        } else {
          // We cannot infer the missing distance or compare odometers across assets.
          currentCycleDistanceComplete = false;
        }
        segmentVehicle = event.vehicle_id;
        segmentMeter = meter;
        if (!segmentVehicle || segmentMeter === null) currentCycleDistanceComplete = false;
        continue;
      }

      const closesCycle = ["dismount", "retread_sent", "repair", "scrap"].includes(event.event_type) || isEndAdjustment(event);
      if (closesCycle && cycleStart) {
        if (segmentVehicle && segmentVehicle === event.vehicle_id && segmentMeter !== null && meter !== null && meter >= segmentMeter) {
          const delta = meter - segmentMeter;
          km += delta;
          currentCycleKm += delta;
          currentCycleHasValidSegment = true;
        } else {
          currentCycleDistanceComplete = false;
        }

        cycles += 1;
        completedDays += Math.max(0, Math.floor(
          (new Date(event.occurred_at).getTime() - new Date(cycleStart).getTime()) / 86400000
        ));
        lastEndAt = event.occurred_at;
        if (currentCycleDistanceComplete && currentCycleHasValidSegment && currentCycleKm > 0) {
          measuredCycleKms.push(currentCycleKm);
        }
        cycleStart = null;
        segmentVehicle = null;
        segmentMeter = null;
        currentCycleKm = 0;
        currentCycleDistanceComplete = false;
        currentCycleHasValidSegment = false;
      }
    }

    const hasActiveCycle = tire.status === "mounted" && cycleStart !== null;
    const activeDays = hasActiveCycle
      ? Math.max(0, Math.floor((now - new Date(cycleStart as string).getTime()) / 86400000))
      : 0;
    const averageKmPerCycle = measuredCycleKms.length
      ? measuredCycleKms.reduce((sum, distance) => sum + distance, 0) / measuredCycleKms.length
      : null;
    const totalCostCents = (numericValue(tire.purchase_cost_cents) ?? 0) + eventCostCents;
    const costPerKmCents = km > 0 ? totalCostCents / km : null;
    const forecastIsSupported = hasActiveCycle
      && measuredCycleKms.length >= 2
      && averageKmPerCycle !== null
      && currentCycleDistanceComplete
      && currentCycleHasValidSegment
      && segmentVehicle !== null
      && segmentMeter !== null;
    const estimatedKmRemaining = forecastIsSupported
      ? Math.max(0, averageKmPerCycle! - currentCycleKm)
      : null;

    report.set(tire.id, {
      km,
      cycles,
      measuredCycles: measuredCycleKms.length,
      completedDays,
      activeDays,
      lastMountAt,
      lastEndAt,
      retreadCount,
      retreadCostCents,
      totalCostCents,
      costPerKmCents,
      averageKmPerCycle,
      currentCycleKm: hasActiveCycle ? currentCycleKm : null,
      estimatedKmRemaining
    });
  }

  return report;
}

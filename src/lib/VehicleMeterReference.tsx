import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";
import { supabase } from "./supabase";

type Props = { organizationId: string; vehicleId: string; meterKind?: string; initialMeter?: number | null };
type Reading = { value: number; source: string; at: string | null };

export function VehicleMeterReference({ organizationId, vehicleId, meterKind = "odometer", initialMeter = 0 }: Props) {
  const [reading, setReading] = useState<Reading | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!vehicleId || !supabase) { setReading(null); return; }
    setLoading(true);
    void (async () => {
      const [fuel, orderOpen, orderClose, tires] = await Promise.all([
        supabase!.from("fuel_events").select("meter_value,occurred_at").eq("organization_id", organizationId).eq("vehicle_id", vehicleId).neq("status", "cancelled").not("meter_value", "is", null).order("meter_value", { ascending: false }).limit(1).maybeSingle(),
        supabase!.from("work_orders").select("meter_at_open,opened_at").eq("organization_id", organizationId).eq("vehicle_id", vehicleId).neq("status", "cancelled").not("meter_at_open", "is", null).order("meter_at_open", { ascending: false }).limit(1).maybeSingle(),
        supabase!.from("work_orders").select("meter_at_close,closed_at,opened_at").eq("organization_id", organizationId).eq("vehicle_id", vehicleId).neq("status", "cancelled").not("meter_at_close", "is", null).order("meter_at_close", { ascending: false }).limit(1).maybeSingle(),
        supabase!.from("tire_events").select("meter_value,occurred_at").eq("organization_id", organizationId).eq("vehicle_id", vehicleId).not("meter_value", "is", null).order("meter_value", { ascending: false }).limit(1).maybeSingle()
      ]);
      const rows: Reading[] = [];
      const baseline = Number(initialMeter);
      if (Number.isFinite(baseline) && baseline >= 0) rows.push({ value: baseline, source: "Cadastro do veículo", at: null });
      if (fuel.data && Number.isFinite(Number(fuel.data.meter_value))) rows.push({ value: Number(fuel.data.meter_value), source: "Abastecimento", at: fuel.data.occurred_at ?? null });
      if (orderOpen.data && Number.isFinite(Number(orderOpen.data.meter_at_open))) rows.push({ value: Number(orderOpen.data.meter_at_open), source: "Abertura de OS", at: orderOpen.data.opened_at ?? null });
      if (orderClose.data && Number.isFinite(Number(orderClose.data.meter_at_close))) rows.push({ value: Number(orderClose.data.meter_at_close), source: "Fechamento de OS", at: orderClose.data.closed_at ?? orderClose.data.opened_at ?? null });
      if (tires.data && Number.isFinite(Number(tires.data.meter_value))) rows.push({ value: Number(tires.data.meter_value), source: "Evento de pneus", at: tires.data.occurred_at ?? null });
      rows.sort((a, b) => b.value - a.value || (b.at ?? "").localeCompare(a.at ?? ""));
      if (alive) { setReading(rows[0] ?? null); setLoading(false); }
    })().catch(() => { if (alive) { setReading(null); setLoading(false); } });
    return () => { alive = false; };
  }, [organizationId, vehicleId, meterKind, initialMeter]);
  if (!vehicleId) return null;
  const unit = meterKind === "hourmeter" ? "h" : "km";
  return <div role="status" aria-live="polite" style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "10px 12px", margin: "0 0 12px", border: "1px solid #bfdbfe", borderRadius: 9, background: "#eff6ff", color: "#1e3a8a", fontSize: 13 }}>
    <Gauge size={18} style={{ flexShrink: 0, marginTop: 1 }} />
    <div><div style={{ fontWeight: 750 }}>Última leitura válida de referência</div>
      {loading ? <div>Consultando registros…</div> : reading ? <>
        <div style={{ fontSize: 18, fontWeight: 800 }}>{new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(reading.value)} {unit}</div>
        <div style={{ color: "#475569", fontSize: 12 }}>Origem: {reading.source}{reading.at ? " · Data: " + new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(reading.at)) : ""}</div>
        <div style={{ color: "#475569", fontSize: 12, marginTop: 3 }}>Use esta leitura como referência. Leituras inválidas continuam bloqueadas pelo banco.</div>
      </> : <div>Sem leitura disponível. Confira o hodômetro/horímetro inicial do cadastro.</div>}
    </div>
  </div>;
}

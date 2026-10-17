import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, CalendarClock, CheckCircle2, CircleDot, Clock3,
  Fuel, RefreshCw, Truck, Wrench
} from "lucide-react";
import {
  asNumber, buildCostBreakdown, dateDaysAgo, dateEndExclusiveIso, dateStartIso,
  formatBrlCents, formatNumber, fuelCostCents, localDateInput, loadFleetAnalytics,
  tireEventCostCents, workOrderCostCents,
  type FleetAnalyticsData, type FleetTireEvent, type FleetWorkOrder
} from "../lib/fleetAnalytics";
import "../fleetAnalytics.css";

type ModuleTarget = "vehicles" | "fuel" | "maintenance" | "tires" | "reports" | "people";
type Props = { organizationId: string; onNavigate: (module: ModuleTarget) => void };
type ActivityRow = { id: string; at: string; title: string; detail: string; amountCents: number; kind: "fuel" | "maintenance" | "tire" | "expense" };

const emptyData = (): FleetAnalyticsData => ({
  vehicles: [], fuelEvents: [], workOrders: [], tires: [], tireEvents: [],
  standaloneExpenses: [], maintenancePlans: [], drivers: []
});
const openOrderStatuses = new Set(["open", "in_progress", "waiting_parts"]);
const orderStatusLabel: Record<string, string> = {
  open: "Aberta", in_progress: "Em andamento", waiting_parts: "Aguardando peças",
  closed: "Concluída", cancelled: "Cancelada"
};
const tireEventLabel: Record<string, string> = {
  purchase: "Compra de pneu", mount: "Montagem", dismount: "Desmontagem",
  rotation: "Rodízio", transfer: "Transferência", retread_sent: "Enviado para recapagem",
  retread_returned: "Retorno da recapagem", repair: "Reparo", inspection: "Inspeção",
  scrap: "Descarte", adjustment: "Ajuste de status"
};

function isInRange(value: string, startIso: string, endExclusiveIso: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time >= new Date(startIso).getTime() && time < new Date(endExclusiveIso).getTime();
}

function addDaysToDate(dateValue: string, days: number) {
  const date = new Date(dateValue + "T12:00:00");
  date.setDate(date.getDate() + days);
  return localDateInput(date);
}

function shortDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(date);
}

function statusCounts(data: FleetAnalyticsData) {
  const activeTires = data.tires.filter(t => !["sold", "scrapped"].includes(t.status));
  return {
    mounted: data.tires.filter(t => t.status === "mounted").length,
    inStock: data.tires.filter(t => t.status === "in_stock").length,
    inProcess: data.tires.filter(t => t.status === "retread" || t.status === "repair").length,
    activeTires: activeTires.length
  };
}

export function Dashboard({ organizationId, onNavigate }: Props) {
  const [windowDays, setWindowDays] = useState("30");
  const [today] = useState(() => localDateInput());
  const [data, setData] = useState<FleetAnalyticsData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const startDate = useMemo(
    () => dateDaysAgo(Number(windowDays), new Date(today + "T12:00:00")),
    [today, windowDays]
  );
  const startIso = useMemo(() => dateStartIso(startDate), [startDate]);
  const endExclusiveIso = useMemo(() => dateEndExclusiveIso(today), [today]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const nextData = await loadFleetAnalytics(organizationId, startIso, endExclusiveIso);
      setData(nextData);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os indicadores da frota.");
    } finally {
      setLoading(false);
    }
  }, [organizationId, startIso, endExclusiveIso, refreshKey]);

  useEffect(() => { void load(); }, [load]);

  const rangeWorkOrders = useMemo(
    () => data.workOrders.filter(o => isInRange(o.opened_at, startIso, endExclusiveIso)),
    [data.workOrders, startIso, endExclusiveIso]
  );
  const rangeData = useMemo(() => ({ ...data, workOrders: rangeWorkOrders }), [data, rangeWorkOrders]);
  const costs = useMemo(() => buildCostBreakdown(rangeData), [rangeData]);
  const tireCounts = useMemo(() => statusCounts(data), [data]);
  const activeVehicles = data.vehicles.filter(v => v.status === "active").length;
  const openOrders = data.workOrders.filter(o => openOrderStatuses.has(o.status));
  const waitingParts = openOrders.filter(o => o.status === "waiting_parts").length;
  const overduePlans = data.maintenancePlans.filter(plan =>
    plan.interval_days !== null &&
    plan.last_done_at !== null &&
    addDaysToDate(plan.last_done_at, plan.interval_days) < today
  );
  const licenseAlerts = data.drivers.filter(driver =>
    driver.status === "active" && driver.license_expiry !== null &&
    driver.license_expiry <= addDaysToDate(today, 30)
  );
  const maxCost = Math.max(costs.fuelCents, costs.maintenanceCents, costs.tireCents, costs.otherCents, 1);

  const recentActivity = useMemo(() => {
    const rows: ActivityRow[] = [];
    const vehicleMap = new Map(data.vehicles.map(v => [v.id, v]));
    const tireMap = new Map(data.tires.map(t => [t.id, t]));
    for (const event of data.fuelEvents) {
      const vehicle = vehicleMap.get(event.vehicle_id);
      rows.push({
        id: "fuel-" + event.id, at: event.occurred_at, kind: "fuel",
        title: "Abastecimento",
        detail: vehicle ? vehicle.description + (vehicle.plate ? " · " + vehicle.plate : "") : "Veículo não identificado",
        amountCents: fuelCostCents(event)
      });
    }
    for (const order of rangeWorkOrders) {
      const vehicle = vehicleMap.get(order.vehicle_id);
      rows.push({
        id: "os-" + order.id, at: order.opened_at, kind: "maintenance",
        title: order.order_number + " · " + order.description,
        detail: (vehicle?.description ?? "Ativo não identificado") + " · " + (orderStatusLabel[order.status] ?? order.status),
        amountCents: workOrderCostCents(order)
      });
    }
    for (const event of data.tireEvents) {
      const tire = tireMap.get(event.tire_id);
      const vehicle = event.vehicle_id ? vehicleMap.get(event.vehicle_id) : undefined;
      rows.push({
        id: "tire-" + event.id, at: event.occurred_at, kind: "tire",
        title: (tireEventLabel[event.event_type] ?? event.event_type) + (tire ? " · " + tire.serial_number : ""),
        detail: vehicle ? vehicle.description : "Movimentação sem veículo associado",
        amountCents: tireEventCostCents(event)
      });
    }
    for (const expense of data.standaloneExpenses) {
      const vehicle = expense.vehicle_id ? vehicleMap.get(expense.vehicle_id) : undefined;
      rows.push({
        id: "expense-" + expense.id, at: expense.expense_date + "T12:00:00", kind: "expense",
        title: expense.description || expense.category || "Despesa avulsa",
        detail: (vehicle?.description ? vehicle.description + " · " : "") + "Despesa não vinculada",
        amountCents: asNumber(expense.amount_cents)
      });
    }
    return rows.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 7);
  }, [data, rangeWorkOrders]);

  const statCards = [
    { label: "Veículos ativos", value: formatNumber(activeVehicles, 0), note: data.vehicles.length + " cadastro(s) não cancelado(s)", icon: Truck, tone: "blue" },
    { label: "Abastecimento no período", value: formatBrlCents(costs.fuelCents), note: formatNumber(data.fuelEvents.reduce((sum, row) => sum + asNumber(row.liters), 0)) + " litros registrados", icon: Fuel, tone: "orange" },
    { label: "Ordens em aberto", value: formatNumber(openOrders.length, 0), note: waitingParts + " aguardando peças", icon: Wrench, tone: "violet" },
    { label: "Pneus montados", value: formatNumber(tireCounts.mounted, 0), note: tireCounts.inStock + " em estoque · " + tireCounts.inProcess + " em recapagem/reparo", icon: CircleDot, tone: "teal" }
  ];

  return <section className="fleet-feature-shell" aria-label="Painel operacional da frota">
    <div className="fleet-feature-toolbar">
      <div>
        <h2>Painel operacional</h2>
        <p>Indicadores alimentados pelos cadastros e lançamentos da organização.</p>
      </div>
      <div className="fleet-toolbar-actions">
        <label className="fleet-inline-filter">Período
          <select value={windowDays} onChange={e => setWindowDays(e.target.value)}>
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
          </select>
        </label>
        <button type="button" className="secondary-button" onClick={() => setRefreshKey(v => v + 1)} disabled={loading}>
          <RefreshCw size={15}/> Atualizar
        </button>
      </div>
    </div>

    {error && <div className="vehicle-message vehicle-error" role="alert"><AlertTriangle size={17}/><span>{error}</span></div>}
    {loading && <div className="fleet-loading" role="status"><RefreshCw size={18} className="fleet-spin"/> Atualizando os indicadores...</div>}

    <div className="fleet-kpi-grid">
      {statCards.map(card => {
        const Icon = card.icon;
        return <article className="fleet-kpi-card" key={card.label}>
          <div className="fleet-kpi-head"><span>{card.label}</span><span className={"fleet-kpi-icon " + card.tone}><Icon size={18}/></span></div>
          <strong className="fleet-kpi-value">{loading ? "—" : card.value}</strong>
          <small>{loading ? "Carregando dados reais" : card.note}</small>
        </article>;
      })}
    </div>

    <div className="fleet-dashboard-grid">
      <article className="fleet-panel">
        <div className="fleet-panel-heading"><div><h3>Custos registrados</h3><p>Abastecimento, O.S. concluídas, pneus e despesas avulsas sem vínculo.</p></div><span className="fleet-period-chip">{shortDate(startIso)} — {shortDate(endExclusiveIso.substring(0, 10) + "T00:00:00")}</span></div>
        {(["fuelCents", "maintenanceCents", "tireCents", "otherCents"] as const).map((key, i) => {
          const labels = ["Combustível", "Manutenção concluída", "Pneus", "Despesas avulsas"];
          const values = [costs.fuelCents, costs.maintenanceCents, costs.tireCents, costs.otherCents];
          const tones = ["fuel", "maintenance", "tire", "other"];
          return <div className="fleet-cost-row" key={key}>
            <div className="fleet-cost-label"><span>{labels[i]}</span><strong>{loading ? "—" : formatBrlCents(values[i])}</strong></div>
            <div className="fleet-bar-track"><span className={"fleet-bar-fill " + tones[i]} style={{ width: (loading ? 0 : values[i] / maxCost * 100) + "%" }}/></div>
          </div>;
        })}
        {!loading && !error && costs.fuelCents === 0 && costs.maintenanceCents === 0 && costs.tireCents === 0 && costs.otherCents === 0 &&
          <div className="fleet-empty-inline"><Activity size={20}/><strong>Nenhum custo lançado neste período</strong><span>Os valores aparecerão aqui quando houver registros válidos.</span></div>}
        <div className="fleet-section-footer"><span>Custo total registrado</span><strong>{loading ? "—" : formatBrlCents(costs.fuelCents + costs.maintenanceCents + costs.tireCents + costs.otherCents)}</strong></div>
      </article>

      <article className="fleet-panel">
        <div className="fleet-panel-heading"><div><h3>Central de atenção</h3><p>Pontos que merecem acompanhamento.</p></div><AlertTriangle size={18} className="fleet-attention-icon"/></div>
        <div className="fleet-alert-list">
          <button type="button" onClick={() => onNavigate("maintenance")} className="fleet-alert-item">
            <span className="fleet-alert-icon amber"><Wrench size={16}/></span>
            <span className="fleet-alert-copy"><strong>Ordens em aberto</strong><small>Inclui abertas, em andamento e aguardando peças.</small></span>
            <b>{loading ? "—" : openOrders.length}</b>
          </button>
          <button type="button" onClick={() => onNavigate("maintenance")} className="fleet-alert-item">
            <span className="fleet-alert-icon blue"><CalendarClock size={16}/></span>
            <span className="fleet-alert-copy"><strong>Planos por data vencidos</strong><small>Considera apenas planos com intervalo em dias e última execução registrada.</small></span>
            <b>{loading ? "—" : overduePlans.length}</b>
          </button>
          <button type="button" onClick={() => onNavigate("people")} className="fleet-alert-item">
            <span className="fleet-alert-icon violet"><Clock3 size={16}/></span>
            <span className="fleet-alert-copy"><strong>CNH vencida ou vencendo em 30 dias</strong><small>Somente motoristas ativos com validade cadastrada.</small></span>
            <b>{loading ? "—" : licenseAlerts.length}</b>
          </button>
          <button type="button" onClick={() => onNavigate("tires")} className="fleet-alert-item">
            <span className="fleet-alert-icon teal"><CircleDot size={16}/></span>
            <span className="fleet-alert-copy"><strong>Pneus fora de operação</strong><small>Em recapagem ou em reparo.</small></span>
            <b>{loading ? "—" : tireCounts.inProcess}</b>
          </button>
        </div>
        {!loading && openOrders.length === 0 && overduePlans.length === 0 && licenseAlerts.length === 0 && tireCounts.inProcess === 0 &&
          <div className="fleet-clean-status"><CheckCircle2 size={15}/> Nenhuma pendência calculada a partir dos dados disponíveis.</div>}
      </article>
    </div>

    <article className="fleet-panel fleet-recent-panel">
      <div className="fleet-panel-heading"><div><h3>Movimentações recentes</h3><p>Até sete lançamentos do período selecionado.</p></div></div>
      {loading ? <div className="fleet-loading"><RefreshCw size={16} className="fleet-spin"/> Carregando movimentações...</div>
        : recentActivity.length === 0 ? <div className="fleet-empty-inline"><Activity size={20}/><strong>Sem movimentações no período</strong><span>Faça um lançamento em abastecimentos, manutenção ou gestão de pneus para vê-lo aqui.</span></div>
        : <div className="fleet-recent-list">{recentActivity.map(row => <div className="fleet-recent-row" key={row.id}>
          <span className={"fleet-recent-icon " + row.kind}>{row.kind === "fuel" ? <Fuel size={16}/> : row.kind === "maintenance" ? <Wrench size={16}/> : row.kind === "tire" ? <CircleDot size={16}/> : <Activity size={16}/>}</span>
          <span className="fleet-recent-copy"><strong>{row.title}</strong><small>{row.detail}</small></span>
          <span className="fleet-recent-date">{shortDate(row.at)}</span>
          <strong className="fleet-recent-amount">{row.amountCents ? formatBrlCents(row.amountCents) : "—"}</strong>
        </div>)}</div>}
    </article>

    <div className="fleet-quick-links">
      <button type="button" onClick={() => onNavigate("vehicles")}><Truck size={17}/><span><strong>Veículos</strong><small>Cadastros e ativos</small></span><b>→</b></button>
      <button type="button" onClick={() => onNavigate("fuel")}><Fuel size={17}/><span><strong>Abastecimentos</strong><small>Litros e despesas</small></span><b>→</b></button>
      <button type="button" onClick={() => onNavigate("maintenance")}><Wrench size={17}/><span><strong>Manutenção</strong><small>Ordens e preventivas</small></span><b>→</b></button>
      <button type="button" onClick={() => onNavigate("reports")}><Activity size={17}/><span><strong>Relatórios</strong><small>Custos por veículo</small></span><b>→</b></button>
    </div>
  </section>;
}

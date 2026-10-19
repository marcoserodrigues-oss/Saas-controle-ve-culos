import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, BarChart3, CalendarDays, Download, RefreshCw, Wallet } from "lucide-react";
import {
  asNumber, buildCostBreakdown, buildVehicleCostRows, dateDaysAgo, dateEndExclusiveIso,
  dateStartIso, formatBrlCents, formatNumber, localDateInput, loadFleetAnalytics,
  loadFuelConsumptionHistory, type FleetAnalyticsData
} from "../lib/fleetAnalytics";
import { calculateFuelConsumptionByVehicle } from "../domain/metrics";
import "../fleetAnalytics.css";

type Props = { organizationId: string };
type MonthlyCost = { key: string; label: string; fuelCents: number; maintenanceCents: number; tireCents: number; otherCents: number; totalCents: number };

const emptyData = (): FleetAnalyticsData => ({
  vehicles: [], fuelEvents: [], workOrders: [], tires: [], tireEvents: [],
  standaloneExpenses: [], maintenancePlans: [], drivers: []
});
const openOrderStatuses = new Set(["open", "in_progress", "waiting_parts"]);

function isInRange(value: string, startIso: string, endExclusiveIso: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) && time >= new Date(startIso).getTime() && time < new Date(endExclusiveIso).getTime();
}

function monthKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
}
function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit" }).format(new Date(year, month - 1, 15));
}
function exportCell(value: string | number) {
  const text = String(value ?? "");
  return /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
}
function moneyForCsv(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function ReportsManager({ organizationId }: Props) {
  const [fromDate, setFromDate] = useState(() => dateDaysAgo(30));
  const [toDate, setToDate] = useState(() => localDateInput());
  const [appliedFrom, setAppliedFrom] = useState(() => dateDaysAgo(30));
  const [appliedTo, setAppliedTo] = useState(() => localDateInput());
  const [data, setData] = useState<FleetAnalyticsData>(emptyData);
  const [fuelHistory, setFuelHistory] = useState<Awaited<ReturnType<typeof loadFuelConsumptionHistory>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");

  const startIso = useMemo(() => dateStartIso(appliedFrom), [appliedFrom]);
  const endExclusiveIso = useMemo(() => dateEndExclusiveIso(appliedTo), [appliedTo]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [next, history] = await Promise.all([
        loadFleetAnalytics(organizationId, startIso, endExclusiveIso),
        loadFuelConsumptionHistory(organizationId, endExclusiveIso)
      ]);
      setData(next);
      setFuelHistory(history);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível carregar os relatórios.");
    } finally {
      setLoading(false);
    }
  }, [organizationId, startIso, endExclusiveIso, refreshKey]);

  useEffect(() => { void load(); }, [load]);

  const rangeWorkOrders = useMemo(
    () => data.workOrders.filter(order => isInRange(order.status === "closed" ? order.closed_at ?? order.opened_at : order.opened_at, startIso, endExclusiveIso)),
    [data.workOrders, startIso, endExclusiveIso]
  );
  const rangeData = useMemo(() => ({ ...data, workOrders: rangeWorkOrders }), [data, rangeWorkOrders]);
  const reportData = useMemo<FleetAnalyticsData>(() => {
    if (!selectedVehicleId) return rangeData;
    return {
      ...rangeData,
      vehicles: rangeData.vehicles.filter(vehicle => vehicle.id === selectedVehicleId),
      fuelEvents: rangeData.fuelEvents.filter(row => row.vehicle_id === selectedVehicleId),
      workOrders: rangeData.workOrders.filter(row => row.vehicle_id === selectedVehicleId),
      tireEvents: rangeData.tireEvents.filter(row => row.vehicle_id === selectedVehicleId),
      standaloneExpenses: rangeData.standaloneExpenses.filter(row => row.vehicle_id === selectedVehicleId)
    };
  }, [rangeData, selectedVehicleId]);
  const costs = useMemo(() => buildCostBreakdown(reportData), [reportData]);
  const vehicleRows = useMemo(() => buildVehicleCostRows(reportData), [reportData]);
  const consumptionByVehicle = useMemo(
    () => calculateFuelConsumptionByVehicle(reportData.vehicles, fuelHistory, startIso, endExclusiveIso),
    [reportData.vehicles, fuelHistory, startIso, endExclusiveIso]
  );
  const fuelConsumptionRows = useMemo(
    () => [...data.vehicles]
      .map(vehicle => ({ vehicle, metric: consumptionByVehicle.get(vehicle.id) }))
      .sort((a, b) => a.vehicle.description.localeCompare(b.vehicle.description, "pt-BR")),
    [reportData.vehicles, consumptionByVehicle]
  );
  const closedOrders = reportData.workOrders.filter(order => order.status === "closed");
  const openOrders = reportData.workOrders.filter(order => openOrderStatuses.has(order.status));
  const totalFuelLiters = reportData.fuelEvents.reduce((sum, row) => sum + asNumber(row.liters), 0);
  const totalCostCents = costs.fuelCents + costs.maintenanceCents + costs.tireCents + costs.otherCents;
  const unassignedTireCost = reportData.tireEvents.filter(event => !event.vehicle_id).reduce((sum, event) => sum + asNumber(event.cost_cents), 0);
  const unassignedExpenseCost = reportData.standaloneExpenses.filter(expense => !expense.vehicle_id).reduce((sum, expense) => sum + asNumber(expense.amount_cents), 0);
  const unassignedCost = unassignedTireCost + unassignedExpenseCost;

  const monthlyRows = useMemo(() => {
    const months = new Map<string, MonthlyCost>();
    const ensure = (value: string) => {
      const key = value.length === 10 ? value.slice(0, 7) : monthKey(value);
      if (!key) return undefined;
      if (!months.has(key)) months.set(key, { key, label: monthLabel(key), fuelCents: 0, maintenanceCents: 0, tireCents: 0, otherCents: 0, totalCents: 0 });
      return months.get(key)!;
    };
    for (const row of reportData.fuelEvents) {
      const bucket = ensure(row.occurred_at);
      if (bucket) bucket.fuelCents += row.total_cents === null ? Math.round(asNumber(row.liters) * asNumber(row.unit_price_cents)) : asNumber(row.total_cents);
    }
    for (const row of reportData.workOrders) {
      if (row.status !== "closed") continue;
      const bucket = ensure(row.closed_at ?? row.opened_at);
      if (bucket) bucket.maintenanceCents += asNumber(row.labor_cost_cents) + asNumber(row.parts_cost_cents);
    }
    for (const row of reportData.tireEvents) {
      const bucket = ensure(row.occurred_at);
      if (bucket) bucket.tireCents += asNumber(row.cost_cents);
    }
    for (const row of reportData.standaloneExpenses) {
      const bucket = ensure(row.expense_date);
      if (bucket) bucket.otherCents += asNumber(row.amount_cents);
    }
    for (const row of months.values()) row.totalCents = row.fuelCents + row.maintenanceCents + row.tireCents + row.otherCents;
    return [...months.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [reportData.fuelEvents, reportData.tireEvents, reportData.standaloneExpenses, reportData.workOrders]);
  const maxMonth = Math.max(1, ...monthlyRows.map(row => row.totalCents));

  function applyRange() {
    if (!fromDate || !toDate) { setError("Informe a data inicial e a data final."); return; }
    if (fromDate > toDate) { setError("A data inicial não pode ser posterior à data final."); return; }
    setError("");
    setAppliedFrom(fromDate);
    setAppliedTo(toDate);
  }
  function setLast30Days() {
    const start = dateDaysAgo(30);
    const end = localDateInput();
    setFromDate(start);
    setToDate(end);
    setError("");
    setAppliedFrom(start);
    setAppliedTo(end);
  }

  function downloadCsv() {
    const rows = [
      ["Veículo", "Placa", "Abastecimento (R$)", "Manutenção concluída (R$)", "Pneus (R$)", "Despesas avulsas (R$)", "Total registrado (R$)"],
      ...vehicleRows.map(row => [
        row.vehicleName, row.plate,
        moneyForCsv(row.fuelCents), moneyForCsv(row.maintenanceCents),
        moneyForCsv(row.tireCents), moneyForCsv(row.otherCents), moneyForCsv(row.totalCents)
      ]),
      ["Custos sem veículo associado", "", "", "", moneyForCsv(unassignedTireCost), moneyForCsv(unassignedExpenseCost), moneyForCsv(unassignedCost)]
    ];
    const csv = "\uFEFF" + rows.map(row => row.map(value => exportCell(value).replace(/"/g, '""')).map(value => '"' + value + '"').join(";")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "fleetwise-custos-" + appliedFrom + "-a-" + appliedTo + ".csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return <section className="fleet-feature-shell" aria-label="Relatórios gerenciais da frota">
    <div className="fleet-feature-toolbar">
      <div><h2>Relatórios gerenciais</h2><p>Consulte os indicadores e custos por período e filtre um veículo/equipamento específico.</p></div>
      <div className="fleet-toolbar-actions">
        <button type="button" className="secondary-button" onClick={() => setRefreshKey(v => v + 1)} disabled={loading}><RefreshCw size={15}/> Atualizar dados</button>
        <button type="button" className="primary-button" onClick={downloadCsv} disabled={loading}><Download size={15}/> Exportar CSV</button>
      </div>
    </div>

    <div className="fleet-period-form panel">
      <div className="fleet-period-title"><CalendarDays size={17}/><strong>Período de apuração</strong></div>
      <label>Data inicial<input type="date" value={fromDate} max={toDate || undefined} onChange={e => setFromDate(e.target.value)}/></label>
      <label>Data final<input type="date" value={toDate} min={fromDate || undefined} onChange={e => setToDate(e.target.value)}/></label>
      <label>Veículo / equipamento<select value={selectedVehicleId} onChange={e => setSelectedVehicleId(e.target.value)}><option value="">Todos os veículos</option>{data.vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.description}{vehicle.plate ? " · " + vehicle.plate : ""}</option>)}</select></label>
      <button type="button" className="primary-button" onClick={applyRange} disabled={loading}>Aplicar período</button>
      <button type="button" className="secondary-button" onClick={setLast30Days} disabled={loading}>Últimos 30 dias</button>
    </div>

    {error && <div className="vehicle-message vehicle-error" role="alert"><AlertCircle size={17}/><span>{error}</span></div>}
    {loading && <div className="fleet-loading" role="status"><RefreshCw size={18} className="fleet-spin"/> Carregando relatórios...</div>}

    <div className="fleet-kpi-grid fleet-report-kpis">
      <article className="fleet-kpi-card"><div className="fleet-kpi-head"><span>Custos registrados</span><span className="fleet-kpi-icon blue"><Wallet size={18}/></span></div><strong className="fleet-kpi-value">{loading ? "—" : formatBrlCents(totalCostCents)}</strong><small>Quatro grupos de custos no período</small></article>
      <article className="fleet-kpi-card"><div className="fleet-kpi-head"><span>Combustível</span><span className="fleet-kpi-icon orange"><span>R$</span></span></div><strong className="fleet-kpi-value">{loading ? "—" : formatBrlCents(costs.fuelCents)}</strong><small>{loading ? "—" : formatNumber(totalFuelLiters) + " litros registrados"}</small></article>
      <article className="fleet-kpi-card"><div className="fleet-kpi-head"><span>Manutenção concluída</span><span className="fleet-kpi-icon violet"><BarChart3 size={18}/></span></div><strong className="fleet-kpi-value">{loading ? "—" : formatBrlCents(costs.maintenanceCents)}</strong><small>{loading ? "—" : closedOrders.length + " ordem(ns) concluída(s)"}</small></article>
      <article className="fleet-kpi-card"><div className="fleet-kpi-head"><span>OS em aberto</span><span className="fleet-kpi-icon teal"><CalendarDays size={18}/></span></div><strong className="fleet-kpi-value">{loading ? "—" : formatNumber(openOrders.length, 0)}</strong><small>No período escolhido</small></article>
    </div>

    <article className="fleet-panel">
      <div className="fleet-panel-heading"><div><h3>Consumo médio por veículo / equipamento</h3><p>Calculado entre abastecimentos completos, somando abastecimentos parciais intermediários.</p></div></div>
      <div className="fleet-table-wrap"><table className="fleet-table">
        <thead><tr><th>Veículo / equipamento</th><th>Consumo médio</th><th>Ciclos válidos</th><th>Distância / horas</th><th>Litros considerados</th></tr></thead>
        <tbody>
          {fuelConsumptionRows.map(({vehicle, metric}) => <tr key={vehicle.id}>
            <td><strong>{vehicle.description}</strong><small>{vehicle.plate || "Sem placa cadastrada"}</small></td>
            <td><strong>{metric?.consumption == null ? "—" : formatNumber(metric.consumption, 2) + " " + metric.unit}</strong></td>
            <td>{metric?.validIntervals ?? 0}</td>
            <td>{metric ? formatNumber(metric.distanceOrHours) + (metric.unit === "km/l" ? " km" : " h") : "—"}</td>
            <td>{metric ? formatNumber(metric.liters) + " L" : "—"}</td>
          </tr>)}
          {!loading && fuelConsumptionRows.length === 0 && <tr><td colSpan={5}>Nenhum veículo cadastrado.</td></tr>}
        </tbody>
      </table></div>
      <p className="tire-footnote">A média só considera ciclos completos entre dois abastecimentos marcados como “Tanque cheio”. Intervalos com leitura ausente, decrescente ou distância/horas zero são descartados. O histórico anterior ao período é consultado para não distorcer o primeiro ciclo.</p>
    </article>

    <div className="fleet-report-grid">
      <article className="fleet-panel">
        <div className="fleet-panel-heading"><div><h3>Custos por mês</h3><p>Comparação dos valores registrados no intervalo selecionado.</p></div></div>
        <div className="fleet-chart-legend"><span><i className="fuel"/> Combustível</span><span><i className="maintenance"/> Manutenção</span><span><i className="tire"/> Pneus</span><span><i className="other"/> Despesas avulsas</span></div>
        {monthlyRows.length === 0 ? <div className="fleet-empty-inline"><BarChart3 size={20}/><strong>Sem valores para o período</strong><span>Quando houver lançamentos, eles serão agrupados por mês.</span></div>
          : <div className="fleet-monthly-chart">{monthlyRows.map(row => <div className="fleet-month-row" key={row.key}>
            <span className="fleet-month-label">{row.label}</span>
            <div className="fleet-month-bar-track" title={"Total: " + formatBrlCents(row.totalCents)}>
              <span className="fleet-month-segment fuel" style={{ width: (row.fuelCents / maxMonth * 100) + "%" }}/>
              <span className="fleet-month-segment maintenance" style={{ width: (row.maintenanceCents / maxMonth * 100) + "%" }}/>
              <span className="fleet-month-segment tire" style={{ width: (row.tireCents / maxMonth * 100) + "%" }}/>
              <span className="fleet-month-segment other" style={{ width: (row.otherCents / maxMonth * 100) + "%" }}/>
            </div>
            <strong className="fleet-month-total">{formatBrlCents(row.totalCents)}</strong>
          </div>)}</div>}
      </article>

      <article className="fleet-panel fleet-report-sidepanel">
        <div className="fleet-panel-heading"><div><h3>Composição dos custos</h3><p>Origem do valor registrado no período.</p></div></div>
        {([
          ["Combustível", costs.fuelCents, "fuel"],
          ["Manutenção concluída", costs.maintenanceCents, "maintenance"],
          ["Eventos de pneus", costs.tireCents, "tire"],
          ["Despesas avulsas sem vínculo", costs.otherCents, "other"]
        ] as const).map(([label, value, tone]) => <div className="fleet-cost-row" key={label}>
          <div className="fleet-cost-label"><span>{label}</span><strong>{loading ? "—" : formatBrlCents(value)}</strong></div>
          <div className="fleet-bar-track"><span className={"fleet-bar-fill " + tone} style={{ width: (loading ? 0 : totalCostCents > 0 ? value / totalCostCents * 100 : 0) + "%" }}/></div>
        </div>)}
        <div className="fleet-section-footer"><span>Sem veículo associado</span><strong>{loading ? "—" : formatBrlCents(unassignedCost)}</strong></div>
      </article>
    </div>

    <article className="fleet-panel fleet-vehicle-cost-panel">
      <div className="fleet-panel-heading"><div><h3>Custos por veículo / equipamento</h3><p>Somente despesas vinculadas ao ativo; O.S. considera custos de ordens concluídas.</p></div><span className="fleet-record-count">{loading ? "—" : vehicleRows.length + " ativo(s)"}</span></div>
      <div className="fleet-table-wrap"><table className="fleet-table">
        <thead><tr><th>Veículo / equipamento</th><th>Abastecimento</th><th>Manutenção</th><th>Pneus</th><th>Despesas avulsas</th><th>Total</th></tr></thead>
        <tbody>
          {vehicleRows.map(row => <tr key={row.vehicleId}>
            <td><strong>{row.vehicleName}</strong><small>{row.plate || "Sem placa cadastrada"}</small></td>
            <td>{formatBrlCents(row.fuelCents)}</td><td>{formatBrlCents(row.maintenanceCents)}</td><td>{formatBrlCents(row.tireCents)}</td><td>{formatBrlCents(row.otherCents)}</td><td><strong>{formatBrlCents(row.totalCents)}</strong></td>
          </tr>)}
          {!loading && vehicleRows.length === 0 && <tr><td colSpan={6}><div className="fleet-empty-inline"><Wallet size={20}/><strong>Nenhum veículo encontrado</strong><span>Cadastre ativos e registre custos para preencher este relatório.</span></div></td></tr>}
        </tbody>
        {vehicleRows.length > 0 && <tfoot><tr><th>Total vinculado a ativos</th><th>{formatBrlCents(vehicleRows.reduce((sum, r) => sum + r.fuelCents, 0))}</th><th>{formatBrlCents(vehicleRows.reduce((sum, r) => sum + r.maintenanceCents, 0))}</th><th>{formatBrlCents(vehicleRows.reduce((sum, r) => sum + r.tireCents, 0))}</th><th>{formatBrlCents(vehicleRows.reduce((sum, r) => sum + r.otherCents, 0))}</th><th>{formatBrlCents(vehicleRows.reduce((sum, r) => sum + r.totalCents, 0))}</th></tr></tfoot>}
      </table></div>
      <p className="fleet-footnote">O relatório não soma despesas ligadas a ordens de serviço ou a outra origem; só considera despesas avulsas sem vínculo para reduzir risco de dupla contagem. Eventos de pneus sem veículo aparecem no indicador “Sem veículo associado”.</p>
    </article>
  </section>;
}

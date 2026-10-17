import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import {
  AlertCircle, ArrowLeft, CheckCircle2, ClipboardList, Download, FileText, Fuel,
  Plus, RefreshCw, Search, ShieldCheck, X
} from "lucide-react";
import { supabase } from "../lib/supabase";
import {
  authorizationConsumptionExceedsLimit, authorizationWorkflowStatus, blankAuthorizationDraft, nextAuthorizationCode,
  validateAuthorizationDraft, type AuthorizationDraft
} from "./fuelAuthorizationUtils";
import { downloadFuelAuthorizationPdf, type FuelAuthorizationPdfData } from "./fuelAuthorizationPdf";

type Vehicle = {
  id: string; code: string; plate: string | null; description: string; fuel_type: string;
  meter_kind: string; status: string;
};
type Driver = {
  id: string; name: string; license_number: string | null; license_category: string | null;
  license_expiry: string | null; status: string;
};
type Supplier = { id: string; name: string; tax_id: string | null; phone: string | null; status: string };
type OrganizationInfo = { name: string; legal_name: string | null; tax_id: string | null };
type Authorization = {
  id: string; organization_id: string; authorization_code: string; vehicle_id: string;
  driver_id: string | null; supplier_id: string | null; valid_from: string; valid_until: string;
  max_liters: number | string | null; max_amount_cents: number | string | null;
  consumed_liters: number | string; consumed_amount_cents: number | string;
  status: string; created_by: string | null; created_at: string;
};
type FilterStatus = "all" | "active" | "scheduled" | "expired" | "inactive" | "cancelled" | "settled";

const fieldStyle: CSSProperties = {
  width: "100%", minWidth: 0, boxSizing: "border-box", border: "1px solid #dbe2ea",
  borderRadius: 9, padding: "10px 11px", fontSize: 14, color: "#172033", background: "#fff"
};
const labelStyle: CSSProperties = { display: "grid", gap: 6, fontSize: 12, fontWeight: 650, color: "#526078" };
const buttonStyle: CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
  border: "1px solid transparent", borderRadius: 9, padding: "10px 13px",
  fontSize: 13, fontWeight: 650, cursor: "pointer", whiteSpace: "nowrap"
};
const panelStyle: CSSProperties = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 };
const formatMoney = (cents: number | string | null) => cents === null || cents === ""
  ? "Sem limite"
  : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(cents) / 100);
const formatLiters = (value: number | string | null) => value === null || value === ""
  ? "Sem limite"
  : new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(Number(value)) + " L";
const formatConsumedLiters = (value: number | string | null) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(Number(value ?? 0)) + " L";
const formatDateTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
};
const statusPill = (status: string): CSSProperties => {
  const tones: Record<string, { bg: string; color: string }> = {
    active: { bg: "#d1fae5", color: "#047857" },
    scheduled: { bg: "#dbeafe", color: "#1d4ed8" },
    expired: { bg: "#fef3c7", color: "#92400e" },
    inactive: { bg: "#e2e8f0", color: "#475569" },
    cancelled: { bg: "#fee2e2", color: "#b91c1c" },
    settled: { bg: "#dcfce7", color: "#166534" }
  };
  const tone = tones[status] ?? tones.inactive;
  return { display: "inline-flex", padding: "4px 8px", borderRadius: 20, background: tone.bg, color: tone.color, fontSize: 11, fontWeight: 750, whiteSpace: "nowrap" };
};

async function getNextAuthorizationCode(organizationId: string): Promise<string> {
  if (!supabase) throw new Error("Banco de dados não configurado.");
  const codes: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await supabase.from("fuel_authorizations")
      .select("authorization_code")
      .eq("organization_id", organizationId)
      .order("authorization_code")
      .range(offset, offset + 999);
    if (result.error) throw result.error;
    const batch = (result.data ?? []) as { authorization_code: string }[];
    codes.push(...batch.map(row => row.authorization_code));
    if (batch.length < 1000) break;
  }
  return nextAuthorizationCode(codes);
}

export function FuelAuthorizationsManager({
  organizationId,
  onBackToFuelings
}: {
  organizationId: string;
  onBackToFuelings: () => void;
}) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [authorizations, setAuthorizations] = useState<Authorization[]>([]);
  const [organization, setOrganization] = useState<OrganizationInfo | null>(null);
  const [draft, setDraft] = useState<AuthorizationDraft>(blankAuthorizationDraft);
  const [showForm, setShowForm] = useState(false);
  const [formVehicleId, setFormVehicleId] = useState("");
  const [formDriverId, setFormDriverId] = useState("");
  const [formSupplierId, setFormSupplierId] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!supabase) {
      setError("Banco de dados não configurado. Confira a conexão do Supabase.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [vehicleResult, driverResult, supplierResult, orgResult] = await Promise.all([
        supabase.from("vehicles").select("id,code,plate,description,fuel_type,meter_kind,status")
          .eq("organization_id", organizationId).order("description"),
        supabase.from("drivers").select("id,name,license_number,license_category,license_expiry,status")
          .eq("organization_id", organizationId).order("name"),
        supabase.from("suppliers").select("id,name,tax_id,phone,status")
          .eq("organization_id", organizationId).order("name"),
        supabase.from("organizations").select("name,legal_name,tax_id")
          .eq("id", organizationId).maybeSingle()
      ]);
      if (vehicleResult.error || driverResult.error || supplierResult.error) {
        throw new Error("Não foi possível carregar os cadastros de ativos, motoristas ou fornecedores.");
      }

      const fetched: Authorization[] = [];
      for (let offset = 0; ; offset += 500) {
        const page = await supabase.from("fuel_authorizations")
          .select("id,organization_id,authorization_code,vehicle_id,driver_id,supplier_id,valid_from,valid_until,max_liters,max_amount_cents,consumed_liters,consumed_amount_cents,status,created_by,created_at")
          .eq("organization_id", organizationId)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(offset, offset + 499);
        if (page.error) throw new Error("Não foi possível carregar as autorizações de abastecimento.");
        const batch = (page.data ?? []) as Authorization[];
        fetched.push(...batch);
        if (batch.length < 500) break;
      }
      setVehicles((vehicleResult.data ?? []) as Vehicle[]);
      setDrivers((driverResult.data ?? []) as Driver[]);
      setSuppliers((supplierResult.data ?? []) as Supplier[]);
      setAuthorizations(fetched);
      setOrganization(orgResult.data as OrganizationInfo | null);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar as autorizações.");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => { void load(); }, [load, refreshKey]);

  const vehicleMap = useMemo(() => new Map(vehicles.map(row => [row.id, row])), [vehicles]);
  const driverMap = useMemo(() => new Map(drivers.map(row => [row.id, row])), [drivers]);
  const supplierMap = useMemo(() => new Map(suppliers.map(row => [row.id, row])), [suppliers]);
  const activeCount = authorizations.filter(row => authorizationWorkflowStatus(row.status, row.valid_from, row.valid_until, row.consumed_liters).key === "active").length;
  const scheduledCount = authorizations.filter(row => authorizationWorkflowStatus(row.status, row.valid_from, row.valid_until, row.consumed_liters).key === "scheduled").length;
  const expiredCount = authorizations.filter(row => authorizationWorkflowStatus(row.status, row.valid_from, row.valid_until, row.consumed_liters).key === "expired").length;
  const settledCount = authorizations.filter(row => authorizationWorkflowStatus(row.status, row.valid_from, row.valid_until, row.consumed_liters).key === "settled").length;

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return authorizations.filter(row => {
      const state = authorizationWorkflowStatus(row.status, row.valid_from, row.valid_until, row.consumed_liters).key;
      if (statusFilter !== "all" && state !== statusFilter) return false;
      if (!term) return true;
      const vehicle = vehicleMap.get(row.vehicle_id);
      const driver = row.driver_id ? driverMap.get(row.driver_id) : undefined;
      const supplier = row.supplier_id ? supplierMap.get(row.supplier_id) : undefined;
      return [
        row.authorization_code, vehicle?.description, vehicle?.code, vehicle?.plate,
        driver?.name, supplier?.name
      ].some(value => value?.toLocaleLowerCase("pt-BR").includes(term));
    });
  }, [authorizations, statusFilter, search, vehicleMap, driverMap, supplierMap]);

  const setDraftField = (key: keyof AuthorizationDraft, value: string) =>
    setDraft(current => ({ ...current, [key]: value }));

  function startCreate() {
    setDraft(blankAuthorizationDraft());
    setFormVehicleId(vehicles.find(row => row.status === "active")?.id ?? "");
    setFormDriverId("");
    setFormSupplierId("");
    setShowForm(true);
    setFormError("");
    setError("");
    setNotice("");
  }

  async function createAuthorization(event: FormEvent) {
    event.preventDefault();
    if (!supabase || saving) return;
    const vehicle = vehicleMap.get(formVehicleId);
    if (!vehicle || vehicle.status !== "active") {
      setFormError("Selecione um veículo/equipamento ativo.");
      return;
    }
    const driver = formDriverId ? driverMap.get(formDriverId) : undefined;
    if (formDriverId && (!driver || driver.status !== "active")) {
      setFormError("Selecione um motorista ativo.");
      return;
    }
    const supplier = formSupplierId ? supplierMap.get(formSupplierId) : undefined;
    if (formSupplierId && (!supplier || supplier.status !== "active")) {
      setFormError("Selecione um fornecedor ativo.");
      return;
    }
    const validation = validateAuthorizationDraft(draft);
    if (validation.error || !validation.limits || !validation.validFrom || !validation.validUntil) {
      setFormError(validation.error ?? "Confira os dados da autorização.");
      return;
    }

    setSaving(true);
    setFormError("");
    setError("");
    setNotice("");
    try {
      const authUser = await supabase.auth.getUser();
      let saved = false;
      let failure = "";
      for (let attempt = 0; attempt < 5; attempt++) {
        let code: string;
        try {
          code = await getNextAuthorizationCode(organizationId);
        } catch {
          failure = "Não foi possível gerar o número sequencial da autorização.";
          break;
        }
        const response = await supabase.from("fuel_authorizations").insert({
          organization_id: organizationId,
          authorization_code: code,
          vehicle_id: vehicle.id,
          driver_id: formDriverId || null,
          supplier_id: formSupplierId || null,
          valid_from: validation.validFrom,
          valid_until: validation.validUntil,
          max_liters: validation.limits.max_liters,
          max_amount_cents: validation.limits.max_amount_cents,
          status: "active",
          created_by: authUser.data.user?.id ?? null
        }).select("id").maybeSingle();
        if (!response.error && response.data) {
          saved = true;
          break;
        }
        if (response.error?.code === "23505" && attempt < 4) continue;
        failure = response.error?.code === "42501"
          ? "Seu perfil não tem permissão para emitir autorizações nesta organização."
          : "O banco não confirmou a emissão. Verifique os dados e tente novamente.";
        break;
      }
      if (!saved) throw new Error(failure || "Não foi possível emitir a autorização após várias tentativas.");
      setShowForm(false);
      setNotice("Autorização emitida com sucesso. Você já pode gerar o PDF na lista abaixo.");
      setRefreshKey(value => value + 1);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Não foi possível emitir a autorização.");
    } finally {
      setSaving(false);
    }
  }

  async function cancelAuthorization(row: Authorization) {
    if (!supabase || saving || row.status !== "active") return;
    if (!window.confirm("Cancelar a autorização " + row.authorization_code + "? O documento original será preservado e o PDF indicará o cancelamento.")) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await supabase.from("fuel_authorizations")
        .update({ status: "cancelled" })
        .eq("id", row.id)
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .select("id")
        .maybeSingle();
      if (response.error) {
        throw new Error(response.error.code === "42501"
          ? "Seu perfil não tem permissão para cancelar autorizações."
          : "Não foi possível cancelar a autorização.");
      }
      if (!response.data) throw new Error("A autorização não foi alterada. Atualize a lista e confira a situação.");
      setNotice("Autorização cancelada. O histórico foi preservado.");
      setRefreshKey(value => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao cancelar a autorização.");
    } finally {
      setSaving(false);
    }
  }

  function downloadPdf(row: Authorization) {
    try {
      const pdfData: FuelAuthorizationPdfData = {
        authorization: row,
        vehicle: vehicleMap.get(row.vehicle_id) ?? null,
        driver: row.driver_id ? driverMap.get(row.driver_id) ?? null : null,
        supplier: row.supplier_id ? supplierMap.get(row.supplier_id) ?? null : null,
        organization
      };
      downloadFuelAuthorizationPdf(pdfData);
      setNotice("PDF " + row.authorization_code + " gerado.");
      setError("");
    } catch {
      setError("Não foi possível gerar o PDF. Atualize os dados e tente novamente.");
    }
  }

  return <section aria-label="Autorizações de abastecimento" style={{ display: "grid", gap: 16 }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button type="button" title="Voltar aos abastecimentos" onClick={onBackToFuelings}
          style={{ ...buttonStyle, background: "#fff", color: "#334155", borderColor: "#dbe2ea" }}><ArrowLeft size={15}/> Abastecimentos</button>
        <div><h2 style={{ margin: 0, color: "#172033", fontSize: 19 }}>Autorizações de abastecimento</h2><p style={{ margin: "5px 0 0", color: "#64748b", fontSize: 13 }}>Emita, controle a validade e baixe autorizações individuais em PDF.</p></div>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={() => setRefreshKey(value => value + 1)} disabled={loading || saving}
          style={{ ...buttonStyle, background: "#fff", color: "#334155", borderColor: "#dbe2ea" }}><RefreshCw size={15}/> Atualizar</button>
        <button type="button" onClick={startCreate} disabled={!vehicles.some(row => row.status === "active") || saving}
          style={{ ...buttonStyle, background: "#1e40af", color: "#fff" }}><Plus size={15}/> Nova autorização</button>
      </div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12 }}>
      <article style={panelStyle}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#64748b", fontSize: 12, fontWeight: 650 }}>Autorizações válidas <span style={{ color: "#047857" }}><ShieldCheck size={18}/></span></div><strong style={{ display: "block", marginTop: 10, fontSize: 25, color: "#172033" }}>{loading ? "—" : activeCount}</strong><small style={{ color: "#64748b" }}>Dentro do período e ativas</small></article>
      <article style={panelStyle}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#64748b", fontSize: 12, fontWeight: 650 }}>Agendadas <span style={{ color: "#1d4ed8" }}><ClipboardList size={18}/></span></div><strong style={{ display: "block", marginTop: 10, fontSize: 25, color: "#172033" }}>{loading ? "—" : scheduledCount}</strong><small style={{ color: "#64748b" }}>Validade ainda não iniciada</small></article>
      <article style={panelStyle}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#64748b", fontSize: 12, fontWeight: 650 }}>Expiradas <span style={{ color: "#b45309" }}><FileText size={18}/></span></div><strong style={{ display: "block", marginTop: 10, fontSize: 25, color: "#172033" }}>{loading ? "—" : expiredCount}</strong><small style={{ color: "#64748b" }}>Sem baixa registrada</small></article>
      <article style={panelStyle}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#64748b", fontSize: 12, fontWeight: 650 }}>Concluídas <span style={{ color: "#047857" }}><CheckCircle2 size={18}/></span></div><strong style={{ display: "block", marginTop: 10, fontSize: 25, color: "#172033" }}>{loading ? "—" : settledCount}</strong><small style={{ color: "#64748b" }}>Baixa registrada no sistema</small></article>
    </div>

    <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e3a8a", borderRadius: 10, padding: "11px 13px", fontSize: 12, lineHeight: 1.55 }}>
      <strong>Regra de controle:</strong> cada autorização tem número sequencial único por organização, período de validade e ativo. Os limites de litros e/ou valor são opcionais. O consumo real é atualizado pelos abastecimentos vinculados; registros cancelados não entram nos totais. Para corrigir uma autorização já emitida, cancele-a e emita uma nova; o histórico é preservado.
    </div>

    {error && <div role="alert" style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: 12, color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 9, fontSize: 13 }}><AlertCircle size={17}/><span>{error}</span></div>}
    {notice && <div role="status" style={{ display: "flex", alignItems: "center", gap: 9, padding: 12, color: "#065f46", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 9, fontSize: 13 }}><CheckCircle2 size={17}/><span>{notice}</span><button type="button" aria-label="Fechar aviso" onClick={() => setNotice("")} style={{ marginLeft: "auto", color: "inherit", background: "transparent", border: 0, cursor: "pointer" }}><X size={15}/></button></div>}

    {showForm && <form onSubmit={createAuthorization} style={{ ...panelStyle, display: "grid", gap: 14, borderColor: "#bfdbfe" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div><h3 style={{ margin: 0, color: "#172033", fontSize: 16 }}>Emitir nova autorização</h3><p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>O número AUT será criado automaticamente ao salvar. Limites de litros e de valor são opcionais.</p></div>
        <button type="button" aria-label="Fechar formulário" onClick={() => { setShowForm(false); setFormError(""); }} style={{ border: 0, background: "transparent", cursor: "pointer", color: "#64748b" }}><X size={18}/></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
        <label style={labelStyle}>Veículo / equipamento *<select required value={formVehicleId} onChange={event => setFormVehicleId(event.target.value)} style={fieldStyle}><option value="">Selecione o ativo</option>{vehicles.filter(row => row.status === "active").map(row => <option key={row.id} value={row.id}>{row.code} · {row.description}{row.plate ? " · " + row.plate : ""}</option>)}</select></label>
        <label style={labelStyle}>Motorista autorizado<select value={formDriverId} onChange={event => setFormDriverId(event.target.value)} style={fieldStyle}><option value="">Não especificado</option>{drivers.filter(row => row.status === "active").map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label style={labelStyle}>Posto / fornecedor autorizado<select value={formSupplierId} onChange={event => setFormSupplierId(event.target.value)} style={fieldStyle}><option value="">Qualquer fornecedor</option>{suppliers.filter(row => row.status === "active").map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label style={labelStyle}>Válida a partir de *<input required type="datetime-local" value={draft.valid_from} onChange={event => setDraftField("valid_from", event.target.value)} style={fieldStyle}/></label>
        <label style={labelStyle}>Válida até *<input required type="datetime-local" min={draft.valid_from || undefined} value={draft.valid_until} onChange={event => setDraftField("valid_until", event.target.value)} style={fieldStyle}/></label>
        <label style={labelStyle}>Limite de litros (opcional)<input type="number" min="0.001" max="100000" step="0.001" value={draft.max_liters} onChange={event => setDraftField("max_liters", event.target.value)} placeholder="Ex.: 150" style={fieldStyle}/></label>
        <label style={labelStyle}>Limite financeiro (R$) (opcional)<input type="number" min="0.01" max="100000000" step="0.01" value={draft.max_amount} onChange={event => setDraftField("max_amount", event.target.value)} placeholder="Ex.: 900,00" style={fieldStyle}/></label>
        <p style={{ gridColumn: "1 / -1", margin: 0, fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>Os dados reais do abastecimento — data/hora, km ou horímetro, litros, preço por litro e valor total — serão preenchidos nas duas vias impressas pelo posto/condutor. A via de retorno será usada para lançar o abastecimento no sistema.</p>
      </div>
      {formError && <div role="alert" style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: 11, borderRadius: 9, background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", fontSize: 13 }}><AlertCircle size={16}/><span>{formError}</span></div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={() => { setShowForm(false); setFormError(""); }} style={{ ...buttonStyle, background: "#fff", color: "#334155", borderColor: "#dbe2ea" }}>Cancelar</button>
        <button type="submit" disabled={saving} style={{ ...buttonStyle, background: saving ? "#93a4c7" : "#1e40af", color: "#fff", cursor: saving ? "wait" : "pointer" }}>{saving ? <RefreshCw size={15}/> : <CheckCircle2 size={15}/>} {saving ? "Emitindo..." : "Emitir autorização"}</button>
      </div>
    </form>}

    <article style={{ ...panelStyle, padding: 0, overflow: "hidden" }}>
      <div style={{ padding: 16, borderBottom: "1px solid #e2e8f0", display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div><h3 style={{ margin: 0, color: "#172033", fontSize: 16 }}>Histórico de autorizações</h3><p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>PDF individual, situação e validade de cada documento.</p></div>
          {loading && <span style={{ display: "inline-flex", gap: 6, alignItems: "center", color: "#64748b", fontSize: 12 }}><RefreshCw size={14}/> Carregando</span>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 9 }}>
          <label style={labelStyle}><span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Search size={13}/> Buscar</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Número, veículo, placa, motorista, posto" style={fieldStyle}/></label>
          <label style={labelStyle}>Situação<select value={statusFilter} onChange={event => setStatusFilter(event.target.value as FilterStatus)} style={fieldStyle}><option value="all">Todas</option><option value="active">Válidas</option><option value="scheduled">Agendadas</option><option value="expired">Expiradas</option><option value="inactive">Inativas</option><option value="cancelled">Canceladas</option><option value="settled">Concluídas</option></select></label>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 1180, borderCollapse: "collapse", textAlign: "left", fontSize: 12 }}>
          <thead><tr style={{ background: "#f8fafc", color: "#64748b" }}>{["Autorização", "Ativo", "Motorista / posto", "Limites", "Consumo registrado", "Validade", "Situação", "Documento"].map(title => <th key={title} style={{ padding: "11px 12px", whiteSpace: "nowrap", textTransform: "uppercase", fontSize: 10, letterSpacing: ".04em", borderBottom: "1px solid #e2e8f0" }}>{title}</th>)}</tr></thead>
          <tbody>
            {visible.map(row => {
              const vehicle = vehicleMap.get(row.vehicle_id);
              const driver = row.driver_id ? driverMap.get(row.driver_id) : undefined;
              const supplier = row.supplier_id ? supplierMap.get(row.supplier_id) : undefined;
              const state = authorizationWorkflowStatus(row.status, row.valid_from, row.valid_until, row.consumed_liters);
              const exceedsLimit = authorizationConsumptionExceedsLimit(
                row.consumed_liters, row.consumed_amount_cents, row.max_liters, row.max_amount_cents
              );
              const hasConfiguredLimit = row.max_liters !== null || row.max_amount_cents !== null;
              return <tr key={row.id} style={{ borderBottom: "1px solid #eef2f7" }}>
                <td style={{ padding: "12px", whiteSpace: "nowrap" }}><strong style={{ color: "#172033", fontSize: 13 }}>{row.authorization_code}</strong><small style={{ display: "block", color: "#94a3b8", marginTop: 3 }}>Emitida {formatDateTime(row.created_at)}</small></td>
                <td style={{ padding: "12px", minWidth: 145 }}><strong style={{ display: "block", color: "#172033" }}>{vehicle?.description ?? "Ativo não encontrado"}</strong><small style={{ display: "block", color: "#94a3b8" }}>{vehicle?.code ?? ""}{vehicle?.plate ? " · " + vehicle.plate : ""}</small></td>
                <td style={{ padding: "12px", minWidth: 150 }}><span style={{ display: "block", color: "#334155" }}>{driver?.name ?? "Qualquer motorista"}</span><small style={{ display: "block", color: "#94a3b8" }}>{supplier?.name ?? "Qualquer posto / fornecedor"}</small></td>
                <td style={{ padding: "12px", whiteSpace: "nowrap" }}><strong style={{ display: "block", color: "#172033" }}>{formatLiters(row.max_liters)}</strong><small style={{ color: "#64748b" }}>{formatMoney(row.max_amount_cents)}</small></td>
                <td style={{ padding: "12px", whiteSpace: "nowrap", minWidth: 175 }}>
                  <strong style={{ display: "block", color: exceedsLimit ? "#b91c1c" : "#172033" }}>{formatConsumedLiters(row.consumed_liters)} registrados</strong>
                  <small style={{ display: "block", color: "#64748b", marginTop: 3 }}>{formatMoney(row.consumed_amount_cents)} total lançado</small>
                  {hasConfiguredLimit && <small style={{ display: "block", color: exceedsLimit ? "#b91c1c" : "#047857", marginTop: 3 }}>{exceedsLimit ? "Limite autorizado excedido" : "Dentro dos limites definidos"}</small>}
                </td>
                <td style={{ padding: "12px", whiteSpace: "nowrap" }}><span>{formatDateTime(row.valid_from)}</span><small style={{ display: "block", color: "#94a3b8", marginTop: 3 }}>até {formatDateTime(row.valid_until)}</small></td>
                <td style={{ padding: "12px" }}><span style={statusPill(state.key)}>{state.label}</span></td>
                <td style={{ padding: "12px", whiteSpace: "nowrap" }}><div style={{ display: "flex", gap: 6 }}>
                  <button type="button" title="Baixar autorização em PDF" aria-label={"Baixar PDF " + row.authorization_code} onClick={() => downloadPdf(row)} style={{ ...buttonStyle, padding: "8px 9px", background: "#eff6ff", color: "#1d4ed8" }}><Download size={14}/> PDF</button>
                  {row.status === "active" && <button type="button" title="Cancelar autorização" aria-label={"Cancelar " + row.authorization_code} onClick={() => void cancelAuthorization(row)} disabled={saving} style={{ ...buttonStyle, padding: 8, background: "#fff1f2", color: "#be123c" }}><X size={14}/></button>}
                </div></td>
              </tr>;
            })}
            {!loading && visible.length === 0 && <tr><td colSpan={8} style={{ padding: 36, textAlign: "center", color: "#64748b" }}><ClipboardList size={24} style={{ display: "block", margin: "0 auto 8px", color: "#94a3b8" }}/><strong style={{ display: "block", color: "#334155" }}>Nenhuma autorização encontrada</strong><small>Ajuste os filtros ou emita uma nova autorização para gerar o PDF.</small></td></tr>}
          </tbody>
        </table>
      </div>
    </article>
    <p style={{ margin: 0, display: "flex", gap: 7, alignItems: "flex-start", color: "#64748b", fontSize: 11, lineHeight: 1.5 }}><Fuel size={14} style={{ flexShrink: 0, marginTop: 1 }}/> O documento PDF pode ser baixado novamente pelo histórico. Autorizações canceladas, expiradas ou agendadas são marcadas claramente no documento.</p>
  </section>;
}

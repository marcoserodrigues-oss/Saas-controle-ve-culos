import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { AlertCircle, CalendarDays, CheckCircle2, ClipboardList, Pencil, Plus, RefreshCw, Search, Wallet, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { findMatchingExpense, moneyToCents, EXPENSE_CATEGORIES } from "./expenseUtils";

type Vehicle = { id: string; code: string; plate: string | null; description: string; status: string };
type Supplier = { id: string; name: string; status: string };
type Expense = {
  id: string;
  organization_id: string;
  vehicle_id: string | null;
  supplier_id: string | null;
  expense_date: string;
  category: string;
  description: string;
  amount_cents: number | string;
  source_type: string;
  source_id: string | null;
  status: string;
  created_at: string;
};
type FormValues = {
  expense_date: string;
  category: string;
  description: string;
  amount: string;
  vehicle_id: string;
  supplier_id: string;
};
const today = () => new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const daysAgo = (days: number) => {
  const value = new Date();
  value.setDate(value.getDate() - days);
  return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const blankForm = (): FormValues => ({
  expense_date: today(), category: "Outros", description: "", amount: "", vehicle_id: "", supplier_id: ""
});
const asNumber = (value: number | string | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const shortDate = (value: string) => {
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? day + "/" + month + "/" + year : value;
};
const statusLabel: Record<string, string> = { active: "Ativa", inactive: "Inativa", cancelled: "Cancelada" };
const baseField: CSSProperties = {
  width: "100%", boxSizing: "border-box", border: "1px solid #dbe2ea", borderRadius: 9,
  padding: "10px 11px", fontSize: 14, color: "#172033", background: "#fff", minWidth: 0
};
const fieldLabel: CSSProperties = { display: "grid", gap: 6, fontSize: 12, fontWeight: 650, color: "#526078" };
const baseButton: CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
  borderRadius: 9, padding: "10px 13px", fontWeight: 650, cursor: "pointer", fontSize: 13,
  border: "1px solid transparent", whiteSpace: "nowrap"
};

export function ExpensesManager({ organizationId }: { organizationId: string }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [rows, setRows] = useState<Expense[]>([]);
  const [form, setForm] = useState<FormValues>(blankForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [fromDate, setFromDate] = useState(() => daysAgo(90));
  const [toDate, setToDate] = useState(today);
  const [appliedFrom, setAppliedFrom] = useState(() => daysAgo(90));
  const [appliedTo, setAppliedTo] = useState(today);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!supabase) {
      setError("Banco de dados não configurado. Confira as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [vehicleResult, supplierResult] = await Promise.all([
        supabase.from("vehicles").select("id,code,plate,description,status")
          .eq("organization_id", organizationId).neq("status", "cancelled").order("description"),
        supabase.from("suppliers").select("id,name,status")
          .eq("organization_id", organizationId).neq("status", "cancelled").order("name")
      ]);
      if (vehicleResult.error || supplierResult.error) {
        throw new Error("Não foi possível carregar os cadastros de veículos e fornecedores.");
      }

      const allRows: Expense[] = [];
      const pageSize = 500;
      for (let offset = 0; ; offset += pageSize) {
        const page = await supabase.from("expenses")
          .select("id,organization_id,vehicle_id,supplier_id,expense_date,category,description,amount_cents,source_type,source_id,status,created_at")
          .eq("organization_id", organizationId)
          .eq("source_type", "manual")
          .is("work_order_id", null)
          .is("source_id", null)
          .gte("expense_date", appliedFrom)
          .lte("expense_date", appliedTo)
          .order("expense_date", { ascending: false })
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (page.error) throw new Error("Não foi possível carregar as despesas da organização.");
        const batch = (page.data ?? []) as Expense[];
        allRows.push(...batch);
        if (batch.length < pageSize) break;
      }

      setVehicles((vehicleResult.data ?? []) as Vehicle[]);
      setSuppliers((supplierResult.data ?? []) as Supplier[]);
      setRows(allRows);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar o módulo de despesas.");
    } finally {
      setLoading(false);
    }
  }, [organizationId, appliedFrom, appliedTo, refreshKey]);

  useEffect(() => { void load(); }, [load]);

  const vehicleMap = useMemo(() => new Map(vehicles.map(vehicle => [vehicle.id, vehicle])), [vehicles]);
  const supplierMap = useMemo(() => new Map(suppliers.map(supplier => [supplier.id, supplier.name])), [suppliers]);
  const categoryOptions = useMemo(() => {
    return [...new Set([...EXPENSE_CATEGORIES, ...rows.map(row => row.category).filter(Boolean), form.category].filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [rows, form.category]);
  const visibleRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return rows.filter(row => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (categoryFilter !== "all" && row.category !== categoryFilter) return false;
      if (!term) return true;
      const vehicle = row.vehicle_id ? vehicleMap.get(row.vehicle_id) : undefined;
      const supplier = row.supplier_id ? supplierMap.get(row.supplier_id) : undefined;
      return [row.description, row.category, vehicle?.description, vehicle?.plate, vehicle?.code, supplier]
        .some(value => value?.toLocaleLowerCase("pt-BR").includes(term));
    });
  }, [rows, search, statusFilter, categoryFilter, vehicleMap, supplierMap]);
  const activeTotalCents = visibleRows.filter(row => row.status === "active").reduce((sum, row) => sum + asNumber(row.amount_cents), 0);
  const activeCount = visibleRows.filter(row => row.status === "active").length;
  const cancelledCount = visibleRows.filter(row => row.status === "cancelled").length;

  const updateForm = (key: keyof FormValues, value: string) => setForm(old => ({ ...old, [key]: value }));
  const beginCreate = () => {
    setForm(blankForm());
    setEditing(null);
    setShowForm(true);
    setFormError("");
    setError("");
    setNotice("");
  };
  const beginEdit = (row: Expense) => {
    setForm({
      expense_date: row.expense_date.slice(0, 10),
      category: row.category,
      description: row.description,
      amount: (asNumber(row.amount_cents) / 100).toFixed(2),
      vehicle_id: row.vehicle_id ?? "",
      supplier_id: row.supplier_id ?? ""
    });
    setEditing(row.id);
    setShowForm(true);
    setFormError("");
    setError("");
    setNotice("");
  };

  async function saveExpense(event: FormEvent) {
    event.preventDefault();
    if (!supabase || saving) return;
    const description = form.description.trim();
    const category = form.category.trim();
    const amountCents = moneyToCents(form.amount);
    if (!form.expense_date || form.expense_date > today()) {
      setFormError("Informe uma data válida, igual ou anterior a hoje.");
      return;
    }
    if (!category || category.length > 80 || !categoryOptions.includes(category)) {
      setFormError("Selecione uma categoria válida.");
      return;
    }
    if (description.length < 3 || description.length > 240) {
      setFormError("A descrição deve ter entre 3 e 240 caracteres. Use número de documento para diferenciar despesas semelhantes.");
      return;
    }
    if (amountCents === null) {
      setFormError("Informe um valor maior que zero, com no máximo R$ 100.000.000,00.");
      return;
    }
    if (form.vehicle_id && !vehicleMap.has(form.vehicle_id)) {
      setFormError("O veículo/equipamento selecionado não pertence aos cadastros disponíveis desta organização.");
      return;
    }
    if (form.supplier_id && !supplierMap.has(form.supplier_id)) {
      setFormError("O fornecedor selecionado não pertence aos cadastros disponíveis desta organização.");
      return;
    }

    setSaving(true);
    setFormError("");
    setNotice("");
    try {
      let duplicateQuery = supabase.from("expenses").select("id,description")
        .eq("organization_id", organizationId)
        .eq("expense_date", form.expense_date)
        .eq("category", category)
        .eq("amount_cents", amountCents)
        .eq("source_type", "manual")
        .eq("status", "active")
        .is("work_order_id", null)
        .is("source_id", null);
      duplicateQuery = form.vehicle_id ? duplicateQuery.eq("vehicle_id", form.vehicle_id) : duplicateQuery.is("vehicle_id", null);
      duplicateQuery = form.supplier_id ? duplicateQuery.eq("supplier_id", form.supplier_id) : duplicateQuery.is("supplier_id", null);
      const possibleDuplicates = await duplicateQuery.limit(25);
      if (possibleDuplicates.error) {
        throw new Error("Não foi possível verificar duplicidades. Por segurança, o lançamento não foi salvo; tente novamente.");
      }
      const duplicate = findMatchingExpense(description, (possibleDuplicates.data ?? []) as { id: string; description: string }[], editing);
      if (duplicate) {
        throw new Error("Possível duplicidade: já existe uma despesa ativa com a mesma data, categoria, valor, veículo/fornecedor e descrição. Confira o lançamento existente ou inclua o número da nota/documento na descrição.");
      }

      const payload = {
        organization_id: organizationId,
        vehicle_id: form.vehicle_id || null,
        supplier_id: form.supplier_id || null,
        expense_date: form.expense_date,
        category,
        description,
        amount_cents: amountCents,
        source_type: "manual",
        source_id: null,
        work_order_id: null
      };
      let result: { error: { message: string; code?: string } | null; data: { id: string } | null };
      if (editing) {
        const response = await supabase.from("expenses").update(payload)
          .eq("id", editing).eq("organization_id", organizationId).eq("status", "active")
          .select("id").maybeSingle();
        result = { error: response.error, data: response.data as { id: string } | null };
      } else {
        const { data: auth } = await supabase.auth.getUser();
        const response = await supabase.from("expenses").insert({ ...payload, created_by: auth.user?.id ?? null })
          .select("id").maybeSingle();
        result = { error: response.error, data: response.data as { id: string } | null };
      }
      if (result.error) {
        if (result.error.code === "42501") throw new Error("Seu perfil não tem permissão para gravar despesas nesta organização.");
        throw new Error("O banco não confirmou o salvamento. Confira suas permissões e tente novamente.");
      }
      if (!result.data) throw new Error("Nenhum registro foi confirmado pelo banco. Atualize a lista antes de tentar novamente.");

      setShowForm(false);
      setEditing(null);
      setForm(blankForm());
      setNotice(editing ? "Despesa atualizada com sucesso." : "Despesa registrada com sucesso.");
      setRefreshKey(value => value + 1);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Não foi possível salvar a despesa.");
    } finally {
      setSaving(false);
    }
  }

  async function cancelExpense(row: Expense) {
    if (!supabase || row.status !== "active") return;
    const confirmed = window.confirm("Cancelar esta despesa? O registro será preservado no histórico e deixará de compor os totais ativos.");
    if (!confirmed) return;
    setError("");
    setNotice("");
    const result = await supabase.from("expenses").update({ status: "cancelled" })
      .eq("id", row.id).eq("organization_id", organizationId).eq("status", "active")
      .select("id").maybeSingle();
    if (result.error) {
      setError(result.error.code === "42501"
        ? "Seu perfil não tem permissão para cancelar despesas."
        : "Não foi possível cancelar a despesa. Nenhuma alteração foi confirmada.");
    } else if (!result.data) {
      setError("A despesa não foi alterada. Talvez outro usuário já tenha modificado o registro; atualize a lista.");
    } else {
      setNotice("Despesa cancelada. O histórico foi preservado.");
      setRefreshKey(value => value + 1);
    }
  }

  function applyPeriod() {
    if (!fromDate || !toDate) { setError("Informe a data inicial e final."); return; }
    if (fromDate > toDate) { setError("A data inicial não pode ser posterior à data final."); return; }
    setError("");
    setAppliedFrom(fromDate);
    setAppliedTo(toDate);
  }
  function resetPeriod() {
    const start = daysAgo(90);
    const end = today();
    setFromDate(start);
    setToDate(end);
    setAppliedFrom(start);
    setAppliedTo(end);
    setError("");
  }

  return <section style={{ display: "grid", gap: 16 }} aria-label="Despesas e custos">
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      <div>
        <h2 style={{ margin: 0, color: "#172033", fontSize: 19 }}>Controle de despesas avulsas</h2>
        <p style={{ margin: "5px 0 0", color: "#64748b", fontSize: 13 }}>Lançamentos manuais fora dos módulos de abastecimento, manutenção e pneus.</p>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={{ ...baseButton, background: "#fff", color: "#334155", borderColor: "#dbe2ea" }} onClick={() => setRefreshKey(value => value + 1)} disabled={loading}>
          <RefreshCw size={15} /> Atualizar
        </button>
        <button type="button" style={{ ...baseButton, background: "#1e40af", color: "#fff" }} onClick={beginCreate}>
          <Plus size={16} /> Nova despesa
        </button>
      </div>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
      <article style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 13, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#64748b", fontSize: 12, fontWeight: 650 }}>
          Total de despesas ativas <span style={{ display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: 9, background: "#eff6ff", color: "#1d4ed8" }}><Wallet size={17}/></span>
        </div>
        <strong style={{ display: "block", marginTop: 10, fontSize: 24, letterSpacing: "-.5px", color: "#172033" }}>{loading ? "—" : money(activeTotalCents)}</strong>
        <small style={{ color: "#64748b" }}>Conforme o período e os filtros atuais</small>
      </article>
      <article style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 13, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#64748b", fontSize: 12, fontWeight: 650 }}>
          Lançamentos ativos <span style={{ display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: 9, background: "#ecfdf5", color: "#047857" }}><CheckCircle2 size={17}/></span>
        </div>
        <strong style={{ display: "block", marginTop: 10, fontSize: 24, letterSpacing: "-.5px", color: "#172033" }}>{loading ? "—" : activeCount}</strong>
        <small style={{ color: "#64748b" }}>Despesas não canceladas na listagem filtrada</small>
      </article>
      <article style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 13, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", color: "#64748b", fontSize: 12, fontWeight: 650 }}>
          Cancelamentos no filtro <span style={{ display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: 9, background: "#fff7ed", color: "#c2410c" }}><ClipboardList size={17}/></span>
        </div>
        <strong style={{ display: "block", marginTop: 10, fontSize: 24, letterSpacing: "-.5px", color: "#172033" }}>{loading ? "—" : cancelledCount}</strong>
        <small style={{ color: "#64748b" }}>Mantidos para rastreabilidade</small>
      </article>
    </div>

    <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", color: "#1e3a8a", borderRadius: 10, padding: "11px 13px", fontSize: 12, lineHeight: 1.55 }}>
      <strong>Regra para não duplicar custos:</strong> registre aqui apenas despesas avulsas. Combustível deve ser lançado em Abastecimentos; mão de obra/peças em Manutenção; recapagens e serviços de pneus em Gestão de pneus. Despesas vinculadas a uma O.S. ou criadas por outro módulo não aparecem nesta lista manual.
    </div>

    {error && <div role="alert" style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: 12, color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 9, fontSize: 13 }}><AlertCircle size={17} style={{ flexShrink: 0 }}/><span>{error}</span></div>}
    {notice && <div role="status" style={{ display: "flex", gap: 9, alignItems: "center", padding: 12, color: "#065f46", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 9, fontSize: 13 }}><CheckCircle2 size={17}/><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Fechar aviso" style={{ marginLeft: "auto", border: 0, background: "transparent", color: "inherit", cursor: "pointer" }}><X size={15}/></button></div>}

    {showForm && <form onSubmit={saveExpense} style={{ display: "grid", gap: 14, background: "#fff", border: "1px solid #cbd5e1", borderRadius: 13, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div><h3 style={{ margin: 0, color: "#172033", fontSize: 16 }}>{editing ? "Editar despesa avulsa" : "Novo lançamento de despesa"}</h3><p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>O valor será salvo em centavos para manter precisão monetária.</p></div>
        <button type="button" onClick={() => { setShowForm(false); setEditing(null); setFormError(""); }} aria-label="Fechar formulário" style={{ border: 0, background: "transparent", cursor: "pointer", color: "#64748b" }}><X size={19}/></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
        <label style={fieldLabel}>Data da despesa<input required type="date" max={today()} value={form.expense_date} onChange={event => updateForm("expense_date", event.target.value)} style={baseField}/></label>
        <label style={fieldLabel}>Categoria<select required value={form.category} onChange={event => updateForm("category", event.target.value)} style={baseField}>{categoryOptions.map(category => <option key={category} value={category}>{category}</option>)}</select></label>
        <label style={fieldLabel}>Valor (R$)<input required type="number" inputMode="decimal" min="0.01" max="100000000" step="0.01" value={form.amount} onChange={event => updateForm("amount", event.target.value)} placeholder="0,00" style={baseField}/></label>
        <label style={fieldLabel}>Veículo / equipamento (opcional)<select value={form.vehicle_id} onChange={event => updateForm("vehicle_id", event.target.value)} style={baseField}><option value="">Sem vínculo com ativo</option>{vehicles.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.description}{vehicle.plate ? " · " + vehicle.plate : ""}{vehicle.status === "inactive" ? " (inativo)" : ""}</option>)}</select></label>
        <label style={fieldLabel}>Fornecedor (opcional)<select value={form.supplier_id} onChange={event => updateForm("supplier_id", event.target.value)} style={baseField}><option value="">Sem fornecedor associado</option>{suppliers.map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}{supplier.status === "inactive" ? " (inativo)" : ""}</option>)}</select></label>
        <label style={{ ...fieldLabel, gridColumn: "1 / -1" }}>Descrição / documento<input required minLength={3} maxLength={240} value={form.description} onChange={event => updateForm("description", event.target.value)} placeholder="Ex.: pedágio BR-040 — comprovante 12345" style={baseField}/></label>
      </div>
      {formError && <div role="alert" style={{ display: "flex", alignItems: "flex-start", gap: 8, color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 9, padding: 11, fontSize: 13 }}><AlertCircle size={16} style={{ flexShrink: 0 }}/><span>{formError}</span></div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
        <button type="button" style={{ ...baseButton, background: "#fff", color: "#334155", borderColor: "#dbe2ea" }} onClick={() => { setShowForm(false); setEditing(null); setFormError(""); }}>Cancelar</button>
        <button type="submit" disabled={saving} style={{ ...baseButton, background: saving ? "#93a4c7" : "#1e40af", color: "#fff", cursor: saving ? "wait" : "pointer" }}>{saving ? <RefreshCw size={15}/> : <CheckCircle2 size={15}/>} {saving ? "Salvando..." : editing ? "Salvar alterações" : "Registrar despesa"}</button>
      </div>
    </form>}

    <article style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 13, overflow: "hidden" }}>
      <div style={{ padding: 16, borderBottom: "1px solid #e2e8f0", display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div><h3 style={{ margin: 0, color: "#172033", fontSize: 16 }}>Lançamentos de despesas</h3><p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>Período carregado: {shortDate(appliedFrom)} a {shortDate(appliedTo)}.</p></div>
          {loading && <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, color: "#64748b" }}><RefreshCw size={14}/> Carregando...</span>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(155px, 1fr))", gap: 9, alignItems: "end" }}>
          <label style={fieldLabel}>Data inicial<input type="date" max={toDate || undefined} value={fromDate} onChange={event => setFromDate(event.target.value)} style={baseField}/></label>
          <label style={fieldLabel}>Data final<input type="date" min={fromDate || undefined} max={today()} value={toDate} onChange={event => setToDate(event.target.value)} style={baseField}/></label>
          <button type="button" onClick={applyPeriod} disabled={loading} style={{ ...baseButton, background: "#1e40af", color: "#fff" }}><CalendarDays size={15}/> Aplicar período</button>
          <button type="button" onClick={resetPeriod} disabled={loading} style={{ ...baseButton, background: "#fff", color: "#334155", borderColor: "#dbe2ea" }}>Últimos 90 dias</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 9 }}>
          <label style={fieldLabel}>Buscar<input value={search} onChange={event => setSearch(event.target.value)} placeholder="Descrição, placa, veículo ou fornecedor" style={baseField}/></label>
          <label style={fieldLabel}>Categoria<select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)} style={baseField}><option value="all">Todas as categorias</option>{categoryOptions.map(category => <option key={category} value={category}>{category}</option>)}</select></label>
          <label style={fieldLabel}>Situação<select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} style={baseField}><option value="active">Ativas</option><option value="cancelled">Canceladas</option><option value="all">Todas</option></select></label>
        </div>
      </div>

      <div style={{ overflowX: "auto", width: "100%" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820, fontSize: 13, textAlign: "left" }}>
          <thead><tr style={{ background: "#f8fafc", color: "#64748b" }}>
            {["Data", "Descrição", "Categoria", "Veículo / fornecedor", "Valor", "Situação", "Ações"].map(label => <th key={label} style={{ padding: "11px 13px", fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em", whiteSpace: "nowrap", borderBottom: "1px solid #e2e8f0" }}>{label}</th>)}
          </tr></thead>
          <tbody>
            {visibleRows.map(row => {
              const vehicle = row.vehicle_id ? vehicleMap.get(row.vehicle_id) : undefined;
              const supplier = row.supplier_id ? supplierMap.get(row.supplier_id) : undefined;
              return <tr key={row.id} style={{ borderBottom: "1px solid #eef2f7", opacity: row.status === "cancelled" ? .72 : 1 }}>
                <td style={{ padding: "12px 13px", whiteSpace: "nowrap", color: "#475569" }}>{shortDate(row.expense_date)}</td>
                <td style={{ padding: "12px 13px", minWidth: 180 }}><strong style={{ color: "#172033", fontWeight: 650 }}>{row.description}</strong><small style={{ display: "block", marginTop: 3, color: "#94a3b8" }}>{row.source_type === "manual" ? "Lançamento manual" : "Origem vinculada"}</small></td>
                <td style={{ padding: "12px 13px", color: "#475569" }}>{row.category}</td>
                <td style={{ padding: "12px 13px", minWidth: 150 }}><span style={{ display: "block", color: "#334155" }}>{vehicle?.description ?? (row.vehicle_id ? "Ativo não disponível" : "Sem vínculo")}</span><small style={{ display: "block", marginTop: 3, color: "#94a3b8" }}>{supplier ?? (vehicle?.plate ?? (row.supplier_id ? "Fornecedor não disponível" : "—"))}</small></td>
                <td style={{ padding: "12px 13px", whiteSpace: "nowrap", color: "#172033", fontWeight: 700 }}>{money(asNumber(row.amount_cents))}</td>
                <td style={{ padding: "12px 13px" }}><span style={{ display: "inline-block", padding: "4px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700, color: row.status === "active" ? "#047857" : "#9a3412", background: row.status === "active" ? "#d1fae5" : "#ffedd5" }}>{statusLabel[row.status] ?? row.status}</span></td>
                <td style={{ padding: "12px 13px" }}><div style={{ display: "flex", gap: 6 }}>
                  {row.status === "active" && <>
                    <button type="button" title="Editar despesa" aria-label={"Editar despesa: " + row.description} onClick={() => beginEdit(row)} style={{ ...baseButton, padding: 8, background: "#eff6ff", color: "#1d4ed8" }}><Pencil size={15}/></button>
                    <button type="button" title="Cancelar despesa" aria-label={"Cancelar despesa: " + row.description} onClick={() => void cancelExpense(row)} style={{ ...baseButton, padding: 8, background: "#fff7ed", color: "#c2410c" }}><X size={15}/></button>
                  </>}
                  {row.status !== "active" && <span style={{ fontSize: 12, color: "#94a3b8" }}>Somente leitura</span>}
                </div></td>
              </tr>;
            })}
            {!loading && visibleRows.length === 0 && <tr><td colSpan={7} style={{ padding: 35, textAlign: "center", color: "#64748b" }}><ClipboardList size={25} style={{ margin: "0 auto 8px", display: "block", color: "#94a3b8" }}/><strong style={{ display: "block", color: "#334155" }}>Nenhuma despesa encontrada</strong><span style={{ display: "block", marginTop: 4, fontSize: 12 }}>Ajuste os filtros ou registre uma nova despesa avulsa.</span></td></tr>}
          </tbody>
          {visibleRows.length > 0 && <tfoot><tr style={{ background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}><th colSpan={4} style={{ padding: "12px 13px", textAlign: "right", color: "#475569" }}>Total ativo na seleção</th><th style={{ padding: "12px 13px", whiteSpace: "nowrap", color: "#172033" }}>{money(activeTotalCents)}</th><th colSpan={2} style={{ padding: "12px 13px", color: "#64748b", fontWeight: 500, fontSize: 11 }}>{visibleRows.length} registro(s) exibido(s)</th></tr></tfoot>}
        </table>
      </div>
    </article>
  </section>;
}

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import {
  AlertCircle, Building2, CheckCircle2, CircleUserRound, FileText, Mail, Pencil,
  Phone, Plus, RefreshCw, Search, ShieldCheck, UserRound, Users, X
} from "lucide-react";
import { supabase } from "../lib/supabase";
import {
  findDuplicateIdentity, findDuplicateName, isValidOptionalEmail, SUPPLIER_TYPES
} from "./peopleUtils";

type RecordStatus = "active" | "inactive" | "cancelled";
type Driver = {
  id: string;
  organization_id: string;
  name: string;
  document_number: string | null;
  license_number: string | null;
  license_category: string | null;
  license_expiry: string | null;
  phone: string | null;
  email: string | null;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
};
type Supplier = {
  id: string;
  organization_id: string;
  name: string;
  tax_id: string | null;
  supplier_type: string;
  phone: string | null;
  email: string | null;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
};
type DriverForm = {
  name: string;
  document_number: string;
  license_number: string;
  license_category: string;
  license_expiry: string;
  phone: string;
  email: string;
};
type SupplierForm = {
  name: string;
  tax_id: string;
  supplier_type: string;
  phone: string;
  email: string;
};
type Tab = "drivers" | "suppliers";
type StatusFilter = "active" | "inactive" | "cancelled" | "all";

const emptyDriver = (): DriverForm => ({
  name: "", document_number: "", license_number: "", license_category: "",
  license_expiry: "", phone: "", email: ""
});
const emptySupplier = (): SupplierForm => ({
  name: "", tax_id: "", supplier_type: "other", phone: "", email: ""
});
const recordStatusLabels: Record<RecordStatus, string> = {
  active: "Ativo", inactive: "Inativo", cancelled: "Cancelado"
};
const supplierTypeLabels: Record<string, string> = Object.fromEntries(
  SUPPLIER_TYPES.map(item => [item.value, item.label])
);
const fieldStyle: CSSProperties = {
  width: "100%", minWidth: 0, boxSizing: "border-box", border: "1px solid #dbe2ea",
  borderRadius: 9, padding: "10px 11px", fontSize: 14, color: "#172033", background: "#fff"
};
const labelStyle: CSSProperties = {
  display: "grid", gap: 6, color: "#526078", fontWeight: 650, fontSize: 12
};
const buttonStyle: CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
  border: "1px solid transparent", borderRadius: 9, padding: "10px 13px",
  fontSize: 13, fontWeight: 650, cursor: "pointer", whiteSpace: "nowrap"
};
const statusStyle = (status: RecordStatus): CSSProperties => ({
  display: "inline-flex", alignItems: "center", padding: "4px 8px", borderRadius: 20,
  fontSize: 11, fontWeight: 750,
  color: status === "active" ? "#047857" : status === "inactive" ? "#92400e" : "#64748b",
  background: status === "active" ? "#d1fae5" : status === "inactive" ? "#fef3c7" : "#e2e8f0"
});
const dateShort = (date: string | null) => {
  if (!date) return "—";
  const [year, month, day] = date.slice(0, 10).split("-");
  return year && month && day ? day + "/" + month + "/" + year : date;
};

export function PeopleManager({ organizationId }: { organizationId: string }) {
  const [activeTab, setActiveTab] = useState<Tab>("drivers");
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [driverForm, setDriverForm] = useState<DriverForm>(emptyDriver);
  const [supplierForm, setSupplierForm] = useState<SupplierForm>(emptySupplier);
  const [editingDriver, setEditingDriver] = useState<string | null>(null);
  const [editingSupplier, setEditingSupplier] = useState<string | null>(null);
  const [showDriverForm, setShowDriverForm] = useState(false);
  const [showSupplierForm, setShowSupplierForm] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!supabase) {
      setError("Banco de dados não configurado. Confira as variáveis de conexão do Supabase.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const driverRows: Driver[] = [];
      const supplierRows: Supplier[] = [];
      const pageSize = 500;
      for (let offset = 0; ; offset += pageSize) {
        const page = await supabase.from("drivers")
          .select("id,organization_id,name,document_number,license_number,license_category,license_expiry,phone,email,status,created_at,updated_at")
          .eq("organization_id", organizationId)
          .order("name")
          .order("id")
          .range(offset, offset + pageSize - 1);
        if (page.error) throw new Error("Não foi possível carregar os motoristas desta organização.");
        const batch = (page.data ?? []) as Driver[];
        driverRows.push(...batch);
        if (batch.length < pageSize) break;
      }
      for (let offset = 0; ; offset += pageSize) {
        const page = await supabase.from("suppliers")
          .select("id,organization_id,name,tax_id,supplier_type,phone,email,status,created_at,updated_at")
          .eq("organization_id", organizationId)
          .order("name")
          .order("id")
          .range(offset, offset + pageSize - 1);
        if (page.error) throw new Error("Não foi possível carregar os fornecedores desta organização.");
        const batch = (page.data ?? []) as Supplier[];
        supplierRows.push(...batch);
        if (batch.length < pageSize) break;
      }
      setDrivers(driverRows);
      setSuppliers(supplierRows);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar os cadastros.");
    } finally {
      setLoading(false);
    }
  }, [organizationId, refreshKey]);

  useEffect(() => { void load(); }, [load]);

  const filteredDrivers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return drivers.filter(row => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      return !term || [
        row.name, row.document_number, row.license_number, row.license_category, row.phone, row.email
      ].some(value => value?.toLocaleLowerCase("pt-BR").includes(term));
    });
  }, [drivers, search, statusFilter]);

  const filteredSuppliers = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return suppliers.filter(row => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      return !term || [
        row.name, row.tax_id, row.phone, row.email, supplierTypeLabels[row.supplier_type] ?? row.supplier_type
      ].some(value => value?.toLocaleLowerCase("pt-BR").includes(term));
    });
  }, [suppliers, search, statusFilter]);

  const activeDrivers = drivers.filter(row => row.status === "active").length;
  const activeSuppliers = suppliers.filter(row => row.status === "active").length;
  const expiryAlerts = drivers.filter(row => {
    if (row.status !== "active" || !row.license_expiry) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(row.license_expiry + "T00:00:00");
    const days = (expiry.getTime() - today.getTime()) / 86400000;
    return days < 0 || days <= 30;
  }).length;

  const resetForms = () => {
    setShowDriverForm(false);
    setShowSupplierForm(false);
    setEditingDriver(null);
    setEditingSupplier(null);
    setDriverForm(emptyDriver());
    setSupplierForm(emptySupplier());
    setFormError("");
  };

  function beginCreate(tab: Tab) {
    resetForms();
    setActiveTab(tab);
    setError("");
    setNotice("");
    setFormError("");
    if (tab === "drivers") setShowDriverForm(true);
    else setShowSupplierForm(true);
  }

  function beginEditDriver(row: Driver) {
    if (row.status === "cancelled") return;
    setActiveTab("drivers");
    setShowSupplierForm(false);
    setEditingSupplier(null);
    setSupplierForm(emptySupplier());
    setDriverForm({
      name: row.name,
      document_number: row.document_number ?? "",
      license_number: row.license_number ?? "",
      license_category: row.license_category ?? "",
      license_expiry: row.license_expiry ?? "",
      phone: row.phone ?? "",
      email: row.email ?? ""
    });
    setEditingDriver(row.id);
    setShowDriverForm(true);
    setFormError("");
    setError("");
    setNotice("");
  }

  function beginEditSupplier(row: Supplier) {
    if (row.status === "cancelled") return;
    setActiveTab("suppliers");
    setShowDriverForm(false);
    setEditingDriver(null);
    setDriverForm(emptyDriver());
    setSupplierForm({
      name: row.name, tax_id: row.tax_id ?? "", supplier_type: row.supplier_type,
      phone: row.phone ?? "", email: row.email ?? ""
    });
    setEditingSupplier(row.id);
    setShowSupplierForm(true);
    setFormError("");
    setError("");
    setNotice("");
  }

  async function saveDriver(event: FormEvent) {
    event.preventDefault();
    if (!supabase || saving) return;
    const name = driverForm.name.trim().replace(/\s+/g, " ");
    const documentNumber = driverForm.document_number.trim() || null;
    const licenseNumber = driverForm.license_number.trim() || null;
    const licenseCategory = driverForm.license_category.trim().toUpperCase() || null;
    const phone = driverForm.phone.trim() || null;
    const email = driverForm.email.trim() || null;
    if (name.length < 2 || name.length > 160) {
      setFormError("Informe o nome completo do motorista, com 2 a 160 caracteres.");
      return;
    }
    if (!isValidOptionalEmail(driverForm.email)) {
      setFormError("Informe um e-mail válido ou deixe o campo em branco.");
      return;
    }
    if (documentNumber && findDuplicateIdentity(documentNumber, drivers.map(row => ({ id: row.id, value: row.document_number })), editingDriver)) {
      setFormError("Já existe um motorista cadastrado com esse CPF/documento, mesmo que esteja inativo.");
      return;
    }
    if (findDuplicateName(name, drivers.map(row => ({ id: row.id, name: row.name })), editingDriver)) {
      setFormError("Já existe um motorista com esse nome. Confira o cadastro antes de continuar.");
      return;
    }
    setSaving(true);
    setFormError("");
    setError("");
    setNotice("");
    try {
      const fields = {
        name,
        document_number: documentNumber,
        license_number: licenseNumber,
        license_category: licenseCategory,
        license_expiry: driverForm.license_expiry || null,
        phone,
        email,
        updated_at: new Date().toISOString()
      };
      const response = editingDriver
        ? await supabase.from("drivers").update(fields)
            .eq("id", editingDriver).eq("organization_id", organizationId).neq("status", "cancelled")
            .select("id").maybeSingle()
        : await supabase.from("drivers").insert({ ...fields, organization_id: organizationId, status: "active" })
            .select("id").maybeSingle();
      if (response.error) {
        if (response.error.code === "23505") throw new Error("Esse CPF/documento já está associado a outro motorista nesta organização.");
        if (response.error.code === "42501") throw new Error("Seu perfil não tem permissão para gravar motoristas.");
        throw new Error("O banco não confirmou o cadastro. Confira os campos e tente novamente.");
      }
      if (!response.data) throw new Error("Nenhuma alteração foi confirmada. O registro pode ter sido cancelado ou alterado por outra pessoa.");
      setNotice(editingDriver ? "Cadastro do motorista atualizado." : "Motorista cadastrado com sucesso.");
      resetForms();
      setRefreshKey(value => value + 1);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Não foi possível salvar o motorista.");
    } finally {
      setSaving(false);
    }
  }

  async function saveSupplier(event: FormEvent) {
    event.preventDefault();
    if (!supabase || saving) return;
    const name = supplierForm.name.trim().replace(/\s+/g, " ");
    const taxId = supplierForm.tax_id.trim() || null;
    const phone = supplierForm.phone.trim() || null;
    const email = supplierForm.email.trim() || null;
    if (name.length < 2 || name.length > 160) {
      setFormError("Informe o nome do fornecedor, com 2 a 160 caracteres.");
      return;
    }
    if (!isValidOptionalEmail(supplierForm.email)) {
      setFormError("Informe um e-mail válido ou deixe o campo em branco.");
      return;
    }
    if (!SUPPLIER_TYPES.some(item => item.value === supplierForm.supplier_type)) {
      setFormError("Selecione um tipo de fornecedor válido.");
      return;
    }
    if (taxId && findDuplicateIdentity(taxId, suppliers.map(row => ({ id: row.id, value: row.tax_id })), editingSupplier)) {
      setFormError("Já existe um fornecedor com esse CNPJ/CPF, inclusive entre os inativos.");
      return;
    }
    if (findDuplicateName(name, suppliers.map(row => ({ id: row.id, name: row.name })), editingSupplier)) {
      setFormError("Já existe um fornecedor com nome semelhante. Confira o cadastro antes de continuar.");
      return;
    }
    setSaving(true);
    setFormError("");
    setError("");
    setNotice("");
    try {
      const fields = {
        name,
        tax_id: taxId,
        supplier_type: supplierForm.supplier_type,
        phone,
        email,
        updated_at: new Date().toISOString()
      };
      const response = editingSupplier
        ? await supabase.from("suppliers").update(fields)
            .eq("id", editingSupplier).eq("organization_id", organizationId).neq("status", "cancelled")
            .select("id").maybeSingle()
        : await supabase.from("suppliers").insert({ ...fields, organization_id: organizationId, status: "active" })
            .select("id").maybeSingle();
      if (response.error) {
        if (response.error.code === "23505") throw new Error("Esse CNPJ/CPF já está cadastrado para outro fornecedor nesta organização.");
        if (response.error.code === "42501") throw new Error("Seu perfil não tem permissão para gravar fornecedores.");
        throw new Error("O banco não confirmou o cadastro. Confira os campos e tente novamente.");
      }
      if (!response.data) throw new Error("Nenhuma alteração foi confirmada. O registro pode ter sido cancelado ou alterado por outra pessoa.");
      setNotice(editingSupplier ? "Cadastro do fornecedor atualizado." : "Fornecedor cadastrado com sucesso.");
      resetForms();
      setRefreshKey(value => value + 1);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Não foi possível salvar o fornecedor.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(tab: Tab, row: Driver | Supplier) {
    if (!supabase || saving || row.status === "cancelled") return;
    const nextStatus: RecordStatus = row.status === "active" ? "inactive" : "active";
    const entity = tab === "drivers" ? "motorista" : "fornecedor";
    const confirmed = window.confirm(
      nextStatus === "inactive"
        ? "Inativar este " + entity + "? O histórico ficará preservado e ele não deverá ser usado em novos lançamentos."
        : "Reativar este " + entity + "? Ele voltará a aparecer como opção ativa nos novos lançamentos."
    );
    if (!confirmed) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const table = tab === "drivers" ? "drivers" : "suppliers";
      const response = await supabase.from(table).update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", row.id).eq("organization_id", organizationId).eq("status", row.status)
        .select("id").maybeSingle();
      if (response.error) {
        if (response.error.code === "42501") throw new Error("Seu perfil não tem permissão para alterar a situação deste cadastro.");
        throw new Error("Não foi possível alterar a situação. Nenhuma mudança foi confirmada.");
      }
      if (!response.data) throw new Error("O cadastro não foi alterado. Atualize a lista para conferir a situação atual.");
      setNotice((nextStatus === "inactive" ? "Cadastro inativado." : "Cadastro reativado.") + " O histórico relacionado foi preservado.");
      setRefreshKey(value => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao alterar a situação do cadastro.");
    } finally {
      setSaving(false);
    }
  }

  const tabButton = (tab: Tab, label: string, count: number, Icon: typeof Users) => (
    <button type="button" onClick={() => { resetForms(); setActiveTab(tab); setFormError(""); setError(""); setNotice(""); }}
      style={{ ...buttonStyle, flex: 1, justifyContent: "center", minWidth: 160, borderColor: activeTab === tab ? "#bfdbfe" : "#e2e8f0", background: activeTab === tab ? "#eff6ff" : "#fff", color: activeTab === tab ? "#1d4ed8" : "#475569" }}>
      <Icon size={16}/>{label}<span style={{ marginLeft: 2, padding: "2px 7px", borderRadius: 20, background: activeTab === tab ? "#dbeafe" : "#f1f5f9", fontSize: 11 }}>{count}</span>
    </button>
  );

  return <section style={{ display: "grid", gap: 16 }} aria-label="Gestão de motoristas e fornecedores">
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
      <div>
        <h2 style={{ margin: 0, color: "#172033", fontSize: 19 }}>Cadastros operacionais</h2>
        <p style={{ margin: "5px 0 0", color: "#64748b", fontSize: 13 }}>Dados centralizados de motoristas e fornecedores vinculados à organização.</p>
      </div>
      <button type="button" style={{ ...buttonStyle, background: "#fff", color: "#334155", borderColor: "#dbe2ea" }} onClick={() => setRefreshKey(value => value + 1)} disabled={loading}>
        <RefreshCw size={15}/> Atualizar dados
      </button>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
      <article style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 13, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#64748b", fontWeight: 650, fontSize: 12 }}>Motoristas ativos <span style={{ display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: 9, background: "#eff6ff", color: "#1d4ed8" }}><UserRound size={17}/></span></div>
        <strong style={{ display: "block", color: "#172033", fontSize: 25, marginTop: 9 }}>{loading ? "—" : activeDrivers}</strong>
        <small style={{ color: "#64748b" }}>Disponíveis para operação</small>
      </article>
      <article style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 13, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#64748b", fontWeight: 650, fontSize: 12 }}>Fornecedores ativos <span style={{ display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: 9, background: "#ecfdf5", color: "#047857" }}><Building2 size={17}/></span></div>
        <strong style={{ display: "block", color: "#172033", fontSize: 25, marginTop: 9 }}>{loading ? "—" : activeSuppliers}</strong>
        <small style={{ color: "#64748b" }}>Disponíveis para novos lançamentos</small>
      </article>
      <article style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 13, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#64748b", fontWeight: 650, fontSize: 12 }}>Alertas de CNH <span style={{ display: "grid", placeItems: "center", width: 32, height: 32, borderRadius: 9, background: "#fff7ed", color: "#c2410c" }}><ShieldCheck size={17}/></span></div>
        <strong style={{ display: "block", color: "#172033", fontSize: 25, marginTop: 9 }}>{loading ? "—" : expiryAlerts}</strong>
        <small style={{ color: "#64748b" }}>Vencidas ou vencendo em até 30 dias</small>
      </article>
    </div>

    <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
      {tabButton("drivers", "Motoristas", drivers.length, Users)}
      {tabButton("suppliers", "Fornecedores", suppliers.length, Building2)}
    </div>

    {error && <div role="alert" style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: 12, color: "#991b1b", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 9, fontSize: 13 }}><AlertCircle size={17} style={{ flexShrink: 0 }}/><span>{error}</span></div>}
    {notice && <div role="status" style={{ display: "flex", gap: 9, alignItems: "center", padding: 12, color: "#065f46", background: "#ecfdf5", border: "1px solid #a7f3d0", borderRadius: 9, fontSize: 13 }}><CheckCircle2 size={17}/><span>{notice}</span><button type="button" onClick={() => setNotice("")} aria-label="Fechar aviso" style={{ marginLeft: "auto", border: 0, background: "transparent", color: "inherit", cursor: "pointer" }}><X size={15}/></button></div>}

    {activeTab === "drivers" && showDriverForm && <form onSubmit={saveDriver} style={{ display: "grid", gap: 14, background: "#fff", border: "1px solid #cbd5e1", borderRadius: 13, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}><div><h3 style={{ margin: 0, fontSize: 16, color: "#172033" }}>{editingDriver ? "Editar motorista" : "Cadastrar motorista"}</h3><p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>Os dados de habilitação alimentam os alertas preventivos de CNH.</p></div><button type="button" aria-label="Fechar formulário" onClick={resetForms} style={{ border: 0, background: "transparent", color: "#64748b", cursor: "pointer" }}><X size={18}/></button></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
        <label style={labelStyle}>Nome completo *<input required minLength={2} maxLength={160} value={driverForm.name} onChange={e => setDriverForm(old => ({ ...old, name: e.target.value }))} style={fieldStyle} autoComplete="name"/></label>
        <label style={labelStyle}>CPF / documento<input value={driverForm.document_number} onChange={e => setDriverForm(old => ({ ...old, document_number: e.target.value }))} maxLength={40} style={fieldStyle} placeholder="Opcional"/></label>
        <label style={labelStyle}>Número da CNH<input value={driverForm.license_number} onChange={e => setDriverForm(old => ({ ...old, license_number: e.target.value }))} maxLength={40} style={fieldStyle}/></label>
        <label style={labelStyle}>Categoria da CNH<select value={driverForm.license_category} onChange={e => setDriverForm(old => ({ ...old, license_category: e.target.value }))} style={fieldStyle}><option value="">Não informada</option>{["A","B","AB","C","AC","D","AD","E","AE"].map(category => <option key={category} value={category}>{category}</option>)}</select></label>
        <label style={labelStyle}>Validade da CNH<input type="date" value={driverForm.license_expiry} onChange={e => setDriverForm(old => ({ ...old, license_expiry: e.target.value }))} style={fieldStyle}/></label>
        <label style={labelStyle}><span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Phone size={13}/> Telefone</span><input type="tel" maxLength={40} value={driverForm.phone} onChange={e => setDriverForm(old => ({ ...old, phone: e.target.value }))} style={fieldStyle} autoComplete="tel"/></label>
        <label style={labelStyle}><span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Mail size={13}/> E-mail</span><input type="email" maxLength={254} value={driverForm.email} onChange={e => setDriverForm(old => ({ ...old, email: e.target.value }))} style={fieldStyle} autoComplete="email"/></label>
      </div>
      {formError && <div role="alert" style={{ display: "flex", gap: 8, padding: 11, borderRadius: 9, background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", fontSize: 13 }}><AlertCircle size={16}/>{formError}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}><button type="button" onClick={resetForms} style={{ ...buttonStyle, background: "#fff", borderColor: "#dbe2ea", color: "#334155" }}>Cancelar</button><button disabled={saving} type="submit" style={{ ...buttonStyle, background: "#1e40af", color: "#fff", opacity: saving ? .65 : 1 }}>{saving ? <RefreshCw size={15}/> : <CheckCircle2 size={15}/>} {saving ? "Salvando..." : editingDriver ? "Salvar alterações" : "Cadastrar motorista"}</button></div>
    </form>}

    {activeTab === "suppliers" && showSupplierForm && <form onSubmit={saveSupplier} style={{ display: "grid", gap: 14, background: "#fff", border: "1px solid #cbd5e1", borderRadius: 13, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}><div><h3 style={{ margin: 0, fontSize: 16, color: "#172033" }}>{editingSupplier ? "Editar fornecedor" : "Cadastrar fornecedor"}</h3><p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>Os mesmos cadastros são utilizados pelos módulos operacionais.</p></div><button type="button" aria-label="Fechar formulário" onClick={resetForms} style={{ border: 0, background: "transparent", color: "#64748b", cursor: "pointer" }}><X size={18}/></button></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
        <label style={labelStyle}>Nome / razão social *<input required minLength={2} maxLength={160} value={supplierForm.name} onChange={e => setSupplierForm(old => ({ ...old, name: e.target.value }))} style={fieldStyle} autoComplete="organization"/></label>
        <label style={labelStyle}>CNPJ / CPF<input maxLength={40} value={supplierForm.tax_id} onChange={e => setSupplierForm(old => ({ ...old, tax_id: e.target.value }))} style={fieldStyle}/></label>
        <label style={labelStyle}>Tipo de fornecedor<select required value={supplierForm.supplier_type} onChange={e => setSupplierForm(old => ({ ...old, supplier_type: e.target.value }))} style={fieldStyle}>{SUPPLIER_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label>
        <label style={labelStyle}><span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Phone size={13}/> Telefone</span><input type="tel" maxLength={40} value={supplierForm.phone} onChange={e => setSupplierForm(old => ({ ...old, phone: e.target.value }))} style={fieldStyle} autoComplete="tel"/></label>
        <label style={labelStyle}><span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Mail size={13}/> E-mail</span><input type="email" maxLength={254} value={supplierForm.email} onChange={e => setSupplierForm(old => ({ ...old, email: e.target.value }))} style={fieldStyle} autoComplete="email"/></label>
      </div>
      {formError && <div role="alert" style={{ display: "flex", gap: 8, padding: 11, borderRadius: 9, background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca", fontSize: 13 }}><AlertCircle size={16}/>{formError}</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}><button type="button" onClick={resetForms} style={{ ...buttonStyle, background: "#fff", borderColor: "#dbe2ea", color: "#334155" }}>Cancelar</button><button disabled={saving} type="submit" style={{ ...buttonStyle, background: "#1e40af", color: "#fff", opacity: saving ? .65 : 1 }}>{saving ? <RefreshCw size={15}/> : <CheckCircle2 size={15}/>} {saving ? "Salvando..." : editingSupplier ? "Salvar alterações" : "Cadastrar fornecedor"}</button></div>
    </form>}

    <article style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 13, overflow: "hidden" }}>
      <div style={{ display: "grid", gap: 12, padding: 16, borderBottom: "1px solid #e2e8f0" }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <div><h3 style={{ margin: 0, color: "#172033", fontSize: 16 }}>{activeTab === "drivers" ? "Lista de motoristas" : "Lista de fornecedores"}</h3><p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>{activeTab === "drivers" ? filteredDrivers.length + " cadastro(s) no filtro atual" : filteredSuppliers.length + " cadastro(s) no filtro atual"}</p></div>
          <button type="button" onClick={() => beginCreate(activeTab)} style={{ ...buttonStyle, background: "#1e40af", color: "#fff" }}><Plus size={15}/> {activeTab === "drivers" ? "Novo motorista" : "Novo fornecedor"}</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 9 }}>
          <label style={labelStyle}><span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}><Search size={13}/> Pesquisar</span><input value={search} onChange={e => setSearch(e.target.value)} placeholder={activeTab === "drivers" ? "Nome, CPF, CNH ou contato" : "Nome, CNPJ ou contato"} style={fieldStyle}/></label>
          <label style={labelStyle}>Situação<select value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)} style={fieldStyle}><option value="active">Ativos</option><option value="inactive">Inativos</option><option value="cancelled">Cancelados (somente leitura)</option><option value="all">Todas as situações</option></select></label>
        </div>
      </div>

      <div style={{ overflowX: "auto", width: "100%" }}>
        {activeTab === "drivers" ? <table style={{ width: "100%", minWidth: 860, borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
          <thead><tr style={{ background: "#f8fafc", color: "#64748b" }}>{["Motorista", "Documento / CNH", "Validade", "Contato", "Situação", "Ações"].map(label => <th key={label} style={{ padding: "11px 13px", whiteSpace: "nowrap", fontSize: 11, letterSpacing: ".04em", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>{label}</th>)}</tr></thead>
          <tbody>{filteredDrivers.map(row => {
            const expired = row.license_expiry && new Date(row.license_expiry + "T00:00:00").getTime() < new Date(new Date().toDateString()).getTime();
            const expiring = row.license_expiry && !expired && new Date(row.license_expiry + "T00:00:00").getTime() <= Date.now() + 30 * 86400000;
            return <tr key={row.id} style={{ borderBottom: "1px solid #eef2f7", opacity: row.status === "cancelled" ? .65 : 1 }}>
              <td style={{ padding: "12px 13px", minWidth: 170 }}><strong style={{ display: "block", color: "#172033" }}>{row.name}</strong><small style={{ color: "#94a3b8" }}>{row.email || "Sem e-mail cadastrado"}</small></td>
              <td style={{ padding: "12px 13px", minWidth: 150 }}><span style={{ display: "block", color: "#334155" }}>{row.document_number || "CPF não informado"}</span><small style={{ color: "#64748b" }}>CNH: {row.license_number || "—"}{row.license_category ? " · Cat. " + row.license_category : ""}</small></td>
              <td style={{ padding: "12px 13px", whiteSpace: "nowrap" }}><span>{dateShort(row.license_expiry)}</span>{row.license_expiry && row.status === "active" && (expired || expiring) && <small style={{ display: "block", marginTop: 3, color: expired ? "#b91c1c" : "#b45309", fontWeight: 700 }}>{expired ? "Vencida" : "Vence em até 30 dias"}</small>}</td>
              <td style={{ padding: "12px 13px", color: "#475569" }}>{row.phone || "—"}</td>
              <td style={{ padding: "12px 13px" }}><span style={statusStyle(row.status)}>{recordStatusLabels[row.status]}</span></td>
              <td style={{ padding: "12px 13px" }}><div style={{ display: "flex", gap: 6 }}>
                {row.status !== "cancelled" && <><button type="button" title="Editar motorista" aria-label={"Editar motorista " + row.name} onClick={() => beginEditDriver(row)} style={{ ...buttonStyle, padding: 8, background: "#eff6ff", color: "#1d4ed8" }}><Pencil size={15}/></button><button type="button" title={row.status === "active" ? "Inativar motorista" : "Reativar motorista"} onClick={() => void toggleStatus("drivers", row)} disabled={saving} style={{ ...buttonStyle, padding: 8, background: row.status === "active" ? "#fff7ed" : "#ecfdf5", color: row.status === "active" ? "#c2410c" : "#047857" }}>{row.status === "active" ? "Inativar" : "Reativar"}</button></>}
                {row.status === "cancelled" && <span style={{ color: "#94a3b8", fontSize: 12 }}>Somente leitura</span>}
              </div></td>
            </tr>;
          })}{!loading && filteredDrivers.length === 0 && <tr><td colSpan={6} style={{ padding: 35, textAlign: "center", color: "#64748b" }}><CircleUserRound size={26} style={{ display: "block", margin: "0 auto 8px", color: "#94a3b8" }}/><strong style={{ display: "block", color: "#334155" }}>Nenhum motorista encontrado</strong><small>Ajuste os filtros ou cadastre um motorista.</small></td></tr>}</tbody>
        </table> : <table style={{ width: "100%", minWidth: 800, borderCollapse: "collapse", fontSize: 13, textAlign: "left" }}>
          <thead><tr style={{ background: "#f8fafc", color: "#64748b" }}>{["Fornecedor", "Documento", "Tipo", "Contato", "Situação", "Ações"].map(label => <th key={label} style={{ padding: "11px 13px", whiteSpace: "nowrap", fontSize: 11, letterSpacing: ".04em", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>{label}</th>)}</tr></thead>
          <tbody>{filteredSuppliers.map(row => <tr key={row.id} style={{ borderBottom: "1px solid #eef2f7", opacity: row.status === "cancelled" ? .65 : 1 }}>
            <td style={{ padding: "12px 13px", minWidth: 170 }}><strong style={{ display: "block", color: "#172033" }}>{row.name}</strong><small style={{ color: "#94a3b8" }}>{row.email || "Sem e-mail cadastrado"}</small></td>
            <td style={{ padding: "12px 13px", color: "#475569" }}>{row.tax_id || "Não informado"}</td>
            <td style={{ padding: "12px 13px", color: "#475569" }}>{supplierTypeLabels[row.supplier_type] ?? row.supplier_type}</td>
            <td style={{ padding: "12px 13px", color: "#475569" }}>{row.phone || "—"}</td>
            <td style={{ padding: "12px 13px" }}><span style={statusStyle(row.status)}>{recordStatusLabels[row.status]}</span></td>
            <td style={{ padding: "12px 13px" }}><div style={{ display: "flex", gap: 6 }}>
              {row.status !== "cancelled" && <><button type="button" title="Editar fornecedor" aria-label={"Editar fornecedor " + row.name} onClick={() => beginEditSupplier(row)} style={{ ...buttonStyle, padding: 8, background: "#eff6ff", color: "#1d4ed8" }}><Pencil size={15}/></button><button type="button" title={row.status === "active" ? "Inativar fornecedor" : "Reativar fornecedor"} onClick={() => void toggleStatus("suppliers", row)} disabled={saving} style={{ ...buttonStyle, padding: 8, background: row.status === "active" ? "#fff7ed" : "#ecfdf5", color: row.status === "active" ? "#c2410c" : "#047857" }}>{row.status === "active" ? "Inativar" : "Reativar"}</button></>}
              {row.status === "cancelled" && <span style={{ color: "#94a3b8", fontSize: 12 }}>Somente leitura</span>}
            </div></td>
          </tr>)}{!loading && filteredSuppliers.length === 0 && <tr><td colSpan={6} style={{ padding: 35, textAlign: "center", color: "#64748b" }}><Building2 size={26} style={{ display: "block", margin: "0 auto 8px", color: "#94a3b8" }}/><strong style={{ display: "block", color: "#334155" }}>Nenhum fornecedor encontrado</strong><small>Ajuste os filtros ou cadastre um fornecedor.</small></td></tr>}</tbody>
        </table>}
      </div>
      {loading && <div role="status" style={{ padding: 12, display: "flex", alignItems: "center", gap: 8, color: "#64748b", fontSize: 12 }}><RefreshCw size={14}/> Carregando cadastros...</div>}
    </article>

    <div style={{ display: "flex", gap: 7, alignItems: "flex-start", color: "#64748b", fontSize: 12, lineHeight: 1.5 }}><FileText size={15} style={{ flexShrink: 0, marginTop: 1 }}/><span>Os cadastros cancelados são somente leitura. Para preservar a rastreabilidade de abastecimentos, serviços e compras, este módulo não exclui fisicamente registros; use Inativar para retirar um cadastro das novas operações.</span></div>
  </section>;
}

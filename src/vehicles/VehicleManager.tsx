import { FormEvent, useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, Search, Truck, X } from "lucide-react";
import { supabase } from "../lib/supabase";

type VehicleKind = "vehicle" | "equipment";
type MeterKind = "odometer" | "hourmeter";
type FuelType = "diesel" | "gasoline" | "ethanol" | "gnv" | "electric" | "other";
type VehicleRecord = {
  id: string; code: string; plate: string | null; description: string;
  kind: VehicleKind; meter_kind: MeterKind; fuel_type: FuelType;
  make: string | null; model: string | null; model_year: number | null;
  status: "active" | "inactive" | "cancelled"; created_at: string;
};

const emptyForm = { code: "", description: "", plate: "", kind: "vehicle" as VehicleKind, meter_kind: "odometer" as MeterKind, fuel_type: "diesel" as FuelType, make: "", model: "", model_year: "" };

export function VehicleManager({ organizationId }: { organizationId: string }) {
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadVehicles = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError("");
    const { data, error: queryError } = await supabase.from("vehicles")
      .select("id, code, plate, description, kind, meter_kind, fuel_type, make, model, model_year, status, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false });
    if (queryError) {
      setError("Não foi possível consultar os veículos. Verifique a conexão, a migração e as permissões RLS.");
      setVehicles([]);
    } else {
      setVehicles((data ?? []) as unknown as VehicleRecord[]);
    }
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { void loadVehicles(); }, [loadVehicles]);

  const saveVehicle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;
    setSaving(true);
    setError("");
    setNotice("");
    const payload = {
      organization_id: organizationId,
      code: form.code.trim(),
      description: form.description.trim(),
      plate: form.plate.trim().toUpperCase() || null,
      kind: form.kind,
      meter_kind: form.kind === "equipment" ? form.meter_kind : "odometer",
      fuel_type: form.fuel_type,
      make: form.make.trim() || null,
      model: form.model.trim() || null,
      model_year: form.model_year ? Number(form.model_year) : null
    };
    const { error: insertError } = await supabase.from("vehicles").insert(payload);
    if (insertError) {
      setError(insertError.code === "23505"
        ? "Já existe um cadastro com esse código, placa ou chassi nesta organização."
        : "Não foi possível salvar. Confira os campos e as permissões do banco.");
    } else {
      setForm(emptyForm);
      setShowForm(false);
      setNotice("Cadastro salvo no Supabase.");
      await loadVehicles();
    }
    setSaving(false);
  };

  const filtered = vehicles.filter((vehicle) => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return !term || [vehicle.code, vehicle.plate ?? "", vehicle.description, vehicle.make ?? "", vehicle.model ?? ""]
      .some((value) => value.toLocaleLowerCase("pt-BR").includes(term));
  });

  return <section className="vehicle-manager panel">
    <div className="vehicle-toolbar">
      <div><h2>Cadastro de ativos</h2><p>Registros persistidos no banco da organização selecionada.</p></div>
      <div className="vehicle-toolbar-actions"><button className="secondary-button" onClick={() => void loadVehicles()} disabled={loading}><RefreshCw size={14} /> Atualizar</button><button className="primary-button" onClick={() => { setShowForm((value) => !value); setError(""); setNotice(""); }}><Plus size={15} /> Novo ativo</button></div>
    </div>
    {error && <div className="vehicle-message vehicle-error" role="alert">{error}<button aria-label="Fechar aviso" onClick={() => setError("")}><X size={14} /></button></div>}
    {notice && <div className="vehicle-message vehicle-success" role="status">{notice}<button aria-label="Fechar aviso" onClick={() => setNotice("")}><X size={14} /></button></div>}
    {showForm && <form className="vehicle-form" onSubmit={saveVehicle}>
      <div className="vehicle-form-heading"><div><strong>Novo veículo ou equipamento</strong><p>O código é obrigatório e deve ser único na organização.</p></div><button type="button" className="icon-button" onClick={() => setShowForm(false)} aria-label="Fechar formulário"><X size={17} /></button></div>
      <div className="vehicle-fields">
        <label>Código interno *<input required maxLength={40} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="Ex.: FRO-001" /></label>
        <label>Descrição *<input required maxLength={160} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex.: Caminhão trator" /></label>
        <label>Placa<input maxLength={12} value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} placeholder="ABC1D23" /></label>
        <label>Tipo<select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as VehicleKind, meter_kind: e.target.value === "equipment" ? "hourmeter" : "odometer" })}><option value="vehicle">Veículo</option><option value="equipment">Equipamento</option></select></label>
        <label>Medidor<select value={form.meter_kind} onChange={(e) => setForm({ ...form, meter_kind: e.target.value as MeterKind })}><option value="odometer">Hodômetro (km)</option><option value="hourmeter">Horímetro (h)</option></select></label>
        <label>Combustível<select value={form.fuel_type} onChange={(e) => setForm({ ...form, fuel_type: e.target.value as FuelType })}><option value="diesel">Diesel</option><option value="gasoline">Gasolina</option><option value="ethanol">Etanol</option><option value="gnv">GNV</option><option value="electric">Elétrico</option><option value="other">Outro</option></select></label>
        <label>Marca<input maxLength={80} value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} /></label>
        <label>Modelo<input maxLength={80} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></label>
        <label>Ano modelo<input type="number" min="1900" max="2200" value={form.model_year} onChange={(e) => setForm({ ...form, model_year: e.target.value })} /></label>
      </div>
      <div className="vehicle-form-actions"><button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Salvando..." : "Salvar cadastro"}</button></div>
    </form>}
    <div className="vehicle-list-toolbar"><label className="vehicle-search"><Search size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por código, placa, descrição ou modelo" /></label><span>{filtered.length} {filtered.length === 1 ? "registro" : "registros"}</span></div>
    {loading ? <div className="vehicle-empty"><RefreshCw size={22} /><strong>Carregando cadastros...</strong></div> : filtered.length === 0 ? <div className="vehicle-empty"><div className="vehicle-empty-icon"><Truck size={24} /></div><strong>{search ? "Nenhum resultado para essa busca" : "Nenhum ativo cadastrado"}</strong><p>{search ? "Tente pesquisar com outro código ou placa." : "Cadastre o primeiro veículo ou equipamento para começar a construir o histórico operacional."}</p>{!search && <button className="primary-button" onClick={() => setShowForm(true)}><Plus size={15} /> Cadastrar primeiro ativo</button>}</div> : <div className="vehicle-table-wrap"><table className="vehicle-table"><thead><tr><th>Ativo</th><th>Tipo</th><th>Medidor</th><th>Combustível</th><th>Status</th></tr></thead><tbody>{filtered.map((vehicle) => <tr key={vehicle.id}><td><div className="vehicle-name"><span className="vehicle-row-icon"><Truck size={16} /></span><span><strong>{vehicle.description}</strong><small>{vehicle.code}{vehicle.plate ? " · "+vehicle.plate : ""}</small></span></div></td><td>{vehicle.kind === "equipment" ? "Equipamento" : "Veículo"}</td><td>{vehicle.meter_kind === "hourmeter" ? "Horímetro (h)" : "Hodômetro (km)"}</td><td>{({ diesel:"Diesel", gasoline:"Gasolina", ethanol:"Etanol", gnv:"GNV", electric:"Elétrico", other:"Outro" } as Record<FuelType,string>)[vehicle.fuel_type]}</td><td><span className={`vehicle-status ${vehicle.status}`}>{vehicle.status === "active" ? "Ativo" : vehicle.status === "inactive" ? "Inativo" : "Cancelado"}</span></td></tr>)}</tbody></table></div>}
  </section>;
}

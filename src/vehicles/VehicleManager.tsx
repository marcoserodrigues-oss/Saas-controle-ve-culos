import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Pencil, Plus, Power, RefreshCw, Search, Truck, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { nextSequentialCode } from "../lib/automaticCode";

type VehicleKind = "vehicle" | "equipment";
type MeterKind = "odometer" | "hourmeter";
type FuelType = "diesel" | "gasoline" | "ethanol" | "gnv" | "electric" | "other";
type LayoutPosition = { code: string; label: string; axle: number; side: string; slot: string; x: number; y: number };
type LayoutTemplate = { id: string; organization_id: string | null; code: string; name: string; asset_kind: VehicleKind; diagram_type: string; axle_count: number; tire_count: number; description: string | null; layout: LayoutPosition[]; is_system: boolean; is_active: boolean };
type VehicleRecord = {
  id: string; code: string; plate: string | null; description: string; tire_layout_template_id: string | null;
  kind: VehicleKind; meter_kind: MeterKind; fuel_type: FuelType;
  make: string | null; model: string | null; model_year: number | null; vin: string | null;
  status: "active" | "inactive" | "cancelled"; created_at: string;
};

const emptyForm = { code: "", description: "", plate: "", vin: "", kind: "vehicle" as VehicleKind, meter_kind: "odometer" as MeterKind, fuel_type: "diesel" as FuelType, make: "", model: "", model_year: "", tire_layout_template_id: "" };


async function syncLayoutPositions(organizationId: string, vehicleId: string, template: LayoutTemplate) {
  if (!supabase) throw new Error("Banco de dados não configurado.");
  const { data, error } = await supabase.from("vehicle_tire_positions")
    .select("position_code")
    .eq("organization_id", organizationId)
    .eq("vehicle_id", vehicleId);
  if (error) throw error;
  const existing = new Set(((data ?? []) as {position_code:string}[]).map(row => row.position_code.toLocaleLowerCase("pt-BR")));
  const missing = template.layout
    .filter(position => !existing.has(position.code.toLocaleLowerCase("pt-BR")))
    .map(position => ({
      organization_id: organizationId,
      vehicle_id: vehicleId,
      position_code: position.code,
      position_label: position.label,
      is_active: true
    }));
  if (missing.length) {
    const inserted = await supabase.from("vehicle_tire_positions").upsert(missing, {
      onConflict: "vehicle_id,position_code",
      ignoreDuplicates: true
    });
    if (inserted.error) throw inserted.error;
  }
  return missing.length;
}

async function generateVehicleCode(organizationId: string, prefix: "VEI" | "EQP") {
  if (!supabase) throw new Error("Banco de dados não configurado.");
  const codes: string[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from("vehicles")
      .select("code")
      .eq("organization_id", organizationId)
      .order("code")
      .range(from, from + 999);
    if (error) throw error;
    const batch = (data ?? []) as { code: string }[];
    codes.push(...batch.map(row => row.code));
    if (batch.length < 1000) break;
  }
  return nextSequentialCode(codes, prefix);
}


export function VehicleManager({ organizationId }: { organizationId: string }) {
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [layoutTemplates, setLayoutTemplates] = useState<LayoutTemplate[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadVehicles = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError("");
    const [vehicleResult, templateResult] = await Promise.all([
      supabase.from("vehicles")
        .select("id, code, plate, description, kind, meter_kind, fuel_type, make, model, model_year, vin, status, created_at, tire_layout_template_id")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false }),
      supabase.from("tire_layout_templates")
        .select("id,organization_id,code,name,asset_kind,diagram_type,axle_count,tire_count,description,layout,is_system,is_active")
        .eq("is_active", true)
        .or("organization_id.is.null,organization_id.eq." + organizationId)
        .order("is_system", { ascending: false })
        .order("name")
    ]);
    if (vehicleResult.error) {
      setError("Não foi possível consultar os veículos. Verifique a conexão, a migração e as permissões RLS.");
      setVehicles([]);
    } else {
      setVehicles((vehicleResult.data ?? []) as unknown as VehicleRecord[]);
    }
    if (templateResult.error) {
      setLayoutTemplates([]);
      setError("Os veículos foram carregados, mas o catálogo de esquemas de pneus não está disponível. Confirme a migração do layout visual.");
    } else {
      setLayoutTemplates((templateResult.data ?? []) as unknown as LayoutTemplate[]);
    }
    setLoading(false);
  }, [organizationId]);

  useEffect(() => { void loadVehicles(); }, [loadVehicles]);

  const saveVehicle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase || saving) return;
    setSaving(true);
    setError("");
    setNotice("");

    const requestedCode = form.code.trim();
    const editingRecord = editingId ? vehicles.find(v => v.id === editingId) : undefined;
    const autoGenerate = !editingId && !requestedCode;
    let code = requestedCode || editingRecord?.code || "";
    const payloadBase = {
      organization_id: organizationId,
      tire_layout_template_id: form.tire_layout_template_id || null,
      description: form.description.trim(),
      plate: form.plate.trim().toUpperCase() || null,
      kind: form.kind,
      meter_kind: form.kind === "equipment" ? form.meter_kind : "odometer",
      fuel_type: form.fuel_type,
      make: form.make.trim() || null,
      model: form.model.trim() || null,
      model_year: form.model_year ? Number(form.model_year) : null,
      vin: form.vin.trim().toUpperCase() || null
    };

    let saveError: { code?: string; message?: string } | null = null;
    let saved = false;
    let savedId: string | null = null;
    let generationFailed = false;

    for (let attempt = 0; attempt < (autoGenerate ? 5 : 1); attempt++) {
      if (!code) {
        try {
          code = await generateVehicleCode(organizationId, form.kind === "equipment" ? "EQP" : "VEI");
        } catch {
          generationFailed = true;
          break;
        }
      }
      const payload = { ...payloadBase, code };
      const result = editingId
        ? await supabase.from("vehicles").update(payload).eq("id", editingId).eq("organization_id", organizationId).select("id").maybeSingle()
        : await supabase.from("vehicles").insert(payload).select("id").maybeSingle();

      if (result.error && autoGenerate && result.error.code === "23505" && result.error.message.includes("vehicles_organization_id_code_key")) {
        saveError = result.error;
        code = "";
        continue;
      }
      saveError = result.error;
      saved = Boolean(result.data);
      savedId = result.data?.id ?? null;
      break;
    }

    if (generationFailed) {
      setError("Não foi possível gerar um código automaticamente. Verifique a conexão e tente novamente.");
    } else if (saveError) {
      setError(saveError.code === "23505"
        ? "Já existe um ativo com esse código, placa ou chassi nesta organização."
        : "Não foi possível salvar. Confira os campos e as permissões do banco.");
    } else if (!saved) {
      setError(autoGenerate
        ? "Não foi possível reservar um código único após várias tentativas. Tente salvar novamente."
        : "Nenhuma alteração foi confirmada. Atualize a lista e confira se o cadastro ainda existe e se você tem permissão.");
    } else {
      let layoutWarning = "";
      const selectedTemplate = layoutTemplates.find(t => t.id === form.tire_layout_template_id);
      if (savedId && selectedTemplate) {
        try {
          const added = await syncLayoutPositions(organizationId, savedId, selectedTemplate);
          if (added > 0) layoutWarning = " Esquema " + selectedTemplate.name + " aplicado: " + added + " posição(ões) criada(s).";
        } catch {
          layoutWarning = " Atenção: o ativo foi salvo, mas não foi possível criar todas as posições do esquema. Aplique o esquema novamente em Gestão de pneus.";
        }
      }
      setForm(emptyForm);
      setEditingId(null);
      setShowForm(false);
      setNotice((editingId ? "Cadastro atualizado." : (autoGenerate ? "Cadastro salvo com código " + code + "." : "Cadastro salvo no Supabase.")) + layoutWarning);
      await loadVehicles();
    }
    setSaving(false);
  };

  const filtered = vehicles.filter((vehicle) => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return !term || [vehicle.code, vehicle.plate ?? "", vehicle.vin ?? "", vehicle.description, vehicle.make ?? "", vehicle.model ?? ""]
      .some((value) => value.toLocaleLowerCase("pt-BR").includes(term));
  });

  return <section className="vehicle-manager panel">
    <div className="vehicle-toolbar">
      <div><h2>Cadastro de ativos</h2><p>Registros persistidos no banco da organização selecionada.</p></div>
      <div className="vehicle-toolbar-actions"><button className="secondary-button" onClick={() => void loadVehicles()} disabled={loading}><RefreshCw size={14} /> Atualizar</button><button className="primary-button" onClick={() => { setForm(emptyForm); setEditingId(null); setShowForm((value) => !value); setError(""); setNotice(""); }}><Plus size={15} /> Novo ativo</button></div>
    </div>
    {error && <div className="vehicle-message vehicle-error" role="alert">{error}<button aria-label="Fechar aviso" onClick={() => setError("")}><X size={14} /></button></div>}
    {notice && <div className="vehicle-message vehicle-success" role="status">{notice}<button aria-label="Fechar aviso" onClick={() => setNotice("")}><X size={14} /></button></div>}
    {showForm && <form className="vehicle-form" onSubmit={saveVehicle}>
      <div className="vehicle-form-heading"><div><strong>{editingId ? "Editar veículo ou equipamento" : "Novo veículo ou equipamento"}</strong><p>Informe um código interno ou deixe em branco para gerar um código único automaticamente.</p></div><button type="button" className="icon-button" onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm); }} aria-label="Fechar formulário"><X size={17} /></button></div>
      <div className="vehicle-fields">
        <label>Código interno<input maxLength={40} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder={form.kind === "equipment" ? "Opcional · ex.: EQP-0001" : "Opcional · ex.: VEI-0001"} /></label>
        <label>Descrição *<input required maxLength={160} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ex.: Caminhão trator" /></label>
        <label>Placa<input maxLength={12} value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} placeholder="ABC1D23" /></label>
        <label>Chassi / VIN<input maxLength={40} value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} placeholder="Identificação do fabricante" /></label>
        <label>Tipo<select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as VehicleKind, meter_kind: e.target.value === "equipment" ? "hourmeter" : "odometer", tire_layout_template_id: "" })}><option value="vehicle">Veículo</option><option value="equipment">Equipamento</option></select></label>
        <label>Esquema de montagem dos pneus<select value={form.tire_layout_template_id} onChange={(e) => setForm({ ...form, tire_layout_template_id: e.target.value })}><option value="">Sem esquema definido</option>{layoutTemplates.filter(t => t.asset_kind === form.kind).map(t => <option key={t.id} value={t.id}>{t.name} · {t.tire_count} posições</option>)}</select><small style={{ color: "#64748b", fontWeight: 400 }}>O esquema cria as posições de pneus depois de salvar, sem apagar posições ou histórico existentes.</small></label>
        <label>Medidor<select value={form.meter_kind} onChange={(e) => setForm({ ...form, meter_kind: e.target.value as MeterKind })}><option value="odometer">Hodômetro (km)</option><option value="hourmeter">Horímetro (h)</option></select></label>
        <label>Combustível<select value={form.fuel_type} onChange={(e) => setForm({ ...form, fuel_type: e.target.value as FuelType })}><option value="diesel">Diesel</option><option value="gasoline">Gasolina</option><option value="ethanol">Etanol</option><option value="gnv">GNV</option><option value="electric">Elétrico</option><option value="other">Outro</option></select></label>
        <label>Marca<input maxLength={80} value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} /></label>
        <label>Modelo<input maxLength={80} value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></label>
        <label>Ano modelo<input type="number" min="1900" max="2200" value={form.model_year} onChange={(e) => setForm({ ...form, model_year: e.target.value })} /></label>
      </div>
      <div className="vehicle-form-actions"><button type="button" className="secondary-button" onClick={() => { setShowForm(false); setEditingId(null); setForm(emptyForm); }}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}>{saving ? "Salvando..." : editingId ? "Salvar alterações" : "Salvar cadastro"}</button></div>
    </form>}
    <div className="vehicle-list-toolbar"><label className="vehicle-search"><Search size={15} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por código, placa, descrição ou modelo" /></label><span>{filtered.length} {filtered.length === 1 ? "registro" : "registros"}</span></div>
    {loading ? <div className="vehicle-empty"><RefreshCw size={22} /><strong>Carregando cadastros...</strong></div> : filtered.length === 0 ? <div className="vehicle-empty"><div className="vehicle-empty-icon"><Truck size={24} /></div><strong>{search ? "Nenhum resultado para essa busca" : "Nenhum ativo cadastrado"}</strong><p>{search ? "Tente pesquisar com outro código ou placa." : "Cadastre o primeiro veículo ou equipamento para começar a construir o histórico operacional."}</p>{!search && <button className="primary-button" onClick={() => setShowForm(true)}><Plus size={15} /> Cadastrar primeiro ativo</button>}</div> : <div className="vehicle-table-wrap"><table className="vehicle-table"><thead><tr><th>Ativo</th><th>Tipo</th><th>Medidor</th><th>Combustível</th><th>Status</th><th>Ações</th></tr></thead><tbody>{filtered.map((vehicle) => <tr key={vehicle.id}><td><div className="vehicle-name"><span className="vehicle-row-icon"><Truck size={16} /></span><span><strong>{vehicle.description}</strong><small>{vehicle.code}{vehicle.plate ? " · "+vehicle.plate : ""}</small></span></div></td><td>{vehicle.kind === "equipment" ? "Equipamento" : "Veículo"}</td><td>{vehicle.meter_kind === "hourmeter" ? "Horímetro (h)" : "Hodômetro (km)"}</td><td>{({ diesel:"Diesel", gasoline:"Gasolina", ethanol:"Etanol", gnv:"GNV", electric:"Elétrico", other:"Outro" } as Record<FuelType,string>)[vehicle.fuel_type]}</td><td><span className={`vehicle-status ${vehicle.status}`}>{vehicle.status === "active" ? "Ativo" : vehicle.status === "inactive" ? "Inativo" : "Cancelado"}</span></td><td><div className="vehicle-row-actions"><button type="button" className="icon-button" aria-label={`Editar ${vehicle.description}`} title="Editar cadastro" onClick={() => { setForm({ code: vehicle.code, description: vehicle.description, plate: vehicle.plate ?? "", vin: vehicle.vin ?? "", kind: vehicle.kind, meter_kind: vehicle.meter_kind, fuel_type: vehicle.fuel_type, make: vehicle.make ?? "", model: vehicle.model ?? "", model_year: vehicle.model_year == null ? "" : String(vehicle.model_year), tire_layout_template_id: vehicle.tire_layout_template_id ?? "" }); setEditingId(vehicle.id); setShowForm(true); setError(""); setNotice(""); }}><Pencil size={15} /></button>{vehicle.status !== "cancelled" && <button type="button" className="icon-button" aria-label={vehicle.status === "active" ? `Inativar ${vehicle.description}` : `Reativar ${vehicle.description}`} title={vehicle.status === "active" ? "Inativar sem apagar histórico" : "Reativar cadastro"} onClick={async () => { if (!supabase) return; setError(""); setNotice(""); const nextStatus = vehicle.status === "active" ? "inactive" : "active"; const { data: updatedVehicle, error: statusError } = await supabase.from("vehicles").update({ status: nextStatus }).eq("id", vehicle.id).eq("organization_id", organizationId).select("id").maybeSingle(); if (statusError) { setError("Não foi possível alterar o status deste ativo."); } else if (!updatedVehicle) { setError("A alteração de status não foi confirmada. Atualize a lista e tente novamente."); } else { setNotice(nextStatus === "inactive" ? "Ativo inativado; o histórico foi preservado." : "Ativo reativado."); await loadVehicles(); } }}><Power size={15} /></button>}</div></td></tr>)}</tbody></table></div>}
  </section>;
}

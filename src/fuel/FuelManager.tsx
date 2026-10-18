import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { AlertCircle, CheckCircle2, FileText, Fuel, Pencil, Plus, RefreshCw, Search, X } from "lucide-react";
import { FuelAuthorizationsManager } from "./FuelAuthorizationsManager";
import { authorizationWorkflowStatus, isAuthorizationPendingSettlement } from "./fuelAuthorizationUtils";
import { supabase } from "../lib/supabase";

type Vehicle = { id: string; code: string; plate: string | null; description: string; meter_kind: string; fuel_type: string; status: string };
type Driver = { id: string; name: string; status: string };
type Supplier = { id: string; name: string; status: string };
type AuthorizationRow = { id: string; authorization_code: string; vehicle_id: string; driver_id: string | null; supplier_id: string | null; valid_from: string; valid_until: string; status: string; consumed_liters: number | string; consumed_amount_cents: number | string };
type EventRow = { id: string; vehicle_id: string; driver_id: string | null; supplier_id: string | null; authorization_id: string | null; occurred_at: string; meter_value: number; liters: number; unit_price_cents: number; total_cents: number | null; fueling_kind: "full" | "partial"; document_number: string | null; notes: string | null; status: string };
type FormValues = { vehicle_id: string; driver_id: string; supplier_id: string; authorization_id: string; occurred_at: string; meter_value: string; liters: string; unit_price: string; fueling_kind: "full" | "partial"; document_number: string; notes: string };
const localDateTimePart = (value = new Date()) => new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0,16);
const blank = (): FormValues => ({ vehicle_id: "", driver_id: "", supplier_id: "", authorization_id: "", occurred_at: localDateTimePart(), meter_value: "", liters: "", unit_price: "", fueling_kind: "full", document_number: "", notes: "" });
const brl = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const num = (v: unknown) => Number(v ?? 0);
const dateLabel = (v: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(v));
const labels: Record<string,string> = { diesel:"Diesel", gasoline:"Gasolina", ethanol:"Etanol", gnv:"GNV", electric:"Elétrico", other:"Outro" };

export function FuelManager({ organizationId }: { organizationId: string }) {
  const [vehicles,setVehicles] = useState<Vehicle[]>([]);
  const [drivers,setDrivers] = useState<Driver[]>([]);
  const [suppliers,setSuppliers] = useState<Supplier[]>([]);
  const [authorizations,setAuthorizations] = useState<AuthorizationRow[]>([]);
  const [rows,setRows] = useState<EventRow[]>([]);
  const [form,setForm] = useState<FormValues>(blank());
  const [editing,setEditing] = useState<string|null>(null);
  const [entryMode,setEntryMode] = useState<"settlement"|"manual">("settlement");
  const [showForm,setShowForm] = useState(false);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [search,setSearch] = useState("");
  const [days,setDays] = useState("30");
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [activeView,setActiveView] = useState<"fuelings"|"authorizations">("fuelings");

  const load = useCallback(async () => {
    if (!supabase) { setError("Banco de dados não configurado."); setLoading(false); return; }
    setLoading(true);
    const [v,d,s,f] = await Promise.all([
      supabase.from("vehicles").select("id,code,plate,description,meter_kind,fuel_type,status").eq("organization_id",organizationId).neq("status","cancelled").order("description"),
      supabase.from("drivers").select("id,name,status").eq("organization_id",organizationId).neq("status","cancelled").order("name"),
      supabase.from("suppliers").select("id,name,status").eq("organization_id",organizationId).neq("status","cancelled").order("name"),
      supabase.from("fuel_events").select("id,vehicle_id,driver_id,supplier_id,authorization_id,occurred_at,meter_value,liters,unit_price_cents,total_cents,fueling_kind,document_number,notes,status").eq("organization_id",organizationId).neq("status","cancelled").order("occurred_at",{ascending:false}).limit(500)
    ]);
    if (v.error || d.error || s.error || f.error) {
      setError("Falha ao carregar os dados. Verifique conexão e permissões da organização.");
      setLoading(false);
      return;
    }

    const authorizationRows: AuthorizationRow[] = [];
    for (let offset = 0; ; offset += 500) {
      const page = await supabase.from("fuel_authorizations")
        .select("id,authorization_code,vehicle_id,driver_id,supplier_id,valid_from,valid_until,status,consumed_liters,consumed_amount_cents")
        .eq("organization_id",organizationId)
        .order("created_at",{ascending:false})
        .range(offset,offset+499);
      if (page.error) {
        setError("Não foi possível carregar as autorizações pendentes de baixa.");
        setLoading(false);
        return;
      }
      const batch = (page.data ?? []) as AuthorizationRow[];
      authorizationRows.push(...batch);
      if (batch.length < 500) break;
    }

    setVehicles((v.data ?? []) as Vehicle[]);
    setDrivers((d.data ?? []) as Driver[]);
    setSuppliers((s.data ?? []) as Supplier[]);
    setRows((f.data ?? []) as EventRow[]);
    setAuthorizations(authorizationRows);
    setError("");
    setLoading(false);
  },[organizationId]);
  useEffect(()=>{ void load(); },[load]);

  const vehicleMap = useMemo(()=>new Map(vehicles.map(v=>[v.id,v])),[vehicles]);
  const driverMap = useMemo(()=>new Map(drivers.map(v=>[v.id,v.name])),[drivers]);
  const supplierMap = useMemo(()=>new Map(suppliers.map(v=>[v.id,v.name])),[suppliers]);
  const authorizationMap = useMemo(()=>new Map(authorizations.map(a=>[a.id,a])),[authorizations]);
  const selectedAuthorization = form.authorization_id ? authorizationMap.get(form.authorization_id) : undefined;
  const openAuthorizations = useMemo(
    () => authorizations.filter(a => isAuthorizationPendingSettlement(a.status, a.consumed_liters, a.valid_from)),
    [authorizations]
  );
  const authorizationOptions = useMemo(
    () => authorizations.filter(a =>
      isAuthorizationPendingSettlement(a.status, a.consumed_liters, a.valid_from) ||
      (Boolean(editing) && a.id === form.authorization_id)
    ),
    [authorizations, editing, form.authorization_id]
  );
  const visible = useMemo(()=>{
    const cutoff = days === "all" ? 0 : Date.now() - Number(days)*86400000;
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return rows.filter(r=>{
      if(new Date(r.occurred_at).getTime()<cutoff) return false;
      if(!term) return true;
      const v=vehicleMap.get(r.vehicle_id);
      return [v?.description,v?.plate,v?.code,driverMap.get(r.driver_id??""),supplierMap.get(r.supplier_id??""),r.document_number,authorizationMap.get(r.authorization_id??"")?.authorization_code].some(x=>x?.toLocaleLowerCase("pt-BR").includes(term));
    });
  },[rows,days,search,vehicleMap,driverMap,supplierMap,authorizationMap]);
  const liters = visible.reduce((a,r)=>a+num(r.liters),0);
  const cents = visible.reduce((a,r)=>a+num(r.total_cents ?? Math.round(num(r.liters)*num(r.unit_price_cents))),0);
  const set = (key:keyof FormValues,value:string)=>setForm(old=>({...old,[key]:value}));
  const startSettlement = ()=>{
    setForm(blank());
    setEditing(null);
    setEntryMode("settlement");
    setShowForm(true);
    setError("");
    setNotice("");
  };
  const createManual = ()=>{
    setForm({...blank(),vehicle_id:vehicles.find(v=>v.status==="active")?.id??""});
    setEditing(null);
    setEntryMode("manual");
    setShowForm(true);
    setError("");
    setNotice("");
  };
  const chooseAuthorization = (id:string) => {
    if(!id){
      setForm(old=>({...old,authorization_id:"",vehicle_id:"",driver_id:"",supplier_id:""}));
      return;
    }
    const authorization = authorizationMap.get(id);
    if(!authorization){setError("Autorização não encontrada nesta organização.");return;}
    setForm(old=>({...old,authorization_id:id,vehicle_id:authorization.vehicle_id,driver_id:authorization.driver_id??"",supplier_id:authorization.supplier_id??""}));
    setError("");
  };
  const edit = (r:EventRow)=>{
    setForm({vehicle_id:r.vehicle_id,driver_id:r.driver_id??"",supplier_id:r.supplier_id??"",authorization_id:r.authorization_id??"",occurred_at:localDateTimePart(new Date(r.occurred_at)),meter_value:String(r.meter_value),liters:String(r.liters),unit_price:(r.unit_price_cents/100).toFixed(2),fueling_kind:r.fueling_kind,document_number:r.document_number??"",notes:r.notes??""});
    setEditing(r.id);
    setEntryMode(r.authorization_id ? "settlement" : "manual");
    setShowForm(true);
    setError("");
    setNotice("");
  };

  const submit = async (ev:FormEvent) => {
    ev.preventDefault(); if(!supabase)return;
    const v=vehicleMap.get(form.vehicle_id), l=Number(form.liters), p=Number(form.unit_price), m=Number(form.meter_value), date=new Date(form.occurred_at);
    if(!v||v.status!=="active"){setError("Selecione um veículo ou equipamento ativo.");return;}
    if(!Number.isFinite(l)||l<=0||l>10000){setError("Informe litros válidos, acima de zero e até 10.000.");return;}
    if(!Number.isFinite(p)||p<=0||p>1000){setError("Informe um preço por litro válido.");return;}
    if(!Number.isFinite(m)||m<0){setError("Informe uma leitura válida de odômetro/horímetro.");return;}
    if(Number.isNaN(date.getTime())||date.getTime()>Date.now()+300000){setError("Data inválida ou futura.");return;}
    if(form.driver_id&&!driverMap.has(form.driver_id)){setError("Motorista inválido para esta organização.");return;}
    if(form.supplier_id&&!supplierMap.has(form.supplier_id)){setError("Fornecedor inválido para esta organização.");return;}
    const authorization = form.authorization_id ? authorizationMap.get(form.authorization_id) : undefined;
    if(entryMode==="settlement"&&!form.authorization_id){setError("Selecione uma autorização em aberto para dar baixa.");return;}
    if(form.authorization_id&&!authorization){setError("Autorização inválida para esta organização.");return;}
    if(authorization){
      if(authorization.vehicle_id!==v.id){setError("O veículo do abastecimento não corresponde ao veículo da autorização.");return;}
      const at=date.getTime();
      if(at<new Date(authorization.valid_from).getTime()||at>new Date(authorization.valid_until).getTime()){setError("A data do abastecimento está fora do período de validade da autorização selecionada.");return;}
      if(authorization.driver_id&&authorization.driver_id!==form.driver_id){setError("O motorista não corresponde ao autorizado.");return;}
      if(authorization.supplier_id&&authorization.supplier_id!==form.supplier_id){setError("O posto/fornecedor não corresponde ao autorizado.");return;}
      const existingEvent = editing ? rows.find(r=>r.id===editing) : undefined;
      const isReusingSameAuthorization = existingEvent?.authorization_id === authorization.id;
      if(entryMode==="settlement"&&!isReusingSameAuthorization&&!isAuthorizationPendingSettlement(authorization.status,authorization.consumed_liters,authorization.valid_from)){
        setError("Esta autorização já recebeu baixa ou não está ativa. Atualize a lista e selecione outra autorização em aberto.");
        return;
      }
    }
    const {data:previous,error:readError}=await supabase.from("fuel_events").select("id,meter_value,occurred_at").eq("organization_id",organizationId).eq("vehicle_id",v.id).neq("status","cancelled").lte("occurred_at",date.toISOString()).order("occurred_at",{ascending:false}).limit(10);
    if(readError){setError("Não foi possível validar a leitura anterior.");return;}
    const last=(previous??[]).find(r=>r.id!==editing);
    if(last&&m<num(last.meter_value)){setError("A leitura não pode ser menor que a última leitura cronológica registrada para este ativo.");return;}
    setSaving(true);setError("");setNotice("");
    const unit=Math.round(p*100);
    const payload={organization_id:organizationId,vehicle_id:v.id,driver_id:form.driver_id||null,supplier_id:form.supplier_id||null,authorization_id:form.authorization_id||null,occurred_at:date.toISOString(),meter_value:m,liters:l,unit_price_cents:unit,fueling_kind:form.fueling_kind,document_number:form.document_number.trim()||null,notes:form.notes.trim()||null};
    const result=editing
      ? await supabase.from("fuel_events").update(payload).eq("id",editing).eq("organization_id",organizationId).select("id").maybeSingle()
      : await supabase.from("fuel_events").insert({...payload,created_by:(await supabase.auth.getUser()).data.user?.id??null}).select("id").maybeSingle();
    if(result.error){
      setError(result.error.code==="23505" && form.authorization_id
        ? "Esta autorização já recebeu baixa em outro lançamento. Atualize a lista e confira o histórico."
        : "Não foi possível salvar o abastecimento. Confira os campos e suas permissões.");
    } else if(!result.data)setError("O banco não confirmou a gravação. Atualize a lista e tente novamente.");
    else {
      setNotice(editing
        ? "Abastecimento atualizado."
        : entryMode==="settlement" ? "Baixa da autorização registrada e abastecimento lançado com sucesso." : "Abastecimento avulso registrado.");
      setShowForm(false);
      setEditing(null);
      await load();
    }
    setSaving(false);
  };
  const cancel = async (r:EventRow) => {
    if(!supabase||!window.confirm("Cancelar este registro? Ele será preservado no histórico e sairá dos indicadores."))return;
    const {data,error:e}=await supabase.from("fuel_events").update({status:"cancelled"}).eq("id",r.id).eq("organization_id",organizationId).select("id").maybeSingle();
    if(e)setError("Não foi possível cancelar. Verifique se seu perfil possui permissão.");
    else if(!data)setError("Cancelamento não confirmado pelo banco.");
    else {setNotice("Registro cancelado; histórico preservado.");await load();}
  };

  const field: CSSProperties={display:"flex",flexDirection:"column",gap:6,fontSize:12,color:"#475569"};
  const input: React.CSSProperties={border:"1px solid #dbe2ec",borderRadius:7,padding:"10px",background:"#fff",color:"#172338",minWidth:0,width:"100%"};
  const button: React.CSSProperties={border:0,borderRadius:7,padding:"10px 13px",background:"#4169df",color:"#fff",fontWeight:600,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:7};
  const mutedButton: React.CSSProperties={...button,background:"#f1f5f9",color:"#334155",border:"1px solid #e2e8f0"};
  const panel: React.CSSProperties={background:"#fff",border:"1px solid #e8edf3",borderRadius:11,padding:18,marginBottom:16};
  if(activeView === "authorizations") return <FuelAuthorizationsManager organizationId={organizationId} onBackToFuelings={() => setActiveView("fuelings")} />;

  return <section aria-label="Controle de abastecimentos">
    <div style={{...panel,display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap"}}>
      <div><h2 style={{margin:"0 0 6px",fontSize:17}}>Controle de abastecimentos</h2><p style={{margin:0,color:"#7d899b",fontSize:12}}>Lançamentos, leituras e custos por veículo/equipamento.</p></div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button style={mutedButton} onClick={()=>setActiveView("authorizations")}><FileText size={15}/> Autorizações PDF</button>
        <button style={mutedButton} onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/> Atualizar</button>
        <button style={mutedButton} onClick={createManual} disabled={!vehicles.some(v=>v.status==="active")}><Plus size={15}/> Lançamento avulso / histórico</button>
        <button style={button} onClick={startSettlement} disabled={loading||openAuthorizations.length===0}><CheckCircle2 size={15}/> Dar baixa em autorização ({openAuthorizations.length})</button>
      </div>
    </div>
    {error&&<div role="alert" style={{...panel,color:"#b42318",display:"flex",gap:8,alignItems:"center"}}><AlertCircle size={17}/>{error}</div>}
    {notice&&<div role="status" style={{...panel,color:"#16794b",display:"flex",gap:8,alignItems:"center"}}><CheckCircle2 size={17}/>{notice}<button style={{...mutedButton,marginLeft:"auto"}} onClick={()=>setNotice("")}><X size={14}/></button></div>}
    {!loading&&openAuthorizations.length===0&&!showForm&&<div role="status" style={{...panel,background:"#f8fafc",color:"#475569",fontSize:13}}>
      Não há autorizações pendentes de baixa no momento. Emita uma autorização em <strong>Autorizações PDF</strong> ou use <strong>Lançamento avulso / histórico</strong> somente para exceções ou registros antigos.
    </div>}
    {showForm&&<form onSubmit={submit} style={panel}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><strong>{editing?(entryMode==="settlement"?"Editar baixa de abastecimento":"Editar abastecimento"):entryMode==="settlement"?"Dar baixa em autorização":"Lançamento avulso / histórico"}</strong><button type="button" style={mutedButton} onClick={()=>setShowForm(false)}><X size={14}/> Fechar</button></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:13}}>
        {entryMode==="settlement"&&<label style={field}>Autorização em aberto *<select required style={input} value={form.authorization_id} onChange={e=>chooseAuthorization(e.target.value)}><option value="" disabled>Selecione a autorização a dar baixa</option>{authorizationOptions.map(a=>{const v=vehicleMap.get(a.vehicle_id);const state=authorizationWorkflowStatus(a.status,a.valid_from,a.valid_until,a.consumed_liters).label;return <option key={a.id} value={a.id}>{a.authorization_code} · {v?.plate??v?.description??"Ativo"} · {state}</option>;})}</select><small style={{color:"#64748b"}}>Escolha a autorização devolvida pelo motorista. O ativo e os dados fixos serão preenchidos automaticamente.</small></label>}
        <label style={field}>Veículo/equipamento *<select required style={input} value={form.vehicle_id} disabled={entryMode==="settlement"||Boolean(selectedAuthorization)} onChange={e=>set("vehicle_id",e.target.value)}><option value="">{entryMode==="settlement"?"Preenchido pela autorização":"Selecione"}</option>{vehicles.filter(v=>v.status==="active"||v.id===form.vehicle_id).map(v=><option key={v.id} value={v.id}>{v.code} · {v.plate? v.plate+" · ":""}{v.description}</option>)}</select></label>
        <label style={field}>Data e hora *<input required type="datetime-local" max={localDateTimePart()} style={input} value={form.occurred_at} onChange={e=>set("occurred_at",e.target.value)}/></label>
        <label style={field}>{vehicleMap.get(form.vehicle_id)?.meter_kind==="hourmeter"?"Horímetro (h) *":"Odômetro (km) *"}<input required type="number" min="0" step="0.1" style={input} value={form.meter_value} onChange={e=>set("meter_value",e.target.value)}/></label>
        <label style={field}>Combustível<input readOnly style={{...input,background:"#f8fafc"}} value={labels[vehicleMap.get(form.vehicle_id)?.fuel_type??""]??"Conforme cadastro do ativo"}/></label>
        <label style={field}>Litros *<input required type="number" min="0.01" max="10000" step="0.01" style={input} value={form.liters} onChange={e=>set("liters",e.target.value)}/></label>
        <label style={field}>Preço por litro (R$) *<input required type="number" min="0.01" max="1000" step="0.01" style={input} value={form.unit_price} onChange={e=>set("unit_price",e.target.value)}/></label>
        <label style={field}>Tipo *<select style={input} value={form.fueling_kind} onChange={e=>set("fueling_kind",e.target.value)}><option value="full">Tanque cheio</option><option value="partial">Parcial</option></select></label>
        <label style={field}>Motorista<select style={input} value={form.driver_id} disabled={Boolean(selectedAuthorization?.driver_id)} onChange={e=>set("driver_id",e.target.value)}><option value="">Não informado</option>{drivers.filter(d=>d.status==="active"||d.id===form.driver_id).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <label style={field}>Posto/fornecedor<select style={input} value={form.supplier_id} disabled={Boolean(selectedAuthorization?.supplier_id)} onChange={e=>set("supplier_id",e.target.value)}><option value="">Não informado</option>{suppliers.filter(s=>s.status==="active"||s.id===form.supplier_id).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label style={field}>Nota fiscal/cupom<input maxLength={100} style={input} value={form.document_number} onChange={e=>set("document_number",e.target.value)} /></label>
        <label style={{...field,gridColumn:"1 / -1"}}>Observações<textarea maxLength={1000} rows={2} style={input} value={form.notes} onChange={e=>set("notes",e.target.value)}/></label>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:16,padding:12,background:"#f8fafc",borderRadius:8}}><span style={{fontSize:12,color:"#64748b"}}>Total calculado automaticamente</span><strong style={{fontSize:20}}>{brl(Math.round(Math.max(0,Number(form.liters)||0)*Math.max(0,Number(form.unit_price)||0)*100))}</strong></div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:14}}><button type="button" style={mutedButton} onClick={()=>setShowForm(false)}>Cancelar</button><button type="submit" style={button} disabled={saving}>{saving?"Salvando…":editing?"Salvar alterações":entryMode==="settlement"?"Dar baixa e registrar abastecimento":"Registrar abastecimento avulso"}</button></div>
    </form>}
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:12,marginBottom:16}}>
      {[["Gasto no período",brl(cents),visible.length+" registro(s)"],["Volume abastecido",liters.toLocaleString("pt-BR",{maximumFractionDigits:2})+" L","Litros válidos"],["Preço médio",liters?brl(Math.round(cents/liters)):"R$ 0,00","Custo total ÷ litros"],["Abastecimentos",String(visible.length),visible.filter(r=>r.fueling_kind==="full").length+" tanque(s) cheio(s)"]].map(([title,value,note])=><article key={title} style={{...panel,margin:0}}><div style={{fontSize:12,color:"#64748b"}}>{title}</div><strong style={{display:"block",fontSize:23,margin:"12px 0 7px"}}>{value}</strong><small style={{color:"#94a3b8"}}>{note}</small></article>)}
    </div>
    <div style={{...panel,display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
      <label style={{...field,flex:"1 1 260px",position:"relative"}}><span style={{display:"flex",gap:7,alignItems:"center"}}><Search size={15}/> Buscar registros</span><input style={input} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Veículo, placa, motorista, posto, documento"/></label>
      <label style={field}>Período<select style={input} value={days} onChange={e=>setDays(e.target.value)}><option value="7">7 dias</option><option value="30">30 dias</option><option value="90">90 dias</option><option value="365">12 meses</option><option value="all">Todo o histórico carregado</option></select></label>
    </div>
    {loading?<div style={panel}>Carregando abastecimentos…</div>:visible.length===0?<div style={{...panel,textAlign:"center",padding:36}}><Fuel size={25}/><h3>{rows.length?"Nenhum resultado encontrado":"Nenhum abastecimento registrado"}</h3><p style={{color:"#7d899b",fontSize:12}}>{rows.length?"Ajuste o período ou a busca.":"Registre um abastecimento para começar a gerar indicadores reais."}</p></div>:<div style={{...panel,overflowX:"auto",padding:0}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:12,minWidth:850}}><thead><tr>{["Data","Veículo","Leitura","Litros","Preço/L","Total","Motorista / posto","Tipo","Ações"].map(t=><th key={t} style={{padding:12,textAlign:"left",background:"#f8fafc",color:"#64748b",whiteSpace:"nowrap"}}>{t}</th>)}</tr></thead><tbody>{visible.map(r=>{const v=vehicleMap.get(r.vehicle_id);return <tr key={r.id} style={{borderTop:"1px solid #edf0f5"}}><td style={{padding:12,whiteSpace:"nowrap"}}>{dateLabel(r.occurred_at)}<small style={{display:"block",color:"#94a3b8"}}>{r.document_number||"Sem documento"}</small>{r.authorization_id&&authorizationMap.get(r.authorization_id)&&<small style={{display:"block",color:"#1d4ed8"}}>{authorizationMap.get(r.authorization_id)?.authorization_code}</small>}</td><td style={{padding:12}}><strong>{v?.description??"Ativo não encontrado"}</strong><small style={{display:"block",color:"#94a3b8"}}>{v?.plate??v?.code??"—"}</small></td><td style={{padding:12}}>{num(r.meter_value).toLocaleString("pt-BR")}<small style={{display:"block",color:"#94a3b8"}}>{v?.meter_kind==="hourmeter"?"h":"km"}</small></td><td style={{padding:12}}>{num(r.liters).toLocaleString("pt-BR",{maximumFractionDigits:2})} L</td><td style={{padding:12}}>{brl(num(r.unit_price_cents))}</td><td style={{padding:12}}><strong>{brl(num(r.total_cents??Math.round(num(r.liters)*num(r.unit_price_cents))))}</strong></td><td style={{padding:12}}>{driverMap.get(r.driver_id??"")??"—"}<small style={{display:"block",color:"#94a3b8"}}>{supplierMap.get(r.supplier_id??"")??"Posto não informado"}</small></td><td style={{padding:12}}>{r.fueling_kind==="full"?"Tanque cheio":"Parcial"}</td><td style={{padding:12,whiteSpace:"nowrap"}}><button style={mutedButton} aria-label="Editar abastecimento" onClick={()=>edit(r)}><Pencil size={14}/></button> <button style={{...mutedButton,color:"#b42318"}} aria-label="Cancelar abastecimento" onClick={()=>void cancel(r)}><X size={14}/></button></td></tr>})}</tbody></table></div>}
    <p style={{fontSize:11,color:"#94a3b8",marginTop:12}}>Até 500 lançamentos mais recentes são carregados por vez. Registros cancelados permanecem no banco e não entram nos indicadores.</p>
  </section>;
}

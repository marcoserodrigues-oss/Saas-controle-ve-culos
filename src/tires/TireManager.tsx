import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { CircleDot, Plus, Pencil, RefreshCw, Search, X, CheckCircle2, AlertCircle, RotateCw, History, Settings2 } from "lucide-react";
import { supabase } from "../lib/supabase";

type TireStatus = "in_stock" | "mounted" | "retread" | "repair" | "scrapped" | "sold";
type EventType = "purchase" | "mount" | "dismount" | "rotation" | "transfer" | "retread_sent" | "retread_returned" | "repair" | "inspection" | "scrap" | "adjustment";
type Tire = { id: string; serial_number: string; brand: string | null; model: string | null; size: string; purchase_date: string | null; purchase_cost_cents: number; status: TireStatus; created_at: string };
type Vehicle = { id: string; code: string; plate: string | null; description: string; kind: string; meter_kind: string; status: string };
type Position = { id: string; vehicle_id: string; position_code: string; position_label: string; is_active: boolean };
type Supplier = { id: string; name: string; supplier_type: string; status: string };
type TireEvent = { id: string; tire_id: string; vehicle_id: string | null; position_id: string | null; event_type: EventType; occurred_at: string; meter_value: number | null; cost_cents: number; supplier_id: string | null; related_tire_event_id: string | null; notes: string | null; reason: string | null };
type TireForm = { serial_number: string; brand: string; model: string; size: string; purchase_date: string; purchase_cost: string };
type EventForm = { tire_id: string; event_type: EventType; occurred_at: string; vehicle_id: string; position_id: string; meter_value: string; cost: string; supplier_id: string; reason: string; notes: string; target_status: TireStatus };
type PositionForm = { vehicle_id: string; position_code: string; position_label: string };

const emptyTire = (): TireForm => ({ serial_number: "", brand: "", model: "", size: "", purchase_date: new Date().toISOString().slice(0,10), purchase_cost: "" });
const emptyEvent = (): EventForm => ({ tire_id: "", event_type: "mount", occurred_at: new Date().toISOString().slice(0,16), vehicle_id: "", position_id: "", meter_value: "", cost: "", supplier_id: "", reason: "", notes: "", target_status: "in_stock" });
const statusLabels: Record<TireStatus,string> = { in_stock: "Em estoque", mounted: "Montado", retread: "Em recapagem", repair: "Em reparo", scrapped: "Descartado", sold: "Vendido" };
const eventLabels: Record<EventType,string> = { purchase: "Compra / cadastro", mount: "Montagem", dismount: "Desmontagem", rotation: "Rodízio", transfer: "Transferência", retread_sent: "Enviado para recapagem", retread_returned: "Retorno da recapagem", repair: "Reparo", inspection: "Inspeção", scrap: "Descarte", adjustment: "Ajuste de status" };
const eventTypes: EventType[] = ["mount","dismount","rotation","transfer","retread_sent","retread_returned","repair","inspection","scrap","adjustment"];
const brl = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format((Number(cents) || 0) / 100);
const dateLabel = (value: string | null) => value ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(new Date(value.includes("T") ? value : value + "T12:00:00")) : "—";
const datetimeLabel = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const toCents = (value: string) => Math.round((Number(value.replace(",", ".")) || 0) * 100);
const placementEvent = (type: EventType) => ["mount","rotation","transfer"].includes(type);

export function TireManager({ organizationId }: { organizationId: string }) {
  const [tires, setTires] = useState<Tire[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [events, setEvents] = useState<TireEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState<"inventory" | "history" | "positions" | "life">("inventory");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showTireForm, setShowTireForm] = useState(false);
  const [editingTireId, setEditingTireId] = useState<string | null>(null);
  const [tireForm, setTireForm] = useState<TireForm>(emptyTire());
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventForm, setEventForm] = useState<EventForm>(emptyEvent());
  const [showPositionForm, setShowPositionForm] = useState(false);
  const [positionForm, setPositionForm] = useState<PositionForm>({ vehicle_id: "", position_code: "", position_label: "" });

  const load = useCallback(async () => {
    if (!supabase) { setError("Banco de dados não configurado."); setLoading(false); return; }
    setLoading(true);
    const [t,v,p,s,e] = await Promise.all([
      supabase.from("tires").select("id,serial_number,brand,model,size,purchase_date,purchase_cost_cents,status,created_at").eq("organization_id",organizationId).order("created_at",{ascending:false}),
      supabase.from("vehicles").select("id,code,plate,description,kind,meter_kind,status").eq("organization_id",organizationId).eq("status","active").order("description"),
      supabase.from("vehicle_tire_positions").select("id,vehicle_id,position_code,position_label,is_active").eq("organization_id",organizationId).order("position_code"),
      supabase.from("suppliers").select("id,name,supplier_type,status").eq("organization_id",organizationId).neq("status","cancelled").order("name"),
      supabase.from("tire_events").select("id,tire_id,vehicle_id,position_id,event_type,occurred_at,meter_value,cost_cents,supplier_id,related_tire_event_id,notes,reason").eq("organization_id",organizationId).order("occurred_at",{ascending:false}).limit(2000)
    ]);
    const fail = t.error || v.error || p.error || s.error || e.error;
    if (fail) setError("Não foi possível carregar pneus e histórico. Confira a conexão e as permissões da organização.");
    else {
      setTires((t.data ?? []) as Tire[]);
      setVehicles((v.data ?? []) as Vehicle[]);
      setPositions((p.data ?? []) as Position[]);
      setSuppliers((s.data ?? []) as Supplier[]);
      setEvents((e.data ?? []) as TireEvent[]);
      setError("");
    }
    setLoading(false);
  }, [organizationId]);
  useEffect(() => { void load(); }, [load]);

  const tireMap = useMemo(() => new Map(tires.map(t => [t.id,t])), [tires]);
  const vehicleMap = useMemo(() => new Map(vehicles.map(v => [v.id,v])), [vehicles]);
  const supplierMap = useMemo(() => new Map(suppliers.map(s => [s.id,s.name])), [suppliers]);
  const positionMap = useMemo(() => new Map(positions.map(p => [p.id,p])), [positions]);
  const latestPlacement = useMemo(() => {
    const map = new Map<string,TireEvent>();
    for (const event of events) if (placementEvent(event.event_type) && !map.has(event.tire_id)) map.set(event.tire_id,event);
    return map;
  }, [events]);
  const activePositions = useMemo(() => positions.filter(p => p.is_active), [positions]);
  const mountedTiresAtPosition = useMemo(() => {
    const map = new Map<string,string>();
    for (const tire of tires) {
      if (tire.status !== "mounted") continue;
      const placement = latestPlacement.get(tire.id);
      if (placement?.position_id) map.set(placement.position_id,tire.id);
    }
    return map;
  }, [tires,latestPlacement]);
  const lifeReport = useMemo(() => {
    const rows = new Map<string,{km:number;cycles:number;completedDays:number;activeDays:number;lastMountAt:string|null;lastEndAt:string|null}>();
    const byTire = new Map<string,TireEvent[]>();
    const ordered = [...events].sort((a,b) => new Date(a.occurred_at).getTime()-new Date(b.occurred_at).getTime());
    for (const event of ordered) {
      if (!byTire.has(event.tire_id)) byTire.set(event.tire_id,[]);
      byTire.get(event.tire_id)!.push(event);
    }
    const now = Date.now();
    for (const tire of tires) {
      let cycleStart: string | null = null;
      let segmentVehicle: string | null = null;
      let segmentMeter: number | null = null;
      let km = 0;
      let cycles = 0;
      let completedDays = 0;
      let lastMountAt: string | null = null;
      let lastEndAt: string | null = null;
      for (const event of byTire.get(tire.id) ?? []) {
        if (event.event_type === "mount" || (event.event_type === "adjustment" && event.reason?.startsWith("Ajuste para Montado"))) {
          cycleStart = event.occurred_at;
          lastMountAt = event.occurred_at;
          segmentVehicle = event.vehicle_id;
          segmentMeter = event.meter_value == null ? null : Number(event.meter_value);
        } else if (event.event_type === "rotation" || event.event_type === "transfer") {
          if (cycleStart && segmentVehicle && segmentVehicle === event.vehicle_id && segmentMeter !== null && event.meter_value !== null && Number(event.meter_value) >= segmentMeter) {
            km += Number(event.meter_value) - segmentMeter;
          }
          if (cycleStart) {
            segmentVehicle = event.vehicle_id;
            segmentMeter = event.meter_value == null ? null : Number(event.meter_value);
          }
        } else if (["dismount","retread_sent","repair","scrap"].includes(event.event_type)) {
          if (cycleStart) {
            if (segmentVehicle && segmentVehicle === event.vehicle_id && segmentMeter !== null && event.meter_value !== null && Number(event.meter_value) >= segmentMeter) {
              km += Number(event.meter_value) - segmentMeter;
            }
            cycles += 1;
            completedDays += Math.max(0,Math.floor((new Date(event.occurred_at).getTime()-new Date(cycleStart).getTime())/86400000));
            lastEndAt = event.occurred_at;
            cycleStart = null;
            segmentVehicle = null;
            segmentMeter = null;
          }
        } else if (event.event_type === "adjustment" && event.reason?.startsWith("Ajuste para Em estoque")) {
          if (cycleStart) {
            if (segmentVehicle && segmentVehicle === event.vehicle_id && segmentMeter !== null && event.meter_value !== null && Number(event.meter_value) >= segmentMeter) km += Number(event.meter_value)-segmentMeter;
            cycles += 1;
            completedDays += Math.max(0,Math.floor((new Date(event.occurred_at).getTime()-new Date(cycleStart).getTime())/86400000));
            lastEndAt = event.occurred_at;
            cycleStart = null;
            segmentVehicle = null;
            segmentMeter = null;
          }
        }
      }
      const activeDays = tire.status === "mounted" && cycleStart ? Math.max(0,Math.floor((now-new Date(cycleStart).getTime())/86400000)) : 0;
      rows.set(tire.id,{km,cycles,completedDays,activeDays,lastMountAt,lastEndAt});
    }
    return rows;
  }, [events,tires]);
  const durationKm = useMemo(() => new Map([...lifeReport].map(([id,row]) => [id,row.km])), [lifeReport]);
  const filteredTires = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return tires.filter(t => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      const place = latestPlacement.get(t.id);
      const vehicle = place?.vehicle_id ? vehicleMap.get(place.vehicle_id) : null;
      return !term || [t.serial_number,t.brand ?? "",t.model ?? "",t.size,vehicle?.description ?? "",vehicle?.plate ?? ""].some(v => v.toLocaleLowerCase("pt-BR").includes(term));
    });
  }, [tires,search,statusFilter,latestPlacement,vehicleMap]);
  const filteredEvents = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return events.filter(e => {
      const t = tireMap.get(e.tire_id);
      const v = e.vehicle_id ? vehicleMap.get(e.vehicle_id) : null;
      return !term || [t?.serial_number ?? "",t?.size ?? "",v?.description ?? "",v?.plate ?? "",eventLabels[e.event_type],e.reason ?? "",e.notes ?? ""].some(x => x.toLocaleLowerCase("pt-BR").includes(term));
    });
  }, [events,search,tireMap,vehicleMap]);

  const startNewTire = () => { setEditingTireId(null); setTireForm(emptyTire()); setShowTireForm(true); setError(""); setNotice(""); };
  const startEditTire = (t: Tire) => {
    setEditingTireId(t.id);
    setTireForm({serial_number:t.serial_number,brand:t.brand ?? "",model:t.model ?? "",size:t.size,purchase_date:t.purchase_date ?? "",purchase_cost:(Number(t.purchase_cost_cents)/100).toFixed(2)});
    setShowTireForm(true); setError(""); setNotice("");
  };

  async function saveTire(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || saving) return;
    const serial = tireForm.serial_number.trim();
    const size = tireForm.size.trim();
    const price = toCents(tireForm.purchase_cost);
    if (serial.length < 2 || size.length < 2) { setError("Informe o número de série e a medida do pneu."); return; }
    if (price < 0 || !Number.isFinite(price)) { setError("O custo de aquisição não pode ser negativo."); return; }
    if (tires.some(t => t.id !== editingTireId && t.serial_number.trim().toLocaleLowerCase("pt-BR") === serial.toLocaleLowerCase("pt-BR"))) { setError("Já existe um pneu com este número de série."); return; }
    setSaving(true); setError(""); setNotice("");
    const payload = { organization_id:organizationId,serial_number:serial,brand:tireForm.brand.trim() || null,model:tireForm.model.trim() || null,size,purchase_date:tireForm.purchase_date || null,purchase_cost_cents:price };
    const result = editingTireId
      ? await supabase.from("tires").update(payload).eq("id",editingTireId).eq("organization_id",organizationId).select("id").maybeSingle()
      : await supabase.from("tires").insert({...payload,status:"in_stock"}).select("id").maybeSingle();
    if (result.error || !result.data) {
      setError(result.error?.code === "23505" ? "Número de série já cadastrado nesta organização." : "Não foi possível salvar o pneu. Confira os campos e permissões.");
    } else if (!editingTireId) {
      const boughtAt = tireForm.purchase_date ? new Date(tireForm.purchase_date + "T12:00:00").toISOString() : new Date().toISOString();
      const initialEvent = await supabase.from("tire_events").insert({organization_id:organizationId,tire_id:result.data.id,event_type:"purchase",occurred_at:boughtAt,cost_cents:price,reason:"Cadastro inicial do pneu",notes:"Evento gerado pelo cadastro do inventário."}).select("id").maybeSingle();
      setShowTireForm(false);
      if (initialEvent.error || !initialEvent.data) setError("Pneu cadastrado, mas o evento inicial de compra não foi registrado. O item permanece em estoque; confira as permissões antes de tentar novamente.");
      else setNotice("Pneu cadastrado no inventário e histórico.");
      await load();
    } else {
      setShowTireForm(false); setNotice("Dados do pneu atualizados."); await load();
    }
    setSaving(false);
  }

  function setEventType(type: EventType) {
    setEventForm(f => ({...f,event_type:type}));
  }
  function openEventForm(tireId = "") {
    const next = {...emptyEvent(),tire_id:tireId};
    const placement = tireId ? latestPlacement.get(tireId) : undefined;
    if (placement) { next.vehicle_id = placement.vehicle_id ?? ""; next.position_id = placement.position_id ?? ""; }
    setEventForm(next); setShowEventForm(true); setError(""); setNotice("");
  }

  async function saveEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || saving) return;
    const tire = tireMap.get(eventForm.tire_id);
    if (!tire) { setError("Selecione um pneu válido."); return; }
    const kind = eventForm.event_type;
    const oldStatus = tire.status;
    const vehiclePlacement = latestPlacement.get(tire.id);
    const isMounted = oldStatus === "mounted";
    let nextStatus: TireStatus = oldStatus;
    let vehicleId: string | null = null;
    let positionId: string | null = null;
    const meter = eventForm.meter_value.trim() === "" ? null : Number(eventForm.meter_value);
    const cost = toCents(eventForm.cost);
    if (!eventForm.occurred_at || new Date(eventForm.occurred_at).getTime() > Date.now()) { setError("Informe uma data/hora válida, sem lançamento futuro."); return; }
    if (meter !== null && (!Number.isFinite(meter) || meter < 0)) { setError("A leitura do hodômetro/horímetro deve ser zero ou maior."); return; }
    if (!Number.isFinite(cost) || cost < 0) { setError("O custo do evento não pode ser negativo."); return; }
    if (eventForm.supplier_id && !suppliers.some(s => s.id === eventForm.supplier_id)) { setError("O fornecedor selecionado não pertence à organização."); return; }

    if (kind === "mount") {
      if (oldStatus !== "in_stock") { setError("Só é possível montar um pneu que esteja em estoque. Use rodízio ou transferência para mudar uma montagem existente."); return; }
      if (!eventForm.vehicle_id || !eventForm.position_id) { setError("Selecione o veículo e a posição de montagem."); return; }
      nextStatus = "mounted"; vehicleId = eventForm.vehicle_id; positionId = eventForm.position_id;
    } else if (kind === "rotation" || kind === "transfer") {
      if (!isMounted) { setError("Rodízio e transferência exigem que o pneu esteja montado."); return; }
      if (!eventForm.vehicle_id || !eventForm.position_id) { setError("Selecione o veículo e a nova posição."); return; }
      nextStatus = "mounted"; vehicleId = eventForm.vehicle_id; positionId = eventForm.position_id;
    } else if (kind === "dismount") {
      if (!isMounted) { setError("Somente um pneu montado pode ser desmontado."); return; }
      nextStatus = "in_stock"; vehicleId = vehiclePlacement?.vehicle_id ?? null; positionId = vehiclePlacement?.position_id ?? null;
    } else if (kind === "retread_sent") {
      if (oldStatus !== "in_stock") { setError("Desmonte o pneu e deixe-o em estoque antes de enviá-lo para recapagem."); return; }
      nextStatus = "retread";
    } else if (kind === "retread_returned") {
      if (oldStatus !== "retread") { setError("O retorno só pode ser lançado para pneu em recapagem."); return; }
      nextStatus = "in_stock";
    } else if (kind === "repair") {
      if (oldStatus !== "in_stock") { setError("Desmonte o pneu e deixe-o em estoque antes de registrar o envio para reparo."); return; }
      nextStatus = "repair";
    } else if (kind === "scrap") {
      if (oldStatus !== "in_stock") { setError("Desmonte o pneu e deixe-o em estoque antes do descarte."); return; }
      if (!window.confirm("Confirmar o descarte permanente deste pneu? O histórico será preservado.")) return;
      nextStatus = "scrapped";
    } else if (kind === "inspection") {
      vehicleId = vehiclePlacement?.vehicle_id ?? (eventForm.vehicle_id || null); positionId = vehiclePlacement?.position_id ?? (eventForm.position_id || null);
    } else if (kind === "adjustment") {
      nextStatus = eventForm.target_status;
      if (nextStatus === "mounted") {
        if (!eventForm.vehicle_id || !eventForm.position_id) { setError("Para ajustar o status para montado, informe veículo e posição."); return; }
        vehicleId = eventForm.vehicle_id; positionId = eventForm.position_id;
      } else if (isMounted) {
        vehicleId = vehiclePlacement?.vehicle_id ?? null; positionId = vehiclePlacement?.position_id ?? null;
      }
      if (nextStatus === "scrapped" && oldStatus !== "scrapped" && !window.confirm("Confirmar ajuste para descartado? O histórico será preservado.")) return;
    }

    if (placementEvent(kind) || (kind === "adjustment" && nextStatus === "mounted")) {
      const targetPosition = activePositions.find(p => p.id === positionId && p.vehicle_id === vehicleId);
      if (!targetPosition) { setError("A posição selecionada não está ativa ou não pertence ao veículo escolhido."); return; }
      const occupant = mountedTiresAtPosition.get(targetPosition.id);
      if (occupant && occupant !== tire.id) { setError("Esta posição já está ocupada por outro pneu. Desmonte ou transfira o pneu atual primeiro."); return; }
    }

    setSaving(true); setError(""); setNotice("");
    const row = {organization_id:organizationId,tire_id:tire.id,vehicle_id:vehicleId,position_id:positionId,event_type:kind,occurred_at:new Date(eventForm.occurred_at).toISOString(),meter_value:meter,cost_cents:cost,supplier_id:eventForm.supplier_id || null,reason:kind === "adjustment" ? "Ajuste para " + statusLabels[nextStatus] + (eventForm.reason.trim() ? " — " + eventForm.reason.trim() : "") : eventForm.reason.trim() || null,notes:eventForm.notes.trim() || null};
    const inserted = await supabase.from("tire_events").insert(row).select("id").maybeSingle();
    if (inserted.error || !inserted.data) {
      setError("Não foi possível salvar o evento. Nenhum sucesso foi confirmado pelo banco.");
    } else {
      const updated = nextStatus === oldStatus ? {error:null,data:{id:tire.id}} : await supabase.from("tires").update({status:nextStatus}).eq("id",tire.id).eq("organization_id",organizationId).select("id").maybeSingle();
      setShowEventForm(false);
      if (updated.error || !updated.data) setError("O evento foi salvo no histórico, mas não foi possível atualizar o status do pneu. Atualize a tela e confira o item.");
      else setNotice("Evento registrado no histórico do pneu.");
      await load();
    }
    setSaving(false);
  }

  async function savePosition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || saving) return;
    const code = positionForm.position_code.trim();
    const label = positionForm.position_label.trim();
    if (!positionForm.vehicle_id || code.length < 1 || label.length < 2) { setError("Informe veículo, código e descrição da posição."); return; }
    if (activePositions.some(p => p.vehicle_id === positionForm.vehicle_id && (p.position_code.toLowerCase() === code.toLowerCase() || p.position_label.toLowerCase() === label.toLowerCase()))) { setError("Já existe uma posição ativa com este código ou descrição nesse veículo."); return; }
    setSaving(true); setError(""); setNotice("");
    const result = await supabase.from("vehicle_tire_positions").insert({organization_id:organizationId,vehicle_id:positionForm.vehicle_id,position_code:code,position_label:label,is_active:true}).select("id").maybeSingle();
    if (result.error || !result.data) setError(result.error?.code === "23505" ? "Código de posição já cadastrado." : "Não foi possível cadastrar a posição.");
    else { setShowPositionForm(false); setPositionForm({vehicle_id:"",position_code:"",position_label:""}); setNotice("Posição de montagem cadastrada."); await load(); }
    setSaving(false);
  }
  async function togglePosition(position: Position) {
    if (!supabase || saving) return;
    if (mountedTiresAtPosition.has(position.id)) { setError("Não é possível desativar uma posição ocupada. Desmonte o pneu primeiro."); return; }
    setSaving(true); setError(""); setNotice("");
    const result = await supabase.from("vehicle_tire_positions").update({is_active:!position.is_active}).eq("id",position.id).eq("organization_id",organizationId).select("id").maybeSingle();
    if (result.error || !result.data) setError("Não foi possível alterar a posição.");
    else { setNotice(position.is_active ? "Posição desativada sem apagar o histórico." : "Posição reativada."); await load(); }
    setSaving(false);
  }

  const mounted = tires.filter(t => t.status === "mounted").length;
  const inStock = tires.filter(t => t.status === "in_stock").length;
  const inProcess = tires.filter(t => t.status === "retread" || t.status === "repair").length;
  const purchaseValue = tires.reduce((sum,t) => sum + Number(t.purchase_cost_cents || 0),0);
  const currentTire = eventForm.tire_id ? tireMap.get(eventForm.tire_id) : null;
  const currentLocation = currentTire ? latestPlacement.get(currentTire.id) : undefined;
  const needsVehiclePosition = ["mount","rotation","transfer"].includes(eventForm.event_type) || (eventForm.event_type === "adjustment" && eventForm.target_status === "mounted");
  const availableEventPositions = activePositions.filter(p => p.vehicle_id === eventForm.vehicle_id && (!mountedTiresAtPosition.has(p.id) || mountedTiresAtPosition.get(p.id) === eventForm.tire_id));
  const visiblePositions = positions.filter(p => !search || [p.position_code,p.position_label,vehicleMap.get(p.vehicle_id)?.description ?? ""].some(x => x.toLocaleLowerCase("pt-BR").includes(search.trim().toLocaleLowerCase("pt-BR"))));

  return <section className="tire-manager">
    <div className="tire-toolbar">
      <div><h2>Gestão e ciclo de vida dos pneus</h2><p>Inventário, montagem por posição, recapagem, reparos e histórico por número de série.</p></div>
      <div className="tire-toolbar-actions"><button className="secondary-button" onClick={() => void load()} disabled={loading || saving}><RefreshCw size={15}/> Atualizar</button><button className="primary-button" onClick={() => openEventForm()} disabled={!tires.length || saving}><Plus size={16}/> Registrar evento</button><button className="primary-button" onClick={startNewTire}><Plus size={16}/> Novo pneu</button></div>
    </div>
    {(error || notice) && <div className={error ? "vehicle-message vehicle-error" : "vehicle-message vehicle-success"} role="status">{error ? <AlertCircle size={17}/> : <CheckCircle2 size={17}/>}<span>{error || notice}</span><button className="message-close" onClick={() => {setError("");setNotice("");}} aria-label="Fechar mensagem"><X size={15}/></button></div>}
    <div className="tire-kpis">
      <article className="tire-kpi"><span>Ativos no inventário</span><strong>{tires.filter(t => !["sold","scrapped"].includes(t.status)).length}</strong><small>{tires.length} pneu(s) cadastrado(s)</small></article>
      <article className="tire-kpi"><span>Montados na frota</span><strong>{mounted}</strong><small>Com posição rastreada</small></article>
      <article className="tire-kpi"><span>Disponíveis em estoque</span><strong>{inStock}</strong><small>Prontos para montagem</small></article>
      <article className="tire-kpi"><span>Em recapagem / reparo</span><strong>{inProcess}</strong><small>Fora de operação</small></article>
      <article className="tire-kpi"><span>Custo de aquisição</span><strong>{brl(purchaseValue)}</strong><small>Valor acumulado cadastrado</small></article>
    </div>
    <div className="tire-tabs" role="tablist" aria-label="Seções de pneus">
      <button className={tab === "inventory" ? "tire-tab active" : "tire-tab"} onClick={() => setTab("inventory")}><CircleDot size={16}/> Inventário</button>
      <button className={tab === "history" ? "tire-tab active" : "tire-tab"} onClick={() => setTab("history")}><History size={16}/> Histórico de eventos</button>
      <button className={tab === "positions" ? "tire-tab active" : "tire-tab"} onClick={() => setTab("positions")}><Settings2 size={16}/> Posições por veículo</button>
      <button className={tab === "life" ? "tire-tab active" : "tire-tab"} onClick={() => setTab("life")}><History size={16}/> Vida útil / duração</button>
    </div>
    <div className="tire-list-toolbar">
      <label className="tire-search"><Search size={16}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder={tab === "history" ? "Buscar pneu, veículo ou evento..." : tab === "life" ? "Buscar no relatório de vida útil..." : "Buscar série, medida ou veículo..."}/></label>
      {(tab === "inventory" || tab === "life") && <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Filtrar por status"><option value="all">Todos os status</option>{Object.entries(statusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>}
      {tab === "positions" && <button className="primary-button" onClick={() => {setPositionForm({vehicle_id:vehicles[0]?.id ?? "",position_code:"",position_label:""});setShowPositionForm(true);setError("");}}><Plus size={16}/> Nova posição</button>}
    </div>
    {loading ? <div className="tire-empty"><RefreshCw size={22}/><strong>Carregando dados...</strong></div> : <>
      {tab === "inventory" && <div className="vehicle-table-wrap"><table className="vehicle-table"><thead><tr><th>Pneu / série</th><th>Medida</th><th>Status</th><th>Localização atual</th><th>Compra</th><th>Uso registrado</th><th></th></tr></thead><tbody>
        {filteredTires.map(t => {const placement = latestPlacement.get(t.id);const v = placement?.vehicle_id ? vehicleMap.get(placement.vehicle_id) : null;const p = placement?.position_id ? positionMap.get(placement.position_id) : null;return <tr key={t.id}>
          <td><div className="vehicle-name"><strong>{t.serial_number}</strong><small>{[t.brand,t.model].filter(Boolean).join(" ") || "Marca/modelo não informado"}</small></div></td>
          <td>{t.size}</td><td><span className={"tire-status tire-status-" + t.status}>{statusLabels[t.status] ?? t.status}</span></td>
          <td>{t.status === "mounted" && v ? <div className="vehicle-name"><strong>{v.description}</strong><small>{p ? p.position_code + " · " + p.position_label : "Posição não identificada"}{v.plate ? " · " + v.plate : ""}</small></div> : "—"}</td>
          <td><div className="vehicle-name"><strong>{brl(Number(t.purchase_cost_cents))}</strong><small>{dateLabel(t.purchase_date)}</small></div></td>
          <td>{(durationKm.get(t.id) ?? 0).toLocaleString("pt-BR")} km</td>
          <td><div className="vehicle-row-actions"><button className="secondary-button" onClick={() => openEventForm(t.id)} title="Registrar evento"><RotateCw size={15}/></button><button className="secondary-button" onClick={() => startEditTire(t)} title="Editar cadastro"><Pencil size={15}/></button></div></td>
        </tr>;})}
        {!filteredTires.length && <tr><td colSpan={7}><div className="tire-empty"><CircleDot size={22}/><strong>Nenhum pneu encontrado</strong><span>Cadastre um pneu ou ajuste os filtros.</span></div></td></tr>}
      </tbody></table></div>}
      {tab === "history" && <div className="vehicle-table-wrap"><table className="vehicle-table"><thead><tr><th>Data/hora</th><th>Pneu</th><th>Evento</th><th>Veículo / posição</th><th>Leitura</th><th>Custo</th><th>Fornecedor</th><th>Observações</th></tr></thead><tbody>
        {filteredEvents.map(e => {const t = tireMap.get(e.tire_id);const v = e.vehicle_id ? vehicleMap.get(e.vehicle_id) : null;const p = e.position_id ? positionMap.get(e.position_id) : null;return <tr key={e.id}><td>{datetimeLabel(e.occurred_at)}</td><td><strong>{t?.serial_number ?? "Pneu removido"}</strong><small className="tire-table-sub">{t?.size ?? ""}</small></td><td>{eventLabels[e.event_type] ?? e.event_type}</td><td>{v ? <div className="vehicle-name"><strong>{v.description}</strong><small>{p ? p.position_code + " · " + p.position_label : v.plate ?? ""}</small></div> : "—"}</td><td>{e.meter_value == null ? "—" : Number(e.meter_value).toLocaleString("pt-BR")}</td><td>{brl(Number(e.cost_cents))}</td><td>{e.supplier_id ? supplierMap.get(e.supplier_id) ?? "—" : "—"}</td><td><div className="tire-note">{e.reason && <strong>{e.reason}</strong>}{e.notes && <span>{e.notes}</span>}</div></td></tr>;})}
        {!filteredEvents.length && <tr><td colSpan={8}><div className="tire-empty"><History size={22}/><strong>Sem eventos encontrados</strong><span>Os eventos registrados aparecerão aqui.</span></div></td></tr>}
      </tbody></table></div>}
      {tab === "positions" && <div className="vehicle-table-wrap"><table className="vehicle-table"><thead><tr><th>Veículo / equipamento</th><th>Código</th><th>Descrição da posição</th><th>Situação</th><th>Pneu montado</th><th></th></tr></thead><tbody>
        {visiblePositions.map(p => {const v = vehicleMap.get(p.vehicle_id);const occupantId = mountedTiresAtPosition.get(p.id);const occupant = occupantId ? tireMap.get(occupantId) : null;return <tr key={p.id}><td>{v?.description ?? "Ativo não encontrado"}<small className="tire-table-sub">{v?.plate ?? v?.code ?? ""}</small></td><td>{p.position_code}</td><td>{p.position_label}</td><td><span className={"tire-status " + (p.is_active ? "tire-status-in_stock" : "tire-status-scrapped")}>{p.is_active ? "Ativa" : "Inativa"}</span></td><td>{occupant ? <strong>{occupant.serial_number}</strong> : "Vazia"}</td><td><button className="secondary-button" onClick={() => void togglePosition(p)} disabled={saving}>{p.is_active ? "Desativar" : "Reativar"}</button></td></tr>;})}
        {!visiblePositions.length && <tr><td colSpan={6}><div className="tire-empty"><Settings2 size={22}/><strong>Nenhuma posição cadastrada</strong><span>Cadastre as posições para habilitar montagens rastreáveis.</span></div></td></tr>}
      </tbody></table></div>}

      {tab === "life" && <div className="tire-life-report">
        <div className="tire-life-heading"><div><h3>Relatório de vida útil dos pneus</h3><p>Indicadores calculados a partir dos eventos efetivamente lançados; lacunas de histórico podem reduzir os resultados.</p></div></div>
        <div className="vehicle-table-wrap"><table className="vehicle-table"><thead><tr><th>Pneu / medida</th><th>Status</th><th>Ciclos encerrados</th><th>Km registrados</th><th>Média km/ciclo</th><th>Dias em ciclos concluídos</th><th>Montagem atual</th><th>Último encerramento</th></tr></thead><tbody>
          {filteredTires.map(t => {const r=lifeReport.get(t.id);const place=latestPlacement.get(t.id);const v=place?.vehicle_id?vehicleMap.get(place.vehicle_id):null;return <tr key={t.id}><td><div className="vehicle-name"><strong>{t.serial_number}</strong><small>{t.size}</small></div></td><td><span className={"tire-status tire-status-"+t.status}>{statusLabels[t.status] ?? t.status}</span></td><td>{(r?.cycles ?? 0).toLocaleString("pt-BR")}</td><td>{(r?.km ?? 0).toLocaleString("pt-BR")} km</td><td>{(r?.cycles ?? 0)>0?Math.round((r?.km ?? 0)/(r?.cycles ?? 1)).toLocaleString("pt-BR")+" km":"—"}</td><td>{(r?.completedDays ?? 0).toLocaleString("pt-BR")} dias</td><td>{t.status==="mounted"?(r?.activeDays ?? 0).toLocaleString("pt-BR")+" dias": "—"}<small className="tire-table-sub">{t.status==="mounted"?(v?.description ?? "Montado"): ""}</small></td><td>{dateLabel(r?.lastEndAt ?? null)}</td></tr>;})}
          {!filteredTires.length && <tr><td colSpan={8}><div className="tire-empty"><History size={22}/><strong>Nenhum pneu encontrado</strong><span>Ajuste a pesquisa ou cadastre pneus e eventos.</span></div></td></tr>}
        </tbody></table></div>
        <p className="tire-footnote">A quilometragem soma apenas trechos em que as leituras inicial e final são válidas e pertencem ao mesmo veículo. Dias em ciclos concluídos contam do primeiro registro de montagem até desmontagem/saída de operação; duração atual é mostrada separadamente para pneus montados. Não se estima dado ausente.</p>
      </div>
    </>}
    <p className="tire-footnote">A duração em km é estimada apenas nos ciclos com montagem e desmontagem registrados no mesmo veículo e com leituras válidas. Não representa quilometragem de vida útil completa quando faltarem eventos históricos.</p>

    {showTireForm && <div className="tire-modal-backdrop" role="presentation"><section className="tire-modal panel" role="dialog" aria-modal="true" aria-labelledby="tire-form-title"><div className="vehicle-form-heading"><div><h3 id="tire-form-title">{editingTireId ? "Editar pneu" : "Cadastrar pneu"}</h3><p>O número de série identifica o pneu individualmente.</p></div><button className="icon-button" onClick={() => setShowTireForm(false)} aria-label="Fechar"><X size={18}/></button></div>
      <form onSubmit={saveTire}><div className="vehicle-fields">
        <label>Número de série / identificação<input required minLength={2} maxLength={100} value={tireForm.serial_number} onChange={e=>setTireForm(f=>({...f,serial_number:e.target.value}))}/></label>
        <label>Medida do pneu<input required minLength={2} maxLength={60} placeholder="Ex.: 295/80 R22.5" value={tireForm.size} onChange={e=>setTireForm(f=>({...f,size:e.target.value}))}/></label>
        <label>Marca<input maxLength={80} value={tireForm.brand} onChange={e=>setTireForm(f=>({...f,brand:e.target.value}))}/></label>
        <label>Modelo / linha<input maxLength={80} value={tireForm.model} onChange={e=>setTireForm(f=>({...f,model:e.target.value}))}/></label>
        <label>Data de aquisição<input type="date" value={tireForm.purchase_date} disabled={Boolean(editingTireId)} onChange={e=>setTireForm(f=>({...f,purchase_date:e.target.value}))}/></label>
        <label>Custo de aquisição (R$)<input type="number" min="0" step="0.01" value={tireForm.purchase_cost} disabled={Boolean(editingTireId)} onChange={e=>setTireForm(f=>({...f,purchase_cost:e.target.value}))}/></label>
      </div><div className="vehicle-form-actions"><button type="button" className="secondary-button" onClick={() => setShowTireForm(false)}>Cancelar</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "Salvando..." : editingTireId ? "Salvar alterações" : "Cadastrar pneu"}</button></div></form>
    </section></div>}

    {showEventForm && <div className="tire-modal-backdrop" role="presentation"><section className="tire-modal panel" role="dialog" aria-modal="true" aria-labelledby="tire-event-title"><div className="vehicle-form-heading"><div><h3 id="tire-event-title">Registrar evento do pneu</h3><p>O evento entra no histórico e atualiza o status operacional quando aplicável.</p></div><button className="icon-button" onClick={() => setShowEventForm(false)} aria-label="Fechar"><X size={18}/></button></div>
      <form onSubmit={saveEvent}><div className="vehicle-fields tire-event-fields">
        <label>Pneu<select required value={eventForm.tire_id} onChange={e=>{const id=e.target.value;const placement=latestPlacement.get(id);setEventForm(f=>({...f,tire_id:id,vehicle_id:placement?.vehicle_id ?? "",position_id:placement?.position_id ?? ""}));}}><option value="">Selecione...</option>{tires.filter(t=>!["scrapped","sold"].includes(t.status) || t.id===eventForm.tire_id).map(t=><option key={t.id} value={t.id}>{t.serial_number} · {t.size} · {statusLabels[t.status]}</option>)}</select></label>
        <label>Tipo de evento<select required value={eventForm.event_type} onChange={e=>setEventType(e.target.value as EventType)}>{eventTypes.map(k=><option key={k} value={k}>{eventLabels[k]}</option>)}</select></label>
        <label>Data e hora<input required type="datetime-local" value={eventForm.occurred_at} onChange={e=>setEventForm(f=>({...f,occurred_at:e.target.value}))}/></label>
        <label>Leitura no ativo (km/horas)<input type="number" min="0" step="0.1" value={eventForm.meter_value} onChange={e=>setEventForm(f=>({...f,meter_value:e.target.value}))}/></label>
        <label>Custo do evento (R$)<input type="number" min="0" step="0.01" value={eventForm.cost} onChange={e=>setEventForm(f=>({...f,cost:e.target.value}))}/></label>
        <label>Fornecedor / recapadora<select value={eventForm.supplier_id} onChange={e=>setEventForm(f=>({...f,supplier_id:e.target.value}))}><option value="">Não informado</option>{suppliers.filter(s=>s.status==="active").map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        {(needsVehiclePosition || eventForm.event_type === "inspection") && <label>Veículo / equipamento<select value={eventForm.vehicle_id} required={needsVehiclePosition} onChange={e=>setEventForm(f=>({...f,vehicle_id:e.target.value,position_id:""}))}><option value="">Selecione...</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.description}{v.plate ? " · " + v.plate : " · " + v.code}</option>)}</select></label>}
        {needsVehiclePosition && <label>Posição de montagem<select required value={eventForm.position_id} onChange={e=>setEventForm(f=>({...f,position_id:e.target.value}))}><option value="">Selecione...</option>{availableEventPositions.map(p=><option key={p.id} value={p.id}>{p.position_code} · {p.position_label}</option>)}</select></label>}
        {eventForm.event_type === "adjustment" && <label>Corrigir status para<select required value={eventForm.target_status} onChange={e=>setEventForm(f=>({...f,target_status:e.target.value as TireStatus}))}>{Object.entries(statusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>}
        <label>Motivo / referência<input maxLength={180} value={eventForm.reason} onChange={e=>setEventForm(f=>({...f,reason:e.target.value}))} placeholder="Ordem de serviço, motivo, protocolo..."/></label>
        <label className="tire-wide-field">Observações<textarea rows={3} maxLength={1000} value={eventForm.notes} onChange={e=>setEventForm(f=>({...f,notes:e.target.value}))}/></label>
      </div>
      {currentTire && <div className="tire-modal-hint">Status atual: <strong>{statusLabels[currentTire.status]}</strong>{currentLocation?.vehicle_id ? " · Local atual: " + (vehicleMap.get(currentLocation.vehicle_id)?.description ?? "veículo") + (currentLocation.position_id && positionMap.get(currentLocation.position_id) ? " / " + positionMap.get(currentLocation.position_id)!.position_label : "") : ""}</div>}
      {eventForm.event_type === "dismount" && <div className="tire-modal-hint">A desmontagem será registrada na última posição conhecida, preservando o histórico.</div>}
      <div className="vehicle-form-actions"><button type="button" className="secondary-button" onClick={() => setShowEventForm(false)}>Cancelar</button><button className="primary-button" type="submit" disabled={saving || !eventForm.tire_id}>{saving ? "Salvando..." : "Registrar no histórico"}</button></div></form>
    </section></div>}

    {showPositionForm && <div className="tire-modal-backdrop" role="presentation"><section className="tire-modal panel" role="dialog" aria-modal="true" aria-labelledby="tire-position-title"><div className="vehicle-form-heading"><div><h3 id="tire-position-title">Nova posição de pneu</h3><p>Cadastre posições conforme os eixos e o layout real do veículo.</p></div><button className="icon-button" onClick={() => setShowPositionForm(false)} aria-label="Fechar"><X size={18}/></button></div>
      <form onSubmit={savePosition}><div className="vehicle-fields">
        <label>Veículo / equipamento<select required value={positionForm.vehicle_id} onChange={e=>setPositionForm(f=>({...f,vehicle_id:e.target.value}))}><option value="">Selecione...</option>{vehicles.map(v=><option key={v.id} value={v.id}>{v.description}{v.plate ? " · " + v.plate : ""}</option>)}</select></label>
        <label>Código curto<input required maxLength={30} value={positionForm.position_code} onChange={e=>setPositionForm(f=>({...f,position_code:e.target.value}))} placeholder="Ex.: E1-EXT"/></label>
        <label>Descrição da posição<input required minLength={2} maxLength={100} value={positionForm.position_label} onChange={e=>setPositionForm(f=>({...f,position_label:e.target.value}))} placeholder="Ex.: Eixo 1 lado externo"/></label>
      </div><div className="vehicle-form-actions"><button type="button" className="secondary-button" onClick={() => setShowPositionForm(false)}>Cancelar</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "Salvando..." : "Cadastrar posição"}</button></div></form>
    </section></div>}
  </section>;
}

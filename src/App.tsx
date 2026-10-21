import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured } from "./lib/supabase";
import { VehicleManager } from "./vehicles/VehicleManager";
import { FuelManager } from "./fuel/FuelManager";
import { MaintenanceManager } from "./maintenance/MaintenanceManager";
import { TireManager } from "./tires/TireManager";
import { Dashboard } from "./dashboard/Dashboard";
import { ReportsManager } from "./reports/ReportsManager";
import { ExpensesManager } from "./expenses/ExpensesManager";
import { PeopleManager } from "./people/PeopleManager";
import {
  AlertTriangle, ArrowUpRight, Bell,
  CalendarClock, ChevronDown, CircleHelp, ClipboardList, Fuel,
  LayoutDashboard, Menu, Package, Search, Settings, ShieldCheck, Truck,
  Wrench, CircleDot, FileBarChart, Users, X
} from "lucide-react";

type ModuleId = "dashboard" | "vehicles" | "fuel" | "maintenance" | "tires" | "expenses" | "reports" | "people";

const navigation: { id: ModuleId; label: string; icon: typeof LayoutDashboard; group: string }[] = [
  { id: "dashboard", label: "Visão geral", icon: LayoutDashboard, group: "Principal" },
  { id: "vehicles", label: "Veículos e equipamentos", icon: Truck, group: "Operação" },
  { id: "fuel", label: "Abastecimentos", icon: Fuel, group: "Operação" },
  { id: "maintenance", label: "Manutenção", icon: Wrench, group: "Operação" },
  { id: "tires", label: "Gestão de pneus", icon: CircleDot, group: "Operação" },
  { id: "expenses", label: "Despesas e custos", icon: ClipboardList, group: "Gestão" },
  { id: "reports", label: "Relatórios", icon: FileBarChart, group: "Gestão" },
  { id: "people", label: "Motoristas e fornecedores", icon: Users, group: "Cadastros" }
];

const moduleDescriptions: Record<ModuleId, string> = {
  dashboard: "Acompanhe a operação com dados rastreáveis e indicadores confiáveis.",
  vehicles: "Cadastros, leitura atual e histórico de cada ativo.",
  fuel: "Registros de abastecimento, autorizações e consumo.",
  maintenance: "Planos preventivos, corretivas e ordens de serviço.",
  tires: "Rastreabilidade individual, posições, recapagens e vida útil.",
  expenses: "Custos operacionais vinculados à sua origem.",
  reports: "Relatórios filtráveis com metodologia e período documentados.",
  people: "Cadastros de motoristas, postos e fornecedores."
};

function formatToday() {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date());
}

function App({ organizationId, organizationName, userEmail }: { organizationId?: string | null; organizationName?: string | null; userEmail?: string | null } = {}) {
  const userDisplayName = userEmail?.split("@")[0]?.replace(/[._-]+/g, " ") || "Usuário";
  const userInitials = userDisplayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "US";
  const [hasPendingFormChanges, setHasPendingFormChanges] = useState(false);
  const [activeModule, setActiveModule] = useState<ModuleId>(() => {
    try {
      const saved = sessionStorage.getItem("fleetwise:activeModule");
      return navigation.some((item) => item.id === saved) ? saved as ModuleId : "dashboard";
    } catch {
      return "dashboard";
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem("fleetwise:activeModule", activeModule);
    } catch {
      // Navigation still works when browser storage is unavailable.
    }
  }, [activeModule]);
  const navigateToModule = useCallback((nextModule: ModuleId) => {
    try {
      sessionStorage.setItem("nexuscode:scroll:" + activeModule, String(window.scrollY));
    } catch {
      // Navigation remains available if browser storage is unavailable.
    }
    setActiveModule(nextModule);
  }, [activeModule]);

  useEffect(() => {
    let savedScroll = 0;
    try {
      savedScroll = Number(sessionStorage.getItem("nexuscode:scroll:" + activeModule) || 0);
    } catch {
      savedScroll = 0;
    }
    // Wait for the newly visible module to participate in layout before restoring its position.
    requestAnimationFrame(() => window.scrollTo({ top: Math.max(0, savedScroll), behavior: "instant" as ScrollBehavior }));
  }, [activeModule]);

  useEffect(() => {
    const saveScroll = () => {
      try {
        sessionStorage.setItem("nexuscode:scroll:" + activeModule, String(window.scrollY));
      } catch {
        // Scroll memory is an enhancement; it must not interrupt normal use.
      }
    };
    window.addEventListener("scroll", saveScroll, { passive: true });
    return () => window.removeEventListener("scroll", saveScroll);
  }, [activeModule]);

  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [search, setSearch] = useState("");
  const activeItem = navigation.find((item) => item.id === activeModule)!;

  return (
    <div className="app-shell">
      {mobileNavOpen && <button className="mobile-scrim" aria-label="Fechar menu" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <img className="brand-logo" src="/nexuscode-logo.svg" alt="NexusCode - Gestão de Veículos" />
          <button className="icon-button close-nav" onClick={() => setMobileNavOpen(false)} aria-label="Fechar menu"><X size={18} /></button>
        </div>
        <div className="company-switcher">
          <div className="company-avatar"><Truck size={18} /></div>
          <div className="company-copy"><strong>{organizationName ?? "Minha frota"}</strong><span>Ambiente operacional</span></div>
          <ChevronDown size={15} className="muted" />
        </div>
        <nav className="main-nav" aria-label="Navegação principal">
          {["Principal", "Operação", "Gestão", "Cadastros"].map((group) => (
            <div className="nav-group" key={group}>
              <p className="nav-heading">{group}</p>
              {navigation.filter((item) => item.group === group).map((item) => {
                const Icon = item.icon;
                return <button key={item.id} className={`nav-item ${activeModule === item.id ? "nav-item-active" : ""}`} onClick={() => { if (activeModule !== item.id && hasPendingFormChanges && !window.confirm("Há um cadastro ou alteração em andamento. Se sair deste módulo, o rascunho será mantido para você continuar depois. Deseja trocar de módulo?")) return; navigateToModule(item.id); setMobileNavOpen(false); setHasPendingFormChanges(false); }}>
                  <Icon size={18} strokeWidth={1.8} /><span>{item.label}</span>
                  {item.id === "tires" && <span className="nav-dot" />}
                </button>;
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card"><div className="help-icon"><CircleHelp size={17} /></div><strong>Precisa de ajuda?</strong><p>Consulte a documentação e as regras do sistema.</p><button onClick={() => navigateToModule("reports")}>Ver orientações <span>↗</span></button></div>
          <button className="nav-item settings-item" onClick={() => navigateToModule("people")}><Settings size={18} /><span>Configurações</span></button>
          <div className="user-profile"><div className="user-avatar">{userInitials}</div><div className="user-copy"><strong>{userDisplayName}</strong><span>{userEmail ?? "Conta autenticada"}</span></div><ChevronDown size={16} className="muted" /></div>
        </div>
      </aside>

      <main className="main-content" onChange={(event) => { const target = event.target as HTMLElement; if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement) setHasPendingFormChanges(true); }}>
        <header className="topbar">
          <div className="topbar-left"><button className="icon-button mobile-menu" onClick={() => setMobileNavOpen(true)} aria-label="Abrir menu"><Menu size={20} /></button><div className="breadcrumb">Frota <span>/</span> <strong>{activeItem.label}</strong></div></div>
          <div className="topbar-actions">
            <label className="global-search"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar no sistema..." aria-label="Buscar no sistema" /><kbd>⌘ K</kbd></label>
            <button className="icon-button notification-button" aria-label="Notificações"><Bell size={18} /><i /></button>
            <div className="top-user"><div className="user-avatar" title={userEmail ?? "Conta autenticada"}>{userInitials}</div><ChevronDown size={15} className="muted" /></div>
          </div>
        </header>

        <div className="page-content">
          <div className="welcome-row">
            <div><div className="eyebrow"><span className="status-pulse" /> AMBIENTE OPERACIONAL</div><h1>{activeModule === "dashboard" ? "Visão geral da frota" : activeItem.label}</h1><p>{activeModule === "dashboard" ? "Uma visão clara da operação, com dados que você pode confiar." : moduleDescriptions[activeModule]}</p></div>
            <div className="date-chip"><CalendarClock size={16} /><span>{formatToday()}</span></div>
          </div>

          {!isSupabaseConfigured && <div className="connection-notice" role="status"><div><strong>Banco de dados ainda não conectado</strong><p>Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY na Vercel ou no arquivo .env.local. O sistema não está salvando registros.</p></div><span>Configuração pendente</span></div>}
          {organizationId ? <>
            <div hidden={activeModule !== "dashboard"}><Dashboard organizationId={organizationId} onNavigate={navigateToModule} /></div>
            <div hidden={activeModule !== "vehicles"}><VehicleManager organizationId={organizationId} /></div>
            <div hidden={activeModule !== "fuel"}><FuelManager organizationId={organizationId} /></div>
            <div hidden={activeModule !== "maintenance"}><MaintenanceManager organizationId={organizationId} /></div>
            <div hidden={activeModule !== "tires"}><TireManager organizationId={organizationId} /></div>
            <div hidden={activeModule !== "expenses"}><ExpensesManager organizationId={organizationId} /></div>
            <div hidden={activeModule !== "reports"}><ReportsManager organizationId={organizationId} /></div>
            <div hidden={activeModule !== "people"}><PeopleManager organizationId={organizationId} /></div>
          </> : <ModulePlaceholder moduleId={activeModule} description={moduleDescriptions[activeModule]} search={search} />}
          <footer className="page-footer"><span><ShieldCheck size={14} /> Integridade de dados em primeiro lugar</span><span>NexusCode - Gestão de Veículos · Fundação do sistema <span className="footer-separator">•</span> v0.1.0</span></footer>
        </div>
      </main>
    </div>
  );
}

function ModulePlaceholder({ moduleId, description, search }: { moduleId: ModuleId; description: string; search: string }) {
  const item = navigation.find((entry) => entry.id === moduleId)!;
  const Icon = item.icon;
  return <section className="module-state panel"><div className="module-state-icon"><Icon size={28} /></div><span className="module-tag">MÓDULO PLANEJADO</span><h2>{item.label}</h2><p>{description}</p>{search && <p className="search-context">Busca atual: <strong>{search}</strong></p>}<div className="module-note"><AlertTriangle size={17} /><span>Este módulo ainda não está conectado a um banco de dados. Nenhum registro pode ser criado nesta etapa. A tela operacional será habilitada após implementar persistência, validações e testes.</span></div><div className="module-next"><strong>Próximos componentes</strong><div><Package size={16} /> Modelo de dados e validações</div><div><ShieldCheck size={16} /> Persistência e auditoria</div><div><ArrowUpRight size={16} /> Fluxos de criação, edição e consulta</div></div></section>;
}

export default App;

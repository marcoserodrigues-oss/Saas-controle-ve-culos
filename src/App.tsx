import { useState } from "react";
import { isSupabaseConfigured } from "./lib/supabase";
import { VehicleManager } from "./vehicles/VehicleManager";
import {
  Activity, AlertTriangle, ArrowUpRight, Bell,
  CalendarClock, ChevronDown, CircleHelp, ClipboardList, Fuel, Gauge,
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
  const [activeModule, setActiveModule] = useState<ModuleId>("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [search, setSearch] = useState("");
  const activeItem = navigation.find((item) => item.id === activeModule)!;

  return (
    <div className="app-shell">
      {mobileNavOpen && <button className="mobile-scrim" aria-label="Fechar menu" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><Gauge size={23} strokeWidth={2.4} /></div>
          <div><strong>Fleet<span>wise</span></strong><small>GESTÃO INTELIGENTE</small></div>
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
                return <button key={item.id} className={`nav-item ${activeModule === item.id ? "nav-item-active" : ""}`} onClick={() => { setActiveModule(item.id); setMobileNavOpen(false); }}>
                  <Icon size={18} strokeWidth={1.8} /><span>{item.label}</span>
                  {item.id === "tires" && <span className="nav-dot" />}
                </button>;
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card"><div className="help-icon"><CircleHelp size={17} /></div><strong>Precisa de ajuda?</strong><p>Consulte a documentação e as regras do sistema.</p><button onClick={() => setActiveModule("reports")}>Ver orientações <span>↗</span></button></div>
          <button className="nav-item settings-item" onClick={() => setActiveModule("people")}><Settings size={18} /><span>Configurações</span></button>
          <div className="user-profile"><div className="user-avatar">{userInitials}</div><div className="user-copy"><strong>{userDisplayName}</strong><span>{userEmail ?? "Conta autenticada"}</span></div><ChevronDown size={16} className="muted" /></div>
        </div>
      </aside>

      <main className="main-content">
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
          {activeModule === "dashboard" ? <Dashboard onNavigate={setActiveModule} /> : activeModule === "vehicles" && organizationId ? <VehicleManager organizationId={organizationId} /> : <ModulePlaceholder moduleId={activeModule} description={moduleDescriptions[activeModule]} search={search} />}
          <footer className="page-footer"><span><ShieldCheck size={14} /> Integridade de dados em primeiro lugar</span><span>Fleetwise · Fundação do sistema <span className="footer-separator">•</span> v0.1.0</span></footer>
        </div>
      </main>
    </div>
  );
}

function Dashboard({ onNavigate }: { onNavigate: (module: ModuleId) => void }) {
  const stats = [
    { label: "Veículos e equipamentos", value: "—", note: "Aguardando cadastro", icon: Truck, tint: "blue", trend: "Sem dados" },
    { label: "Gastos no período", value: "—", note: "Sem registros financeiros", icon: Activity, tint: "violet", trend: "Sem dados" },
    { label: "Manutenções pendentes", value: "—", note: "Aguardando ordens de serviço", icon: Wrench, tint: "amber", trend: "Sem dados" },
    { label: "Pneus em operação", value: "—", note: "Aguardando inventário", icon: CircleDot, tint: "teal", trend: "Sem dados" }
  ];
  return <>
    <section className="stat-grid" aria-label="Indicadores principais">
      {stats.map((stat) => { const Icon = stat.icon; return <article className="stat-card" key={stat.label}><div className="stat-top"><span>{stat.label}</span><div className={`stat-icon ${stat.tint}`}><Icon size={18} /></div></div><div className="stat-value">{stat.value}</div><div className="stat-bottom"><span>{stat.note}</span><span className="neutral-trend">{stat.trend}</span></div></article>; })}
    </section>

    <section className="dashboard-grid">
      <article className="panel activity-panel">
        <div className="panel-heading"><div><h2>Resumo operacional</h2><p>Dados consolidados a partir dos registros válidos</p></div><span className="period-pill">Período atual <ChevronDown size={13} /></span></div>
        <div className="empty-chart"><div className="chart-illustration"><div className="chart-grid"><span /><span /><span /><span /></div><div className="chart-bars"><i /><i /><i /><i /><i /><i /><i /></div><div className="chart-line"><span /><span /><span /><span /></div></div><div className="empty-title">Seu painel começa com os dados reais</div><p>Cadastre seus veículos e lance as primeiras movimentações para visualizar tendências e indicadores.</p><button className="primary-button" onClick={() => onNavigate("vehicles")}>Cadastrar primeiro veículo <span>→</span></button></div>
      </article>
      <article className="panel attention-panel">
        <div className="panel-heading"><div><h2>Central de atenção</h2><p>Alertas e pontos que exigem acompanhamento</p></div><div className="attention-symbol"><AlertTriangle size={17} /></div></div>
        <div className="empty-alerts"><div className="empty-alert-icon"><ShieldCheck size={22} /></div><strong>Nenhum alerta calculado</strong><p>Os alertas aparecerão após o cadastro de dados válidos. Não exibimos pendências fictícias.</p></div>
        <div className="attention-links"><button onClick={() => onNavigate("maintenance")}><Wrench size={16} /><span>Manutenção</span><span className="link-arrow">→</span></button><button onClick={() => onNavigate("tires")}><CircleDot size={16} /><span>Inspeção de pneus</span><span className="link-arrow">→</span></button><button onClick={() => onNavigate("fuel")}><Fuel size={16} /><span>Abastecimentos</span><span className="link-arrow">→</span></button></div>
      </article>
    </section>

    <section className="bottom-grid">
      <article className="panel quick-panel"><div className="panel-heading"><div><h2>Acesso rápido</h2><p>Atalhos para tarefas comuns</p></div></div><div className="quick-actions">
        <button onClick={() => onNavigate("vehicles")}><span className="quick-icon quick-blue"><Truck size={19} /></span><span><strong>Adicionar veículo</strong><small>Cadastre um ativo da frota</small></span><span className="link-arrow">↗</span></button>
        <button onClick={() => onNavigate("fuel")}><span className="quick-icon quick-orange"><Fuel size={19} /></span><span><strong>Novo abastecimento</strong><small>Registrar combustível e leitura</small></span><span className="link-arrow">↗</span></button>
        <button onClick={() => onNavigate("maintenance")}><span className="quick-icon quick-violet"><Wrench size={19} /></span><span><strong>Abrir ordem de serviço</strong><small>Registrar manutenção</small></span><span className="link-arrow">↗</span></button>
        <button onClick={() => onNavigate("tires")}><span className="quick-icon quick-teal"><CircleDot size={19} /></span><span><strong>Gerenciar pneus</strong><small>Montagens, ciclos e inspeções</small></span><span className="link-arrow">↗</span></button>
      </div></article>
      <article className="panel integrity-panel"><div className="panel-heading"><div><h2>Saúde dos dados</h2><p>Princípios de confiabilidade</p></div><div className="integrity-badge"><ShieldCheck size={17} /></div></div><div className="integrity-list"><div><span className="integrity-check"><ShieldCheck size={15} /></span><span><strong>Sem dados demonstrativos</strong><small>Indicadores vazios até haver registros reais.</small></span></div><div><span className="integrity-check"><ShieldCheck size={15} /></span><span><strong>Histórico rastreável</strong><small>Correções devem preservar valores anteriores.</small></span></div><div><span className="integrity-check"><ShieldCheck size={15} /></span><span><strong>Cálculos verificáveis</strong><small>Fórmulas cobertas por testes de domínio.</small></span></div></div><div className="integrity-foot"><span className="integrity-status-dot" /> Fundação em desenvolvimento</div></article>
    </section>
  </>;
}

function ModulePlaceholder({ moduleId, description, search }: { moduleId: ModuleId; description: string; search: string }) {
  const item = navigation.find((entry) => entry.id === moduleId)!;
  const Icon = item.icon;
  return <section className="module-state panel"><div className="module-state-icon"><Icon size={28} /></div><span className="module-tag">MÓDULO PLANEJADO</span><h2>{item.label}</h2><p>{description}</p>{search && <p className="search-context">Busca atual: <strong>{search}</strong></p>}<div className="module-note"><AlertTriangle size={17} /><span>Este módulo ainda não está conectado a um banco de dados. Nenhum registro pode ser criado nesta etapa. A tela operacional será habilitada após implementar persistência, validações e testes.</span></div><div className="module-next"><strong>Próximos componentes</strong><div><Package size={16} /> Modelo de dados e validações</div><div><ShieldCheck size={16} /> Persistência e auditoria</div><div><ArrowUpRight size={16} /> Fluxos de criação, edição e consulta</div></div></section>;
}

export default App;

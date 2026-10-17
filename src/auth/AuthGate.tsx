import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

type Membership = { organization_id: string; role: string; organizations: { name: string } | { name: string }[] | null };

export function AuthGate({ children }: { children: (context: { organizationId: string | null; organizationName: string | null; userEmail: string | null; signOut: () => Promise<void> }) => ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [membershipCheck, setMembershipCheck] = useState(false);

  useEffect(() => {
    if (!supabase) { setChecking(false); return; }
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) setError(sessionError.message);
      setSession(data.session);
      setChecking(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setError("");
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session) {
      setMemberships([]);
      setOrganizationId("");
      setMembershipCheck(false);
      return;
    }
    let active = true;
    setMembershipCheck(true);
    supabase.from("organization_members")
      .select("organization_id, role, organizations(name)")
      .eq("user_id", session.user.id)
      .eq("is_active", true)
      .then(({ data, error: queryError }) => {
        if (!active) return;
        if (queryError) setError("Não foi possível validar a organização deste usuário. Verifique as políticas do Supabase.");
        const rows = (data ?? []) as unknown as Membership[];
        setMemberships(rows);
        if (rows.length === 1) setOrganizationId(rows[0].organization_id);
        setMembershipCheck(false);
      });
    return () => { active = false; };
  }, [session]);

  if (!isSupabaseConfigured || !supabase) {
    return <>{children({ organizationId: null, organizationName: null, userEmail: null, signOut: async () => {} })}</>;
  }

  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const { error: signInError } = await supabase!.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) setError("Não foi possível entrar. Confira o e-mail e a senha.");
    setSubmitting(false);
  };

  const signOut = async () => {
    await supabase!.auth.signOut();
    setMemberships([]);
    setOrganizationId("");
  };

  if (checking) return <div className="auth-screen"><div className="auth-card"><div className="auth-mark">FW</div><p>Verificando sessão segura...</p></div></div>;

  if (!session) return <div className="auth-screen">
    <form className="auth-card" onSubmit={signIn}>
      <div className="auth-mark">FW</div>
      <div className="auth-eyebrow">FLEETWISE · GESTÃO DE FROTA</div>
      <h1>Acesse sua conta</h1>
      <p className="auth-description">Entre com as credenciais fornecidas pelo administrador da sua organização.</p>
      <label>E-mail<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@empresa.com" /></label>
      <label>Senha<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Sua senha" /></label>
      {error && <div className="auth-error" role="alert">{error}</div>}
      <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? "Validando acesso..." : "Entrar com segurança"}</button>
      <div className="auth-footnote">Cadastro público desativado. O acesso exige usuário previamente provisionado e vínculo com uma organização.</div>
    </form>
  </div>;

  if (membershipCheck) return <div className="auth-screen"><div className="auth-card"><div className="auth-mark">FW</div><p>Validando vínculo com a organização...</p></div></div>;

  if (memberships.length === 0) return <div className="auth-screen">
    <div className="auth-card"><div className="auth-mark">FW</div><h1>Organização não vinculada</h1><p className="auth-description">Sua conta está autenticada, mas ainda não tem vínculo ativo com uma organização. Solicite ao administrador que conclua o provisionamento.</p>{error && <div className="auth-error">{error}</div>}<button className="auth-submit" onClick={() => void signOut()}>Sair da conta</button></div>
  </div>;

  const selected = memberships.find((membership) => membership.organization_id === organizationId);
  const organizationNameValue = selected?.organizations
    ? Array.isArray(selected.organizations) ? selected.organizations[0]?.name : selected.organizations.name
    : null;

  return <div className="authenticated-shell">
    <div className="auth-context-bar"><span>Conta: <strong>{session.user.email}</strong>{memberships.length > 1 && <><span className="auth-context-divider">·</span><label>Organização <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}><option value="">Selecione...</option>{memberships.map((membership) => { const org = Array.isArray(membership.organizations) ? membership.organizations[0] : membership.organizations; return <option key={membership.organization_id} value={membership.organization_id}>{org?.name ?? membership.organization_id}</option>; })}</select></label></>}</span><button onClick={() => void signOut()}>Sair <span>↗</span></button></div>
    {memberships.length > 1 && !organizationId ? <div className="auth-screen"><div className="auth-card"><h1>Selecione a organização</h1><p className="auth-description">Escolha o ambiente para continuar.</p><select className="auth-org-select" value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}><option value="">Selecione...</option>{memberships.map((membership) => { const org = Array.isArray(membership.organizations) ? membership.organizations[0] : membership.organizations; return <option key={membership.organization_id} value={membership.organization_id}>{org?.name ?? membership.organization_id}</option>; })}</select></div></div> : children({ organizationId, organizationName: organizationNameValue ?? null, userEmail: session.user.email ?? null, signOut })}
  </div>;
}

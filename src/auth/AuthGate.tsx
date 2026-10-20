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
  const [forgotPasswordMode, setForgotPasswordMode] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryEmailSent, setRecoveryEmailSent] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  useEffect(() => {
    if (!supabase) { setChecking(false); return; }

    // The recovery link may authenticate the user automatically. Keep the reset
    // screen visible when Supabase signals a password-recovery flow.
    if (window.location.hash.includes("type=recovery")) setRecoveryMode(true);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") {
        setRecoveryMode(true);
        setForgotPasswordMode(false);
        setError("");
      }
      setSession(nextSession);
      if (event !== "PASSWORD_RECOVERY") setError("");
    });

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) setError("Não foi possível verificar a sessão. Tente novamente.");
      setSession(data.session);
      setChecking(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session || recoveryMode) {
      setMemberships([]);
      setOrganizationId("");
      setMembershipCheck(false);
      return;
    }
    let active = true;
    // Never carry an organization selection across account/session changes.
    setMemberships([]);
    setOrganizationId("");
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
  }, [session, recoveryMode]);

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

  const requestPasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setRecoveryEmailSent(false);
    const { error: resetError } = await supabase!.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    if (resetError) {
      setError("Não foi possível enviar o e-mail de recuperação. Confira o endereço e tente novamente.");
    } else {
      setRecoveryEmailSent(true);
    }
    setSubmitting(false);
  };

  const updatePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (newPassword.length < 8) {
      setError("A nova senha deve ter pelo menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError("As senhas digitadas não coincidem.");
      return;
    }
    setSubmitting(true);
    const { error: updateError } = await supabase!.auth.updateUser({ password: newPassword });
    if (updateError) {
      setError("Não foi possível atualizar a senha. Solicite um novo link de recuperação e tente novamente.");
      setSubmitting(false);
      return;
    }
    setPassword("");
    setNewPassword("");
    setConfirmNewPassword("");
    setRecoveryMode(false);
    setForgotPasswordMode(false);
    setError("");
    setSubmitting(false);
  };

  const signOut = async () => {
    await supabase!.auth.signOut();
    setSession(null);
    setMemberships([]);
    setOrganizationId("");
    setRecoveryMode(false);
    setForgotPasswordMode(false);
  };

  if (checking) return <div className="auth-screen"><div className="auth-card"><div className="auth-mark">NC</div><p>Verificando sessão segura...</p></div></div>;

  if (recoveryMode) return <div className="auth-screen">
    <form className="auth-card" onSubmit={updatePassword}>
      <div className="auth-mark">NC</div>
      <div className="auth-eyebrow">NEXUSCODE · SEGURANÇA DA CONTA</div>
      <h1>Crie uma nova senha</h1>
      <p className="auth-description">Escolha uma senha nova para acessar sua conta com segurança.</p>
      <label>Nova senha<input type="password" autoComplete="new-password" required minLength={8} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Pelo menos 8 caracteres" /></label>
      <label>Confirme a nova senha<input type="password" autoComplete="new-password" required minLength={8} value={confirmNewPassword} onChange={(event) => setConfirmNewPassword(event.target.value)} placeholder="Digite a senha novamente" /></label>
      {error && <div className="auth-error" role="alert">{error}</div>}
      <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? "Salvando nova senha..." : "Salvar nova senha"}</button>
      <div className="auth-footnote">Após salvar, sua conta continuará vinculada à organização existente.</div>
    </form>
  </div>;

  if (!session && forgotPasswordMode) return <div className="auth-screen">
    <form className="auth-card" onSubmit={requestPasswordReset}>
      <div className="auth-mark">NC</div>
      <div className="auth-eyebrow">NEXUSCODE · RECUPERAÇÃO DE ACESSO</div>
      <h1>Esqueceu sua senha?</h1>
      <p className="auth-description">Informe seu e-mail cadastrado. Enviaremos um link para criar uma nova senha.</p>
      <label>E-mail<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@empresa.com" /></label>
      {error && <div className="auth-error" role="alert">{error}</div>}
      {recoveryEmailSent && <div className="auth-success" role="status">Se o e-mail estiver cadastrado, você receberá as instruções de recuperação. Abra o link neste mesmo navegador para definir a nova senha.</div>}
      <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? "Enviando..." : "Enviar link de recuperação"}</button>
      <button className="auth-text-button" type="button" onClick={() => { setForgotPasswordMode(false); setRecoveryEmailSent(false); setError(""); }}>Voltar para entrar</button>
    </form>
  </div>;

  if (!session) return <div className="auth-screen">
    <form className="auth-card" onSubmit={signIn}>
      <div className="auth-mark">NC</div>
      <div className="auth-eyebrow">NEXUSCODE · GESTÃO DE VEÍCULOS</div>
      <h1>Acesse sua conta</h1>
      <p className="auth-description">Entre com as credenciais fornecidas pelo administrador da sua organização.</p>
      <label>E-mail<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@empresa.com" /></label>
      <label>Senha<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Sua senha" /></label>
      {error && <div className="auth-error" role="alert">{error}</div>}
      <button className="auth-submit" type="submit" disabled={submitting}>{submitting ? "Validando acesso..." : "Entrar com segurança"}</button>
      <button className="auth-text-button" type="button" onClick={() => { setForgotPasswordMode(true); setError(""); }}>Esqueci minha senha</button>
      <div className="auth-footnote">Cadastro público desativado. O acesso exige usuário previamente provisionado e vínculo com uma organização.</div>
    </form>
  </div>;

  if (membershipCheck) return <div className="auth-screen"><div className="auth-card"><div className="auth-mark">NC</div><p>Validando vínculo com a organização...</p></div></div>;

  if (memberships.length === 0) return <div className="auth-screen">
    <div className="auth-card"><div className="auth-mark">NC</div><h1>Organização não vinculada</h1><p className="auth-description">Sua conta está autenticada, mas ainda não tem vínculo ativo com uma organização. Solicite ao administrador que conclua o provisionamento.</p>{error && <div className="auth-error">{error}</div>}<button className="auth-submit" onClick={() => void signOut()}>Sair da conta</button></div>
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

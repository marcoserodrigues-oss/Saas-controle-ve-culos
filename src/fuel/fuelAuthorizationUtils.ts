import { nextSequentialCode } from "../lib/automaticCode";

export type AuthorizationDraft = {
  valid_from: string;
  valid_until: string;
  max_liters: string;
  max_amount: string;
};

export type AuthorizationLimits = {
  max_liters: number | null;
  max_amount_cents: number | null;
};

export function localDateTimeInput(date = new Date()): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function blankAuthorizationDraft(now = new Date()): AuthorizationDraft {
  const until = new Date(now);
  until.setDate(until.getDate() + 1);
  return {
    valid_from: localDateTimeInput(now),
    valid_until: localDateTimeInput(until),
    max_liters: "",
    max_amount: ""
  };
}

export function parseAuthorizationLimits(
  litersValue: string,
  amountValue: string
): { limits?: AuthorizationLimits; error?: string } {
  const litersText = litersValue.trim();
  const amountText = amountValue.trim();
  let max_liters: number | null = null;
  let max_amount_cents: number | null = null;

  if (litersText) {
    const parsed = Number(litersText);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100000) {
      return { error: "O limite em litros deve ser maior que zero e não ultrapassar 100.000 L." };
    }
    max_liters = Math.round(parsed * 1000) / 1000;
  }
  if (amountText) {
    const parsed = Number(amountText);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100000000) {
      return { error: "O limite financeiro deve ser maior que zero e não ultrapassar R$ 100.000.000,00." };
    }
    max_amount_cents = Math.round(parsed * 100);
    if (!Number.isSafeInteger(max_amount_cents) || max_amount_cents <= 0) {
      return { error: "Informe um limite financeiro válido." };
    }
  }
  return { limits: { max_liters, max_amount_cents } };
}

export function validateAuthorizationDraft(
  draft: AuthorizationDraft,
  now = new Date()
): { limits?: AuthorizationLimits; validFrom?: string; validUntil?: string; error?: string } {
  if (!draft.valid_from || !draft.valid_until) {
    return { error: "Informe a data inicial e final da autorização." };
  }
  const start = new Date(draft.valid_from);
  const end = new Date(draft.valid_until);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
    return { error: "Informe datas válidas para a autorização." };
  }
  if (end <= start) {
    return { error: "A validade final deve ser posterior à validade inicial." };
  }
  if (end <= now) {
    return { error: "A validade final precisa estar no futuro." };
  }
  const parsed = parseAuthorizationLimits(draft.max_liters, draft.max_amount);
  if (parsed.error || !parsed.limits) return { error: parsed.error };
  return {
    limits: parsed.limits,
    validFrom: start.toISOString(),
    validUntil: end.toISOString()
  };
}

export function isAuthorizationPendingSettlement(
  status: string,
  consumedLiters: number | string | null | undefined
): boolean {
  const consumed = Number(consumedLiters ?? 0);
  return status === "active" && Number.isFinite(consumed) && consumed <= 0;
}

export function authorizationWorkflowStatus(
  status: string,
  validFrom: string,
  validUntil: string,
  consumedLiters: number | string | null | undefined,
  now = new Date()
): { label: string; key: "active" | "inactive" | "cancelled" | "scheduled" | "expired" | "settled" } {
  if (status === "active" && Number(consumedLiters ?? 0) > 0) {
    return { label: "Concluída", key: "settled" };
  }
  return authorizationDisplayStatus(status, validFrom, validUntil, now);
}

export function authorizationConsumptionExceedsLimit(
  consumedLiters: number | string | null,
  consumedAmountCents: number | string | null,
  maxLiters: number | string | null,
  maxAmountCents: number | string | null
): boolean {
  const litersUsed = Number(consumedLiters ?? 0);
  const amountUsed = Number(consumedAmountCents ?? 0);
  const hasLitersLimit = maxLiters !== null && maxLiters !== "";
  const hasAmountLimit = maxAmountCents !== null && maxAmountCents !== "";

  return (
    (hasLitersLimit && Number.isFinite(litersUsed) && litersUsed > Number(maxLiters)) ||
    (hasAmountLimit && Number.isFinite(amountUsed) && amountUsed > Number(maxAmountCents))
  );
}

export function nextAuthorizationCode(existingCodes: readonly (string | null | undefined)[]): string {
  return nextSequentialCode(existingCodes, "AUT", 4);
}

export function authorizationDisplayStatus(
  status: string,
  validFrom: string,
  validUntil: string,
  now = new Date()
): { label: string; key: "active" | "inactive" | "cancelled" | "scheduled" | "expired" } {
  if (status === "cancelled") return { label: "Cancelada", key: "cancelled" };
  if (status === "inactive") return { label: "Inativa", key: "inactive" };
  if (now.getTime() < new Date(validFrom).getTime()) return { label: "Agendada", key: "scheduled" };
  if (now.getTime() > new Date(validUntil).getTime()) return { label: "Expirada", key: "expired" };
  return { label: "Válida", key: "active" };
}

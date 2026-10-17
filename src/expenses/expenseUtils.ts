export const EXPENSE_CATEGORIES = [
  "Pedágios",
  "Estacionamento",
  "Lavagem",
  "Seguro",
  "Documentação e taxas",
  "Multas",
  "Frete e transporte",
  "Hospedagem e diárias",
  "Telefone e comunicação",
  "Locação",
  "Material de consumo",
  "Outros"
] as const;

export function normalizeExpenseDescription(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR");
}

export function moneyToCents(value: string): number | null {
  if (!value.trim()) return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) return null;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export type ExpenseDuplicateCandidate = {
  id: string;
  description: string;
};

export function findMatchingExpense(
  description: string,
  candidates: ExpenseDuplicateCandidate[],
  excludeId: string | null = null
): ExpenseDuplicateCandidate | undefined {
  const normalized = normalizeExpenseDescription(description);
  if (!normalized) return undefined;
  return candidates.find(row => row.id !== excludeId && normalizeExpenseDescription(row.description) === normalized);
}

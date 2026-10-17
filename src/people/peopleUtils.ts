export function normalizeLookup(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

export function normalizeIdentity(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidOptionalEmail(value: string): boolean {
  const trimmed = value.trim();
  return !trimmed || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export type IdentityRow = { id: string; value: string | null | undefined };
export type NameRow = { id: string; name: string };

export function findDuplicateIdentity(value: string, rows: IdentityRow[], excludeId: string | null = null): IdentityRow | undefined {
  const key = normalizeIdentity(value);
  if (!key) return undefined;
  return rows.find(row => row.id !== excludeId && normalizeIdentity(row.value ?? "") === key);
}

export function findDuplicateName(value: string, rows: NameRow[], excludeId: string | null = null): NameRow | undefined {
  const key = normalizeLookup(value);
  if (!key) return undefined;
  return rows.find(row => row.id !== excludeId && normalizeLookup(row.name) === key);
}

export const SUPPLIER_TYPES = [
  { value: "fuel_station", label: "Posto / combustível" },
  { value: "maintenance", label: "Manutenção" },
  { value: "tire", label: "Pneus / recapagem" },
  { value: "parts", label: "Peças e materiais" },
  { value: "other", label: "Outros serviços" }
] as const;

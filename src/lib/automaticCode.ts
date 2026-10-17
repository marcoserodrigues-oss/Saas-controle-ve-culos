/**
 * Gera o próximo código sequencial de um prefixo considerando todos os códigos
 * visíveis da organização. A unicidade final é garantida pelos índices UNIQUE
 * do banco e pelos fluxos de retry no momento da gravação.
 */
export function nextSequentialCode(
  existingCodes: readonly (string | null | undefined)[],
  prefix: string,
  width = 4,
): string {
  const normalizedPrefix = prefix.trim();
  if (!normalizedPrefix) throw new Error("O prefixo do código não pode ficar vazio.");

  const escapedPrefix = normalizedPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escapedPrefix}-(\\d+)$`, "i");
  let highest = 0;

  for (const rawCode of existingCodes) {
    if (!rawCode) continue;
    const match = pattern.exec(rawCode.trim());
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isSafeInteger(value) && value > highest) highest = value;
  }

  return `${normalizedPrefix}-${String(highest + 1).padStart(Math.max(1, width), "0")}`;
}

import { describe, expect, it } from "vitest";
import { findDuplicateIdentity, findDuplicateName, isValidOptionalEmail, normalizeIdentity, normalizeLookup } from "./peopleUtils";

describe("people module validation helpers", () => {
  it("normalizes names without accents and repeated spacing", () => {
    expect(normalizeLookup("  OFICINA   SÃO JOSÉ ")).toBe("oficina sao jose");
  });

  it("normalizes tax ids and personal identifiers despite punctuation", () => {
    expect(normalizeIdentity("12.345.678/0001-90")).toBe("12345678000190");
    expect(normalizeIdentity("123.456.789-00")).toBe("12345678900");
  });

  it("detects duplicate names with different casing, accents and spacing", () => {
    const names = [{ id: "1", name: "Auto Peças São José" }];
    expect(findDuplicateName(" AUTO PECAS   SAO JOSE ", names)?.id).toBe("1");
    expect(findDuplicateName("Auto Peças São José", names, "1")).toBeUndefined();
    expect(findDuplicateName("Outro fornecedor", names)).toBeUndefined();
  });

  it("detects duplicate identifiers independent of punctuation", () => {
    const rows = [{ id: "1", value: "12.345.678/0001-90" }];
    expect(findDuplicateIdentity("12345678000190", rows)?.id).toBe("1");
    expect(findDuplicateIdentity("12345678000190", rows, "1")).toBeUndefined();
    expect(findDuplicateIdentity("98.765.432/0001-10", rows)).toBeUndefined();
  });

  it("accepts blank optional emails and rejects malformed addresses", () => {
    expect(isValidOptionalEmail("")).toBe(true);
    expect(isValidOptionalEmail(" motorista@empresa.com.br ")).toBe(true);
    expect(isValidOptionalEmail("sem-email")).toBe(false);
  });
});

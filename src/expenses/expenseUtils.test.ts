import { describe, expect, it } from "vitest";
import { findMatchingExpense, moneyToCents, normalizeExpenseDescription } from "./expenseUtils";

describe("expense utility functions", () => {
  it("normalizes accents, spaces and letter case for duplicate detection", () => {
    expect(normalizeExpenseDescription("  PEDÁGIO   BR-040 ")).toBe("pedagio br-040");
  });

  it("converts positive decimal currency amounts to integer cents", () => {
    expect(moneyToCents("123.45")).toBe(12345);
    expect(moneyToCents("0.10")).toBe(10);
  });

  it("rejects empty, invalid, zero and out-of-range currency amounts", () => {
    expect(moneyToCents("")).toBeNull();
    expect(moneyToCents("abc")).toBeNull();
    expect(moneyToCents("0")).toBeNull();
    expect(moneyToCents("-1")).toBeNull();
    expect(moneyToCents("100000001")).toBeNull();
  });

  it("finds an exact logical duplicate and can exclude the current entry", () => {
    const candidates = [{ id: "first", description: "Pedágio BR-040" }];
    expect(findMatchingExpense("PEDÁGIO  BR-040", candidates)?.id).toBe("first");
    expect(findMatchingExpense("PEDÁGIO  BR-040", candidates, "first")).toBeUndefined();
    expect(findMatchingExpense("Pedágio BR-381", candidates)).toBeUndefined();
  });
});

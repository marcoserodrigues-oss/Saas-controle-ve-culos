import { describe, expect, it } from "vitest";
import {
  authorizationConsumptionExceedsLimit,
  authorizationDisplayStatus,
  authorizationWorkflowStatus,
  isAuthorizationPendingSettlement,
  blankAuthorizationDraft,
  nextAuthorizationCode,
  parseAuthorizationLimits,
  validateAuthorizationDraft
} from "./fuelAuthorizationUtils";

describe("fuel authorization helpers", () => {
  it("generates unique-looking sequential authorization codes from existing values", () => {
    expect(nextAuthorizationCode(["AUT-0001", "AUT-0008", "OTHER-0009"])).toBe("AUT-0009");
  });

  it("allows authorizations without mandatory volume or financial limits", () => {
    expect(parseAuthorizationLimits("", "")).toMatchObject({ limits: { max_liters: null, max_amount_cents: null } });
    expect(parseAuthorizationLimits("0", "")).toMatchObject({ error: expect.any(String) });
    expect(parseAuthorizationLimits("150", "")).toMatchObject({ limits: { max_liters: 150, max_amount_cents: null } });
    expect(parseAuthorizationLimits("", "1250.50")).toMatchObject({ limits: { max_liters: null, max_amount_cents: 125050 } });
    expect(parseAuthorizationLimits("25", "300.25")).toMatchObject({ limits: { max_liters: 25, max_amount_cents: 30025 } });
  });

  it("keeps only active and unused authorizations pending settlement", () => {
    const now = new Date("2026-10-17T12:00:00.000Z");
    expect(isAuthorizationPendingSettlement("active", 0, "2026-10-16T00:00:00Z", now)).toBe(true);
    expect(isAuthorizationPendingSettlement("active", "0.000", "2026-10-15T00:00:00Z", now)).toBe(true);
    expect(isAuthorizationPendingSettlement("active", 25, "2026-10-16T00:00:00Z", now)).toBe(false);
    expect(isAuthorizationPendingSettlement("active", 0, "2026-10-18T00:00:00Z", now)).toBe(false);
    expect(isAuthorizationPendingSettlement("cancelled", 0, "2026-10-16T00:00:00Z", now)).toBe(false);
    expect(isAuthorizationPendingSettlement("inactive", 0, "2026-10-16T00:00:00Z", now)).toBe(false);
  });

  it("labels used authorizations as completed even when their validity window has passed", () => {
    const now = new Date("2026-10-17T12:00:00.000Z");
    expect(authorizationWorkflowStatus("active", "2026-10-15T00:00:00Z", "2026-10-16T00:00:00Z", 10, now))
      .toMatchObject({ label: "Concluída", key: "settled" });
    expect(authorizationWorkflowStatus("active", "2026-10-15T00:00:00Z", "2026-10-16T00:00:00Z", 0, now).key)
      .toBe("expired");
  });

  it("tracks actual consumption against only the limits that were configured", () => {
    expect(authorizationConsumptionExceedsLimit(50, 200000, null, null)).toBe(false);
    expect(authorizationConsumptionExceedsLimit(151, 100, 150, null)).toBe(true);
    expect(authorizationConsumptionExceedsLimit(20, 125100, null, 125000)).toBe(true);
    expect(authorizationConsumptionExceedsLimit(100, 125000, 100, 125000)).toBe(false);
  });

  it("validates future ending time and ordered validity window", () => {
    const now = new Date("2026-10-17T12:00:00.000Z");
    const draft = blankAuthorizationDraft(now);
    expect(validateAuthorizationDraft({ ...draft, max_liters: "200" }, now).error).toBeUndefined();
    expect(validateAuthorizationDraft({ ...draft, valid_until: draft.valid_from, max_liters: "200" }, now).error).toContain("posterior");
    expect(validateAuthorizationDraft({ ...draft, max_liters: "", max_amount: "" }, now).error).toBeUndefined();
  });

  it("reports authorization as cancelled, scheduled, expired or valid", () => {
    const now = new Date("2026-10-17T12:00:00.000Z");
    expect(authorizationDisplayStatus("cancelled", "2026-10-16T00:00:00Z", "2026-10-18T00:00:00Z", now).key).toBe("cancelled");
    expect(authorizationDisplayStatus("active", "2026-10-18T00:00:00Z", "2026-10-19T00:00:00Z", now).key).toBe("scheduled");
    expect(authorizationDisplayStatus("active", "2026-10-15T00:00:00Z", "2026-10-16T00:00:00Z", now).key).toBe("expired");
    expect(authorizationDisplayStatus("active", "2026-10-16T00:00:00Z", "2026-10-18T00:00:00Z", now).key).toBe("active");
  });
});

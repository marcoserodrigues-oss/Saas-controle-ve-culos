import { describe, expect, it } from "vitest";
import { createFuelAuthorizationPdf } from "./fuelAuthorizationPdf";
import type { FuelAuthorizationPdfData } from "./fuelAuthorizationPdf";

const sample: FuelAuthorizationPdfData = {
  authorization: {
    authorization_code: "AUT-0001",
    valid_from: "2026-10-17T12:00:00.000Z",
    valid_until: "2026-10-18T12:00:00.000Z",
    max_liters: 150,
    max_amount_cents: 85000,
    consumed_liters: 0,
    status: "active",
    created_at: "2026-10-17T11:00:00.000Z"
  },
  vehicle: { code: "VEI-0001", plate: "ABC1D23", description: "Caminhão de testes", fuel_type: "diesel", meter_kind: "odometer" },
  driver: { name: "João da Silva", license_number: "123456789", license_category: "E", license_expiry: "2028-12-31" },
  supplier: { name: "Posto São José", tax_id: "12.345.678/0001-90", phone: "3133334444" },
  organization: { name: "Frota Teste", legal_name: "Frota Teste Ltda.", tax_id: "98.765.432/0001-10" }
};

describe("fuel authorization PDF", () => {
  it("generates a valid PDF document buffer for download", () => {
    const pdf = createFuelAuthorizationPdf(sample);
    const output = pdf.output("arraybuffer");
    const header = new TextDecoder().decode(output.slice(0, 5));
    expect(header).toBe("%PDF-");
    expect(output.byteLength).toBeGreaterThan(1000);
  });

  it("preserves authorization details in the document's internal text stream", () => {
    const pdf = createFuelAuthorizationPdf(sample);
    const output = pdf.output();
    expect(output).toContain("AUT-0001");
    expect(output).toContain("AUTORIZACAO DE ABASTECIMENTO");
  });

  it("prints two detachable copies and blank fields for returned fueling data", () => {
    const output = createFuelAuthorizationPdf(sample).output();
    expect(output).toContain("VIA DO POSTO");
    expect(output).toContain("VIA DE RETORNO");
    expect(output).toContain("ODOMETRO");
    expect(output).toContain("LITROS");
    expect(output).toContain("PRECO POR LITRO");
    expect(output).toContain("VALOR TOTAL");
    expect(output).toContain("RECORTAR");
  });

  it("marks already settled authorizations as completed and not reusable", () => {
    const pdf = createFuelAuthorizationPdf({
      ...sample,
      authorization: { ...sample.authorization, consumed_liters: 35 }
    });
    expect(pdf.output()).toContain("CONCLU");
    expect(pdf.output()).toContain("Nao utilizar para novo abastecimento");
  });

  it("marks cancelled authorizations as not valid for use", () => {
    const pdf = createFuelAuthorizationPdf({
      ...sample,
      authorization: { ...sample.authorization, status: "cancelled" }
    });
    expect(pdf.output()).toContain("CANCELADA");
  });
});

import { jsPDF } from "jspdf";
import { authorizationDisplayStatus } from "./fuelAuthorizationUtils";

export type FuelAuthorizationPdfData = {
  authorization: {
    authorization_code: string;
    valid_from: string;
    valid_until: string;
    max_liters: number | string | null;
    max_amount_cents: number | string | null;
    status: string;
    created_at: string;
  };
  vehicle: {
    code: string;
    plate: string | null;
    description: string;
    fuel_type: string;
    meter_kind: string;
  } | null;
  driver: {
    name: string;
    license_number: string | null;
    license_category: string | null;
    license_expiry: string | null;
  } | null;
  supplier: {
    name: string;
    tax_id: string | null;
    phone: string | null;
  } | null;
  organization: {
    name: string;
    legal_name: string | null;
    tax_id: string | null;
  } | null;
};

const brl = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const liters = (value: number | string | null) => {
  if (value === null || value === "") return "Sem limite";
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(parsed) + " L"
    : "Sem limite";
};
const dateTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Nao informado"
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
};
const fuelLabels: Record<string, string> = {
  diesel: "Diesel", gasoline: "Gasolina", ethanol: "Etanol", gnv: "GNV", electric: "Eletrico", other: "Outro"
};

export function createFuelAuthorizationPdf(data: FuelAuthorizationPdfData): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 7;
  const copyWidth = pageWidth - margin * 2;
  const copyHeight = 137;
  const auth = data.authorization;
  const state = authorizationDisplayStatus(auth.status, auth.valid_from, auth.valid_until);
  const active = state.key === "active";
  const stateColors: Record<string, [number, number, number]> = {
    active: [5, 120, 87],
    scheduled: [29, 78, 216],
    expired: [180, 83, 9],
    inactive: [100, 116, 139],
    cancelled: [185, 28, 28]
  };
  const organization = data.organization;
  const vehicle = data.vehicle;
  const driver = data.driver;
  const supplier = data.supplier;
  const limitSummary = [
    auth.max_liters === null || auth.max_liters === "" ? null : "Ate " + liters(auth.max_liters),
    auth.max_amount_cents === null || auth.max_amount_cents === "" ? null : "Ate " + brl(Number(auth.max_amount_cents))
  ].filter(Boolean).join(" / ") || "Sem limite pre-fixado de litros ou valor";
  const issuedDate = dateTime(auth.created_at);

  const section = (
    top: number,
    copyLabel: string,
    returnCopy: boolean
  ) => {
    const x = margin;
    const w = copyWidth;
    const right = x + w;
    const labelColor: [number, number, number] = [100, 116, 139];
    const valueColor: [number, number, number] = [30, 41, 59];
    const colGap = 5;
    const twoCol = (w - 8 - colGap) / 2;
    const field = (label: string, value: string, fx: number, fy: number, fw: number) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.7);
      doc.setTextColor(...labelColor);
      doc.text(label.toLocaleUpperCase("pt-BR"), fx, fy);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...valueColor);
      const lines = doc.splitTextToSize(value || "Nao informado", fw);
      doc.text(lines.slice(0, 1), fx, fy + 4.1);
    };
    const blankField = (label: string, fx: number, fy: number, fw: number) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(5.6);
      doc.setTextColor(71, 85, 105);
      doc.text(label.toLocaleUpperCase("pt-BR"), fx, fy);
      doc.setDrawColor(100, 116, 139);
      doc.setLineWidth(0.25);
      doc.line(fx, fy + 8.8, fx + fw, fy + 8.8);
    };

    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.35);
    doc.roundedRect(x, top, w, copyHeight, 1.5, 1.5, "S");

    doc.setFillColor(20, 39, 74);
    doc.roundedRect(x + 0.4, top + 0.4, w - 0.8, 13, 1.2, 1.2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    doc.text("FLEETWISE", x + 4, top + 6.2);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.6);
    doc.text(copyLabel, right - 4, top + 5.1, { align: "right" });
    doc.setFontSize(5.8);
    doc.text(organization?.legal_name || organization?.name || "Organizacao", x + 4, top + 10.2);
    if (organization?.tax_id) {
      doc.text("CNPJ/CPF: " + organization.tax_id, right - 4, top + 10.2, { align: "right" });
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(20, 39, 74);
    doc.text("AUTORIZACAO DE ABASTECIMENTO", x + 4, top + 20.5);
    doc.setFontSize(11);
    doc.text(auth.authorization_code, right - 4, top + 20.5, { align: "right" });

    doc.setFillColor(...stateColors[state.key]);
    doc.roundedRect(right - 32, top + 22.8, 28, 6.3, 1.2, 1.2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(5.8);
    doc.setTextColor(255, 255, 255);
    doc.text(state.label.toLocaleUpperCase("pt-BR"), right - 18, top + 26.7, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(...labelColor);
    doc.text("Emitida: " + issuedDate, x + 4, top + 26.5);

    field("Veiculo / equipamento", vehicle?.description ?? "Ativo nao encontrado", x + 4, top + 33.4, twoCol);
    field("Placa / codigo", [vehicle?.plate, vehicle?.code].filter(Boolean).join(" / ") || "Nao informado", x + 4 + twoCol + colGap, top + 33.4, twoCol);
    field("Motorista autorizado", driver?.name ?? "Nao especificado", x + 4, top + 44.9, twoCol);
    field("Posto / fornecedor", supplier?.name ?? "A escolha conforme regras da empresa", x + 4 + twoCol + colGap, top + 44.9, twoCol);
    field("Validade", dateTime(auth.valid_from) + " ate " + dateTime(auth.valid_until), x + 4, top + 56.3, twoCol);
    field("Combustivel", fuelLabels[vehicle?.fuel_type ?? ""] ?? "Conforme cadastro do ativo", x + 4 + twoCol + colGap, top + 56.3, twoCol);

    doc.setFillColor(248, 250, 252);
    doc.roundedRect(x + 3, top + 63, w - 6, 7.3, 1, 1, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.1);
    doc.setTextColor(71, 85, 105);
    doc.text("Limites opcionais: " + limitSummary, x + 5, top + 67.7);

    doc.setDrawColor(226, 232, 240);
    doc.line(x + 3, top + 73, right - 3, top + 73);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(30, 64, 175);
    doc.text("DADOS DO ABASTECIMENTO — PREENCHER NO POSTO", x + 4, top + 79);

    const fx = x + 4;
    const usable = w - 8;
    const widths = [30, 43, 29, 41, 41];
    const gap = (usable - widths.reduce((sum, value) => sum + value, 0)) / 4;
    let pos = fx;
    const fields = [
      returnCopy ? "Data / hora" : "Data / hora",
      vehicle?.meter_kind === "hourmeter" ? "Horimetro (h)" : "Odometro (km)",
      "Litros",
      "Preco por litro (R$)",
      "Valor total (R$)"
    ];
    fields.forEach((label, i) => {
      blankField(label, pos, top + 86, widths[i]);
      pos += widths[i] + gap;
    });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(71, 85, 105);
    const instruction = active
      ? "Conferir o veiculo e a validade antes do abastecimento. Preencher os dados reais, colher as assinaturas e devolver a via de retorno a empresa."
      : "ATENCAO: documento " + state.label.toLocaleUpperCase("pt-BR") + ". Nao utilizar para novo abastecimento. Manter somente para historico.";
    doc.text(doc.splitTextToSize(instruction, w - 8).slice(0, 2), x + 4, top + 100);

    const signatureY = top + 117;
    const signatureWidth = (w - 16) / 2;
    doc.setDrawColor(100, 116, 139);
    doc.line(x + 4, signatureY, x + 4 + signatureWidth, signatureY);
    doc.line(right - 4 - signatureWidth, signatureY, right - 4, signatureY);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.7);
    doc.setTextColor(71, 85, 105);
    doc.text("Assinatura do motorista", x + 4 + signatureWidth / 2, signatureY + 4, { align: "center" });
    doc.text(
      returnCopy ? "Recebido / conferido pela empresa" : "Carimbo / assinatura do posto",
      right - 4 - signatureWidth / 2,
      signatureY + 4,
      { align: "center" }
    );

    doc.setFontSize(5.1);
    doc.setTextColor(100, 116, 139);
    doc.text("Documento gerado eletronicamente pelo Fleetwise.", x + 4, top + 131.2);
    doc.text(auth.authorization_code, right - 4, top + 131.2, { align: "right" });
  };

  section(5, "VIA DO POSTO — MANTER NO POSTO", false);

  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.45);
  doc.setLineDashPattern([1.8, 1.3], 0);
  doc.line(7, 148.5, pageWidth - 7, 148.5);
  doc.setLineDashPattern([], 0);
  doc.setFillColor(255, 255, 255);
  doc.rect(72, 145.8, 66, 5.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(71, 85, 105);
  doc.text("RECORTAR / PICOTAR NESTA LINHA", pageWidth / 2, 149.3, { align: "center" });

  section(155, "VIA DE RETORNO — DEVOLVER A EMPRESA", true);

  return doc;
}

export function downloadFuelAuthorizationPdf(data: FuelAuthorizationPdfData): void {
  const pdf = createFuelAuthorizationPdf(data);
  const safeCode = data.authorization.authorization_code.replace(/[^a-z0-9_-]/gi, "-");
  pdf.save("Autorizacao-abastecimento-" + safeCode + ".pdf");
}

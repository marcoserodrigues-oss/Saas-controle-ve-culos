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
  if (value === null || value === "") return "Sem limite informado";
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(parsed) + " L"
    : "Sem limite informado";
};
const dateTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Não informado"
    : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
};
const fuelLabels: Record<string, string> = {
  diesel: "Diesel", gasoline: "Gasolina", ethanol: "Etanol", gnv: "GNV", electric: "Elétrico", other: "Outro"
};

export function createFuelAuthorizationPdf(data: FuelAuthorizationPdfData): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const pageWidth = 210;
  const margin = 17;
  const contentWidth = pageWidth - margin * 2;
  const auth = data.authorization;
  const currentStatus = authorizationDisplayStatus(auth.status, auth.valid_from, auth.valid_until);
  const isUsable = currentStatus.key === "active";
  const statusColors: Record<string, [number, number, number]> = {
    active: [5, 120, 87],
    scheduled: [29, 78, 216],
    expired: [180, 83, 9],
    inactive: [100, 116, 139],
    cancelled: [185, 28, 28]
  };
  const statusColor = statusColors[currentStatus.key] ?? [100, 116, 139];

  doc.setFillColor(20, 39, 74);
  doc.rect(0, 0, pageWidth, 35, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.text("FLEETWISE", margin, 14);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("GESTAO INTELIGENTE DE FROTAS", margin, 20);
  const org = data.organization;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(doc.splitTextToSize(org?.legal_name || org?.name || "Organizacao", 105), pageWidth - margin, 12, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  if (org?.tax_id) doc.text("CNPJ/CPF: " + org.tax_id, pageWidth - margin, 22, { align: "right" });

  doc.setTextColor(20, 39, 74);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("AUTORIZACAO DE ABASTECIMENTO", margin, 47);
  doc.setDrawColor(219, 226, 234);
  doc.setLineWidth(0.4);
  doc.line(margin, 52, pageWidth - margin, 52);

  doc.setFontSize(10);
  doc.text("Numero da autorizacao", margin, 61);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(auth.authorization_code, margin, 69);
  doc.setFillColor(...statusColor);
  doc.roundedRect(pageWidth - margin - 36, 57, 36, 11, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(8);
  doc.text(currentStatus.label.toLocaleUpperCase("pt-BR"), pageWidth - margin - 18, 63.8, { align: "center" });
  doc.setTextColor(71, 85, 105);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text("Emitida em: " + dateTime(auth.created_at), margin, 76);

  let y = 86;
  const section = (title: string) => {
    doc.setFillColor(239, 246, 255);
    doc.roundedRect(margin, y, contentWidth, 7, 1.5, 1.5, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(30, 64, 175);
    doc.text(title, margin + 3, y + 4.7);
    y += 12;
  };
  const field = (label: string, value: string, x: number, rowY: number, width: number) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(label.toLocaleUpperCase("pt-BR"), x, rowY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    const lines = doc.splitTextToSize(value || "Nao informado", width);
    doc.text(lines.slice(0, 2), x, rowY + 5);
  };
  const colGap = 8;
  const colWidth = (contentWidth - colGap) / 2;
  section("ATIVO AUTORIZADO");
  field("Veiculo / equipamento", data.vehicle?.description ?? "Ativo nao encontrado", margin, y, colWidth);
  field("Codigo do ativo", data.vehicle?.code ?? "-", margin + colWidth + colGap, y, colWidth);
  y += 17;
  field("Placa / identificacao", data.vehicle?.plate ?? "Nao informada", margin, y, colWidth);
  field("Combustivel", fuelLabels[data.vehicle?.fuel_type ?? ""] ?? "Conforme cadastro do ativo", margin + colWidth + colGap, y, colWidth);
  y += 17;

  section("CONDUTOR E FORNECEDOR");
  field("Motorista autorizado", data.driver?.name ?? "Nao especificado", margin, y, colWidth);
  field("CNH / categoria", data.driver
    ? [data.driver.license_number, data.driver.license_category ? "Categoria " + data.driver.license_category : null].filter(Boolean).join(" - ") || "Nao informada"
    : "Nao especificada", margin + colWidth + colGap, y, colWidth);
  y += 17;
  field("Posto / fornecedor autorizado", data.supplier?.name ?? "Qualquer fornecedor", margin, y, colWidth);
  field("CNPJ/CPF do fornecedor", data.supplier?.tax_id ?? "Nao informado", margin + colWidth + colGap, y, colWidth);
  y += 18;

  section("LIMITES AUTORIZADOS");
  const amount = auth.max_amount_cents === null || auth.max_amount_cents === ""
    ? "Sem limite financeiro informado"
    : brl(Number(auth.max_amount_cents));
  field("Volume maximo", liters(auth.max_liters), margin, y, colWidth);
  field("Valor maximo autorizado", amount, margin + colWidth + colGap, y, colWidth);
  y += 19;

  section("PERIODO DE VALIDADE");
  field("Valida a partir de", dateTime(auth.valid_from), margin, y, colWidth);
  field("Valida ate", dateTime(auth.valid_until), margin + colWidth + colGap, y, colWidth);
  y += 21;

  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, contentWidth, 23, 2, 2, "FD");
  doc.setTextColor(51, 65, 85);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("CONDICOES DE UTILIZACAO", margin + 4, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  const conditions = isUsable
    ? "Documento valido somente para o ativo, condutor, fornecedor (quando indicado), limites e periodo descritos acima. O abastecimento realizado deve ser comprovado e registrado no sistema. Este documento nao substitui nota fiscal ou cupom fiscal."
    : "ATENCAO: esta autorizacao nao esta atualmente valida (" + currentStatus.label.toLocaleUpperCase("pt-BR") + "). Nao utilizar para novos abastecimentos. O documento foi mantido para fins de historico.";
  doc.text(doc.splitTextToSize(conditions, contentWidth - 8).slice(0, 3), margin + 4, y + 11);
  y += 34;

  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);
  doc.line(margin, y + 8, margin + 72, y + 8);
  doc.line(pageWidth - margin - 72, y + 8, pageWidth - margin, y + 8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  doc.setFontSize(8);
  doc.text("Responsavel pela autorizacao", margin + 36, y + 13, { align: "center" });
  doc.text("Assinatura do condutor", pageWidth - margin - 36, y + 13, { align: "center" });

  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text("Documento gerado eletronicamente pelo Fleetwise.", margin, 286);
  doc.text("Autorizacao: " + auth.authorization_code, pageWidth - margin, 286, { align: "right" });
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, 289, pageWidth - margin, 289);
  return doc;
}

export function downloadFuelAuthorizationPdf(data: FuelAuthorizationPdfData): void {
  const pdf = createFuelAuthorizationPdf(data);
  const safeCode = data.authorization.authorization_code.replace(/[^a-z0-9_-]/gi, "-");
  pdf.save("Autorizacao-abastecimento-" + safeCode + ".pdf");
}

import { describe, expect, it } from "vitest";
import { nextSequentialCode } from "./automaticCode";

describe("nextSequentialCode", () => {
  it("gera o próximo número sem repetir um código sequencial já existente", () => {
    expect(nextSequentialCode(["VEI-0001", "VEI-0002", "VEI-0009"], "VEI")).toBe("VEI-0010");
  });

  it("ignora códigos de outros prefixos e códigos manuais que não seguem a sequência", () => {
    expect(nextSequentialCode(["EQP-0040", "VEI-0003", "FROTA-ANTIGA"], "VEI")).toBe("VEI-0004");
  });

  it("reconhece diferenças de caixa e preserva o prefixo solicitado na saída", () => {
    expect(nextSequentialCode(["vei-0005", "VEI-0007"], "VEI")).toBe("VEI-0008");
  });

  it("suporta listas vazias e largura personalizada", () => {
    expect(nextSequentialCode([], "OS", 5)).toBe("OS-00001");
  });

  it("não confunde dígitos de sufixos que não têm o formato prefixo-numeração", () => {
    expect(nextSequentialCode(["VEI-X999", "X-VEI-0080", "VEI-0002"], "VEI")).toBe("VEI-0003");
  });
});

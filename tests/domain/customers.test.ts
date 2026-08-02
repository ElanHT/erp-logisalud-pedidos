import { describe, expect, it } from "vitest";
import { isCustomerOrderable } from "@/domain/customers";

describe("isCustomerOrderable", () => {
  it("un cliente PENDIENTE_DE_VALIDACION no debe poder usarse en pedidos (placeholder para Fase 4)", () => {
    expect(isCustomerOrderable("PENDIENTE_DE_VALIDACION")).toBe(false);
  });

  it("un cliente ACTIVO sí puede usarse en pedidos", () => {
    expect(isCustomerOrderable("ACTIVO")).toBe(true);
  });

  it("un cliente RECHAZADO o INACTIVO no debe poder usarse en pedidos", () => {
    expect(isCustomerOrderable("RECHAZADO")).toBe(false);
    expect(isCustomerOrderable("INACTIVO")).toBe(false);
  });
});

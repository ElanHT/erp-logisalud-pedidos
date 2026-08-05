import { describe, expect, it } from "vitest";
import {
  calculateLineItem,
  canEditPaymentTerms,
  computeAutomaticValidationOutcome,
  resolveOrderSellerFilter,
  resolveOrderSellerId,
  type OrderEstado,
} from "@/domain/orders";

describe("computeAutomaticValidationOutcome / calculateLineItem — feliz camino gravado", () => {
  it("un pedido gravado normal con cliente activo y condición de pago habitual llega a READY_FOR_OPERATIONS", () => {
    const line = calculateLineItem({
      cantidad: 10,
      precioVigente: 25.5,
      afectacionTributaria: "GRAVADO",
      tasaAplicable: 18,
    });
    expect(line).toEqual({ ok: true, subtotal: 255, igv: 45.9, total: 300.9 });

    const outcome = computeAutomaticValidationOutcome({
      customerEstado: "ACTIVO",
      orderPaymentTermsId: 1,
      customerCondicionPagoHabitualId: 1,
      hasPendingApprovalRequest: false,
    });
    expect(outcome).toBe("READY_FOR_OPERATIONS");
  });
});

describe("computeAutomaticValidationOutcome — cliente sin condición de pago habitual", () => {
  // La cartera real migrada entra con condicion_pago_habitual_id en null
  // a propósito. Sin habitual no hay contra qué comparar, así que
  // cualquier condición que elija el vendedor debe pasar sin excepción
  // administrativa. Espejo de 0043 en SQL.
  it("cualquier condición de pago se acepta sin excepción administrativa", () => {
    for (const orderPaymentTermsId of [1, 2, 99]) {
      expect(
        computeAutomaticValidationOutcome({
          customerEstado: "ACTIVO",
          orderPaymentTermsId,
          customerCondicionPagoHabitualId: null,
          hasPendingApprovalRequest: false,
        }),
      ).toBe("READY_FOR_OPERATIONS");
    }
  });

  it("sin habitual, una solicitud de descuento pendiente sigue mandando a excepción comercial", () => {
    expect(
      computeAutomaticValidationOutcome({
        customerEstado: "ACTIVO",
        orderPaymentTermsId: 3,
        customerCondicionPagoHabitualId: null,
        hasPendingApprovalRequest: true,
      }),
    ).toBe("COMMERCIAL_EXCEPTION");
  });

  it("sin habitual, un cliente pendiente de validación sigue teniendo precedencia", () => {
    expect(
      computeAutomaticValidationOutcome({
        customerEstado: "PENDIENTE_DE_VALIDACION",
        orderPaymentTermsId: 3,
        customerCondicionPagoHabitualId: null,
        hasPendingApprovalRequest: false,
      }),
    ).toBe("NEW_CUSTOMER_VALIDATION");
  });

  it("con habitual definida y distinta, sí dispara excepción administrativa", () => {
    expect(
      computeAutomaticValidationOutcome({
        customerEstado: "ACTIVO",
        orderPaymentTermsId: 2,
        customerCondicionPagoHabitualId: 1,
        hasPendingApprovalRequest: false,
      }),
    ).toBe("ADMINISTRATIVE_EXCEPTION");
  });
});

describe("resolveOrderSellerId — pedido creado por administrador a nombre de un vendedor", () => {
  it("el administrador usa el seller elegido en el selector", () => {
    expect(
      resolveOrderSellerId({ rol: "administrador", callerSellerId: null, selectedSellerId: "seller-X" }),
    ).toBe("seller-X");
  });

  it("el administrador sin seller elegido lanza error explícito (el selector es obligatorio)", () => {
    expect(() => resolveOrderSellerId({ rol: "administrador", callerSellerId: null })).toThrow();
  });

  it("un vendedor normal ignora cualquier selectedSellerId y siempre usa el suyo propio", () => {
    expect(
      resolveOrderSellerId({ rol: "vendedor", callerSellerId: "seller-Y", selectedSellerId: "seller-Z" }),
    ).toBe("seller-Y");
  });
});

describe("canEditPaymentTerms — condición de pago bloqueada tras el envío", () => {
  it("solo es editable en DRAFT", () => {
    expect(canEditPaymentTerms("DRAFT")).toBe(true);
  });

  const estadosBloqueados: OrderEstado[] = [
    "SUBMITTED",
    "NEW_CUSTOMER_VALIDATION",
    "ADMINISTRATIVE_EXCEPTION",
    "COMMERCIAL_EXCEPTION",
    "READY_FOR_OPERATIONS",
  ];
  it.each(estadosBloqueados)("no es editable en %s", (estado) => {
    expect(canEditPaymentTerms(estado)).toBe(false);
  });
});

describe("computeAutomaticValidationOutcome — cliente nuevo no pasa de SUBMITTED", () => {
  it("cliente PENDIENTE_DE_VALIDACION siempre da NEW_CUSTOMER_VALIDATION", () => {
    expect(
      computeAutomaticValidationOutcome({
        customerEstado: "PENDIENTE_DE_VALIDACION",
        orderPaymentTermsId: 1,
        customerCondicionPagoHabitualId: 1,
        hasPendingApprovalRequest: false,
      }),
    ).toBe("NEW_CUSTOMER_VALIDATION");
  });

  it("cliente nuevo tiene precedencia incluso combinado con condición de pago distinta Y solicitud pendiente", () => {
    expect(
      computeAutomaticValidationOutcome({
        customerEstado: "PENDIENTE_DE_VALIDACION",
        orderPaymentTermsId: 2,
        customerCondicionPagoHabitualId: 1,
        hasPendingApprovalRequest: true,
      }),
    ).toBe("NEW_CUSTOMER_VALIDATION");
  });
});

describe("computeAutomaticValidationOutcome — excepción administrativa (condición de pago distinta)", () => {
  it("condición de pago del pedido distinta de la habitual del cliente activo da ADMINISTRATIVE_EXCEPTION", () => {
    expect(
      computeAutomaticValidationOutcome({
        customerEstado: "ACTIVO",
        orderPaymentTermsId: 2,
        customerCondicionPagoHabitualId: 1,
        hasPendingApprovalRequest: false,
      }),
    ).toBe("ADMINISTRATIVE_EXCEPTION");
  });
});

describe("computeAutomaticValidationOutcome — solicitud de descuento bloquea el avance", () => {
  it("cliente activo con condición de pago habitual pero solicitud de descuento pendiente da COMMERCIAL_EXCEPTION", () => {
    expect(
      computeAutomaticValidationOutcome({
        customerEstado: "ACTIVO",
        orderPaymentTermsId: 1,
        customerCondicionPagoHabitualId: 1,
        hasPendingApprovalRequest: true,
      }),
    ).toBe("COMMERCIAL_EXCEPTION");
  });
});

describe("resolveOrderSellerFilter — vendedor no puede ver pedidos/clientes de otra zona (proxy)", () => {
  // Esto complementa, no reemplaza, la policy `orders_select` de
  // supabase/migrations/0033_orders_core.sql — no hay infraestructura de
  // Postgres local en este repo para testear la policy en sí; la
  // garantía real vive en RLS, este test solo fija el contrato de la
  // capa TS que arma la consulta.
  it("un vendedor siempre queda filtrado a su propio seller_id, sin importar qué pida", () => {
    expect(
      resolveOrderSellerFilter({ rol: "vendedor", callerSellerId: "seller-A", requestedSellerId: "seller-B" }),
    ).toBe("seller-A");
  });

  it("un administrador/control_pedidos/aprobador_comercial no queda filtrado", () => {
    expect(resolveOrderSellerFilter({ rol: "administrador", callerSellerId: null })).toBe("ALL");
  });
});

describe("calculateLineItem — manipulación de precio desde el navegador", () => {
  // La firma de calculateLineItem no tiene ningún parámetro que el
  // navegador pueda inventar (no recibe "precioUnitario", solo
  // "precioVigente"). En producción ese valor viene siempre de una
  // consulta server-side dentro de pedidos.submit_order (0036), que
  // además NO acepta precios como parámetro del RPC — así que ni
  // siquiera alguien que llame el RPC directamente (sin pasar por la
  // app) puede forzar un precio. La garantía fuerte vive ahí, no en
  // este test unitario.
  it("sin precio vigente, la línea se bloquea explícitamente en vez de asumir un precio", () => {
    const result = calculateLineItem({
      cantidad: 5,
      precioVigente: null,
      afectacionTributaria: "GRAVADO",
      tasaAplicable: 18,
    });
    expect(result).toEqual({ ok: false, reason: "NO_PRICE" });
  });

  it("un producto INAFECTO no cobra IGV aunque tenga tasaAplicable > 0", () => {
    const result = calculateLineItem({
      cantidad: 2,
      precioVigente: 10,
      afectacionTributaria: "INAFECTO",
      tasaAplicable: 18,
    });
    expect(result).toEqual({ ok: true, subtotal: 20, igv: 0, total: 20 });
  });
});

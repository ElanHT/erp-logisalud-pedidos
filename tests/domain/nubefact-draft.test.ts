import { describe, expect, it } from "vitest";
import {
  AVISO_BORRADOR,
  TIPO_DE_COMPROBANTE,
  TIPO_DE_DOCUMENTO_CLIENTE,
  buildComprobanteBorrador,
  buildGuiaRemisionBorrador,
  resolverTipoComprobante,
  type DraftFulfillmentData,
  type DraftItem,
  type DraftOrderData,
} from "@/domain/nubefact-draft";

function item(overrides: Partial<DraftItem> = {}): DraftItem {
  return {
    codigo: "DAPHA10-EJ",
    descripcion: "Dapha 10 mg x 30 tabletas",
    unidadMedida: "UND",
    cantidad: 10,
    precioUnitario: 25.5,
    igv: 45.9,
    subtotal: 255,
    total: 300.9,
    afectacionTributaria: "GRAVADO",
    tasaIgv: 18,
    pesoUnitario: 0.25,
    ...overrides,
  };
}

function data(overrides: Partial<DraftOrderData> = {}): DraftOrderData {
  return {
    numero: 1042,
    fechaEmision: "2026-08-06T14:30:00Z",
    cliente: {
      razonSocial: "CLINICA EJEMPLO S.A.C.",
      rucODocumento: "20100000001",
      direccion: "Av. Ejemplo 123, Surco",
    },
    vendedor: "LUIS VARGAS",
    condicionPago: "Crédito 30 días",
    tipoComprobantePermitido: "FACTURA",
    items: [item()],
    ...overrides,
  };
}

function fulfillment(overrides: Partial<DraftFulfillmentData> = {}): DraftFulfillmentData {
  return {
    fuenteStock: "Almacén Central Lima",
    almacen: "Almacén Central Lima",
    direccionPartida: null,
    vehiculo: null,
    chofer: null,
    transportista: "Transporte propio",
    fechaDespacho: "2026-08-06T18:00:00Z",
    ...overrides,
  };
}

describe("resolverTipoComprobante", () => {
  it("respeta al cliente que solo admite factura o solo boleta", () => {
    expect(resolverTipoComprobante("FACTURA")).toEqual({ tipo: "FACTURA", sinDefinir: false });
    expect(resolverTipoComprobante("BOLETA")).toEqual({ tipo: "BOLETA", sinDefinir: false });
  });

  // Hueco real: orders no guarda qué eligió el vendedor. No se adivina en
  // silencio — se marca sinDefinir para que el borrador lo advierta.
  it("marca sinDefinir cuando el cliente admite ambos", () => {
    expect(resolverTipoComprobante("FACTURA_O_BOLETA")).toEqual({
      tipo: "FACTURA",
      sinDefinir: true,
    });
  });
});

describe("buildComprobanteBorrador", () => {
  it("lleva el bloque _borrador con el aviso y la marca de quitarlo", () => {
    const { payload } = buildComprobanteBorrador(data());
    const borrador = payload._borrador as Record<string, unknown>;
    expect(borrador.aviso).toBe(AVISO_BORRADOR);
    expect(borrador.quitar_este_bloque_antes_de_enviar).toBe(true);
  });

  it("mapea factura y RUC a los códigos de NubeFact", () => {
    const { payload } = buildComprobanteBorrador(data());
    expect(payload.tipo_de_comprobante).toBe(TIPO_DE_COMPROBANTE.FACTURA);
    expect(payload.cliente_tipo_de_documento).toBe(TIPO_DE_DOCUMENTO_CLIENTE.RUC);
    expect(payload.operacion).toBe("generar_comprobante");
  });

  it("un documento que no es RUC va como DNI y boleta", () => {
    const { payload } = buildComprobanteBorrador(
      data({
        tipoComprobantePermitido: "BOLETA",
        cliente: { razonSocial: "PEREZ JUAN", rucODocumento: "00000000003", direccion: "Calle 1" },
      }),
    );
    expect(payload.tipo_de_comprobante).toBe(TIPO_DE_COMPROBANTE.BOLETA);
    expect(payload.cliente_tipo_de_documento).toBe(TIPO_DE_DOCUMENTO_CLIENTE.DNI);
  });

  it("advierte cuando el cliente admite ambos y nadie eligió", () => {
    const { advertencias } = buildComprobanteBorrador(
      data({ tipoComprobantePermitido: "FACTURA_O_BOLETA" }),
    );
    expect(advertencias.some((a) => a.includes("no registra cuál eligió el vendedor"))).toBe(true);
  });

  it("advierte si resolvió factura pero el documento no es RUC válido", () => {
    const { advertencias } = buildComprobanteBorrador(
      data({
        tipoComprobantePermitido: "FACTURA",
        cliente: { razonSocial: "X", rucODocumento: "12345678", direccion: "Calle 1" },
      }),
    );
    expect(advertencias.some((a) => a.includes("no es un RUC de contribuyente válido"))).toBe(true);
  });

  it("advierte siempre que serie y número son placeholder", () => {
    const { advertencias } = buildComprobanteBorrador(data());
    expect(advertencias.some((a) => a.includes("PLACEHOLDER"))).toBe(true);
  });

  it("suma gravada, inafecta, IGV y total sin recalcular las líneas", () => {
    const { payload } = buildComprobanteBorrador(
      data({
        items: [
          item(),
          item({
            codigo: "INAF-01",
            afectacionTributaria: "INAFECTO",
            igv: 0,
            subtotal: 20,
            total: 20,
            tasaIgv: 0,
          }),
        ],
      }),
    );
    expect(payload.total_gravada).toBe(255);
    expect(payload.total_inafecta).toBe(20);
    expect(payload.total_igv).toBe(45.9);
    expect(payload.total).toBe(320.9);
  });

  it("marca el tipo_de_igv distinto para gravado e inafecto", () => {
    const { payload } = buildComprobanteBorrador(
      data({ items: [item(), item({ afectacionTributaria: "INAFECTO", igv: 0, tasaIgv: 0 })] }),
    );
    const items = payload.items as Array<Record<string, unknown>>;
    expect(items[0].tipo_de_igv).toBe(1);
    expect(items[1].tipo_de_igv).toBe(8);
  });

  it("usa fecha dd-mm-yyyy en hora de Perú", () => {
    const { payload } = buildComprobanteBorrador(data({ fechaEmision: "2026-08-06T02:00:00Z" }));
    // 02:00 UTC del 6 es 21:00 del 5 en Lima.
    expect(payload.fecha_de_emision).toBe("05-08-2026");
  });
});

describe("buildGuiaRemisionBorrador", () => {
  it("transporte con transportista es público; con vehículo y chofer es privado", () => {
    const externo = buildGuiaRemisionBorrador(data(), fulfillment({ transportista: "Transportes X" }));
    expect(externo.payload.tipo_de_transporte).toBe("01");

    const propio = buildGuiaRemisionBorrador(
      data(),
      fulfillment({ transportista: null, vehiculo: "ABC-123", chofer: "Juan Perez" }),
    );
    expect(propio.payload.tipo_de_transporte).toBe("02");
    expect(propio.payload.transportista_placa_numero).toBe("ABC-123");
    expect(propio.payload.conductor_denominacion).toBe("Juan Perez");
  });

  it("advierte si el transporte propio no tiene vehículo o chofer completos", () => {
    const { advertencias } = buildGuiaRemisionBorrador(
      data(),
      fulfillment({ transportista: null, vehiculo: "ABC-123", chofer: null }),
    );
    expect(advertencias.some((a) => a.includes("placa y datos del conductor"))).toBe(true);
  });

  it("calcula el peso con lo que hay y advierte de los productos sin peso", () => {
    const { payload, advertencias } = buildGuiaRemisionBorrador(
      data({ items: [item({ pesoUnitario: 0.25 }), item({ codigo: "SIN-PESO", pesoUnitario: null })] }),
      fulfillment(),
    );
    expect(payload.peso_bruto_total).toBe(2.5);
    expect(advertencias.some((a) => a.includes("SIN-PESO"))).toBe(true);
  });

  it("advierte que no hay dirección de partida (el almacén no la guarda)", () => {
    const { advertencias } = buildGuiaRemisionBorrador(data(), fulfillment());
    expect(advertencias.some((a) => a.includes("dirección de partida"))).toBe(true);
  });

  it("usa la dirección del cliente como dirección de llegada", () => {
    const { payload } = buildGuiaRemisionBorrador(data(), fulfillment());
    expect(payload.direccion_de_llegada).toBe("Av. Ejemplo 123, Surco");
  });

  it("motivo de traslado es venta y lleva el bloque _borrador", () => {
    const { payload } = buildGuiaRemisionBorrador(data(), fulfillment());
    expect(payload.motivo_de_traslado).toBe("01");
    expect((payload._borrador as Record<string, unknown>).quitar_este_bloque_antes_de_enviar).toBe(
      true,
    );
  });
});

/**
 * Generación de BORRADORES de documentación electrónica (comprobante y
 * guía de remisión) con la estructura aproximada de la API de NubeFact.
 *
 * ⚠ NADA DE ESTO SE ENVÍA A NINGÚN SERVICIO. Es JSON local para que la
 * facturadora lo compare campo por campo contra el manual oficial.
 *
 * TODO — Pendiente: reemplazar generación de borrador por llamada real a la
 * API de NubeFact (POST a la ruta configurada con el token), una vez
 * confirmada la estructura exacta de campos contra el manual oficial y
 * rotado el token de forma segura (variables de entorno NUBEFACT_API_URL y
 * NUBEFACT_API_TOKEN, nunca en el repo).
 *
 * Los nombres de campo salen de la documentación pública de NubeFact y
 * están SIN CONFIRMAR. Cada payload lleva un bloque `_borrador` con las
 * advertencias que un humano tiene que resolver; ese bloque hay que
 * quitarlo antes de enviar nada de verdad.
 */

import { esRucContribuyenteValido, type TipoComprobantePermitido } from "./customers";

export const AVISO_BORRADOR =
  "BORRADOR SIN VALIDAR — generado localmente para revisión humana. No se envió a NubeFact. " +
  "Los nombres y códigos de campo están sin confirmar contra el manual oficial.";

/** NubeFact: 1 = Factura, 2 = Boleta. Sin confirmar. */
export const TIPO_DE_COMPROBANTE: Record<"FACTURA" | "BOLETA", number> = {
  FACTURA: 1,
  BOLETA: 2,
};

/** NubeFact: 6 = RUC, 1 = DNI. Sin confirmar. */
export const TIPO_DE_DOCUMENTO_CLIENTE = { RUC: 6, DNI: 1 } as const;

/**
 * Serie del comprobante. PLACEHOLDER: la serie real la autoriza SUNAT y se
 * configura en NubeFact, no la inventa esta app. Queda como advertencia en
 * el borrador.
 */
const SERIE_PLACEHOLDER: Record<"FACTURA" | "BOLETA", string> = {
  FACTURA: "F001",
  BOLETA: "B001",
};

export type DraftItem = {
  codigo: string;
  descripcion: string;
  unidadMedida: string;
  cantidad: number;
  /** Valor unitario sin IGV, tal como lo grabó submit_order. */
  precioUnitario: number;
  igv: number;
  subtotal: number;
  total: number;
  afectacionTributaria: "GRAVADO" | "INAFECTO";
  tasaIgv: number;
  /** Peso unitario, si el producto lo tiene registrado. */
  pesoUnitario: number | null;
};

export type DraftOrderData = {
  numero: number;
  fechaEmision: string;
  cliente: {
    razonSocial: string;
    rucODocumento: string;
    direccion: string | null;
  };
  vendedor: string | null;
  condicionPago: string | null;
  tipoComprobantePermitido: TipoComprobantePermitido;
  items: DraftItem[];
};

export type DraftFulfillmentData = {
  fuenteStock: string | null;
  almacen: string | null;
  direccionPartida: string | null;
  vehiculo: string | null;
  chofer: string | null;
  transportista: string | null;
  fechaDespacho: string | null;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fechaISO(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // NubeFact usa dd-mm-yyyy en fecha_de_emision, según la doc pública.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("day")}-${get("month")}-${get("year")}`;
}

/**
 * Qué comprobante corresponde.
 *
 * OJO — hueco real del modelo: `orders` NO guarda qué comprobante eligió el
 * vendedor. Hoy nadie lo elige al tomar el pedido. Así que:
 *  - si el cliente solo admite uno, ese es.
 *  - si admite FACTURA_O_BOLETA, no hay dato: se usa FACTURA y se emite una
 *    advertencia para que un humano lo confirme. No se adivina en silencio.
 */
export function resolverTipoComprobante(permitido: TipoComprobantePermitido): {
  tipo: "FACTURA" | "BOLETA";
  sinDefinir: boolean;
} {
  if (permitido === "FACTURA") return { tipo: "FACTURA", sinDefinir: false };
  if (permitido === "BOLETA") return { tipo: "BOLETA", sinDefinir: false };
  return { tipo: "FACTURA", sinDefinir: true };
}

export type DraftResult<T> = { payload: T; advertencias: string[] };

export function buildComprobanteBorrador(
  data: DraftOrderData,
): DraftResult<Record<string, unknown>> {
  const advertencias: string[] = [];
  const { tipo, sinDefinir } = resolverTipoComprobante(data.tipoComprobantePermitido);

  if (sinDefinir) {
    advertencias.push(
      "El cliente admite FACTURA o BOLETA y el pedido no registra cuál eligió el vendedor " +
        "(orders no tiene ese campo todavía). Se asumió FACTURA — confirmar antes de emitir.",
    );
  }

  const esRuc = esRucContribuyenteValido(data.cliente.rucODocumento);
  if (tipo === "FACTURA" && !esRuc) {
    advertencias.push(
      "Se resolvió FACTURA pero el documento del cliente no es un RUC de contribuyente válido. " +
        "SUNAT no admite factura sin RUC; corregir el documento o emitir boleta.",
    );
  }
  if (!data.cliente.direccion) {
    advertencias.push("El cliente no tiene dirección registrada en el comprobante.");
  }

  advertencias.push(
    `La serie "${SERIE_PLACEHOLDER[tipo]}" y el número ${data.numero} son PLACEHOLDER. ` +
      "La serie real la autoriza SUNAT y el correlativo fiscal lo lleva NubeFact; " +
      "orders.numero es el número interno del pedido, no el del comprobante.",
  );

  const totalGravada = round2(
    data.items.filter((i) => i.afectacionTributaria === "GRAVADO").reduce((s, i) => s + i.subtotal, 0),
  );
  const totalInafecta = round2(
    data.items.filter((i) => i.afectacionTributaria === "INAFECTO").reduce((s, i) => s + i.subtotal, 0),
  );
  const totalIgv = round2(data.items.reduce((s, i) => s + i.igv, 0));
  const total = round2(data.items.reduce((s, i) => s + i.total, 0));

  const payload = {
    _borrador: {
      aviso: AVISO_BORRADOR,
      generado_por: "erp-logisalud-pedidos",
      pedido_numero: data.numero,
      advertencias,
      quitar_este_bloque_antes_de_enviar: true,
    },
    operacion: "generar_comprobante",
    tipo_de_comprobante: TIPO_DE_COMPROBANTE[tipo],
    serie: SERIE_PLACEHOLDER[tipo],
    numero: data.numero,
    sunat_transaction: 1,
    cliente_tipo_de_documento: esRuc ? TIPO_DE_DOCUMENTO_CLIENTE.RUC : TIPO_DE_DOCUMENTO_CLIENTE.DNI,
    cliente_numero_de_documento: data.cliente.rucODocumento,
    cliente_denominacion: data.cliente.razonSocial,
    cliente_direccion: data.cliente.direccion ?? "",
    fecha_de_emision: fechaISO(data.fechaEmision),
    moneda: 1,
    porcentaje_de_igv: data.items[0]?.tasaIgv ?? 18,
    total_gravada: totalGravada,
    total_inafecta: totalInafecta,
    total_igv: totalIgv,
    total,
    // Referencias internas, no fiscales — útiles para que la facturadora
    // cruce el borrador con el pedido.
    observaciones: [
      `Pedido interno #${data.numero}`,
      data.vendedor ? `Vendedor: ${data.vendedor}` : null,
      data.condicionPago ? `Condición de pago: ${data.condicionPago}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    items: data.items.map((i) => ({
      unidad_de_medida: i.unidadMedida,
      codigo: i.codigo,
      descripcion: i.descripcion,
      cantidad: i.cantidad,
      valor_unitario: i.precioUnitario,
      precio_unitario: round2(i.precioUnitario * (1 + (i.afectacionTributaria === "GRAVADO" ? i.tasaIgv / 100 : 0))),
      subtotal: i.subtotal,
      tipo_de_igv: i.afectacionTributaria === "GRAVADO" ? 1 : 8,
      igv: i.igv,
      total: i.total,
    })),
  };

  return { payload, advertencias };
}

/** NubeFact GRE: 01 = venta. Sin confirmar. */
const MOTIVO_TRASLADO_VENTA = "01";
/** 01 = transporte público (tercero), 02 = privado (propio). Sin confirmar. */
const TIPO_TRANSPORTE = { PUBLICO: "01", PRIVADO: "02" } as const;

export function buildGuiaRemisionBorrador(
  data: DraftOrderData,
  fulfillment: DraftFulfillmentData,
): DraftResult<Record<string, unknown>> {
  const advertencias: string[] = [
    AVISO_BORRADOR,
    "La serie y el número de la guía son PLACEHOLDER; los autoriza SUNAT y los lleva NubeFact.",
  ];

  const esPropio = fulfillment.transportista === null;
  const tipoTransporte = esPropio ? TIPO_TRANSPORTE.PRIVADO : TIPO_TRANSPORTE.PUBLICO;

  if (esPropio && (!fulfillment.vehiculo || !fulfillment.chofer)) {
    advertencias.push(
      "Transporte privado sin vehículo o sin chofer completos; SUNAT exige placa y datos del conductor.",
    );
  }

  // El peso bruto es obligatorio en la GRE y hoy casi ningún producto tiene
  // peso registrado (products.peso_unitario_futuro es nullable y quedó sin
  // cargar). Se calcula con lo que hay y se avisa de lo que falta.
  const sinPeso = data.items.filter((i) => i.pesoUnitario === null);
  const pesoBrutoTotal = round2(
    data.items.reduce((s, i) => s + (i.pesoUnitario ?? 0) * i.cantidad, 0),
  );
  if (sinPeso.length > 0) {
    advertencias.push(
      `${sinPeso.length} de ${data.items.length} producto(s) no tienen peso unitario registrado ` +
        `(${sinPeso.map((i) => i.codigo).join(", ")}), así que peso_bruto_total (${pesoBrutoTotal}) ` +
        "está incompleto. SUNAT exige el peso bruto real en la guía.",
    );
  }
  if (!fulfillment.direccionPartida) {
    advertencias.push("No hay dirección de partida registrada (el almacén no tiene dirección).");
  }
  if (!data.cliente.direccion) {
    advertencias.push("El cliente no tiene dirección de llegada registrada.");
  }

  const esRuc = esRucContribuyenteValido(data.cliente.rucODocumento);

  const payload = {
    _borrador: {
      aviso: AVISO_BORRADOR,
      generado_por: "erp-logisalud-pedidos",
      pedido_numero: data.numero,
      advertencias,
      quitar_este_bloque_antes_de_enviar: true,
    },
    operacion: "generar_guia",
    tipo_de_comprobante: 7,
    serie: "T001",
    numero: data.numero,
    cliente_tipo_de_documento: esRuc ? TIPO_DE_DOCUMENTO_CLIENTE.RUC : TIPO_DE_DOCUMENTO_CLIENTE.DNI,
    cliente_numero_de_documento: data.cliente.rucODocumento,
    cliente_denominacion: data.cliente.razonSocial,
    cliente_destinatario: data.cliente.razonSocial,
    fecha_de_emision: fechaISO(fulfillment.fechaDespacho ?? data.fechaEmision),
    motivo_de_traslado: MOTIVO_TRASLADO_VENTA,
    peso_bruto_total: pesoBrutoTotal,
    peso_bruto_unidad_de_medida: "KGM",
    numero_de_bultos: data.items.length,
    tipo_de_transporte: tipoTransporte,
    fecha_de_inicio_de_traslado: fechaISO(fulfillment.fechaDespacho ?? data.fechaEmision),
    transportista_documento_tipo: esPropio ? "" : TIPO_DE_DOCUMENTO_CLIENTE.RUC,
    transportista_denominacion: fulfillment.transportista ?? "",
    transportista_placa_numero: esPropio ? (fulfillment.vehiculo ?? "") : "",
    conductor_denominacion: esPropio ? (fulfillment.chofer ?? "") : "",
    direccion_de_partida: fulfillment.direccionPartida ?? "",
    direccion_de_llegada: data.cliente.direccion ?? "",
    // Referencia interna para cruzar con el despacho.
    observaciones: [
      `Pedido interno #${data.numero}`,
      fulfillment.fuenteStock ? `Fuente: ${fulfillment.fuenteStock}` : null,
      fulfillment.almacen ? `Almacén: ${fulfillment.almacen}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
    items: data.items.map((i) => ({
      unidad_de_medida: i.unidadMedida,
      codigo: i.codigo,
      descripcion: i.descripcion,
      cantidad: i.cantidad,
    })),
  };

  return { payload, advertencias };
}

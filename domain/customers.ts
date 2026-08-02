export type CustomerEstado = "PENDIENTE_DE_VALIDACION" | "ACTIVO" | "RECHAZADO" | "INACTIVO";

/**
 * Un cliente solo puede usarse en un pedido si está ACTIVO. La
 * verificación real de esto ocurre en Fase 4 al crear el pedido; esta
 * función es la regla de dominio que esa fase deberá invocar.
 */
export function isCustomerOrderable(estado: CustomerEstado): boolean {
  return estado === "ACTIVO";
}

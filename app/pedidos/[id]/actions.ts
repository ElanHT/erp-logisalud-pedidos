"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import { addOrderItem, removeOrderItem, updatePaymentTerms, submitOrder } from "@/services/orders";
import { createApprovalRequest } from "@/services/approvals";
import { addOrderObservation } from "@/services/order-exceptions";

export async function agregarProducto(orderId: string, customerId: string, formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const cantidad = Number(formData.get("cantidad"));
  if (!productId) throw new Error("Selecciona un producto.");
  if (!cantidad || cantidad <= 0) throw new Error("Ingresa una cantidad válida.");

  const result = await addOrderItem({ orderId, customerId, productId, cantidad });
  if (!result.ok) {
    const messages: Record<string, string> = {
      NO_PRICE: "Este producto no tiene precio vigente para el canal del cliente.",
      NO_TAX_PROFILE: "Este producto no tiene perfil tributario vigente.",
      NO_CHANNEL: "El cliente no tiene canal de venta asignado.",
    };
    throw new Error(messages[result.reason]);
  }

  revalidatePath(`/pedidos/${orderId}`);
}

export async function quitarProducto(orderId: string, itemId: string) {
  await removeOrderItem(itemId);
  revalidatePath(`/pedidos/${orderId}`);
}

export async function actualizarCondicionPago(orderId: string, formData: FormData) {
  const userId = await requireUserId();
  const paymentTermsId = Number(formData.get("paymentTermsId"));
  if (!paymentTermsId) throw new Error("Selecciona una condición de pago.");
  await updatePaymentTerms(orderId, paymentTermsId, userId);
  revalidatePath(`/pedidos/${orderId}`);
}

export async function enviarPedido(orderId: string) {
  const userId = await requireUserId();
  const result = await submitOrder(orderId, userId);
  revalidatePath(`/pedidos/${orderId}`);
  return result;
}

export async function agregarObservacion(orderId: string, formData: FormData) {
  const userId = await requireUserId();
  const comentario = String(formData.get("comentario") ?? "").trim();
  if (!comentario) throw new Error("Escribe un comentario.");
  await addOrderObservation({ orderId, comentario, actor: userId });
  revalidatePath(`/pedidos/${orderId}`);
}

export async function solicitarDescuento(orderId: string, itemId: string, formData: FormData) {
  const userId = await requireUserId();
  const cantidad = Number(formData.get("cantidad"));
  const precioSolicitado = formData.get("precioSolicitado") ? Number(formData.get("precioSolicitado")) : undefined;
  const porcentajeDescuento = formData.get("porcentajeDescuento") ? Number(formData.get("porcentajeDescuento")) : undefined;
  const motivo = String(formData.get("motivo") ?? "").trim();

  if (!motivo) throw new Error("Explica el motivo de la solicitud.");
  if (!precioSolicitado && !porcentajeDescuento) throw new Error("Indica un precio solicitado o un porcentaje de descuento.");

  await createApprovalRequest({
    orderId,
    orderItemId: itemId,
    solicitadoPor: userId,
    cantidad,
    motivo,
    precioSolicitado,
    porcentajeDescuento,
    competenciaNegociacion: String(formData.get("competenciaNegociacion") ?? "").trim() || undefined,
    comentario: String(formData.get("comentario") ?? "").trim() || undefined,
  });

  revalidatePath(`/pedidos/${orderId}`);
}

"use server";

import { redirect } from "next/navigation";
import { getCurrentUser, requireUserId } from "@/lib/auth/session";
import { resolveOrderSellerId } from "@/domain/orders";
import { createDraftOrder } from "@/services/orders";
import { listCustomerAddresses } from "@/services/customers";

export async function getAddressesForCustomer(customerId: string) {
  return listCustomerAddresses(customerId);
}

export async function crearBorrador(formData: FormData) {
  const user = await getCurrentUser();
  const userId = await requireUserId();
  if (!user) throw new Error("No autenticado.");

  const isAdmin = user.roles.includes("administrador");
  const rol = isAdmin ? "administrador" : "vendedor";
  const selectedSellerId = String(formData.get("sellerId") ?? "") || null;

  const sellerId = resolveOrderSellerId({
    rol,
    callerSellerId: user.sellerId,
    selectedSellerId,
  });

  const customerId = String(formData.get("customerId") ?? "");
  const customerAddressId = String(formData.get("customerAddressId") ?? "");
  const paymentTermsId = Number(formData.get("paymentTermsId"));

  if (!customerId) throw new Error("Selecciona un cliente.");
  if (!customerAddressId) throw new Error("Selecciona una dirección.");
  if (!paymentTermsId) throw new Error("Selecciona una condición de pago.");

  const draft = await createDraftOrder({
    sellerId,
    creadoPor: userId,
    customerId,
    customerAddressId,
    paymentTermsId,
  });

  redirect(`/pedidos/${draft.id}`);
}

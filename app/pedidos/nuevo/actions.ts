"use server";

import { redirect } from "next/navigation";
import { getCurrentUser, requireUserId } from "@/lib/auth/session";
import { resolveOrderSellerId } from "@/domain/orders";
import { createDraftOrder } from "@/services/orders";
import { listCustomerAddresses, requestNewCustomer } from "@/services/customers";

export async function getAddressesForCustomer(customerId: string) {
  return listCustomerAddresses(customerId);
}

export async function crearClienteNuevo(input: {
  razonSocial: string;
  rucODocumento: string;
  canalId: number;
  zonaId: number;
  condicionPagoHabitualId: number;
  direccion: string;
}) {
  const userId = await requireUserId();

  const razonSocial = input.razonSocial.trim();
  const rucODocumento = input.rucODocumento.trim();
  const direccion = input.direccion.trim();

  if (!razonSocial) throw new Error("La razón social es requerida.");
  if (!rucODocumento) throw new Error("El RUC/documento es requerido.");
  if (!input.canalId) throw new Error("Selecciona un canal.");
  if (!input.zonaId) throw new Error("Selecciona una zona.");
  if (!input.condicionPagoHabitualId) throw new Error("Selecciona una condición de pago habitual.");
  if (!direccion) throw new Error("La dirección es requerida.");

  const { customer, addressId } = await requestNewCustomer({
    rucODocumento,
    razonSocial,
    canalId: input.canalId,
    zonaId: input.zonaId,
    condicionPagoHabitualId: input.condicionPagoHabitualId,
    direccion,
    solicitadoPor: userId,
  });

  return { customer, addressId };
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

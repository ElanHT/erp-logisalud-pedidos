"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/auth/session";
import { resolveCustomerValidation } from "@/services/customers";

export async function aprobarCliente(customerId: string) {
  const userId = await requireUserId();
  await resolveCustomerValidation(customerId, "ACTIVO", userId);
  revalidatePath("/control-pedidos/validacion-clientes");
}

export async function rechazarCliente(customerId: string) {
  const userId = await requireUserId();
  await resolveCustomerValidation(customerId, "RECHAZADO", userId);
  revalidatePath("/control-pedidos/validacion-clientes");
}

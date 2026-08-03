import "server-only";
import { createClient } from "@/lib/supabase/server";

export type PendingCustomer = {
  id: string;
  ruc_o_documento: string;
  razon_social: string;
  nombre_comercial: string | null;
  tipo_comprobante_permitido: string;
  es_agente_retencion: boolean;
  created_at: string;
  canal: { nombre: string } | null;
  zona: { nombre: string } | null;
  condicion_pago: { nombre: string } | null;
  customer_addresses: Array<{ direccion: string; ubigeo: string | null; es_principal: boolean }>;
};

export type ActiveCustomerOption = {
  id: string;
  razon_social: string;
  ruc_o_documento: string;
  canal_id: number | null;
  condicion_pago_habitual_id: number | null;
};

/**
 * Clientes ACTIVO visibles para el usuario actual (RLS ya limita por
 * zona si es vendedor, o muestra todos si es admin/control_pedidos —
 * ver customers_select en 0012_customers.sql). Usado por el selector de
 * cliente al tomar un pedido.
 */
export async function listActiveCustomers(): Promise<ActiveCustomerOption[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("customers")
    .select("id, razon_social, ruc_o_documento, canal_id, condicion_pago_habitual_id")
    .eq("estado", "ACTIVO")
    .order("razon_social");

  if (error) throw new Error(error.message);
  return data as unknown as ActiveCustomerOption[];
}

export async function listCustomerAddresses(customerId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("customer_addresses")
    .select("id, direccion, es_principal")
    .eq("customer_id", customerId)
    .eq("estado", "activo")
    .order("es_principal", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function listPendingCustomers(): Promise<PendingCustomer[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("customers")
    .select(
      `*,
      canal:sales_channels(nombre),
      zona:zones(nombre),
      condicion_pago:payment_terms(nombre),
      customer_addresses(direccion, ubigeo, es_principal)`,
    )
    .eq("estado", "PENDIENTE_DE_VALIDACION")
    .order("created_at");

  if (error) throw new Error(error.message);
  return data as unknown as PendingCustomer[];
}

export async function resolveCustomerValidation(
  customerId: string,
  decision: "ACTIVO" | "RECHAZADO",
  actor: string,
) {
  const supabase = createClient();

  // El cambio de estado en sí queda registrado por el trigger
  // customers_audit (ver 0017_master_data_audit_triggers.sql).
  const { data, error } = await supabase
    .from("customers")
    .update({
      estado: decision,
      validado_por: actor,
      fecha_validacion: new Date().toISOString(),
    })
    .eq("id", customerId)
    .select()
    .single();

  if (error) throw new Error(error.message);

  // Fase 4: todo pedido que quedó esperando a este cliente
  // (NEW_CUSTOMER_VALIDATION) se destraba con la misma decisión — si el
  // cliente quedó ACTIVO, se reevalúa la bifurcación (puede seguir a
  // READY_FOR_OPERATIONS o caer en otra excepción); si fue RECHAZADO, el
  // pedido vuelve a DRAFT (un cliente rechazado no puede seguir
  // avanzando solo).
  const { data: pendingOrders, error: pendingError } = await supabase
    .from("orders")
    .select("id")
    .eq("customer_id", customerId)
    .eq("estado", "NEW_CUSTOMER_VALIDATION");
  if (pendingError) throw new Error(pendingError.message);

  for (const order of pendingOrders ?? []) {
    if (decision === "ACTIVO") {
      const { error: rpcError } = await supabase.rpc("reevaluate_order", {
        p_order_id: order.id,
        p_motivo: "Cliente validado",
      });
      if (rpcError) throw new Error(rpcError.message);
    } else {
      const { error: rpcError } = await supabase.rpc("apply_order_transition", {
        p_order_id: order.id,
        p_estado_nuevo: "DRAFT",
        p_motivo: "Cliente rechazado",
      });
      if (rpcError) throw new Error(rpcError.message);
    }
  }

  return data;
}

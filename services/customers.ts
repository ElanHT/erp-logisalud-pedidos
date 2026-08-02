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
  return data;
}

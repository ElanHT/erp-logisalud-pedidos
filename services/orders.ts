import "server-only";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "./audit-log";
import { calculateLineItem, canEditPaymentTerms } from "@/domain/orders";

export type OrderSummary = {
  id: string;
  estado: string;
  fecha_creacion: string;
  fecha_envio: string | null;
  customer: { razon_social: string } | null;
  seller: { nombre_completo: string } | null;
};

export type OrderItemRow = {
  id: string;
  product_id: string;
  cantidad: number;
  precio_unitario: number;
  afectacion_tributaria: string;
  tasa_igv: number;
  subtotal: number;
  igv: number;
  total: number;
  product: { descripcion: string; codigo_interno: string } | null;
};

export type OrderStatusHistoryRow = {
  id: number;
  estado_anterior: string | null;
  estado_nuevo: string;
  motivo: string | null;
  fecha: string;
};

export type OrderObservationRow = {
  id: string;
  comentario: string;
  contexto: string | null;
  fecha: string;
  autor: string;
};

export type OrderDetail = OrderSummary & {
  seller_id: string;
  customer_id: string;
  customer_address_id: string;
  payment_terms_id: number;
  customer: { razon_social: string; canal_id: number | null; condicion_pago_habitual_id: number | null } | null;
  address: { direccion: string } | null;
  payment_terms: { nombre: string } | null;
  items: OrderItemRow[];
  history: OrderStatusHistoryRow[];
  observations: OrderObservationRow[];
};

const ORDER_SUMMARY_SELECT =
  "id, estado, fecha_creacion, fecha_envio, customer:customers(razon_social), seller:sellers(nombre_completo)";

export async function listMyDraftOrders(sellerId: string): Promise<OrderSummary[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_SUMMARY_SELECT)
    .eq("seller_id", sellerId)
    .eq("estado", "DRAFT")
    .order("fecha_creacion", { ascending: false });

  if (error) throw new Error(error.message);
  return data as unknown as OrderSummary[];
}

export async function listOrdersForSeller(sellerId: string): Promise<OrderSummary[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_SUMMARY_SELECT)
    .eq("seller_id", sellerId)
    .order("fecha_creacion", { ascending: false });

  if (error) throw new Error(error.message);
  return data as unknown as OrderSummary[];
}

export async function createDraftOrder(input: {
  sellerId: string;
  creadoPor: string;
  customerId: string;
  customerAddressId: string;
  paymentTermsId: number;
}) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("orders")
    .insert({
      seller_id: input.sellerId,
      creado_por: input.creadoPor,
      customer_id: input.customerId,
      customer_address_id: input.customerAddressId,
      payment_terms_id: input.paymentTermsId,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getOrderDetail(orderId: string): Promise<OrderDetail | null> {
  const supabase = createClient();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(
      `${ORDER_SUMMARY_SELECT}, seller_id, customer_id, customer_address_id, payment_terms_id,
      customer:customers(razon_social, canal_id, condicion_pago_habitual_id),
      address:customer_addresses(direccion),
      payment_terms:payment_terms(nombre)`,
    )
    .eq("id", orderId)
    .maybeSingle();

  if (orderError) throw new Error(orderError.message);
  if (!order) return null;

  const [{ data: items, error: itemsError }, { data: history, error: historyError }, { data: observations, error: observationsError }] =
    await Promise.all([
      supabase
        .from("order_items")
        .select("id, product_id, cantidad, precio_unitario, afectacion_tributaria, tasa_igv, subtotal, igv, total, product:products(descripcion, codigo_interno)")
        .eq("order_id", orderId),
      supabase
        .from("order_status_history")
        .select("id, estado_anterior, estado_nuevo, motivo, fecha")
        .eq("order_id", orderId)
        .order("fecha", { ascending: true }),
      supabase
        .from("order_observations")
        .select("id, comentario, contexto, fecha, autor")
        .eq("order_id", orderId)
        .order("fecha", { ascending: false }),
    ]);

  if (itemsError) throw new Error(itemsError.message);
  if (historyError) throw new Error(historyError.message);
  if (observationsError) throw new Error(observationsError.message);

  return {
    ...(order as unknown as OrderDetail),
    items: (items ?? []) as unknown as OrderItemRow[],
    history: (history ?? []) as unknown as OrderStatusHistoryRow[],
    observations: (observations ?? []) as unknown as OrderObservationRow[],
  };
}

export type AddOrderItemResult = { ok: true; itemId: string } | { ok: false; reason: "NO_PRICE" | "NO_TAX_PROFILE" | "NO_CHANNEL" };

/**
 * Agrega una línea al pedido en DRAFT. El precio mostrado acá es solo
 * para que el vendedor vea una referencia mientras arma el pedido — el
 * valor que realmente queda grabado lo decide pedidos.submit_order() en
 * el servidor al momento de enviar (ver domain/orders.ts).
 */
export async function addOrderItem(input: {
  orderId: string;
  customerId: string;
  productId: string;
  cantidad: number;
}): Promise<AddOrderItemResult> {
  const supabase = createClient();

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("canal_id")
    .eq("id", input.customerId)
    .single();
  if (customerError) throw new Error(customerError.message);
  if (!customer.canal_id) return { ok: false, reason: "NO_CHANNEL" };

  const { data: priceRow } = await supabase
    .from("price_list_items")
    .select("precio")
    .eq("product_id", input.productId)
    .eq("sales_channel_id", customer.canal_id)
    .is("vigente_hasta", null)
    .maybeSingle();
  if (!priceRow) return { ok: false, reason: "NO_PRICE" };

  const { data: taxProfile } = await supabase
    .from("product_tax_profiles")
    .select("afectacion_tributaria, tasa_aplicable")
    .eq("product_id", input.productId)
    .is("vigente_hasta", null)
    .maybeSingle();
  if (!taxProfile) return { ok: false, reason: "NO_TAX_PROFILE" };

  const line = calculateLineItem({
    cantidad: input.cantidad,
    precioVigente: priceRow.precio,
    afectacionTributaria: taxProfile.afectacion_tributaria as "GRAVADO" | "INAFECTO",
    tasaAplicable: taxProfile.tasa_aplicable,
  });
  if (!line.ok) return { ok: false, reason: "NO_PRICE" };

  const { data, error } = await supabase
    .from("order_items")
    .insert({
      order_id: input.orderId,
      product_id: input.productId,
      cantidad: input.cantidad,
      precio_unitario: priceRow.precio,
      afectacion_tributaria: taxProfile.afectacion_tributaria,
      tasa_igv: taxProfile.tasa_aplicable,
      subtotal: line.subtotal,
      igv: line.igv,
      total: line.total,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return { ok: true, itemId: data.id };
}

export async function removeOrderItem(itemId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("order_items").delete().eq("id", itemId);
  if (error) throw new Error(error.message);
}

export async function updatePaymentTerms(orderId: string, paymentTermsId: number, actor: string) {
  const supabase = createClient();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("estado, payment_terms_id")
    .eq("id", orderId)
    .single();
  if (orderError) throw new Error(orderError.message);
  if (!canEditPaymentTerms(order.estado as never)) {
    throw new Error("La condición de pago solo se puede editar mientras el pedido está en borrador.");
  }

  const { error } = await supabase.from("orders").update({ payment_terms_id: paymentTermsId }).eq("id", orderId);
  if (error) throw new Error(error.message);

  await logAudit({
    actor,
    accion: "cambiar_condicion_pago",
    entidad: "orders",
    entidadId: orderId,
    datosAntes: { payment_terms_id: order.payment_terms_id },
    datosDespues: { payment_terms_id: paymentTermsId },
  });
}

export type SubmitOrderResult = { estadoResultado: string; priceDrift: Array<{ orderItemId: string; precioAnterior: number; precioNuevo: number }> };

export async function submitOrder(orderId: string, actor: string): Promise<SubmitOrderResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("submit_order", { p_order_id: orderId, p_motivo: "Envío de pedido" });
  if (error) throw new Error(error.message);

  await logAudit({
    actor,
    accion: "enviar_pedido",
    entidad: "orders",
    entidadId: orderId,
    datosDespues: data,
  });

  return { estadoResultado: data.estadoResultado, priceDrift: data.priceDrift ?? [] };
}

export async function repeatLastOrder(sellerId: string, actor: string) {
  const supabase = createClient();
  const { data: last, error: lastError } = await supabase
    .from("orders")
    .select("id, customer_id, customer_address_id, payment_terms_id")
    .eq("seller_id", sellerId)
    .order("fecha_creacion", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) throw new Error(lastError.message);
  if (!last) throw new Error("No hay pedidos anteriores para repetir.");

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("product_id, cantidad")
    .eq("order_id", last.id);
  if (itemsError) throw new Error(itemsError.message);

  const draft = await createDraftOrder({
    sellerId,
    creadoPor: actor,
    customerId: last.customer_id,
    customerAddressId: last.customer_address_id,
    paymentTermsId: last.payment_terms_id,
  });

  for (const item of items ?? []) {
    await addOrderItem({ orderId: draft.id, customerId: last.customer_id, productId: item.product_id, cantidad: item.cantidad });
  }

  return draft;
}

import { notFound } from "next/navigation";
import { getOrderDetail } from "@/services/orders";
import Link from "next/link";
import { getFulfillmentForOrder } from "@/services/fulfillments";
import { getCurrentUser } from "@/lib/auth/session";
import { listProducts } from "@/services/products";
import { listCatalog } from "@/services/catalog";
import { OrderItemComposer } from "./order-item-composer";
import { ObservationForm } from "./observation-form";

const ESTADO_LABELS: Record<string, string> = {
  DRAFT: "Borrador",
  SUBMITTED: "Enviado",
  NEW_CUSTOMER_VALIDATION: "Esperando validación de cliente nuevo",
  ADMINISTRATIVE_EXCEPTION: "Excepción administrativa",
  COMMERCIAL_EXCEPTION: "Excepción comercial",
  READY_FOR_OPERATIONS: "Listo para operaciones",
  DISPATCHED: "Despachado",
};

export default async function OrderDetailPage({ params }: { params: { id: string } }) {
  const order = await getOrderDetail(params.id);
  if (!order) notFound();

  // Solo lectura para el vendedor: ve que su pedido salió y con qué, sin
  // poder editar nada (no hay policy de escritura para él en fulfillments).
  const fulfillment = order.estado === "DISPATCHED" ? await getFulfillmentForOrder(order.id) : null;

  // Los borradores de documentación electrónica los revisan administrador y
  // control_pedidos; el vendedor no tiene nada que hacer con ellos.
  const currentUser = await getCurrentUser();
  const puedeVerBorradores =
    order.estado === "DISPATCHED" &&
    (currentUser?.roles.includes("administrador") ||
      currentUser?.roles.includes("control_pedidos")) === true;

  const isDraft = order.estado === "DRAFT";

  const [products, paymentTerms] = await Promise.all([
    isDraft ? listProducts() : Promise.resolve([]),
    listCatalog("payment_terms"),
  ]);

  const activeProducts = products
    .filter((p) => p.estado === "activo" && p.hasCurrentPrice)
    .map((p) => ({ id: p.id, descripcion: p.descripcion, codigo_interno: p.codigo_interno }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold">{order.customer?.razon_social ?? "Pedido"}</h2>
          <span className="rounded-full bg-logisalud-green/10 px-3 py-1 text-xs font-medium text-logisalud-green">
            {ESTADO_LABELS[order.estado] ?? order.estado}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-600">
          Vendedor: {order.seller?.nombre_completo ?? "—"} · Dirección: {order.address?.direccion ?? "—"} · Condición de pago:{" "}
          {order.payment_terms?.nombre ?? "—"}
        </p>
      </div>

      {isDraft ? (
        <OrderItemComposer
          orderId={order.id}
          customerId={order.customer_id}
          items={order.items}
          products={activeProducts}
          paymentTerms={paymentTerms.map((p) => ({ id: p.id, nombre: p.nombre }))}
          currentPaymentTermsId={order.payment_terms_id}
        />
      ) : (
        <div className="card p-4">
          <h3 className="font-semibold text-logisalud-green">Productos</h3>
          <div className="mt-3 flex flex-col gap-2">
            {order.items.map((item) => (
              <div key={item.id} className="rounded-lg border border-gray-200 p-3">
                <p className="font-medium text-gray-900">{item.product?.descripcion}</p>
                <p className="text-sm text-gray-500">
                  {item.cantidad} x {item.precio_unitario.toFixed(4)} — Total: {item.total.toFixed(2)} (IGV {item.igv.toFixed(2)})
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {fulfillment && (
        <div className="card-highlight p-4">
          <h3 className="font-semibold text-logisalud-green">Despacho</h3>
          <p className="mt-2 text-sm text-gray-600">
            Despachado el{" "}
            {fulfillment.fecha_despacho
              ? new Date(fulfillment.fecha_despacho).toLocaleString("es-PE", {
                  timeZone: "America/Lima",
                })
              : "—"}
            {fulfillment.inventory_source && ` · ${fulfillment.inventory_source.nombre}`}
          </p>
          <p className="mt-1 text-sm text-gray-600">
            Transporte:{" "}
            {fulfillment.transporter?.nombre ??
              [fulfillment.vehicle?.nombre, fulfillment.driver?.nombre].filter(Boolean).join(" · ") ??
              "—"}
          </p>
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {fulfillment.fulfillment_items.map((fi, idx) => {
              const pedida = Number(fi.order_item?.cantidad ?? 0);
              const preparada = Number(fi.cantidad_preparada);
              return (
                <li key={idx} className={preparada !== pedida ? "text-amber-800" : "text-gray-700"}>
                  {fi.order_item?.product?.codigo_interno ?? "—"} · pedido {pedida} · despachado{" "}
                  {preparada}
                  {fi.motivo_diferencia && ` — ${fi.motivo_diferencia}`}
                  {fi.pendiente_de_stock && " — pendiente de stock"}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {puedeVerBorradores && (
        <div className="card p-4">
          <h3 className="font-semibold text-logisalud-green">Documentación electrónica</h3>
          <p className="mt-1 text-sm text-gray-600">
            Borradores generados al despachar, para revisar contra el manual de la facturadora. No
            se han enviado a ningún servicio.
          </p>
          <Link
            href={`/control-pedidos/documentos/${order.id}`}
            className="btn-secondary mt-3 inline-block text-sm"
          >
            Ver JSON de Factura/Boleta y Guía (borrador)
          </Link>
        </div>
      )}

      <div className="card p-4">
        <h3 className="font-semibold text-logisalud-green">Historial de estados</h3>
        {order.history.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">Sin cambios de estado todavía.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2 text-sm">
            {order.history.map((h) => (
              <div key={h.id} className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0">
                <span>
                  {h.estado_anterior ?? "—"} → {h.estado_nuevo}
                  {h.motivo ? ` — ${h.motivo}` : ""}
                </span>
                <span className="text-gray-500">{new Date(h.fecha).toLocaleString("es-PE")}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-4">
        <h3 className="font-semibold text-logisalud-green">Observaciones</h3>
        {order.observations.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">Sin observaciones.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2 text-sm">
            {order.observations.map((o) => (
              <div key={o.id} className="border-b border-gray-100 pb-2 last:border-0">
                <p>{o.comentario}</p>
                <p className="text-gray-500">{new Date(o.fecha).toLocaleString("es-PE")}</p>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3">
          <ObservationForm orderId={order.id} />
        </div>
      </div>
    </div>
  );
}

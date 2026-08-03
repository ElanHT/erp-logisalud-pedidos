"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  agregarProducto,
  quitarProducto,
  actualizarCondicionPago,
  enviarPedido,
  solicitarDescuento,
} from "./actions";

type Product = { id: string; descripcion: string; codigo_interno: string };
type OrderItem = {
  id: string;
  product_id: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  igv: number;
  total: number;
  product: { descripcion: string; codigo_interno: string } | null;
};
type PaymentTerm = { id: number; nombre: string };

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function OrderItemComposer({
  orderId,
  customerId,
  items,
  products,
  paymentTerms,
  currentPaymentTermsId,
}: {
  orderId: string;
  customerId: string;
  items: OrderItem[];
  products: Product[];
  paymentTerms: PaymentTerm[];
  currentPaymentTermsId: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [submitResult, setSubmitResult] = useState<{ estadoResultado: string; priceDrift: Array<{ orderItemId: string; precioAnterior: number; precioNuevo: number }> } | null>(null);
  const [discountFormItemId, setDiscountFormItemId] = useState<string | null>(null);

  const filteredProducts = useMemo(() => {
    if (!productQuery.trim()) return [];
    const q = normalize(productQuery);
    return products.filter((p) => normalize(p.descripcion).includes(q) || normalize(p.codigo_interno).includes(q)).slice(0, 15);
  }, [products, productQuery]);

  function handleAddProduct(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await agregarProducto(orderId, customerId, formData);
        (e.target as HTMLFormElement).reset();
        setProductQuery("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo agregar el producto.");
      }
    });
  }

  function handleRemove(itemId: string) {
    startTransition(async () => {
      await quitarProducto(orderId, itemId);
    });
  }

  function handlePaymentTerms(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await actualizarCondicionPago(orderId, formData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo actualizar la condición de pago.");
      }
    });
  }

  function handleDiscountRequest(itemId: string, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await solicitarDescuento(orderId, itemId, formData);
        setDiscountFormItemId(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo registrar la solicitud.");
      }
    });
  }

  function handleSubmitOrder() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await enviarPedido(orderId);
        setSubmitResult(result);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo enviar el pedido.");
      }
    });
  }

  const totalPedido = items.reduce((acc, item) => acc + item.total, 0);

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {submitResult && (
        <div className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
          <p>Pedido enviado. Estado resultante: {submitResult.estadoResultado}.</p>
          {submitResult.priceDrift.length > 0 && (
            <p className="mt-1 text-amber-700">
              El precio de {submitResult.priceDrift.length} línea(s) cambió desde que armaste el borrador — ya quedó
              actualizado al precio vigente.
            </p>
          )}
        </div>
      )}

      <form onSubmit={handlePaymentTerms} className="card flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Condición de pago</label>
          <select name="paymentTermsId" defaultValue={currentPaymentTermsId} className="min-h-12 rounded-lg border border-gray-300 px-3 py-2">
            {paymentTerms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-secondary" disabled={isPending}>
          Actualizar
        </button>
      </form>

      <form onSubmit={handleAddProduct} className="card flex flex-col gap-3 p-4">
        <h3 className="font-semibold text-logisalud-green">Agregar producto</h3>
        <input
          type="text"
          value={productQuery}
          onChange={(e) => setProductQuery(e.target.value)}
          placeholder="Buscar producto por nombre o código..."
          className="min-h-12 rounded-lg border border-gray-300 px-3 py-2"
        />
        {filteredProducts.length > 0 && (
          <select name="productId" required className="min-h-12 rounded-lg border border-gray-300 px-3 py-2">
            <option value="">Selecciona un producto</option>
            {filteredProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.descripcion} ({p.codigo_interno})
              </option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-3">
          <input
            name="cantidad"
            type="number"
            min="1"
            step="1"
            placeholder="Cantidad"
            required
            className="min-h-12 w-32 rounded-lg border border-gray-300 px-3 py-2"
          />
          <button type="submit" className="btn-secondary" disabled={isPending}>
            Agregar
          </button>
        </div>
      </form>

      <div className="card p-4">
        <h3 className="font-semibold text-logisalud-green">Productos</h3>
        {items.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">Todavía no agregaste productos.</p>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {items.map((item) => (
              <div key={item.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">{item.product?.descripcion}</p>
                    <p className="text-sm text-gray-500">
                      {item.cantidad} x {item.precio_unitario.toFixed(4)} — Total: {item.total.toFixed(2)} (IGV {item.igv.toFixed(2)})
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDiscountFormItemId(discountFormItemId === item.id ? null : item.id)}
                      className="text-sm text-logisalud-teal hover:underline"
                    >
                      Solicitar precio especial
                    </button>
                    <button type="button" onClick={() => handleRemove(item.id)} className="text-sm text-red-600 hover:underline" disabled={isPending}>
                      Quitar
                    </button>
                  </div>
                </div>

                {discountFormItemId === item.id && (
                  <form onSubmit={(e) => handleDiscountRequest(item.id, e)} className="mt-3 flex flex-col gap-2 rounded-lg bg-gray-50 p-3">
                    <input type="hidden" name="cantidad" value={item.cantidad} />
                    <div className="flex flex-wrap gap-2">
                      <input name="precioSolicitado" type="number" step="0.0001" placeholder="Precio solicitado" className="min-h-10 rounded-lg border border-gray-300 px-2 py-1 text-sm" />
                      <span className="self-center text-sm text-gray-500">o</span>
                      <input name="porcentajeDescuento" type="number" step="0.01" placeholder="% descuento" className="min-h-10 rounded-lg border border-gray-300 px-2 py-1 text-sm" />
                    </div>
                    <textarea name="motivo" required placeholder="Motivo" className="rounded-lg border border-gray-300 px-2 py-1 text-sm" />
                    <input name="competenciaNegociacion" placeholder="Competencia / negociación (opcional)" className="min-h-10 rounded-lg border border-gray-300 px-2 py-1 text-sm" />
                    <input name="comentario" placeholder="Comentario (opcional)" className="min-h-10 rounded-lg border border-gray-300 px-2 py-1 text-sm" />
                    <button type="submit" className="btn-secondary self-start text-sm" disabled={isPending}>
                      Enviar solicitud
                    </button>
                  </form>
                )}
              </div>
            ))}
            <p className="mt-2 text-right font-semibold text-gray-900">Total: {totalPedido.toFixed(2)}</p>
          </div>
        )}
      </div>

      <button type="button" onClick={handleSubmitOrder} className="btn-primary" disabled={isPending || items.length === 0}>
        Enviar pedido
      </button>
    </div>
  );
}

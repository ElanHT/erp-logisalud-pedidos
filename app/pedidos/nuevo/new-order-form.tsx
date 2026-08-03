"use client";

import { useMemo, useState, useTransition } from "react";
import { crearBorrador, getAddressesForCustomer } from "./actions";

type Seller = { id: string; codigo_representante: string; nombre_completo: string; zone: { nombre: string } | null };
type Customer = { id: string; razon_social: string; ruc_o_documento: string };
type PaymentTerm = { id: number; nombre: string };
type Address = { id: string; direccion: string; es_principal: boolean };

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

export function NewOrderForm({
  isAdmin,
  sellers,
  customers,
  paymentTerms,
}: {
  isAdmin: boolean;
  sellers: Seller[];
  customers: Customer[];
  paymentTerms: PaymentTerm[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);

  const filteredCustomers = useMemo(() => {
    if (!customerQuery.trim()) return customers.slice(0, 20);
    const q = normalize(customerQuery);
    return customers.filter((c) => normalize(c.razon_social).includes(q) || normalize(c.ruc_o_documento).includes(q)).slice(0, 20);
  }, [customers, customerQuery]);

  function handleSelectCustomer(customerId: string) {
    setSelectedCustomerId(customerId);
    setAddresses([]);
    if (!customerId) return;
    setLoadingAddresses(true);
    startTransition(async () => {
      try {
        const result = await getAddressesForCustomer(customerId);
        setAddresses(result as Address[]);
      } finally {
        setLoadingAddresses(false);
      }
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await crearBorrador(formData);
      } catch (err) {
        if (err instanceof Error && err.message === "NEXT_REDIRECT") return;
        setError(err instanceof Error ? err.message : "No se pudo crear el pedido.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="card flex flex-col gap-4 p-5">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {isAdmin && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">A nombre de qué vendedor/zona</label>
          <select name="sellerId" required className="min-h-12 w-full rounded-lg border border-gray-300 px-3 py-2">
            <option value="">Selecciona un vendedor</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre_completo} {s.zone ? `— ${s.zone.nombre}` : ""} ({s.codigo_representante})
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Cliente</label>
        <input
          type="text"
          value={customerQuery}
          onChange={(e) => setCustomerQuery(e.target.value)}
          placeholder="Buscar por razón social o RUC..."
          className="mb-2 min-h-12 w-full rounded-lg border border-gray-300 px-3 py-2"
        />
        <select
          name="customerId"
          required
          value={selectedCustomerId}
          onChange={(e) => handleSelectCustomer(e.target.value)}
          className="min-h-12 w-full rounded-lg border border-gray-300 px-3 py-2"
        >
          <option value="">Selecciona un cliente</option>
          {filteredCustomers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.razon_social} ({c.ruc_o_documento})
            </option>
          ))}
        </select>
        {customers.length === 0 && (
          <p className="mt-1 text-sm text-gray-500">No hay clientes activos visibles para tu zona.</p>
        )}
      </div>

      {selectedCustomerId && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Dirección de entrega</label>
          {loadingAddresses ? (
            <p className="text-sm text-gray-500">Cargando direcciones...</p>
          ) : (
            <select name="customerAddressId" required className="min-h-12 w-full rounded-lg border border-gray-300 px-3 py-2">
              <option value="">Selecciona una dirección</option>
              {addresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.direccion} {a.es_principal ? "(principal)" : ""}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Condición de pago</label>
        <select name="paymentTermsId" required className="min-h-12 w-full rounded-lg border border-gray-300 px-3 py-2">
          <option value="">Selecciona una condición de pago</option>
          {paymentTerms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </div>

      <button type="submit" className="btn-primary" disabled={isPending}>
        Crear borrador y continuar
      </button>
    </form>
  );
}

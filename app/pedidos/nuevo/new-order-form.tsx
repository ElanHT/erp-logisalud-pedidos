"use client";

import { useMemo, useState, useTransition } from "react";
import { Combobox, type ComboboxOption } from "@/components/combobox";
import { MENSAJE_SIN_DIRECCION } from "@/domain/customers";
import { MIN_SEARCH_LENGTH, displayRazonSocial } from "@/domain/customer-search";
import {
  agregarDireccionCliente,
  buscarClientes,
  crearBorrador,
  crearClienteNuevo,
  getAddressesForCustomer,
} from "./actions";

type Seller = { id: string; codigo_representante: string; nombre_completo: string; zone: { nombre: string } | null };
type Customer = {
  id: string;
  razon_social: string;
  nombre_comercial?: string | null;
  ruc_o_documento: string;
};
type PaymentTerm = { id: number; nombre: string };
type CatalogOption = { id: number; nombre: string };
type Address = { id: string; direccion: string; es_principal: boolean };

/**
 * Un cliente como opción del combobox: el nombre limpio arriba (sin los
 * asteriscos que arrastra la cartera legacy) y el RUC abajo, que es el
 * otro dato por el que el vendedor lo reconoce.
 */
function toOption(c: Customer): ComboboxOption {
  const nombre = displayRazonSocial(c.razon_social);
  const comercial = c.nombre_comercial?.trim();
  const alias = comercial && comercial.toUpperCase() !== nombre.toUpperCase() ? ` — ${comercial}` : "";
  return { id: c.id, label: `${nombre}${alias}`, description: c.ruc_o_documento };
}

export function NewOrderForm({
  isAdmin,
  sellers,
  customers: initialCustomers,
  paymentTerms,
  salesChannels,
  zones,
}: {
  isAdmin: boolean;
  sellers: Seller[];
  customers: Customer[];
  paymentTerms: PaymentTerm[];
  salesChannels: CatalogOption[];
  zones: CatalogOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [selectedOption, setSelectedOption] = useState<ComboboxOption | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerError, setNewCustomerError] = useState<string | null>(null);
  const [newAddress, setNewAddress] = useState({ direccion: "", referencia: "" });
  const [newAddressError, setNewAddressError] = useState<string | null>(null);
  const [newCustomer, setNewCustomer] = useState({
    razonSocial: "",
    rucODocumento: "",
    canalId: "",
    zonaId: "",
    condicionPagoHabitualId: "",
    direccion: "",
  });

  function updateNewCustomer(field: keyof typeof newCustomer, value: string) {
    setNewCustomer((prev) => ({ ...prev, [field]: value }));
  }

  // Cliente elegido, direcciones ya cargadas, y ninguna: el pedido queda
  // bloqueado hasta registrar una.
  const sinDireccion = !!selectedCustomerId && !loadingAddresses && addresses.length === 0;

  const initialOptions = useMemo(() => initialCustomers.map(toOption), [initialCustomers]);

  /**
   * Búsqueda real, en el SERVIDOR. No se filtra sobre una lista
   * precargada: son 3.4k clientes, PostgREST corta en 1.000 filas y el
   * resto quedaba invisible para el buscador (era el bug anterior). El
   * debounce y el descarte de respuestas viejas los hace el Combobox.
   */
  async function searchOptions(term: string): Promise<ComboboxOption[]> {
    const results = await buscarClientes(term);
    return results.map(toOption);
  }

  function handleAddAddress() {
    setNewAddressError(null);
    startTransition(async () => {
      try {
        const created = await agregarDireccionCliente({
          customerId: selectedCustomerId,
          direccion: newAddress.direccion,
          referencia: newAddress.referencia,
        });
        setAddresses((prev) => [...prev, created]);
        setSelectedAddressId(created.id);
        setNewAddress({ direccion: "", referencia: "" });
      } catch (err) {
        setNewAddressError(err instanceof Error ? err.message : "No se pudo guardar la dirección.");
      }
    });
  }

  function handleSelectCustomer(option: ComboboxOption | null) {
    const customerId = option?.id ?? "";
    setSelectedOption(option);
    setSelectedCustomerId(customerId);
    setAddresses([]);
    setSelectedAddressId("");
    setNewAddressError(null);
    setNewAddress({ direccion: "", referencia: "" });
    if (!customerId) return;
    setLoadingAddresses(true);
    startTransition(async () => {
      try {
        const result = (await getAddressesForCustomer(customerId)) as Address[];
        setAddresses(result);
        if (result.length === 1) setSelectedAddressId(result[0].id);
      } finally {
        setLoadingAddresses(false);
      }
    });
  }

  function handleCreateCustomer() {
    setNewCustomerError(null);
    startTransition(async () => {
      try {
        const { customer, addressId } = await crearClienteNuevo({
          razonSocial: newCustomer.razonSocial,
          rucODocumento: newCustomer.rucODocumento,
          canalId: Number(newCustomer.canalId),
          zonaId: Number(newCustomer.zonaId),
          condicionPagoHabitualId: Number(newCustomer.condicionPagoHabitualId),
          direccion: newCustomer.direccion,
        });
        // El cliente recién creado queda elegido en el mismo campo.
        setSelectedOption(toOption(customer));
        setSelectedCustomerId(customer.id);
        setAddresses([{ id: addressId, direccion: newCustomer.direccion, es_principal: true }]);
        setSelectedAddressId(addressId);
        setShowNewCustomerForm(false);
        setNewCustomer({ razonSocial: "", rucODocumento: "", canalId: "", zonaId: "", condicionPagoHabitualId: "", direccion: "" });
      } catch (err) {
        setNewCustomerError(err instanceof Error ? err.message : "No se pudo registrar el cliente.");
      }
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    // El combobox no usa `required` nativo (ver components/combobox.tsx),
    // así que el cliente se valida acá. La Server Action lo revalida.
    if (!selectedCustomerId) {
      setError("Selecciona un cliente.");
      return;
    }
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
        <div className="mb-1 flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">Cliente</label>
          <button
            type="button"
            onClick={() => setShowNewCustomerForm((v) => !v)}
            className="text-sm text-logisalud-teal hover:underline"
          >
            {showNewCustomerForm ? "Cancelar" : "+ Cliente nuevo"}
          </button>
        </div>

        {showNewCustomerForm ? (
          // Deliberadamente un <div>, no un <form>: ya estamos dentro del
          // <form> principal de "Nuevo pedido" y un <form> anidado es HTML
          // inválido — el navegador colapsa la estructura y el submit de
          // este mini-formulario termina disparando el formulario exterior
          // en su lugar (bug real encontrado al probar esto en el navegador).
          <div className="flex flex-col gap-2 rounded-lg bg-gray-50 p-3">
            {newCustomerError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{newCustomerError}</p>}
            <p className="text-sm text-gray-600">
              El cliente queda pendiente de validación — no se puede usar en el pedido hasta que
              control de pedidos o un administrador lo apruebe.
            </p>
            <input
              value={newCustomer.razonSocial}
              onChange={(e) => updateNewCustomer("razonSocial", e.target.value)}
              placeholder="Razón social"
              className="min-h-10 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <input
              value={newCustomer.rucODocumento}
              onChange={(e) => updateNewCustomer("rucODocumento", e.target.value)}
              placeholder="RUC / documento"
              className="min-h-10 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <select
              value={newCustomer.canalId}
              onChange={(e) => updateNewCustomer("canalId", e.target.value)}
              className="min-h-10 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Canal</option>
              {salesChannels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <select
              value={newCustomer.zonaId}
              onChange={(e) => updateNewCustomer("zonaId", e.target.value)}
              className="min-h-10 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Zona</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.nombre}
                </option>
              ))}
            </select>
            <select
              value={newCustomer.condicionPagoHabitualId}
              onChange={(e) => updateNewCustomer("condicionPagoHabitualId", e.target.value)}
              className="min-h-10 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Condición de pago habitual</option>
              {paymentTerms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            <input
              value={newCustomer.direccion}
              onChange={(e) => updateNewCustomer("direccion", e.target.value)}
              placeholder="Dirección"
              className="min-h-10 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <button type="button" onClick={handleCreateCustomer} className="btn-secondary self-start text-sm" disabled={isPending}>
              Registrar cliente
            </button>
          </div>
        ) : (
          <Combobox
            name="customerId"
            required
            label="Cliente"
            selected={selectedOption}
            onSelect={handleSelectCustomer}
            onSearch={searchOptions}
            initialOptions={initialOptions}
            placeholder="Escribe el RUC, la razón social o el nombre comercial..."
            minSearchLength={MIN_SEARCH_LENGTH}
            emptyMessage="Ningún cliente activo de tu cartera coincide"
            hint={`Primeros ${initialOptions.length} clientes en orden alfabético. Escribe ${MIN_SEARCH_LENGTH} caracteres o más para buscar en toda tu cartera.`}
          />
        )}
      </div>

      {selectedCustomerId && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Dirección de entrega</label>
          {loadingAddresses ? (
            <p className="text-sm text-gray-500">Cargando direcciones...</p>
          ) : sinDireccion ? (
            // Bloqueo intencional, no advertencia: preferimos frenar la
            // toma del pedido a que salga un despacho sin dirección real
            // (ver docs/business-rules.md). Los clientes de la cartera
            // migrada entraron sin dirección, así que se captura acá
            // mismo en vez de mandar al vendedor a otra pantalla.
            <div className="flex flex-col gap-2 rounded-lg border-2 border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-900">⚠ {MENSAJE_SIN_DIRECCION}</p>
              {newAddressError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{newAddressError}</p>
              )}
              <input
                value={newAddress.direccion}
                onChange={(e) => setNewAddress((prev) => ({ ...prev, direccion: e.target.value }))}
                placeholder="Dirección de entrega"
                className="min-h-12 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                value={newAddress.referencia}
                onChange={(e) => setNewAddress((prev) => ({ ...prev, referencia: e.target.value }))}
                placeholder="Referencia (opcional)"
                className="min-h-12 rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={handleAddAddress}
                className="btn-secondary self-start text-sm"
                disabled={isPending || !newAddress.direccion.trim()}
              >
                Guardar dirección y continuar
              </button>
            </div>
          ) : (
            <select
              name="customerAddressId"
              required
              value={selectedAddressId}
              onChange={(e) => setSelectedAddressId(e.target.value)}
              className="min-h-12 w-full rounded-lg border border-gray-300 px-3 py-2"
            >
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

      <button
        type="submit"
        className="btn-primary"
        disabled={isPending || sinDireccion}
        title={sinDireccion ? MENSAJE_SIN_DIRECCION : undefined}
      >
        Crear borrador y continuar
      </button>
    </form>
  );
}

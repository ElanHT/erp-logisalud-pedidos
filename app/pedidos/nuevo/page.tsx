import { getCurrentUser } from "@/lib/auth/session";
import { listActiveCustomers } from "@/services/customers";
import { listActiveSellers } from "@/services/sellers";
import { listCatalog } from "@/services/catalog";
import { NewOrderForm } from "./new-order-form";

export default async function NuevoPedidoPage() {
  const user = await getCurrentUser();
  const isAdmin = user?.roles.includes("administrador") ?? false;

  const [customers, paymentTerms, sellers] = await Promise.all([
    listActiveCustomers(),
    listCatalog("payment_terms"),
    isAdmin ? listActiveSellers() : Promise.resolve([]),
  ]);

  return (
    <div>
      <h2 className="text-xl font-semibold">Nuevo pedido</h2>
      <p className="mt-1 text-sm text-gray-600">
        {isAdmin
          ? "Elige a nombre de qué vendedor se registra, luego el cliente, dirección y condición de pago."
          : "Elige el cliente, dirección y condición de pago para empezar."}
      </p>
      <div className="mt-4">
        <NewOrderForm
          isAdmin={isAdmin}
          sellers={sellers}
          customers={customers}
          paymentTerms={paymentTerms.map((p) => ({ id: p.id, nombre: p.nombre }))}
        />
      </div>
    </div>
  );
}

import { listPendingCustomers } from "@/services/customers";
import { CustomerValidationList } from "./customer-validation-list";
import { aprobarCliente, rechazarCliente } from "./actions";

export default async function ValidacionClientesPage() {
  const customers = await listPendingCustomers();

  return (
    <div>
      <h2 className="text-xl font-semibold">Clientes pendientes de validación</h2>
      <p className="mt-1 text-sm text-gray-600">
        Solicitudes creadas por vendedores. Un cliente no puede usarse en
        pedidos hasta ser aprobado acá.
      </p>
      <div className="mt-4">
        <CustomerValidationList
          customers={customers}
          onAprobar={aprobarCliente}
          onRechazar={rechazarCliente}
        />
      </div>
    </div>
  );
}

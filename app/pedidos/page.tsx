import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { listMyDraftOrders } from "@/services/orders";
import { repetirUltimoPedido } from "./actions";

export default async function PedidosHomePage() {
  const user = await getCurrentUser();
  const isAdmin = user?.roles.includes("administrador") ?? false;
  const drafts = user?.sellerId ? await listMyDraftOrders(user.sellerId) : [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">Pedidos</h2>
        <p className="mt-1 text-sm text-gray-600">
          {isAdmin
            ? "Toma un pedido a nombre de un vendedor, o revisa tus propios borradores si tienes uno vinculado."
            : "Tus borradores y accesos rápidos para tomar un pedido."}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link href="/pedidos/nuevo" className="card p-5 hover:shadow-md">
          <h3 className="font-semibold text-logisalud-green">Nuevo pedido</h3>
          <p className="mt-1 text-sm text-gray-600">
            {isAdmin ? "Elige a nombre de qué vendedor se registra." : "Arma un pedido para uno de tus clientes."}
          </p>
        </Link>
        {user?.sellerId && drafts.length > 0 && (
          <form action={repetirUltimoPedido}>
            <button type="submit" className="card w-full p-5 text-left hover:shadow-md">
              <h3 className="font-semibold text-logisalud-green">Repetir último pedido</h3>
              <p className="mt-1 text-sm text-gray-600">Crea un borrador nuevo con los mismos productos.</p>
            </button>
          </form>
        )}
      </div>

      {user?.sellerId && (
        <div>
          <h3 className="text-lg font-semibold">Borradores</h3>
          {drafts.length === 0 ? (
            <p className="mt-2 text-sm text-gray-600">No tienes pedidos en borrador.</p>
          ) : (
            <div className="mt-3 flex flex-col gap-3">
              {drafts.map((order) => (
                <Link key={order.id} href={`/pedidos/${order.id}`} className="card flex items-center justify-between p-4 hover:shadow-md">
                  <div>
                    <p className="font-medium text-gray-900">{order.customer?.razon_social ?? "Cliente sin nombre"}</p>
                    <p className="text-sm text-gray-500">{new Date(order.fecha_creacion).toLocaleDateString("es-PE")}</p>
                  </div>
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">Borrador</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

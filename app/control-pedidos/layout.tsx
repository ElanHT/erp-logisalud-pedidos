import { requireRole } from "@/lib/auth/session";
import { signOut } from "@/lib/auth/actions";

export default async function ControlPedidosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireRole(["control_pedidos", "administrador"]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between p-4">
          <h1 className="text-lg font-bold text-logisalud-green">Control de Pedidos</h1>
          <form action={signOut}>
            <button type="submit" className="btn-secondary text-sm">
              Cerrar sesión
            </button>
          </form>
        </div>
      </header>
      <div className="mx-auto max-w-3xl p-6">{children}</div>
    </div>
  );
}

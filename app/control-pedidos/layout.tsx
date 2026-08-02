import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { signOut } from "@/lib/auth/actions";

export default async function ControlPedidosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireRole(["control_pedidos", "administrador"]);
  const isAdmin = user.roles.includes("administrador");

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between p-4">
          <div>
            <h1 className="text-lg font-bold text-logisalud-green">Control de Pedidos</h1>
            {isAdmin && (
              <Link href="/admin" className="text-sm text-gray-600 hover:text-logisalud-green hover:underline">
                ← Volver a Maestros
              </Link>
            )}
          </div>
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

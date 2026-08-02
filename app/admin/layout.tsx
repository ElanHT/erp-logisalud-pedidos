import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { signOut } from "@/lib/auth/actions";

const NAV_LINKS = [
  { href: "/admin", label: "Maestros" },
  { href: "/admin/maestros/productos", label: "Productos" },
  { href: "/admin/maestros/listas-precios", label: "Listas de precios" },
  { href: "/control-pedidos/validacion-clientes", label: "Validación de clientes" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole(["administrador"]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/admin" className="text-lg font-bold text-logisalud-green">
              LOGISALUD Pedidos
            </Link>
            <nav className="flex flex-wrap gap-3 text-sm">
              {NAV_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className="hover:text-logisalud-green hover:underline">
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/admin/perfil" className="text-gray-600 hover:text-logisalud-green hover:underline">
              {user.email}
            </Link>
            <form action={signOut}>
              <button type="submit" className="btn-secondary text-sm">
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-4xl p-6">{children}</div>
    </div>
  );
}

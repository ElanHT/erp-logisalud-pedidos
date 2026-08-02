import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { signOut } from "@/lib/auth/actions";

const NAV_LINKS = [
  { href: "/admin/maestros/proveedores", label: "Proveedores" },
  { href: "/admin/maestros/canales", label: "Canales" },
  { href: "/admin/maestros/zonas", label: "Zonas" },
  { href: "/admin/maestros/condiciones-pago", label: "Condiciones de pago" },
  { href: "/admin/maestros/productos", label: "Productos" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole(["administrador"]);

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <h1 className="text-lg font-bold text-logisalud-green">Maestros — Administración</h1>
            <nav className="mt-2 flex flex-wrap gap-3 text-sm">
              {NAV_LINKS.map((link) => (
                <Link key={link.href} href={link.href} className="hover:underline">
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <form action={signOut}>
            <button type="submit" className="btn-secondary text-sm">
              Cerrar sesión
            </button>
          </form>
        </div>
      </header>
      <div className="mx-auto max-w-4xl p-6">{children}</div>
    </div>
  );
}

import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { signOut } from "@/lib/auth/actions";

export default async function Home() {
  const user = await getCurrentUser();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-6">
      <header className="pt-8">
        <h1 className="text-3xl font-bold text-logisalud-green">
          LOGISALUD Pedidos
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Fase 2 — Maestros. Aún sin pedidos, precios ni stock.
        </p>
      </header>

      <section className="card p-5">
        <h2 className="text-lg font-semibold">Estado del proyecto</h2>
        <p className="mt-2 text-sm text-gray-600">
          Auth, roles, RLS y maestros (clientes, zonas, productos, canales,
          proveedores, condiciones de pago) configurados. Ver{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5">
            docs/data-model.md
          </code>{" "}
          para el detalle.
        </p>
      </section>

      <section className="card-highlight p-5">
        <h2 className="text-lg font-semibold text-logisalud-teal">
          Próximos pasos
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Pedidos, precios, promociones, stock y NubeFact llegan en fases
          posteriores.
        </p>
      </section>

      {user ? (
        <section className="card flex flex-col gap-3 p-5">
          <p className="text-sm text-gray-600">
            Sesión iniciada como <span className="font-semibold">{user.email}</span>
            {user.roles.length > 0 && ` (${user.roles.join(", ")})`}
          </p>
          <div className="flex flex-wrap gap-3">
            {user.roles.includes("administrador") && (
              <Link href="/admin/maestros/proveedores" className="btn-primary">
                Ir a Maestros
              </Link>
            )}
            {(user.roles.includes("control_pedidos") ||
              user.roles.includes("administrador")) && (
              <Link href="/control-pedidos/validacion-clientes" className="btn-secondary">
                Validación de clientes
              </Link>
            )}
          </div>
          <form action={signOut}>
            <button type="submit" className="text-sm text-gray-500 underline">
              Cerrar sesión
            </button>
          </form>
        </section>
      ) : (
        <Link href="/login" className="btn-primary text-center">
          Iniciar sesión
        </Link>
      )}
    </main>
  );
}

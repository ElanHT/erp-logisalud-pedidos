export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col gap-6 p-6">
      <header className="pt-8">
        <h1 className="text-3xl font-bold text-logisalud-green">
          LOGISALUD Pedidos
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Base técnica — Fase 1. Sin pantallas de negocio todavía.
        </p>
      </header>

      <section className="card p-5">
        <h2 className="text-lg font-semibold">Estado del proyecto</h2>
        <p className="mt-2 text-sm text-gray-600">
          Next.js 14 + Tailwind + Supabase Auth configurados. Ver{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5">
            docs/architecture.md
          </code>{" "}
          para el detalle.
        </p>
      </section>

      <section className="card-highlight p-5">
        <h2 className="text-lg font-semibold text-logisalud-teal">
          Próximos pasos
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          Modelos de pedidos, precios, stock y NubeFact llegan en fases
          posteriores.
        </p>
      </section>
    </main>
  );
}

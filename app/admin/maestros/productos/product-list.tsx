"use client";

import { useTransition } from "react";
import type { ProductWithTaxProfile } from "@/services/products";

export function ProductList({
  products,
  onToggle,
}: {
  products: ProductWithTaxProfile[];
  onToggle: (id: string, estado: "activo" | "inactivo") => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <ul className="flex flex-col gap-2">
      {products.map((p) => {
        const perfilVigente = p.product_tax_profiles.find((tp) => tp.vigente_hasta === null);

        return (
          <li key={p.id} className="card flex items-center justify-between p-4">
            <div>
              <p className="font-semibold">
                {p.descripcion} <span className="text-gray-500">({p.codigo_interno})</span>
              </p>
              <p className="text-sm text-gray-600">
                {p.supplier?.nombre ?? "Sin proveedor"} · {p.unidad_medida}
              </p>
              {perfilVigente && (
                <p className="text-xs text-gray-500">
                  {perfilVigente.afectacion_tributaria} · {perfilVigente.tasa_aplicable}%
                </p>
              )}
              <p className="text-xs text-gray-500">{p.estado}</p>
            </div>
            <button
              className="btn-secondary text-sm"
              disabled={isPending}
              onClick={() =>
                startTransition(() =>
                  onToggle(p.id, p.estado === "activo" ? "inactivo" : "activo"),
                )
              }
            >
              {p.estado === "activo" ? "Desactivar" : "Activar"}
            </button>
          </li>
        );
      })}
      {products.length === 0 && <p className="text-sm text-gray-500">Sin productos todavía.</p>}
    </ul>
  );
}

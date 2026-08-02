import { listCatalog } from "@/services/catalog";
import { CatalogList } from "@/components/catalog-list";
import { crearCondicionPago, cambiarEstadoCondicionPago } from "./actions";

export default async function CondicionesPagoPage() {
  const items = await listCatalog("payment_terms");

  return (
    <div>
      <h2 className="text-xl font-semibold">Condiciones de pago</h2>
      <div className="mt-4">
        <CatalogList
          items={items}
          onCreate={crearCondicionPago}
          onToggle={cambiarEstadoCondicionPago}
          withDescription
        />
      </div>
    </div>
  );
}

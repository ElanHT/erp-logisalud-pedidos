import "server-only";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "./audit-log";

export type ProductWithTaxProfile = {
  id: string;
  codigo_interno: string;
  codigo_proveedor: string | null;
  descripcion: string;
  presentacion: string | null;
  marca: string | null;
  unidad_medida: string;
  estado: string;
  controla_lote: boolean;
  controla_vencimiento: boolean;
  supplier: { nombre: string } | null;
  product_tax_profiles: Array<{
    afectacion_tributaria: string;
    tasa_aplicable: number;
    vigente_desde: string;
    vigente_hasta: string | null;
  }>;
};

export async function listProducts(): Promise<ProductWithTaxProfile[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("products")
    .select(
      "*, supplier:suppliers(nombre), product_tax_profiles(afectacion_tributaria, tasa_aplicable, vigente_desde, vigente_hasta)",
    )
    .order("descripcion");

  if (error) throw new Error(error.message);
  return data as unknown as ProductWithTaxProfile[];
}

export async function listActiveSuppliers() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, nombre")
    .eq("estado", "activo")
    .order("nombre");
  if (error) throw new Error(error.message);
  return data;
}

export type NewProductInput = {
  codigoInterno: string;
  codigoProveedor?: string;
  descripcion: string;
  presentacion?: string;
  supplierId?: number;
  marca?: string;
  unidadMedida: string;
  controlaLote: boolean;
  controlaVencimiento: boolean;
  afectacionTributaria: "GRAVADO" | "INAFECTO";
  tasaAplicable: number;
};

export async function createProductWithTaxProfile(input: NewProductInput, actor: string) {
  const supabase = createClient();

  const { data: product, error: productError } = await supabase
    .from("products")
    .insert({
      codigo_interno: input.codigoInterno,
      codigo_proveedor: input.codigoProveedor || null,
      descripcion: input.descripcion,
      presentacion: input.presentacion || null,
      supplier_id: input.supplierId ?? null,
      marca: input.marca || null,
      unidad_medida: input.unidadMedida,
      controla_lote: input.controlaLote,
      controla_vencimiento: input.controlaVencimiento,
    })
    .select()
    .single();

  if (productError) throw new Error(productError.message);

  const { error: taxError } = await supabase.from("product_tax_profiles").insert({
    product_id: product.id,
    afectacion_tributaria: input.afectacionTributaria,
    tasa_aplicable: input.tasaAplicable,
  });

  if (taxError) throw new Error(taxError.message);

  // El perfil tributario se audita vía trigger (product_tax_profiles_audit);
  // el producto en sí se audita explícitamente acá.
  await logAudit({
    actor,
    accion: "crear",
    entidad: "products",
    entidadId: product.id,
    datosDespues: product,
  });

  return product;
}

export async function toggleProductEstado(
  id: string,
  estado: "activo" | "inactivo",
  actor: string,
) {
  const supabase = createClient();

  const { data: before } = await supabase.from("products").select("*").eq("id", id).single();

  const { data, error } = await supabase
    .from("products")
    .update({ estado })
    .eq("id", id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  await logAudit({
    actor,
    accion: "cambiar_estado",
    entidad: "products",
    entidadId: id,
    datosAntes: before,
    datosDespues: data,
  });

  return data;
}

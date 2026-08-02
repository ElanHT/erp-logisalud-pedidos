import "server-only";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAudit } from "./audit-log";
import {
  parsePriceListRows,
  decideTaxTreatment,
  buildChannelPrices,
  type RawRow,
  type ParsedProductRow,
  type ParseResult,
} from "@/domain/price-list-import";

const PRICE_SHEET_NAMES = [/PRECIOS X CANALES/i, /FORMATO LGS/i];
const STORAGE_BUCKET = "price-lists";

function cellPlainValue(value: ExcelJS.CellValue): RawRow[number] {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "object") {
    if ("result" in value) return cellPlainValue(value.result as ExcelJS.CellValue);
    if ("richText" in value) {
      return (value.richText as Array<{ text: string }>).map((t) => t.text).join("");
    }
    if ("text" in value) return String((value as { text: unknown }).text);
    return null;
  }
  if (typeof value === "boolean") return String(value);
  return value;
}

function pickWorksheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet {
  for (const pattern of PRICE_SHEET_NAMES) {
    const match = workbook.worksheets.find((ws) => pattern.test(ws.name));
    if (match) return match;
  }
  return workbook.worksheets[0];
}

function worksheetToRows(worksheet: ExcelJS.Worksheet): RawRow[] {
  const rows: RawRow[] = Array.from({ length: worksheet.rowCount }, () => []);
  const maxCol = worksheet.columnCount;

  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const arr: RawRow = [];
    for (let c = 1; c <= maxCol; c++) {
      arr.push(cellPlainValue(row.getCell(c).value));
    }
    rows[rowNumber - 1] = arr;
  });

  return rows;
}

async function parseWorkbookToRows(buffer: ArrayBuffer): Promise<RawRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = pickWorksheet(workbook);
  return worksheetToRows(worksheet);
}

async function getCurrentIgvRate(): Promise<number> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("tax_configurations")
    .select("valor")
    .eq("nombre", "IGV")
    .is("vigente_hasta", null)
    .single();
  if (error) throw new Error(`No se pudo leer la tasa de IGV vigente: ${error.message}`);
  return Number(data.valor);
}

export type ImportPreview = {
  fileName: string;
  supplierId: number;
  headerRowIndex: number;
  igvRate: number;
  products: Array<
    ParsedProductRow & {
      isNew: boolean;
      afectacionTributaria: "GRAVADO" | "INAFECTO";
      tasaAplicable: number;
    }
  >;
  sectionHeaders: ParseResult["sectionHeaders"];
  errors: ParseResult["errors"];
  warnings: ParseResult["warnings"];
};

export async function previewPriceListImport(
  file: File,
  supplierId: number,
): Promise<ImportPreview> {
  const buffer = await file.arrayBuffer();
  const rows = await parseWorkbookToRows(buffer);
  const parsed = parsePriceListRows(rows);
  const igvRate = await getCurrentIgvRate();

  const supabase = createClient();
  const codes = parsed.products.map((p) => p.codigoLogisalud);
  const existing =
    codes.length > 0
      ? await supabase.from("products").select("codigo_interno").in("codigo_interno", codes)
      : { data: [] as { codigo_interno: string }[], error: null };
  if (existing.error) throw new Error(existing.error.message);
  const existingCodes = new Set(existing.data.map((p) => p.codigo_interno));

  return {
    fileName: file.name,
    supplierId,
    headerRowIndex: parsed.headerRowIndex,
    igvRate,
    products: parsed.products.map((p) => ({
      ...p,
      isNew: !existingCodes.has(p.codigoLogisalud),
      ...decideTaxTreatment(p, igvRate),
    })),
    sectionHeaders: parsed.sectionHeaders,
    errors: parsed.errors,
    warnings: parsed.warnings,
  };
}

export type PublishResult = {
  priceListId: string;
  productCount: number;
  itemCount: number;
};

export async function publishPriceListImport(
  file: File,
  supplierId: number,
  actorUserId: string,
): Promise<PublishResult> {
  const buffer = await file.arrayBuffer();
  const rows = await parseWorkbookToRows(buffer);
  const parsed = parsePriceListRows(rows);

  if (parsed.errors.length > 0) {
    throw new Error(
      `No se puede publicar: hay ${parsed.errors.length} fila(s) con error (código faltante o duplicado).`,
    );
  }
  if (parsed.products.length === 0) {
    throw new Error("No se encontraron productos válidos para publicar.");
  }

  const igvRate = await getCurrentIgvRate();

  const admin = createAdminClient();
  const storagePath = `${supplierId}/${Date.now()}-${file.name}`;
  const { error: uploadError } = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: file.type || "application/octet-stream",
    });
  if (uploadError) throw new Error(`No se pudo guardar el archivo: ${uploadError.message}`);

  const payload = parsed.products.map((p) => {
    const tax = decideTaxTreatment(p, igvRate);
    return {
      codigoLogisalud: p.codigoLogisalud,
      codigoProveedor: p.codigoProveedor,
      codigoBonificacion: p.codigoBonificacion,
      producto: p.producto,
      principioActivo: p.principioActivo,
      presentacion: p.presentacion,
      unidadMedida: p.unidadMedida,
      afectacionTributaria: tax.afectacionTributaria,
      tasaAplicable: tax.tasaAplicable,
      vvfSinIgv: p.vvfSinIgv,
      vvdSinIgv: p.vvdSinIgv,
      costoReferencialDistribuidora: p.pvfDistribuidora,
      fechaVigenciaProveedor: p.fechaVigenciaProveedor,
      channelPrices: buildChannelPrices(p),
    };
  });

  const supabase = createClient();
  const { data: priceListId, error: rpcError } = await supabase.rpc("publish_price_list", {
    p_supplier_id: supplierId,
    p_archivo_nombre: file.name,
    p_archivo_storage_path: storagePath,
    p_products: payload,
  });

  if (rpcError) {
    await admin.storage.from(STORAGE_BUCKET).remove([storagePath]).catch(() => {});
    throw new Error(`No se pudo publicar la lista de precios: ${rpcError.message}`);
  }

  const itemCount = payload.reduce((sum, p) => sum + p.channelPrices.length, 0);

  await logAudit({
    actor: actorUserId,
    accion: "publicar_lista_precios",
    entidad: "price_lists",
    entidadId: priceListId as string,
    datosDespues: {
      supplierId,
      archivo: file.name,
      productos: payload.length,
      items: itemCount,
    },
  });

  return { priceListId: priceListId as string, productCount: payload.length, itemCount };
}

export type PriceListHistoryEntry = {
  id: string;
  fecha_inicio: string;
  fecha_fin: string | null;
  archivo_nombre: string;
  publicado_en: string;
  supplier: { nombre: string } | null;
  item_count: number;
};

export async function listPriceListHistory(): Promise<PriceListHistoryEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("price_lists")
    .select("*, supplier:suppliers(nombre), price_list_items(count)")
    .order("publicado_en", { ascending: false });

  if (error) throw new Error(error.message);

  return (data as unknown as Array<Record<string, unknown>>).map((row) => ({
    id: row.id as string,
    fecha_inicio: row.fecha_inicio as string,
    fecha_fin: row.fecha_fin as string | null,
    archivo_nombre: row.archivo_nombre as string,
    publicado_en: row.publicado_en as string,
    supplier: row.supplier as { nombre: string } | null,
    item_count: ((row.price_list_items as Array<{ count: number }>)[0]?.count as number) ?? 0,
  }));
}

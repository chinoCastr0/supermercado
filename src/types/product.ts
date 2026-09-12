/**
 * Contratos del frontend para catálogo, edición, filtros y carteles.
 * Los precios viajan como strings decimales; revision debe volver al servidor
 * al editar. Estos tipos deben evolucionar junto con los DTOs Pydantic.
 */
export type WeightUnit = "g" | "kg" | "ml" | "l" | "u";

export type Product = {
  id: number;
  barcode: string;
  name: string;
  price: string;
  weight: number | string | null;
  weight_unit: WeightUnit | null;
  revision: number;
  last_updated: string;
  label_version: number;
  printed: boolean;
  printed_at: string | null;
};

export type ProductDraft = {
  barcode: string;
  name: string;
  price: string;
  weight: string;
  weight_unit: WeightUnit;
};

export type ProductPayload = Omit<ProductDraft, "weight" | "weight_unit"> & {
  weight: number | null;
  weight_unit: WeightUnit | null;
  expected_revision?: number;
};
export type ProductImportResult = {
  imported_count: number;
  updated_count: number;
  price_updated_count: number;
  preserved_price_barcodes: string[];
  skipped_barcodes: string[];
  invalid_rows: string[];
};
export type BulkProductRevision = {
  id: number;
  expected_revision: number;
};
export type BulkPriceResult = {
  updated_count: number;
  unchanged_count: number;
};
export type BulkPriceConflict = {
  id: number;
  expected_revision: number;
  current_revision: number;
};
export type BulkDeleteResult = {
  deleted_count: number;
};
export type Notice = { kind: "success" | "error"; message: string } | null;
export type PrintFilter = "all" | "pending" | "printed";
export type ProductSort = "name" | "price-asc" | "price-desc" | "updated-desc";
export type ProductListFilters = {
  search: string;
  printStatus: PrintFilter;
};

export type LabelWarning = {
  product_id: number;
  name: string;
  reason: string;
};

export type GeneratedLabels = {
  blob: Blob;
  batchId: string;
  productCount: number;
  filename: string;
  warnings: LabelWarning[];
};

export type BatchConfirmation = {
  batch_id: string;
  marked_count: number;
  stale_product_ids: number[];
  missing_product_ids: number[];
};

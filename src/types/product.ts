/**
 * IMPORTANCIA: define el vocabulario compartido del frontend.
 *
 * PATRÓN / SOLID: son DTOs y tipos de dominio. Favorecen ISP porque cada flujo
 * usa sólo la forma de datos que necesita (`Product`, `Draft` o `Payload`).
 *
 * SOLUCIÓN ESPECÍFICA: campos, filtros y opciones de orden del supermercado.
 */
export type WeightUnit = "g" | "kg" | "ml" | "l" | "u";

export type Product = {
  id: number;
  barcode: string;
  name: string;
  price: string;
  weight: number | string | null;
  weight_unit: WeightUnit | null;
  active: boolean;
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
  active: boolean;
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
};
export type Notice = { kind: "success" | "error"; message: string } | null;
export type StatusFilter = "all" | "active" | "inactive";
export type PrintFilter = "all" | "pending" | "printed";
export type ProductSort = "name" | "price-asc" | "price-desc" | "updated-desc";

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

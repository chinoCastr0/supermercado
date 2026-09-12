/**
 * Contratos del frontend para la lista operativa de faltantes.
 * Es independiente del catálogo: `product_id` es una referencia opcional y el
 * resto de los campos nunca se copian desde `products`. `quantity` viaja como
 * texto libre para conservar expresiones como "media caja" o "2 bultos".
 * Estos tipos deben evolucionar junto con los DTOs Pydantic de missing_product.
 */
export type MissingStatus = "pending" | "resolved";

export type MissingProduct = {
  id: number;
  product_id: number | null;
  name: string;
  quantity: string | null;
  notes: string | null;
  status: MissingStatus;
  created_at: string;
  resolved_at: string | null;
};

export type MissingProductPayload = {
  name: string;
  product_id: number | null;
  quantity: string | null;
  notes: string | null;
};

export type MissingProductChanges = Partial<MissingProductPayload> & {
  status?: MissingStatus;
};

export type MissingStatusFilter = "all" | "pending" | "resolved";

export type MissingListFilters = {
  search: string;
  status: MissingStatusFilter;
};

/** Borrador del formulario de alta rápida antes de normalizar y enviar. */
export type MissingDraft = {
  name: string;
  quantity: string;
  notes: string;
  productId: number | null;
};

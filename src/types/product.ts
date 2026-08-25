/**
 * IMPORTANCIA: define el vocabulario compartido del frontend.
 *
 * PATRÓN / SOLID: son DTOs y tipos de dominio. Favorecen ISP porque cada flujo
 * usa sólo la forma de datos que necesita (`Product`, `Draft` o `Payload`).
 *
 * SOLUCIÓN ESPECÍFICA: campos, filtros y opciones de orden del supermercado.
 */
export type Product = {
  id: number;
  barcode: string;
  name: string;
  price: number | string;
  active: boolean;
  last_updated: string;
};

export type ProductDraft = {
  barcode: string;
  name: string;
  price: string;
  active: boolean;
};

export type ProductPayload = Omit<ProductDraft, "price"> & { price: number };
export type Notice = { kind: "success" | "error"; message: string } | null;
export type StatusFilter = "all" | "active" | "inactive";
export type ProductSort = "name" | "price-asc" | "price-desc" | "updated-desc";

/**
 * Funciones puras para comparar un lote y describir sus pasos de confirmación.
 * La máquina de estados sólo devuelve intenciones; no envía peticiones HTTP.
 */
import type { BulkProductRevision, Product } from "../types/product";
import { compareMoney } from "./money.ts";

export type BulkPricePreviewItem = {
  id: number;
  name: string;
  barcode: string;
  currentPrice: string;
  newPrice: string;
  changes: boolean;
  expectedRevision: number;
};

/** Retiene identidad, precio anterior y revisión de cada producto. */
export function buildBulkPricePreview(
  products: readonly Product[],
  newPrice: string,
): BulkPricePreviewItem[] {
  return products.map((product) => ({
    id: product.id,
    name: product.name,
    barcode: product.barcode,
    currentPrice: product.price,
    newPrice,
    changes: compareMoney(product.price, newPrice) !== 0,
    expectedRevision: product.revision,
  }));
}

/** Incluye también precios iguales para validar la revisión de toda la selección. */
export function bulkPriceTargets(
  preview: readonly BulkPricePreviewItem[],
): BulkProductRevision[] {
  return preview.map((product) => ({
    id: product.id,
    expected_revision: product.expectedRevision,
  }));
}

export type BulkPriceStep = "entry" | "confirmation" | "submitting" | "closed";
export type BulkPriceEvent = "continue" | "back" | "confirm" | "cancel";

/** Devuelve el siguiente estado; sólo confirmar habilita el envío. */
export function bulkPriceTransition(
  step: BulkPriceStep,
  event: BulkPriceEvent,
): { step: BulkPriceStep; shouldSubmit: boolean } {
  if (event === "cancel") return { step: "closed", shouldSubmit: false };
  if (step === "entry" && event === "continue") {
    return { step: "confirmation", shouldSubmit: false };
  }
  if (step === "confirmation" && event === "back") {
    return { step: "entry", shouldSubmit: false };
  }
  if (step === "confirmation" && event === "confirm") {
    return { step: "submitting", shouldSubmit: true };
  }
  return { step, shouldSubmit: false };
}

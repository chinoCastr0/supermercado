/**
 * Helpers puros de la lista de faltantes: armado de la query HTTP y
 * normalización del borrador del formulario de alta rápida.
 * El recorte de espacios y el paso de texto vacío a `null` reproducen lo que el
 * backend hace con `_blank_to_none`, para no enviar cadenas vacías.
 */
import type {
  MissingDraft,
  MissingListFilters,
  MissingProductPayload,
} from "../types/missingProduct";

/** Codifica búsqueda, filtro de estado y límites mediante URLSearchParams. */
export function buildMissingListQuery(
  filters: MissingListFilters,
  skip: number,
  limit: number,
): string {
  const params = new URLSearchParams({
    skip: String(skip),
    limit: String(limit),
    status: filters.status,
  });
  const search = filters.search.trim();
  if (search) params.set("search", search);
  return params.toString();
}

/** Convierte un texto opcional en su valor limpio o `null` si quedó vacío. */
function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Normaliza el borrador; devuelve `null` si no hay un nombre utilizable. */
export function buildMissingPayload(
  draft: MissingDraft,
): MissingProductPayload | null {
  const name = draft.name.trim();
  if (name === "") return null;
  return {
    name,
    product_id: draft.productId,
    quantity: optionalText(draft.quantity),
    notes: optionalText(draft.notes),
  };
}

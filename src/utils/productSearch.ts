/**
 * Construcción de filtros HTTP y debounce cancelable de entrada de texto.
 * El barcode siempre permanece textual para conservar ceros iniciales.
 */
import type { ProductListFilters } from "../types/product";

export const SEARCH_DEBOUNCE_MS = 300;

/** Codifica búsqueda, filtros y límites mediante URLSearchParams. */
export function buildProductListQuery(
  filters: ProductListFilters,
  skip: number,
  limit: number,
): string {
  const params = new URLSearchParams({
    skip: String(skip),
    limit: String(limit),
    print_status: filters.printStatus,
  });
  const search = filters.search.trim();
  if (search) params.set("search", search);
  return params.toString();
}

/** Devuelve la limpieza que React ejecuta antes de programar otra búsqueda. */
export function scheduleDebouncedSearch(
  value: string,
  apply: (value: string) => void,
  delay = SEARCH_DEBOUNCE_MS,
): () => void {
  const timer = setTimeout(() => apply(value), delay);
  return () => clearTimeout(timer);
}

/** Actualiza el texto y vuelve a la primera página de resultados. */
export function applySearchInput(
  value: string,
  setQuery: (value: string) => void,
  setPage: (page: number) => void,
): void {
  setQuery(value);
  setPage(1);
}

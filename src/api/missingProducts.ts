/**
 * Adaptador HTTP de la lista de faltantes. Reutiliza `request` y `readError` del
 * adaptador de productos para compartir el manejo de errores de FastAPI.
 * El backend valida las reglas de negocio; aquí solo se traduce el 409 de
 * "ya hay un faltante pendiente" a un error tipado con la anotación existente.
 */
import { API_URL, authFetch, extractErrorMessage, readError, request } from "./products";
import type {
  MissingListFilters,
  MissingProduct,
  MissingProductChanges,
  MissingProductPayload,
} from "../types/missingProduct";
import { buildMissingListQuery } from "../utils/missingProducts";

export class MissingProductConflictError extends Error {
  existing: MissingProduct;

  constructor(message: string, existing: MissingProduct) {
    super(message);
    this.name = "MissingProductConflictError";
    this.existing = existing;
  }
}

export const missingProductsApi = {
  /** Descarga la lista completa que coincide con los filtros, paginando de a 500. */
  async list(filters: MissingListFilters): Promise<MissingProduct[]> {
    const items: MissingProduct[] = [];
    const limit = 500;
    for (let skip = 0; ; skip += limit) {
      const batch = await request<MissingProduct[]>(
        `/missing-products?${buildMissingListQuery(filters, skip, limit)}`,
      );
      items.push(...batch);
      if (batch.length < limit) return items;
    }
  },

  /** Crea una anotación; el 409 conserva el faltante pendiente ya existente. */
  async create(payload: MissingProductPayload): Promise<MissingProduct> {
    const response = await authFetch(`${API_URL}/missing-products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.status === 409) {
      const data = (await response.json().catch(() => null)) as {
        detail?: { message?: string; existing?: MissingProduct };
      };
      if (data?.detail?.existing) {
        throw new MissingProductConflictError(
          data.detail.message ?? "Ya hay un faltante pendiente para ese producto.",
          data.detail.existing,
        );
      }
      throw new Error(extractErrorMessage(data));
    }
    if (!response.ok) throw new Error(await readError(response));
    return response.json() as Promise<MissingProduct>;
  },

  /** Aplica una edición parcial: solo los campos presentes se modifican. */
  update(
    missingId: number,
    changes: MissingProductChanges,
  ): Promise<MissingProduct> {
    return request(`/missing-products/${missingId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(changes),
    });
  },

  /** Elimina definitivamente una anotación de la lista. */
  remove(missingId: number): Promise<void> {
    return request(`/missing-products/${missingId}`, { method: "DELETE" });
  },
};

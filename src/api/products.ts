/**
 * IMPORTANCIA: concentra toda la comunicación HTTP del dominio de productos.
 *
 * PATRÓN / SOLID: es un API Gateway (fachada de infraestructura). Aplica SRP
 * porque los componentes no construyen URLs ni interpretan respuestas HTTP, y
 * favorece DIP porque el resto de la UI depende de esta frontera pequeña.
 *
 * SOLUCIÓN ESPECÍFICA: rutas `/products`, paginación de 500 registros y FormData.
 */
import type { Product, ProductPayload } from "../types/product";

const API_URL = (
  import.meta.env.VITE_API_URL ?? "http://localhost:8000"
).replace(/\/$/, "");

async function readError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { detail?: string };
    return data.detail ?? "No se pudo completar la operación.";
  } catch {
    return "No se pudo completar la operación.";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init);
  if (!response.ok) throw new Error(await readError(response));
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}

export const productsApi = {
  async listAll(): Promise<Product[]> {
    const products: Product[] = [];
    const limit = 500;
    for (let skip = 0; ; skip += limit) {
      const batch = await request<Product[]>(
        `/products?skip=${skip}&limit=${limit}`,
      );
      products.push(...batch);
      if (batch.length < limit) return products;
    }
  },

  save(payload: ProductPayload, productId?: number): Promise<Product> {
    return request(`/products${productId ? `/${productId}` : ""}`, {
      method: productId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  remove(productId: number): Promise<void> {
    return request(`/products/${productId}`, { method: "DELETE" });
  },

  import(
    file: File,
  ): Promise<{ imported_count: number; skipped_barcodes: string[] }> {
    const body = new FormData();
    body.append("file", file);
    return request("/products/import", { method: "POST", body });
  },
};

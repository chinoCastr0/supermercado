/**
 * IMPORTANCIA: concentra toda la comunicación HTTP del dominio de productos.
 *
 * PATRÓN / SOLID: es un API Gateway (fachada de infraestructura). Aplica SRP
 * porque los componentes no construyen URLs ni interpretan respuestas HTTP, y
 * favorece DIP porque el resto de la UI depende de esta frontera pequeña.
 *
 * SOLUCIÓN ESPECÍFICA: rutas `/products`, paginación de 500 registros y FormData.
 */
import type {
  BatchConfirmation,
  GeneratedLabels,
  LabelWarning,
  Product,
  ProductPayload,
} from "../types/product";

const API_URL = (
  import.meta.env.VITE_API_URL ?? "/api"
).replace(/\/$/, "");

async function readError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as {
      detail?: string | Array<{ msg?: string }>;
    };
    if (typeof data.detail === "string") return data.detail;
    if (Array.isArray(data.detail)) {
      const messages = data.detail
        .map((error) => error.msg)
        .filter((message): message is string => Boolean(message));
      if (messages.length) return messages.join(" ");
    }
    return "No se pudo completar la operación.";
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
  ): Promise<{
    imported_count: number;
    updated_count: number;
    skipped_barcodes: string[];
  }> {
    const body = new FormData();
    body.append("file", file);
    return request("/products/import", { method: "POST", body });
  },

  async exportRegister(): Promise<void> {
    const response = await fetch(`${API_URL}/products/export/register`);
    if (!response.ok) throw new Error(await readError(response));

    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = "PRESUR1.DAT";
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  },

  async generateLabels(productIds: number[]): Promise<GeneratedLabels> {
    const response = await fetch(`${API_URL}/labels/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_ids: productIds }),
    });
    if (!response.ok) throw new Error(await readError(response));

    const disposition = response.headers.get("Content-Disposition") ?? "";
    const filename =
      disposition.match(/filename="([^"]+)"/)?.[1] ?? "carteles-precios.pdf";
    const warningsHeader = response.headers.get("X-Print-Warnings");
    let warnings: LabelWarning[] = [];
    if (warningsHeader) {
      try {
        warnings = JSON.parse(warningsHeader) as LabelWarning[];
      } catch {
        warnings = [];
      }
    }
    return {
      blob: await response.blob(),
      batchId: response.headers.get("X-Print-Batch-Id") ?? "",
      productCount: Number(response.headers.get("X-Print-Product-Count") ?? 0),
      filename,
      warnings,
    };
  },

  confirmLabelBatch(batchId: string): Promise<BatchConfirmation> {
    return request(`/labels/batches/${batchId}/confirm`, { method: "POST" });
  },

  setPrintStatus(productIds: number[], printed: boolean) {
    return request<{ updated_count: number }>("/labels/status", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_ids: productIds, printed }),
    });
  },
};

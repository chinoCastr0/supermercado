/**
 * Adaptador HTTP del inventario y carteles. Centraliza URLs, errores y descargas.
 * Los tipos T son contratos estáticos; request no valida el JSON en ejecución.
 * listAll consume páginas sucesivas de 500 hasta completar los resultados.
 */
import type {
  BatchConfirmation,
  BulkDeleteResult,
  BulkPriceConflict,
  BulkPriceResult,
  BulkProductRevision,
  GeneratedLabels,
  LabelWarning,
  Product,
  ProductImportResult,
  ProductListFilters,
  ProductPayload,
} from "../types/product";
import { buildProductListQuery } from "../utils/productSearch";

export const API_URL = (
  import.meta.env.VITE_API_URL ?? "/api"
).replace(/\/$/, "");

/** Extrae el mensaje de un body FastAPI ya leído. */
export function extractErrorMessage(data: unknown): string {
  const detail = data && typeof data === "object" && "detail" in data ? data.detail : null;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map((error: unknown) =>
      error && typeof error === "object" && "msg" in error ? error.msg : null,
    ).filter((message): message is string => typeof message === "string" && Boolean(message));
    if (messages.length) return messages.join(" ");
  }
  if (detail && typeof detail === "object" && "message" in detail &&
      typeof detail.message === "string" && detail.message) return detail.message;
  return "No se pudo completar la operación.";
}

export async function readError(response: Response): Promise<string> {
  try {
    return extractErrorMessage(await response.json());
  } catch {
    return extractErrorMessage(null);
  }
}

/** Envía la petición y convierte respuestas no exitosas en Error; 204 no tiene JSON. */
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, init);
  if (!response.ok) throw new Error(await readError(response));
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}

export class BulkPriceConflictError extends Error {
  conflicts: BulkPriceConflict[];

  constructor(message: string, conflicts: BulkPriceConflict[]) {
    super(message);
    this.name = "BulkPriceConflictError";
    this.conflicts = conflicts;
  }
}

export const productsApi = {
  /** Descarga secuencialmente todas las páginas que coinciden con los filtros. */
  async listAll(filters: ProductListFilters): Promise<Product[]> {
    const products: Product[] = [];
    const limit = 500;
    for (let skip = 0; ; skip += limit) {
      const batch = await request<Product[]>(
        `/products?${buildProductListQuery(filters, skip, limit)}`,
      );
      products.push(...batch);
      if (batch.length < limit) return products;
    }
  },

  /** Búsqueda acotada para elegir un producto de referencia; nunca recorre todo. */
  search(term: string, limit = 8): Promise<Product[]> {
    const params = new URLSearchParams({
      search: term.trim(),
      skip: "0",
      limit: String(limit),
    });
    return request<Product[]>(`/products?${params.toString()}`);
  },

  /** Distingue ausencia (null) de fallos de red o del servidor. */
  async findByBarcode(barcode: string): Promise<Product | null> {
    const response = await fetch(
      `${API_URL}/products/by-barcode?barcode=${encodeURIComponent(barcode)}`,
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(await readError(response));
    return response.json() as Promise<Product>;
  },

  /** Envía alta o edición; las ediciones deben incluir expected_revision. */
  save(payload: ProductPayload, productId?: number): Promise<Product> {
    return request(`/products${productId ? `/${productId}` : ""}`, {
      method: productId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },

  /** Solicita el borrado definitivo de una identidad. */
  remove(productId: number): Promise<void> {
    return request(`/products/${productId}`, { method: "DELETE" });
  },

  /** Conserva los detalles del conflicto para identificar revisiones obsoletas. */
  async bulkUpdatePrice(
    price: string,
    products: BulkProductRevision[],
  ): Promise<BulkPriceResult> {
    const response = await fetch(`${API_URL}/products/bulk-price`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ price, products }),
    });
    if (response.status === 409) {
      const data = (await response.json()) as {
        detail?: {
          message?: string;
          conflicts?: BulkPriceConflict[];
        };
      };
      throw new BulkPriceConflictError(
        data.detail?.message ?? "Hay productos desactualizados.",
        data.detail?.conflicts ?? [],
      );
    }
    if (!response.ok) throw new Error(await readError(response));
    return response.json() as Promise<BulkPriceResult>;
  },

  /** Envía una selección que el servidor procesa dentro de una transacción. */
  bulkDelete(productIds: number[]): Promise<BulkDeleteResult> {
    return request("/products/bulk", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_ids: productIds }),
    });
  },

  /** Adjunta el archivo como multipart sin fijar manualmente su boundary. */
  import(file: File): Promise<ProductImportResult> {
    const body = new FormData();
    body.append("file", file);
    return request("/products/import", { method: "POST", body });
  },

  /** Descarga el binario de caja y libera la URL temporal después del clic. */
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

  /** Recupera PDF y metadatos del lote que luego podrá confirmarse. */
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

  /** Confirma lo impreso usando el identificador persistente del lote. */
  confirmLabelBatch(batchId: string): Promise<BatchConfirmation> {
    return request(`/labels/batches/${batchId}/confirm`, { method: "POST" });
  },

  /** Cambia el estado manual sin enviar la versión que el operador vio. */
  setPrintStatus(productIds: number[], printed: boolean) {
    return request<{ updated_count: number }>("/labels/status", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_ids: productIds, printed }),
    });
  },
};

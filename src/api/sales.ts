/** HTTP de ventas; el servidor calcula y devuelve importes como strings. */
import { API_URL, authFetch, readError, request } from "./products";
import type { CashSale } from "../utils/cashRegister";
import { normalizeMoneyInput } from "../utils/money";
export type SaleItem = { kind: "product" | "manual"; product_id: number | null; name: string; barcode: string; price: string; quantity: number; subtotal: string };
export type Sale = { id: number; client_id: string; cashier: string; date: string; created_at: string; total: string; paid: string; change: string; items: SaleItem[] };
export type SalesDay = { date: string; total: string; sales: Sale[] };
export class SaleRejectedError extends Error {}
export const salesApi = {
  list: (date?: string) => request<SalesDay>(`/sales${date ? `?date=${date}` : ""}`),
  create: async (sale: CashSale): Promise<Sale> => {
    const response = await authFetch(API_URL + "/sales", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: sale.clientId,
      paid: sale.paid.trim() ? normalizeMoneyInput(sale.paid) : null,
      items: sale.lines.map((line) => ({
        kind: line.kind, ...(line.kind === "product" ? { product_id: line.productId } : { name: line.name }),
        price: line.price, quantity: line.quantity,
      })),
    }),
  });
    if (!response.ok) {
      const message = await readError(response);
      if (response.status >= 400 && response.status < 500 && response.status !== 408) throw new SaleRejectedError(message);
      throw new Error(message);
    }
    return response.json() as Promise<Sale>;
  },
};

/** Solicitudes de tickets PDF transitorios con el mismo contrato binario que carteles. */
import { API_URL, authFetch, readError } from "./products";

export const offersApi = {
  async generateTicket(productId: number, promoText: string, copies: number) {
    const response = await authFetch(`${API_URL}/offers/ticket`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: productId, promo_text: promoText, copies }),
    });
    if (!response.ok) throw new Error(await readError(response));
    const disposition = response.headers.get("Content-Disposition") ?? "";
    return {
      blob: await response.blob(),
      filename: disposition.match(/filename="([^"]+)"/)?.[1] ?? "oferta.pdf",
    };
  },
};

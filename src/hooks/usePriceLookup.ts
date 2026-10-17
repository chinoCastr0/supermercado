/** Consulta de catálogo independiente de la venta; ignora respuestas obsoletas. */
import { useRef, useState } from "react";
import { productsApi } from "../api/products";
import type { CashProduct } from "../utils/cashRegister";
import type { ScannerLookupOutcome } from "../components/BarcodeScanner";
export function usePriceLookup() {
  const [product, setProduct] = useState<CashProduct | null>(null);
  const [message, setMessage] = useState("Escaneá un producto para consultar su precio.");
  const generation = useRef(0);
  const lookup = async (code: string): Promise<ScannerLookupOutcome> => {
    const current = ++generation.current;
    setProduct(null); setMessage("Consultando…");
    try {
      const found = await productsApi.findByBarcode(code.trim());
      if (current !== generation.current) return "error";
      setProduct(found); setMessage(found ? "" : "Producto no encontrado.");
      return found ? "found" : "not-found";
    } catch {
      if (current === generation.current) setMessage("No se pudo consultar. Intentá nuevamente.");
      return "error";
    }
  };
  return { product, message, lookup };
}

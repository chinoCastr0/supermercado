import { useEffect, useRef, useState } from "react";
import { productsApi } from "../api/products";
import type { ScannerLookupOutcome } from "../components/BarcodeScanner";
import { addScan, changeQuantity, removeLine, restoreSale, saleTotal, type CashSale } from "../utils/cashRegister";

export function useCashRegister(storageKey: string) {
  const [sale, setSale] = useState<CashSale>(() => {
    try { return restoreSale(sessionStorage.getItem(storageKey)); }
    catch { return { lines: [], paid: "" }; }
  });
  const [notice, setNotice] = useState("");
  const [highlight, setHighlight] = useState<number | null>(null);
  const [pending, setPending] = useState(0);
  const generation = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      if (sale.lines.length) sessionStorage.setItem(storageKey, JSON.stringify(sale));
      else sessionStorage.removeItem(storageKey);
    } catch { /* La caja funciona también sin almacenamiento disponible. */ }
  }, [sale, storageKey]);

  useEffect(() => () => {
    generation.current += 1;
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
  }, []);

  const scan = (raw: string): Promise<ScannerLookupOutcome> => {
    const barcode = raw.trim();
    const current = generation.current;
    setPending((count) => count + 1);
    const task = queue.current.then(async (): Promise<ScannerLookupOutcome> => {
      if (current !== generation.current) return "error";
      try {
        const product = await productsApi.findByBarcode(barcode);
        if (current !== generation.current) return "error";
        if (!product) {
          setNotice(`Producto no encontrado: ${barcode}`);
          return "not-found";
        }
        // Validar antes del actualizador de React (que debe ser puro).
        try { addScan([], product); }
        catch {
          setNotice(`El producto ${barcode} tiene un precio inválido. Revisalo en Productos.`);
          return "error";
        }
        setSale((previous) => ({ ...previous, lines: addScan(previous.lines, product) }));
        setHighlight(product.id);
        if (highlightTimer.current) clearTimeout(highlightTimer.current);
        highlightTimer.current = setTimeout(() => setHighlight(null), 900);
        setNotice(`Agregado: ${product.name}`);
        return "found";
      } catch {
        if (current === generation.current) setNotice(`No se pudo consultar el producto ${barcode}. Error de red o del servidor. Intentá nuevamente.`);
        return "error";
      }
    }).finally(() => {
      if (current === generation.current) setPending((count) => Math.max(0, count - 1));
    });
    queue.current = task.catch(() => undefined);
    return task;
  };

  return {
    ...sale, notice, highlight, pending, scan, total: saleTotal(sale.lines),
    setPaid: (paid: string) => setSale((previous) => ({ ...previous, paid })),
    setQuantity: (id: number, quantity: string) => setSale((previous) => ({ ...previous, lines: changeQuantity(previous.lines, id, quantity) })),
    remove: (id: number) => setSale((previous) => ({ ...previous, lines: removeLine(previous.lines, id) })),
    reset: () => {
      generation.current += 1;
      queue.current = Promise.resolve();
      setSale({ lines: [], paid: "" });
      setNotice(""); setHighlight(null); setPending(0);
    },
  };
}

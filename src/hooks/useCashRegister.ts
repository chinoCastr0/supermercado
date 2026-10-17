/** Estado y persistencia del borrador de caja. */
import { useEffect, useRef, useState } from "react";
import { SaleRejectedError, salesApi } from "../api/sales";
import { formatMoney } from "../utils/money";
import { productsApi } from "../api/products";
import type { ScannerLookupOutcome } from "../components/BarcodeScanner";
import { addManual, addScan, changeQuantity, removeLine, restoreSale, saleTotal, type CashSale } from "../utils/cashRegister";

export function useCashRegister(storageKey: string) {
  const [sale, setSale] = useState<CashSale>(() => {
    try { return restoreSale(sessionStorage.getItem(storageKey), crypto.randomUUID()); }
    catch { return { lines: [], paid: "", clientId: crypto.randomUUID() }; }
  });
  const [resultNotice, setResultNotice] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
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
        const lineId = crypto.randomUUID();
        try { addScan([], product, lineId); }
        catch {
          setNotice(`El producto ${barcode} tiene un precio inválido. Revisalo en Productos.`);
          return "error";
        }
        setSale((previous) => ({ ...previous, lines: addScan(previous.lines, product, lineId) }));
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
    ...sale, notice, highlight, pending, scan, saving, resultNotice, dismissNotice: () => setResultNotice(null),
    finalize: async () => {
      if (submitting.current || pending || !sale.lines.length) return;
      submitting.current = true; setSaving(true);
      const submitted = { ...sale, submitted: true };
      setSale(submitted);
      try { sessionStorage.setItem(storageKey, JSON.stringify(submitted)); } catch { /* Almacenamiento opcional. */ }
      try {
        const result = await salesApi.create(submitted);
        generation.current += 1;
        setSale({ lines: [], paid: "", clientId: crypto.randomUUID() });
        setResultNotice({ kind: "success", message: `Venta #${result.id} registrada · Vuelto ${formatMoney(result.change)}` });
        setNotice("");
      } catch (reason) {
        if (reason instanceof SaleRejectedError && !sale.submitted) setSale({ ...sale, submitted: false });
        setResultNotice({ kind: "error", message: reason instanceof Error ? reason.message : "No se pudo registrar la venta." });
      } finally { submitting.current = false; setSaving(false); }
    },
    total: saleTotal(sale.lines),
    addManual: (name: string, price: string) => {
      const lineId = crypto.randomUUID();
      setSale((previous) => ({ ...previous, lines: addManual(previous.lines, name, price, lineId) }));
    },
    setPaid: (paid: string) => setSale((previous) => ({ ...previous, paid })),
    setQuantity: (id: string, quantity: string) => setSale((previous) => ({ ...previous, lines: changeQuantity(previous.lines, id, quantity) })),
    remove: (id: string) => setSale((previous) => ({ ...previous, lines: removeLine(previous.lines, id) })),
    reset: () => {
      generation.current += 1;
      queue.current = Promise.resolve();
      setSale({ lines: [], paid: "", clientId: crypto.randomUUID() });
      setNotice(""); setHighlight(null); setPending(0);
    },
  };
}

/** Líneas y cálculos puros de venta. */
import { moneyCents, multiplyMoney, normalizeMoneyInput, subtractMoney, sumMoney } from "./money.ts";

export type CashProduct = { id: number; barcode: string; name: string; price: string };
export type CashLine = { lineId: string; name: string; barcode: string; price: string; quantity: number } & ({ kind: "product"; productId: number } | { kind: "manual" });
export type CashSale = { lines: CashLine[]; paid: string; clientId: string; submitted?: boolean };

export function normalizeQuantity(value: string | number): number {
  const text = String(value);
  if (!/^\d+$/.test(text)) return 1;
  const quantity = Number(text);
  return Number.isSafeInteger(quantity) && quantity >= 1 ? quantity : 1;
}

export function addScan(lines: readonly CashLine[], product: CashProduct, lineId: string): CashLine[] {
  const price = normalizeMoneyInput(product.price);
  if (!price) throw new Error("El producto tiene un precio inválido.");
  const previous = lines.find((line) => line.kind === "product" && line.productId === product.id);
  const line = previous
    ? { ...previous, quantity: Math.min(previous.quantity + 1, Number.MAX_SAFE_INTEGER) }
    : { kind: "product" as const, productId: product.id, lineId, name: product.name, barcode: product.barcode, price, quantity: 1 };
  return [line, ...lines.filter((item) => item.kind !== "product" || item.productId !== product.id)];
}

export function changeQuantity(lines: readonly CashLine[], id: string, quantity: string | number): CashLine[] {
  return lines.map((line) => line.lineId === id ? { ...line, quantity: normalizeQuantity(quantity) } : line);
}

export function removeLine(lines: readonly CashLine[], id: string): CashLine[] {
  return lines.filter((line) => line.lineId !== id);
}

export function saleTotal(lines: readonly CashLine[]): string {
  return sumMoney(lines.map((line) => multiplyMoney(line.price, line.quantity)));
}

export function articleCount(lines: readonly CashLine[]): string {
  return lines.reduce((count, line) => count + BigInt(line.quantity), 0n).toLocaleString("es-AR");
}

export function paymentBalance(total: string, rawPaid: string) {
  const paid = /^0([.,]00?)?$/.test(rawPaid.trim()) ? "0.00" : normalizeMoneyInput(rawPaid);
  if (!paid) return null;
  const enough = moneyCents(paid) >= moneyCents(total);
  return { enough, amount: enough ? subtractMoney(paid, total) : subtractMoney(total, paid) };
}

/** Los manuales nunca se fusionan. */
export function addManual(lines: readonly CashLine[], name: string, rawPrice: string, lineId: string): CashLine[] {
  const price = normalizeMoneyInput(rawPrice);
  if (!price) throw new Error("Ingresá un importe mayor que cero.");
  return [{ kind: "manual", lineId, name: name.trim() || "Producto manual", barcode: "", price, quantity: 1 }, ...lines];
}
/** Descarta versiones anteriores y datos corruptos del almacenamiento. */
export function restoreSale(raw: string | null, fallbackId: string): CashSale {
  const empty: CashSale = { lines: [], paid: "", clientId: fallbackId };
  try {
    const value = JSON.parse(raw ?? "null");
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!value || !Array.isArray(value.lines) || typeof value.paid !== "string" || !uuid.test(value.clientId)) return empty;
    const ids = new Set<string>();
    const products = new Set<number>();
    for (const line of value.lines) {
      if (!line || !uuid.test(line.lineId) || ids.has(line.lineId) ||
          !["product", "manual"].includes(line.kind) ||
          typeof line.name !== "string" || !line.name.trim() || typeof line.barcode !== "string" ||
          typeof line.price !== "string" || normalizeMoneyInput(line.price) !== line.price ||
          !Number.isSafeInteger(line.quantity) || line.quantity < 1) return empty;
      if (line.kind === "product") {
        if (!Number.isSafeInteger(line.productId) || line.productId < 1 || products.has(line.productId)) return empty;
        products.add(line.productId);
      }
      ids.add(line.lineId);
    }
    return { lines: value.lines, paid: value.paid, clientId: value.clientId, ...(value.submitted === true ? { submitted: true } : {}) };
  } catch { return empty; }
}

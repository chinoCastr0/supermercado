import { moneyCents, multiplyMoney, normalizeMoneyInput, subtractMoney, sumMoney } from "./money.ts";

export type CashProduct = { id: number; barcode: string; name: string; price: string };
export type CashLine = CashProduct & { quantity: number };
export type CashSale = { lines: CashLine[]; paid: string };

export function normalizeQuantity(value: string | number): number {
  const text = String(value);
  if (!/^\d+$/.test(text)) return 1;
  const quantity = Number(text);
  return Number.isSafeInteger(quantity) && quantity >= 1 ? quantity : 1;
}

export function addScan(lines: readonly CashLine[], product: CashProduct): CashLine[] {
  const price = normalizeMoneyInput(product.price);
  if (!price) throw new Error("El producto tiene un precio inválido.");
  const previous = lines.find((line) => line.id === product.id);
  const line = previous
    ? { ...previous, quantity: Math.min(previous.quantity + 1, Number.MAX_SAFE_INTEGER) }
    : { id: product.id, name: product.name, barcode: product.barcode, price, quantity: 1 };
  return [line, ...lines.filter((item) => item.id !== product.id)];
}

export function changeQuantity(lines: readonly CashLine[], id: number, quantity: string | number): CashLine[] {
  return lines.map((line) => line.id === id ? { ...line, quantity: normalizeQuantity(quantity) } : line);
}

export function removeLine(lines: readonly CashLine[], id: number): CashLine[] {
  return lines.filter((line) => line.id !== id);
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

/** sessionStorage es entrada no confiable: recuperar únicamente ventas válidas. */
export function restoreSale(raw: string | null): CashSale {
  const empty = { lines: [], paid: "" };
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || !Array.isArray(value.lines) || typeof value.paid !== "string") return empty;
    const ids = new Set<number>();
    const lines: CashLine[] = [];
    for (const line of value.lines) {
      if (!line || !Number.isSafeInteger(line.id) || ids.has(line.id) ||
          typeof line.barcode !== "string" || typeof line.name !== "string" ||
          typeof line.price !== "string" || !normalizeMoneyInput(line.price) ||
          !Number.isSafeInteger(line.quantity) || line.quantity < 1) return empty;
      ids.add(line.id);
      lines.push({ id: line.id, barcode: line.barcode, name: line.name,
        price: normalizeMoneyInput(line.price)!, quantity: line.quantity });
    }
    return { lines, paid: value.paid };
  } catch { return empty; }
}

/** Resumen puro de cierre: campos inválidos no impiden calcular los demás. */
import { moneyCents, moneyFromCents, normalizeMoneyInput, sumMoney } from "./money.ts";
export type Amounts = { cash: string[]; transfers: string[]; posnet: string[]; orders: string[] };
export type AmountKey = keyof Amounts;
export const amountKeys: AmountKey[] = ["cash", "transfers", "posnet", "orders"];
export function closureSummary(amounts: Amounts, salesTotal: string) {
  const invalid: string[] = [];
  const normalized = {} as Amounts;
  const subtotals = {} as Record<AmountKey, string>;
  for (const key of amountKeys) {
    normalized[key] = amounts[key].map((raw, index) => {
      if (!raw.trim() || /^0+([.,]0{1,2})?$/.test(raw.trim())) return "0.00";
      const value = normalizeMoneyInput(raw);
      if (!value) invalid.push(`${key}-${index}`);
      return value ?? "0.00";
    });
    subtotals[key] = sumMoney(normalized[key]);
  }
  const total = sumMoney(Object.values(subtotals));
  const difference = moneyCents(total) - moneyCents(salesTotal);
  return { normalized, invalid, subtotals, total, direction: difference < 0n ? "short" : difference > 0n ? "over" : "balanced",
    difference: moneyFromCents(difference < 0n ? -difference : difference) };
}

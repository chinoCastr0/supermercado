import { normalizeMoneyInput } from "./money.ts";

/** Porcentajes no negativos, con hasta dos decimales, expresados en centésimas. */
export function parsePercentage(value: string): bigint | null {
  const match = /^(\d{1,7})(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  return BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
}

export type PriceCalculation =
  | { price: string; error: null }
  | { price: null; error: string };

/** Costo × impuestos × ganancia, sin floats ni redondeos intermedios. */
export function calculateFinalPrice(cost: string, tax: string, profit: string): PriceCalculation {
  const normalizedCost = normalizeMoneyInput(cost);
  if (!normalizedCost) {
    return { price: null, error: "Ingresá un costo positivo con hasta dos decimales." };
  }
  const taxRate = parsePercentage(tax);
  const profitRate = parsePercentage(profit);
  if (taxRate === null || profitRate === null) {
    return { price: null, error: "Ingresá porcentajes de 0 o más, con hasta dos decimales." };
  }
  const costCents = BigInt(normalizedCost.replace(".", ""));
  const numerator = costCents * (10_000n + taxRate) * (10_000n + profitRate);
  const denominator = 10_000n * 10_000n;
  // Cada centena de pesos son 10.000 centavos. El corte es $40, no $50.
  const hundred = 10_000n * denominator;
  const roundUp = numerator % hundred > 4_000n * denominator;
  const pesos = (numerator / hundred + (roundUp ? 1n : 0n)) * 100n;
  if (pesos === 0n) {
    return { price: null, error: "El redondeo da $0. Ingresá un precio final positivo manualmente." };
  }
  const price = normalizeMoneyInput(`${pesos}.00`);
  if (!price) {
    return { price: null, error: "El precio calculado supera el importe máximo permitido." };
  }
  return { price, error: null };
}

/**
 * Normalización, formato y comparación monetaria sin aritmética float.
 * Se usan strings y centavos BigInt. Mantener las convenciones de separadores
 * sincronizadas con backend/app/money.py y sus pruebas de contrato.
 */
const MONEY_MAX_DIGITS = 12;

/** Comprueba grupos de miles de tres cifras después del primer grupo. */
function isGroupedInteger(value: string, separator: "." | ",") {
  const groups = value.split(separator);
  return (
    groups.length > 1 &&
    /^\d{1,3}$/.test(groups[0]) &&
    groups.slice(1).every((group) => /^\d{3}$/.test(group))
  );
}

/** Aplica la convención de separadores y devuelve null cuando no la reconoce. */
function canonicalMoneyText(rawValue: string): string | null {
  const value = rawValue.trim();
  if (!value || !/^[\d.,]+$/.test(value)) return null;

  const dotCount = (value.match(/\./g) ?? []).length;
  const commaCount = (value.match(/,/g) ?? []).length;
  if (dotCount && commaCount) {
    const decimalSeparator =
      value.lastIndexOf(".") > value.lastIndexOf(",") ? "." : ",";
    const thousandsSeparator = decimalSeparator === "." ? "," : ".";
    const decimalIndex = value.lastIndexOf(decimalSeparator);
    let integerPart = value.slice(0, decimalIndex);
    const fractionalPart = value.slice(decimalIndex + 1);
    if (!/^\d{1,2}$/.test(fractionalPart)) return null;
    if (integerPart.includes(thousandsSeparator)) {
      if (!isGroupedInteger(integerPart, thousandsSeparator)) return null;
      integerPart = integerPart.split(thousandsSeparator).join("");
    } else if (!/^\d+$/.test(integerPart)) {
      return null;
    }
    return `${integerPart}.${fractionalPart}`;
  }

  const separator = dotCount ? "." : commaCount ? "," : null;
  if (!separator) return /^\d+$/.test(value) ? value : null;
  const separatorCount = separator === "." ? dotCount : commaCount;
  if (separatorCount > 1) {
    return isGroupedInteger(value, separator)
      ? value.split(separator).join("")
      : null;
  }

  const [integerPart, fractionalPart] = value.split(separator);
  if (!/^\d+$/.test(integerPart) || !/^\d+$/.test(fractionalPart)) return null;
  if (fractionalPart.length <= 2) return `${integerPart}.${fractionalPart}`;
  if (
    fractionalPart.length === 3 &&
    integerPart.length <= 3 &&
    integerPart !== "0"
  ) {
    return `${integerPart}${fractionalPart}`;
  }
  return null;
}

/** Devuelve precio positivo con dos decimales dentro del límite de 12 dígitos. */
export function normalizeMoneyInput(rawValue: string): string | null {
  const canonical = canonicalMoneyText(rawValue);
  if (!canonical) return null;

  const [rawInteger, rawCents = ""] = canonical.split(".");
  const integer = rawInteger.replace(/^0+(?=\d)/, "");
  const cents = rawCents.padEnd(2, "0");
  if (integer.length + cents.length > MONEY_MAX_DIGITS) return null;
  if (BigInt(`${integer}${cents}`) <= 0n) return null;
  return `${integer}.${cents}`;
}

/** Agrupa miles y centavos por texto, sin perder precisión. */
export function formatMoney(value: string): string {
  const normalized = normalizeMoneyInput(value);
  if (!normalized) return "Precio inválido";
  const [integer, cents] = normalized.split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `$ ${grouped},${cents}`;
}

/** Compara centavos BigInt; ante texto inválido usa orden lexicográfico. */
export function compareMoney(left: string, right: string): number {
  const normalizedLeft = normalizeMoneyInput(left);
  const normalizedRight = normalizeMoneyInput(right);
  if (!normalizedLeft || !normalizedRight) return left.localeCompare(right);
  const leftCents = BigInt(normalizedLeft.replace(".", ""));
  const rightCents = BigInt(normalizedRight.replace(".", ""));
  return leftCents < rightCents ? -1 : leftCents > rightCents ? 1 : 0;
}

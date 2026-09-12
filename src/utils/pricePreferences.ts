export type PricePercentages = {
  tax: string;
  profit: string;
};

const STORAGE_KEY = "inventario.price-percentages.v1";
let sessionPercentages: PricePercentages = { tax: "0", profit: "0" };

/** Mantiene los valores entre altas y, con almacenamiento disponible, entre sesiones. */
export function readPricePercentages(): PricePercentages {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (parsed && typeof parsed === "object" &&
        "tax" in parsed && typeof parsed.tax === "string" &&
        "profit" in parsed && typeof parsed.profit === "string") {
        sessionPercentages = { tax: parsed.tax, profit: parsed.profit };
      }
    }
  } catch {
    // Si el navegador bloquea el almacenamiento, conserva la última carga en memoria.
  }
  return { ...sessionPercentages };
}

/** Se invoca sólo cuando el usuario modifica un porcentaje. */
export function savePricePercentages(percentages: PricePercentages): void {
  sessionPercentages = { ...percentages };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(percentages));
  } catch {
    // El cálculo puede continuar aunque el almacenamiento esté bloqueado.
  }
}

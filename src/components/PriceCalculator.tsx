import { useState } from "react";
import { calculateFinalPrice } from "../utils/priceCalculator";
import { readPricePercentages, savePricePercentages } from "../utils/pricePreferences";
import type { PricePercentages } from "../utils/pricePreferences";

type Props = {
  autoFocusCost?: boolean;
  onCalculate: (price: string) => void;
};

export function PriceCalculator({ onCalculate, autoFocusCost = false }: Props) {
  const [cost, setCost] = useState("");
  const [percentages, setPercentages] = useState(readPricePercentages);
  const calculation = cost.trim()
    ? calculateFinalPrice(cost, percentages.tax, percentages.profit)
    : null;

  const recalculate = (nextCost: string, nextPercentages: PricePercentages) => {
    const result = calculateFinalPrice(nextCost, nextPercentages.tax, nextPercentages.profit);
    onCalculate(result.price ?? "");
  };
  const changePercentage = (field: keyof PricePercentages, value: string) => {
    const next = { ...percentages, [field]: value };
    setPercentages(next);
    savePricePercentages(next);
    if (cost.trim()) recalculate(cost, next);
  };

  return (
    <fieldset className="price-calculator">
      <legend>Calcular precio</legend>
      <label>
        Precio costo
        <input
          autoFocus={autoFocusCost}
          type="text"
          inputMode="decimal"
          value={cost}
          onChange={(event) => {
            setCost(event.target.value);
            recalculate(event.target.value, percentages);
          }}
          placeholder="Ej. 1.000,00"
          aria-describedby="price-calculator-hint"
        />
      </label>
      <div className="price-percentages">
        <label>
          Impuestos (%)
          <input
            type="text"
            inputMode="decimal"
            maxLength={10}
            value={percentages.tax}
            onChange={(event) => changePercentage("tax", event.target.value)}
          />
        </label>
        <label>
          Ganancia (%)
          <input
            type="text"
            inputMode="decimal"
            maxLength={10}
            value={percentages.profit}
            onChange={(event) => changePercentage("profit", event.target.value)}
          />
        </label>
      </div>
      <p id="price-calculator-hint" className="price-calculator-hint">
        La ganancia se aplica sobre el costo con impuestos. Los porcentajes se recuerdan para el próximo producto.
        {" "}Redondeo a centenas: hasta $40 baja; más de $40 sube.
      </p>
      {calculation?.error && <p className="form-error" role="status">{calculation.error}</p>}
    </fieldset>
  );
}

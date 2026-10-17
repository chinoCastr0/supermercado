/** Un solo componente para efectivo y los tres grupos repetibles. */
import { formatMoney } from "../utils/money";
export function AmountGroup({ label, addLabel, items, invalid, subtotal, fixed, disabled, onChange }: {
  label: string; addLabel?: string; items: string[]; invalid: boolean[]; subtotal: string;
  fixed?: boolean; disabled: boolean; onChange: (items: string[]) => void;
}) {
  return <fieldset className="data-card amount-group" disabled={disabled}><legend>{label}</legend>
    {items.map((value, index) => <div className="amount-row" key={index}>
      <label>{fixed ? index === 0 ? "Efectivo día" : "Efectivo noche" : `${label} ${index + 1}`}
        <input inputMode="decimal" value={value} aria-invalid={invalid[index]} onChange={(e) => onChange(items.map((old, i) => i === index ? e.target.value : old))} />
        {invalid[index] && <small className="cash-short">Importe inválido</small>}
      </label>
      {!fixed && index > 0 && <button type="button" className="button ghost" aria-label={`Quitar ${label} ${index + 1}`} onClick={() => onChange(items.filter((_, i) => i !== index))}>Quitar</button>}
    </div>)}
    {!fixed && <button type="button" className="button secondary" disabled={items.length >= 100} onClick={() => onChange([...items, ""])}>{addLabel}</button>}
    <p>Subtotal: <strong>{formatMoney(subtotal)}</strong></p>
  </fieldset>;
}

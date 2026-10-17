/** Formulario pequeño para artículos sin código. */
import { useState } from "react";
import { normalizeMoneyInput } from "../utils/money";
export function ManualProductForm({ onAdd }: { onAdd: (name: string, price: string) => void }) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState(false);
  return <form className="cash-manual" onSubmit={(event) => {
    event.preventDefault();
    const normalized = normalizeMoneyInput(price);
    if (!normalized) { setError(true); return; }
    onAdd(name, normalized); setName(""); setPrice(""); setError(false);
  }}>
    <label>Descripción<input maxLength={255} value={name} onChange={(e) => setName(e.target.value)} placeholder="Producto manual" /></label>
    <label>Importe<input inputMode="decimal" value={price} aria-invalid={error} onChange={(e) => setPrice(e.target.value)} placeholder="0,00" /></label>
    <button className="button secondary">Agregar manual</button>
    {error && <p className="cash-short" role="alert">Ingresá un importe mayor que cero.</p>}
  </form>;
}

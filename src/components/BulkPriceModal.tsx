/**
 * Edición masiva en dos pasos: ingreso y revisión de todos los precios.
 * La vista previa retiene las revisiones recibidas al abrir el modal; no debe
 * actualizarlas silenciosamente antes de confirmar una escritura.
 */
import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { BulkProductRevision, Product } from "../types/product";
import {
  buildBulkPricePreview,
  bulkPriceTargets,
  bulkPriceTransition,
} from "../utils/bulkPrice";
import { formatMoney, normalizeMoneyInput } from "../utils/money";
import { Modal } from "./Modal";

type Props = {
  products: readonly Product[];
  isSaving: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (
    price: string,
    products: BulkProductRevision[],
  ) => Promise<boolean>;
};

/** Congela el precio normalizado antes de presentar la confirmación. */
export function BulkPriceModal({
  products,
  isSaving,
  error,
  onClose,
  onConfirm,
}: Props) {
  const [step, setStep] = useState<"entry" | "confirmation">("entry");
  const [priceInput, setPriceInput] = useState("");
  const [confirmedPrice, setConfirmedPrice] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const preview = useMemo(
    () =>
      confirmedPrice
        ? buildBulkPricePreview(products, confirmedPrice)
        : [],
    [confirmedPrice, products],
  );
  const changedCount = preview.filter((product) => product.changes).length;
  const unchangedCount = preview.length - changedCount;

  const continueToConfirmation = (event: FormEvent) => {
    event.preventDefault();
    const normalized = normalizeMoneyInput(priceInput);
    if (!normalized) {
      setValidationError("Ingresá un precio válido mayor que cero.");
      return;
    }
    const transition = bulkPriceTransition("entry", "continue");
    setConfirmedPrice(normalized);
    setValidationError(null);
    if (transition.step === "confirmation") setStep("confirmation");
  };

  const closeWithoutChanges = () => {
    const transition = bulkPriceTransition(step, "cancel");
    if (!transition.shouldSubmit) onClose();
  };

  const confirmChanges = async () => {
    if (!confirmedPrice) return;
    const transition = bulkPriceTransition("confirmation", "confirm");
    if (!transition.shouldSubmit) return;
    await onConfirm(confirmedPrice, bulkPriceTargets(preview));
  };

  return (
    <Modal
      titleId="bulk-price-title"
      isBusy={isSaving}
      onClose={closeWithoutChanges}
      className="bulk-price-modal"
    >
      <div className="modal-header">
        <div>
          <span className="modal-kicker">ACCIÓN MASIVA</span>
          <h2 id="bulk-price-title">
            {step === "entry" ? "Cambiar precio" : "Confirmar cambios"}
          </h2>
        </div>
        <button
          type="button"
          onClick={closeWithoutChanges}
          aria-label="Cerrar sin modificar productos"
        >
          ×
        </button>
      </div>

      {step === "entry" ? (
        <form onSubmit={continueToConfirmation}>
          <p className="modal-description">
            El precio absoluto se aplicará a {products.length} producto
            {products.length === 1 ? "" : "s"}. Todavía no se realizará ningún
            cambio.
          </p>
          <label>
            Nuevo precio
            <input
              autoFocus
              inputMode="decimal"
              value={priceInput}
              placeholder="Ejemplo: 2000,00"
              onChange={(event) => {
                setPriceInput(event.target.value);
                setValidationError(null);
              }}
            />
          </label>
          {validationError && (
            <p className="form-error" role="alert">
              {validationError}
            </p>
          )}
          <div className="modal-actions">
            <button className="button secondary" type="button" onClick={onClose}>
              Cancelar
            </button>
            <button className="button primary" type="submit">
              Continuar
            </button>
          </div>
        </form>
      ) : (
        <div className="bulk-confirmation">
          <p className="modal-description">
            Revisá todos los valores. La operación sólo se enviará cuando pulses
            <strong> Confirmar cambios</strong>.
          </p>
          <div className="bulk-summary" aria-label="Resumen del cambio masivo">
            <span>Seleccionados <strong>{preview.length}</strong></span>
            <span>Cambiarán <strong>{changedCount}</strong></span>
            <span>Sin cambios <strong>{unchangedCount}</strong></span>
          </div>
          <div className="bulk-comparison-list">
            {preview.map((product) => (
              <article
                className={`bulk-comparison ${product.changes ? "will-change" : "unchanged"}`}
                key={product.id}
              >
                <div>
                  <strong>{product.name}</strong>
                  <code>{product.barcode}</code>
                </div>
                <div className="bulk-price-change">
                  <span>{formatMoney(product.currentPrice)}</span>
                  <b aria-hidden="true">→</b>
                  <span>{formatMoney(product.newPrice)}</span>
                  {!product.changes && <em>Sin cambios</em>}
                </div>
              </article>
            ))}
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button
              className="button secondary"
              type="button"
              disabled={isSaving}
              onClick={() => {
                const transition = bulkPriceTransition("confirmation", "back");
                if (transition.step === "entry") setStep("entry");
              }}
            >
              Volver
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={isSaving}
              onClick={closeWithoutChanges}
            >
              Cancelar
            </button>
            <button
              className="button primary"
              type="button"
              disabled={isSaving}
              onClick={() => void confirmChanges()}
            >
              {isSaving ? "Aplicando…" : "Confirmar cambios"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

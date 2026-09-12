/**
 * Formulario de alta/edición con validación local de precio y texto PRESUR.
 * onSave delega la persistencia. La revisión se toma del producto que abrió
 * el formulario para que el servidor pueda rechazar una edición obsoleta.
 */
import { useState } from "react";
import type { FormEvent } from "react";
import type {
  Product,
  ProductDraft,
  ProductPayload,
  WeightUnit,
} from "../types/product";
import {
  REGISTER_BARCODE_BYTES,
  REGISTER_NAME_BYTES,
  registerByteLength,
  registerTextError,
} from "../utils/registerFormat";
import { getPriceChange, normalizeMoneyInput } from "../utils/money";
import { Modal } from "./Modal";
import { PriceCalculator } from "./PriceCalculator";

const EMPTY_DRAFT: ProductDraft = {
  barcode: "",
  name: "",
  price: "",
  weight: "",
  weight_unit: "g",
};
type Props = {
  product: Product | null;
  initialBarcode?: string;
  focusCost?: boolean;
  isSaving: boolean;
  onClose: () => void;
  onSave: (payload: ProductPayload, productId?: number) => Promise<boolean>;
};

/** Mantiene un borrador local independiente del registro recibido. */
export function ProductModal({
  product,
  initialBarcode = "",
  focusCost = false,
  isSaving,
  onClose,
  onSave,
}: Props) {
  const [validationError, setValidationError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProductDraft>(() =>
    product
      ? {
          barcode: product.barcode,
          name: product.name,
          price: String(product.price),
          weight: product.weight === null ? "" : String(product.weight),
          weight_unit: product.weight_unit ?? "g",
        }
      : { ...EMPTY_DRAFT, barcode: initialBarcode },
  );
  const priceChange = product ? getPriceChange(String(product.price), draft.price) : null;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const error =
      registerTextError(draft.name, "El nombre", REGISTER_NAME_BYTES) ??
      registerTextError(
        draft.barcode,
        "El código de barras",
        REGISTER_BARCODE_BYTES,
      );
    if (error) {
      setValidationError(error);
      return;
    }
    const price = normalizeMoneyInput(draft.price);
    if (!price) {
      setValidationError(
        "Ingresá un precio positivo con hasta dos decimales (por ejemplo, 1234,56).",
      );
      return;
    }
    setValidationError(null);
    const weight = draft.weight ? Number(draft.weight) : null;
    if (
      await onSave(
        {
          ...draft,
          price,
          weight,
          weight_unit: weight === null ? null : draft.weight_unit,
          ...(product ? { expected_revision: product.revision } : {}),
        },
        product?.id,
      )
    )
      onClose();
  };
  return (
    <Modal titleId="product-modal-title" isBusy={isSaving} onClose={onClose} className="product-modal">
      <div className="modal-header">
        <div>
          <span className="modal-kicker">INVENTARIO</span>
          <h2 id="product-modal-title">
            {product ? "Editar producto" : "Nuevo producto"}
          </h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar">
          ×
        </button>
      </div>
      <form onSubmit={(event) => void submit(event)}>
        {validationError && (
          <p className="form-error" role="alert">
            {validationError}
          </p>
        )}
        <label>
          Código de barras
          <input
            autoFocus={!focusCost && !product && !initialBarcode}
            required
            maxLength={REGISTER_BARCODE_BYTES}
            value={draft.barcode}
            onChange={(event) => {
              setValidationError(null);
              setDraft({ ...draft, barcode: event.target.value });
            }}
            placeholder="Ej. 7791234567890"
          />
          <small className="field-hint">
            {registerByteLength(draft.barcode)}/{REGISTER_BARCODE_BYTES} bytes
          </small>
        </label>
        <label>
          Nombre del producto
          <input
            autoFocus={!focusCost && Boolean(product || initialBarcode)}
            required
            maxLength={REGISTER_NAME_BYTES}
            value={draft.name}
            onChange={(event) => {
              setValidationError(null);
              setDraft({ ...draft, name: event.target.value });
            }}
            placeholder="Ej. Yerba mate 1 kg"
          />
          <small className="field-hint">
            {registerByteLength(draft.name)}/{REGISTER_NAME_BYTES} bytes
          </small>
        </label>
        <div className="measurement-fields">
          <label>
            Peso o contenido
            <input
              min="0.01"
              step="0.01"
              type="number"
              value={draft.weight}
              onChange={(event) =>
                setDraft({ ...draft, weight: event.target.value })
              }
              placeholder="Ej. 500"
            />
          </label>
          <label>
            Unidad
            <select
              value={draft.weight_unit}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  weight_unit: event.target.value as WeightUnit,
                })
              }
            >
              <option value="g">Gramos (g)</option>
              <option value="kg">Kilogramos (kg)</option>
              <option value="ml">Mililitros (ml)</option>
              <option value="l">Litros (l)</option>
              <option value="u">Unidades</option>
            </select>
          </label>
        </div>
        <PriceCalculator
          autoFocusCost={focusCost}
          onCalculate={(price) => {
            setValidationError(null);
            setDraft((current) => ({ ...current, price }));
          }}
        />
        <label>
          <span className="final-price-heading">
            <span id="final-price-label">Precio final</span>
            <small
              id="final-price-change"
              className={`price-change ${priceChange?.direction ?? ""}`}
              role="status"
              aria-atomic="true"
            >
              {priceChange?.label}
            </small>
          </span>
          <input
            aria-labelledby="final-price-label"
            aria-describedby="final-price-change"
            required
            inputMode="decimal"
            type="text"
            value={draft.price}
            onChange={(event) => {
              setValidationError(null);
              setDraft({ ...draft, price: event.target.value });
            }}
            placeholder="Ej. 1.234,56"
          />
          <small className="field-hint">Podés ajustarlo manualmente antes de guardar.</small>
        </label>
        <div className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary" disabled={isSaving} type="submit">
            {isSaving
              ? "Guardando…"
              : product
                ? "Guardar cambios"
                : "Agregar producto"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

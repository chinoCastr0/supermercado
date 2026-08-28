/**
 * IMPORTANCIA: contiene el formulario para crear o editar un producto.
 *
 * PATRÓN / SOLID: reutiliza el mismo componente para dos casos mediante estado
 * inicial y composición. Aplica DIP al delegar la persistencia en `onSave` y SRP
 * al ocuparse sólo de interacción/validación del formulario.
 *
 * SOLUCIÓN ESPECÍFICA: campos, placeholders y validaciones del producto.
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
import { Modal } from "./Modal";

const EMPTY_DRAFT: ProductDraft = {
  barcode: "",
  name: "",
  price: "",
  weight: "",
  weight_unit: "g",
  active: true,
};
type Props = {
  product: Product | null;
  isSaving: boolean;
  onClose: () => void;
  onSave: (payload: ProductPayload, productId?: number) => Promise<boolean>;
};

export function ProductModal({ product, isSaving, onClose, onSave }: Props) {
  const [validationError, setValidationError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProductDraft>(() =>
    product
      ? {
          barcode: product.barcode,
          name: product.name,
          price: String(product.price),
          weight: product.weight === null ? "" : String(product.weight),
          weight_unit: product.weight_unit ?? "g",
          active: product.active,
        }
      : EMPTY_DRAFT,
  );
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
    setValidationError(null);
    const weight = draft.weight ? Number(draft.weight) : null;
    if (
      await onSave(
        {
          ...draft,
          price: Number(draft.price),
          weight,
          weight_unit: weight === null ? null : draft.weight_unit,
        },
        product?.id,
      )
    )
      onClose();
  };
  return (
    <Modal titleId="product-modal-title" isBusy={isSaving} onClose={onClose}>
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
          Nombre del producto
          <input
            autoFocus
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
        <label>
          Código de barras
          <input
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
          Precio
          <input
            required
            min="0.01"
            step="0.01"
            type="number"
            value={draft.price}
            onChange={(event) =>
              setDraft({ ...draft, price: event.target.value })
            }
            placeholder="0,00"
          />
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
        <label className="switch-row">
          <span>
            <strong>Producto activo</strong>
            <small>Visible y disponible en el inventario</small>
          </span>
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(event) =>
              setDraft({ ...draft, active: event.target.checked })
            }
          />
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

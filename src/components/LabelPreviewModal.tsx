/**
 * Vista previa y descarga del PDF; la confirmación es una acción independiente.
 * El padre es dueño de la URL blob y debe revocarla cuando termine su uso.
 */
import type { GeneratedLabels } from "../types/product";
import { Modal } from "./Modal";
import { PdfPreview } from "./PdfPreview";

export type LabelPreview = GeneratedLabels & {
  url: string;
  productIds: number[];
};

type Props = {
  preview: LabelPreview;
  isSaving: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

/** Muestra el documento sin marcar productos hasta una confirmación explícita. */
export function LabelPreviewModal({
  preview,
  isSaving,
  onClose,
  onConfirm,
}: Props) {
  return (
    <Modal
      titleId="label-preview-title"
      isBusy={isSaving}
      onClose={onClose}
      className="label-preview-modal"
    >
      <div className="modal-header">
        <div>
          <span className="modal-kicker">VISTA PREVIA A4 · 3 × 8</span>
          <h2 id="label-preview-title">Carteles de precios</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar">
          ×
        </button>
      </div>
      <p className="modal-description">
        El lote contiene {preview.productCount} cartel
        {preview.productCount === 1 ? "" : "es"}. Descargar o visualizar no
        cambia su estado.
      </p>
      {preview.warnings.length > 0 && (
        <div className="label-warnings" role="alert">
          <strong>
            {preview.warnings.length} producto
            {preview.warnings.length === 1 ? "" : "s"} omitido
            {preview.warnings.length === 1 ? "" : "s"}
          </strong>
          <ul>
            {preview.warnings.map((warning) => (
              <li key={warning.product_id}>
                {warning.name}: {warning.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
      <PdfPreview
        url={preview.url}
        filename={preview.filename}
        title="Previsualización de carteles de precios"
      >
        <button
          className="button primary"
          disabled={isSaving}
          type="button"
          onClick={onConfirm}
        >
          {isSaving ? "Confirmando…" : "Marcar estos productos como impresos"}
        </button>
      </PdfPreview>
    </Modal>
  );
}

/** Previsualiza un lote PDF y exige confirmación explícita después de imprimir. */
import type { GeneratedLabels } from "../types/product";
import { Modal } from "./Modal";

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

export function LabelPreviewModal({
  preview,
  isSaving,
  onClose,
  onConfirm,
}: Props) {
  const download = () => {
    const link = document.createElement("a");
    link.href = preview.url;
    link.download = preview.filename;
    document.body.append(link);
    link.click();
    link.remove();
  };

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
      <iframe
        className="pdf-preview"
        src={preview.url}
        title="Previsualización de carteles de precios"
      />
      <div className="modal-actions label-preview-actions">
        <button className="button secondary" type="button" onClick={download}>
          Descargar PDF
        </button>
        <button
          className="button primary"
          disabled={isSaving}
          type="button"
          onClick={onConfirm}
        >
          {isSaving ? "Confirmando…" : "Marcar estos productos como impresos"}
        </button>
      </div>
    </Modal>
  );
}

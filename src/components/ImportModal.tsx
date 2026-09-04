/**
 * IMPORTANCIA: presenta y controla la selección de archivos de importación.
 *
 * PATRÓN / SOLID: componente especializado construido por composición sobre
 * `Modal`; aplica SRP. La callback `onImport` invierte la dependencia (DIP):
 * este archivo no conoce endpoints ni `fetch`.
 *
 * SOLUCIÓN ESPECÍFICA: extensiones aceptadas, textos y cálculo visual de KB.
 */
import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { Modal } from "./Modal";

type Props = {
  isSaving: boolean;
  error?: string | null;
  onClose: () => void;
  onImport: (file: File) => Promise<boolean>;
};
export function ImportModal({ error, isSaving, onClose, onImport }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const submit = async () => {
    if (!file) return;
    setSubmitted(true);
    if (await onImport(file)) onClose();
  };
  return (
    <Modal titleId="import-modal-title" isBusy={isSaving} onClose={onClose}>
      <div className="modal-header">
        <div>
          <span className="modal-kicker">CARGA MASIVA</span>
          <h2 id="import-modal-title">Importar productos</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Cerrar">
          ×
        </button>
      </div>
      <p className="modal-description">
        Subí un Excel o CSV con las columnas <strong>barcode</strong>,{" "}
        <strong>name</strong>, <strong>price</strong> y, opcionalmente,{" "}
        <strong>peso</strong> (por ejemplo, <code>500 g</code>,{" "}
        <code>1,5 l</code> o <code>6 unidades</code>) y{" "}
        <strong>last_updated</strong> o{" "}
        <strong>fecha</strong>. También podés separar el valor en las columnas{" "}
        <strong>peso</strong> y <strong>unidad</strong>. Para un barcode existente,
        sólo se actualiza el precio cuando el importado es mayor. Nombre, estado,
        peso, unidad y fecha se conservan siempre. Todos los campos se cargan
        únicamente cuando el barcode es nuevo.
      </p>
      <button
        className={`dropzone ${file ? "has-file" : ""}`}
        type="button"
        onClick={() => fileInput.current?.click()}
      >
        <span className="upload-icon">⇧</span>
        <strong>{file ? file.name : "Seleccionar archivo"}</strong>
        <small>
          {file
            ? `${(file.size / 1024).toFixed(1)} KB`
            : "Formatos .xlsx o .csv"}
        </small>
      </button>
      <input
        ref={fileInput}
        className="sr-only"
        type="file"
        accept=".xlsx,.csv"
        onChange={(event: ChangeEvent<HTMLInputElement>) => {
          setFile(event.target.files?.[0] ?? null);
          setSubmitted(false);
        }}
      />
      {submitted && error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button className="button secondary" type="button" onClick={onClose}>
          Cancelar
        </button>
        <button
          className="button primary"
          disabled={!file || isSaving}
          type="button"
          onClick={() => void submit()}
        >
          {isSaving ? "Importando…" : "Importar archivo"}
        </button>
      </div>
    </Modal>
  );
}

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
  onClose: () => void;
  onImport: (file: File) => Promise<boolean>;
};
export function ImportModal({ isSaving, onClose, onImport }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const submit = async () => {
    if (file && (await onImport(file))) onClose();
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
        <strong>peso</strong> y <strong>unidad</strong>. Los productos existentes
        se actualizarán.
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
            : "Formatos .xlsx, .xls o .csv"}
        </small>
      </button>
      <input
        ref={fileInput}
        className="sr-only"
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          setFile(event.target.files?.[0] ?? null)
        }
      />
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

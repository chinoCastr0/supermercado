/**
 * Mensaje de resultado con cierre delegado al padre; no ejecuta operaciones.
 */
import type { Notice } from "../types/product";

/** Renderiza el resultado de una operación con cierre accesible. */
export function NoticeBanner({
  notice,
  onClose,
}: {
  notice: NonNullable<Notice>;
  onClose: () => void;
}) {
  return (
    <div className={`notice ${notice.kind}`} role="status">
      <span>{notice.kind === "success" ? "✓" : "!"}</span>
      <p>{notice.message}</p>
      <button type="button" aria-label="Cerrar mensaje" onClick={onClose}>
        ×
      </button>
    </div>
  );
}

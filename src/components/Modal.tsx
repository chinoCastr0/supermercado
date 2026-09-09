/**
 * Contenedor compartido: composición visual, ARIA, Escape y clic en el fondo.
 * isBusy bloquea esos dos cierres; los botones de cada hijo deben respetarlo
 * por separado. Todavía no implementa retención ni restauración del foco.
 */
import { useEffect } from "react";
import type { ReactNode } from "react";

type Props = {
  titleId: string;
  isBusy: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
};

/** Envuelve cualquier contenido de diálogo y registra el cierre por Escape. */
export function Modal({ titleId, isBusy, onClose, children, className }: Props) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isBusy) onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isBusy, onClose]);
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isBusy) onClose();
      }}
    >
      <section
        className={`modal ${className ?? ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {children}
      </section>
    </div>
  );
}

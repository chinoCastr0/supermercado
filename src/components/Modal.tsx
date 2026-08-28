/**
 * IMPORTANCIA: reúne comportamiento accesible y cierre común de los modales.
 *
 * PATRÓN / SOLID: usa composición mediante `children` y aplica OCP: un modal
 * nuevo extiende este contenedor sin modificarlo. También aplica SRP al aislar
 * Escape, backdrop y atributos ARIA.
 *
 * SOLUCIÓN ESPECÍFICA: bloquear el cierre mientras una operación está ocupada.
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

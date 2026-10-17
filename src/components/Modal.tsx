/**
 * Contenedor compartido: composición visual, ARIA, Escape y clic en el fondo.
 * isBusy bloquea esos dos cierres; los botones de cada hijo deben respetarlo
 * por separado. Retiene el foco, lo restaura al cerrar y bloquea el scroll de fondo.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  const dialogRef = useRef<HTMLElement>(null);
  const [opener] = useState(() => document.activeElement instanceof HTMLElement ? document.activeElement : null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const overflow = document.body.style.overflow;
    const background = Array.from(document.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && !element.contains(dialog))
      .map((element) => ({ element, inert: element.inert }));
    background.forEach(({ element }) => { element.inert = true; });
    document.body.style.overflow = "hidden";
    // Respeta autoFocus de los formularios y del lector de códigos.
    if (!dialog.contains(document.activeElement)) dialog.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = overflow;
      background.forEach(({ element, inert }) => { element.inert = inert; });
      queueMicrotask(() => {
        if (opener?.isConnected && !document.querySelector('[role="dialog"]')) opener.focus({ preventScroll: true });
      });
    };
  }, [opener]);
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (event.key === "Escape") {
        event.preventDefault();
        if (!isBusy) onClose();
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), iframe, [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.getClientRects().length > 0 && !element.closest('[hidden], [inert]') && !element.classList.contains("sr-only"));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
        event.preventDefault(); first.focus();
      }
    };
    const retainFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialogRef.current?.contains(event.target)) dialogRef.current?.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", handleKey);
    document.addEventListener("focusin", retainFocus);
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.removeEventListener("focusin", retainFocus);
    };
  }, [isBusy, onClose]);
  return createPortal(
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isBusy) onClose();
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        className={`modal ${className ?? ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {children}
      </section>
    </div>,
    document.body,
  );
}

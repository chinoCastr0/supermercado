/** Un único lector de teclado; diálogos habilitados sólo de forma explícita. */
import { useEffect, useRef } from "react";
import { createBarcodeKeyboardReader } from "../utils/barcodeKeyboard";

/** Escucha el lector en el inventario sin interferir con los formularios. */
export function useBarcodeKeyboard(
  enabled: boolean,
  onBarcode: (barcode: string) => Promise<unknown>,
  options?: {
    queue?: boolean;
    allowDialog?: boolean;
    allowTextSearch?: boolean;
    restoreEditable?: (target: HTMLInputElement, value: string) => void;
  },
) {
  const onBarcodeRef = useRef(onBarcode);
  const optionsRef = useRef(options);
  useEffect(() => {
    onBarcodeRef.current = onBarcode;
    optionsRef.current = options;
  }, [onBarcode, options]);

  useEffect(() => {
    if (!enabled) return;
    let busy = false;
    let edit: { target: HTMLInputElement; value: string; time: number } | null = null;
    const onRead = (barcode: string) => {
      if (edit) optionsRef.current?.restoreEditable?.(edit.target, edit.value);
      edit = null;
      if (busy && !optionsRef.current?.queue) return;
      busy = true;
      void onBarcodeRef.current(barcode).finally(() => { busy = false; });
    };
    let previousTarget: EventTarget | null = null;
    let readKey = createBarcodeKeyboardReader(onRead);
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target;
      const isSearch = target instanceof HTMLInputElement && target.hasAttribute("data-barcode-search");
      const isCashEdit = target instanceof HTMLInputElement && target.hasAttribute("data-barcode-edit") && optionsRef.current?.restoreEditable;
      // Un cambio de campo nunca debe unir dos fragmentos. En campos de pago
      // exigimos una ráfaga más rápida para distinguir escritura manual.
      if (previousTarget !== target) {
        previousTarget = target;
        edit = null;
        readKey = createBarcodeKeyboardReader(onRead, {
          maxInterval: isCashEdit ? 35 : 100,
          allowTextSearch: optionsRef.current?.allowTextSearch,
        });
      }
      if (target instanceof HTMLElement && !isSearch && !isCashEdit &&
        (target.isContentEditable || target.closest("input, textarea, select") || (target.closest("[role='dialog']") && !(optionsRef.current?.allowDialog && target.closest("[role='dialog']")?.querySelector("[data-barcode-dialog]"))))) return;
      if (isCashEdit && event.key.length === 1 &&
          (!edit || edit.target !== target || event.timeStamp - edit.time > 35)) {
        edit = { target, value: target.value, time: event.timeStamp };
      } else if (isCashEdit && edit && event.key.length === 1) {
        edit.time = event.timeStamp;
      } else if (!isCashEdit) edit = null;
      readKey(event, isSearch ? target.value : undefined);
      if (event.key === "Enter" && event.defaultPrevented && isCashEdit) event.stopImmediatePropagation();
      if (event.key.length !== 1 && event.key !== "Shift") edit = null;
    };
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [enabled]);
}

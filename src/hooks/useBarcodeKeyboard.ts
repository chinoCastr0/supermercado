import { useEffect, useRef } from "react";
import { createBarcodeKeyboardReader } from "../utils/barcodeKeyboard";

/** Escucha el lector en el inventario sin interferir con los formularios. */
export function useBarcodeKeyboard(
  enabled: boolean,
  onBarcode: (barcode: string) => Promise<unknown>,
) {
  const onBarcodeRef = useRef(onBarcode);
  useEffect(() => {
    onBarcodeRef.current = onBarcode;
  }, [onBarcode]);

  useEffect(() => {
    if (!enabled) return;
    let busy = false;
    const readKey = createBarcodeKeyboardReader((barcode) => {
      if (busy) return;
      busy = true;
      void onBarcodeRef.current(barcode).finally(() => { busy = false; });
    });
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target;
      const isSearch = target instanceof HTMLInputElement && target.hasAttribute("data-barcode-search");
      if (target instanceof HTMLElement && !isSearch &&
        (target.isContentEditable || target.closest("input, textarea, select, [role='dialog']"))) return;
      readKey(event, isSearch ? target.value : undefined);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [enabled]);
}

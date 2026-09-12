/** Los lectores USB/Bluetooth escriben una ráfaga de teclas y terminan con Enter. */
export function createBarcodeKeyboardReader(onBarcode: (barcode: string) => void) {
  let buffer = "";
  let lastKeyTime = -Infinity;

  return (event: Pick<KeyboardEvent, "key" | "timeStamp" | "ctrlKey" | "altKey" | "metaKey" | "repeat" | "isComposing" | "preventDefault">, searchValue?: string) => {
    if (event.ctrlKey || event.altKey || event.metaKey || event.repeat || event.isComposing) {
      buffer = "";
      return;
    }
    const isContinuous = event.timeStamp - lastKeyTime <= 100;
    if (event.key === "Enter") {
      // El campo de búsqueda también admite códigos numéricos ingresados lentamente.
      const isScan = isContinuous && buffer.length >= 3;
      const barcode = isScan ? buffer : searchValue?.trim();
      buffer = "";
      lastKeyTime = -Infinity;
      if (barcode && (isScan || (searchValue !== undefined && /^\d+$/.test(barcode)))) {
        event.preventDefault();
        onBarcode(barcode);
      }
      return;
    }
    if (event.key.length === 1) {
      buffer = (isContinuous ? buffer : "") + event.key;
      lastKeyTime = event.timeStamp;
    } else if (event.key !== "Shift") {
      buffer = "";
    }
  };
}

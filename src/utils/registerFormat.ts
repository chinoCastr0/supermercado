/**
 * Validación local del texto CP1252 y límites binarios de PRESUR1.DAT.
 * Cada carácter admitido ocupa un byte; los inválidos se informan antes del envío.
 */
export const REGISTER_NAME_BYTES = 18;
export const REGISTER_BARCODE_BYTES = 15;

const CP1252_EXTRA_CHARACTERS = new Set(
  "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ",
);

/** Reconoce el subconjunto imprimible CP1252 admitido en la interfaz. */
function isCp1252Character(character: string) {
  const codePoint = character.codePointAt(0) ?? 0;
  return (
    (codePoint >= 0x20 && codePoint <= 0x7e) ||
    (codePoint >= 0xa0 && codePoint <= 0xff) ||
    CP1252_EXTRA_CHARACTERS.has(character)
  );
}

/** Informa el primer problema de obligatoriedad, codificación o longitud. */
export function registerTextError(
  value: string,
  fieldLabel: string,
  maximumBytes: number,
) {
  if (!value.trim()) return `${fieldLabel} es obligatorio.`;
  if ([...value].some((character) => !isCp1252Character(character))) {
    return `${fieldLabel} contiene caracteres incompatibles con la caja.`;
  }
  if ([...value].length > maximumBytes) {
    return `${fieldLabel} admite hasta ${maximumBytes} bytes.`;
  }
  return null;
}

/** Cuenta bytes representables; la validación informa caracteres excluidos. */
export function registerByteLength(value: string) {
  return [...value].filter(isCp1252Character).length;
}

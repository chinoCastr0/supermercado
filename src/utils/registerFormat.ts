export const REGISTER_NAME_BYTES = 18;
export const REGISTER_BARCODE_BYTES = 15;

const CP1252_EXTRA_CHARACTERS = new Set(
  "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ",
);

function isCp1252Character(character: string) {
  const codePoint = character.codePointAt(0) ?? 0;
  return (
    (codePoint >= 0x20 && codePoint <= 0x7e) ||
    (codePoint >= 0xa0 && codePoint <= 0xff) ||
    CP1252_EXTRA_CHARACTERS.has(character)
  );
}

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

export function registerByteLength(value: string) {
  return [...value].filter(isCp1252Character).length;
}

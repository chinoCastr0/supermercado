import assert from "node:assert/strict";
import test from "node:test";
import { createBarcodeKeyboardReader } from "../src/utils/barcodeKeyboard.ts";

function setup() {
  const codes = [];
  let prevented = 0;
  let time = 0;
  const reader = createBarcodeKeyboardReader((code) => codes.push(code));
  const key = (key, delay = 10, searchValue, extras = {}) => {
    time += delay;
    reader({ key, timeStamp: time, preventDefault: () => prevented++, ...extras }, searchValue);
  };
  const scan = (code) => {
    for (const char of code) key(char);
    key("Enter");
  };
  return { codes, key, scan, prevented: () => prevented };
}

test("el lector fisico entrega el barcode completo conservando ceros iniciales", () => {
  const s = setup();
  s.scan("0077912345678");
  assert.deepEqual(s.codes, ["0077912345678"]);
  assert.equal(s.prevented(), 1);
});

test("permite lecturas consecutivas sin mezclar codigos", () => {
  const s = setup();
  s.scan("ABC123");
  s.scan("000456");
  assert.deepEqual(s.codes, ["ABC123", "000456"]);
});

test("no confunde escritura lenta fuera del buscador con un escaneo", () => {
  const s = setup();
  for (const char of "779123") s.key(char, 200);
  s.key("Enter");
  assert.deepEqual(s.codes, []);
  assert.equal(s.prevented(), 0);
});

test("Enter en el buscador consulta el codigo incluso con un lector lento", () => {
  const s = setup();
  s.key("Enter", 200, " 000123456 ");
  assert.deepEqual(s.codes, ["000123456"]);
});

test("escanear sobre una busqueda previa usa solo el nuevo barcode", () => {
  const s = setup();
  for (const char of "000123") s.key(char);
  s.key("Enter", 10, "yerba000123");
  assert.deepEqual(s.codes, ["000123"]);
});

test("no abre el alta por Enter en una busqueda de nombre o vacia", () => {
  const s = setup();
  s.key("Enter", 200, "yerba");
  s.key("Enter", 200, "");
  assert.deepEqual(s.codes, []);
});

test("ignora atajos, composicion y teclas repetidas", () => {
  for (const extras of [{ ctrlKey: true }, { altKey: true }, { metaKey: true }, { repeat: true }, { isComposing: true }]) {
    const s = setup();
    for (const char of "12345") s.key(char, 10, undefined, extras);
    s.key("Enter");
    assert.deepEqual(s.codes, []);
  }
});

test("descarta una rafaga sin Enter antes de una nueva lectura", () => {
  const s = setup();
  for (const char of "999") s.key(char);
  s.key("0", 500);
  s.key("0");
  s.key("1");
  s.key("Enter");
  assert.deepEqual(s.codes, ["001"]);
});

/** Lector físico y enrutamiento explícito dentro de diálogos. */
import assert from "node:assert/strict";
import test from "node:test";
import { createBarcodeKeyboardReader } from "../src/utils/barcodeKeyboard.ts";

function setup(options) {
  const codes = [];
  let prevented = 0;
  let time = 0;
  const reader = createBarcodeKeyboardReader((code) => codes.push(code), options);
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

test("Caja admite códigos alfanuméricos manuales sin cambiar el inventario", () => {
  const s = setup({ allowTextSearch: true });
  s.key("Enter", 200, " ABC123 ");
  assert.deepEqual(s.codes, ["ABC123"]);
});

test("campos de caja exigen ráfaga rápida y dejan confirmar un pago manual", () => {
  const s = setup({ maxInterval: 35 });
  for (const char of "1500") s.key(char, 80);
  s.key("Enter", 80);
  assert.deepEqual(s.codes, []);
  s.scan("7790000000001");
  assert.deepEqual(s.codes, ["7790000000001"]);
});

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

test("el hook acepta el diálogo de consulta y sigue ignorando otros diálogos", async () => {
  const { readFile } = await import("node:fs/promises");
  const { stripTypeScriptTypes } = await import("node:module");
  let source = stripTypeScriptTypes(await readFile(new URL("../src/hooks/useBarcodeKeyboard.ts", import.meta.url), "utf8"));
  source = source.replace('import { useEffect, useRef } from "react";', "const { useEffect, useRef } = globalThis.__barcodeTest;")
    .replace('import { createBarcodeKeyboardReader } from "../utils/barcodeKeyboard";', "const { createBarcodeKeyboardReader } = globalThis.__barcodeTest;");
  const previous = { window: globalThis.window, HTMLElement: globalThis.HTMLElement, HTMLInputElement: globalThis.HTMLInputElement };
  let handler;
  const cleanups = [];
  class Element {
    constructor(allowed = false) { this.allowed = allowed; }
    closest(selector) { return selector === "[role='dialog']" ? this : null; }
    querySelector() { return this.allowed ? {} : null; }
  }
  globalThis.window = { addEventListener: (_, fn) => { handler = fn; }, removeEventListener: () => {} };
  globalThis.HTMLElement = Element;
  globalThis.HTMLInputElement = class extends Element {};
  globalThis.__barcodeTest = { createBarcodeKeyboardReader, useRef: (current) => ({ current }), useEffect: (fn) => { const cleanup = fn(); if (cleanup) cleanups.push(cleanup); } };
  try {
    const { useBarcodeKeyboard } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
    const codes = [];
    useBarcodeKeyboard(true, async (code) => { codes.push(code); }, { allowDialog: true, queue: true });
    let timeStamp = 0;
    const scan = (target) => { for (const key of [..."12345", "Enter"]) handler({ target, key, timeStamp: timeStamp += 10, preventDefault() {} }); };
    scan(new Element(false));
    assert.deepEqual(codes, []);
    scan(new Element(true));
    assert.deepEqual(codes, ["12345"]);
  } finally {
    cleanups.forEach((fn) => fn());
    Object.assign(globalThis, previous);
    delete globalThis.__barcodeTest;
  }
});

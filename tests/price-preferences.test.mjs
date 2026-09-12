import assert from "node:assert/strict";
import test from "node:test";
import { readPricePercentages, savePricePercentages } from "../src/utils/pricePreferences.ts";

function mockStorage(t, storage) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  });
}

test("conserva impuestos y ganancia al abrir sucesivos productos", (t) => {
  const values = new Map();
  mockStorage(t, {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  });
  savePricePercentages({ tax: "21", profit: "35,50" });
  assert.deepEqual(readPricePercentages(), { tax: "21", profit: "35,50" });
  const first = readPricePercentages();
  first.tax = "0";
  assert.deepEqual(readPricePercentages(), { tax: "21", profit: "35,50" });
  assert.deepEqual(JSON.parse([...values.values()][0]), { tax: "21", profit: "35,50" });
});

test("recupera los porcentajes guardados en una sesion anterior", (t) => {
  mockStorage(t, { getItem: () => '{"tax":"10,5","profit":"42"}' });
  assert.deepEqual(readPricePercentages(), { tax: "10,5", profit: "42" });
});

test("recuerda modificaciones manuales a cero o campo vacio", (t) => {
  const values = new Map();
  mockStorage(t, {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  });
  savePricePercentages({ tax: "0", profit: "" });
  assert.deepEqual(readPricePercentages(), { tax: "0", profit: "" });
});

test("si falla el almacenamiento, conserva porcentajes entre altas en memoria", (t) => {
  mockStorage(t, {
    getItem: () => { throw new Error("Blocked"); },
    setItem: () => { throw new Error("Blocked"); },
  });
  savePricePercentages({ tax: "21", profit: "30" });
  assert.deepEqual(readPricePercentages(), { tax: "21", profit: "30" });
});

test("tolera preferencias corruptas sin romper el formulario", (t) => {
  mockStorage(t, { getItem: () => "invalid json", setItem: () => {} });
  savePricePercentages({ tax: "5", profit: "15" });
  assert.deepEqual(readPricePercentages(), { tax: "5", profit: "15" });
});

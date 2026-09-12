import assert from "node:assert/strict";
import test from "node:test";
import { calculateFinalPrice, parsePercentage } from "../src/utils/priceCalculator.ts";

test("calcula el ejemplo del usuario: 1000 con 21% y 50% da 1800", () => {
  assert.deepEqual(calculateFinalPrice("1000", "21", "50"), { price: "1800.00", error: null });
});

test("aplica ganancia sobre el costo con impuestos, no suma porcentajes", () => {
  assert.equal(calculateFinalPrice("10000", "21", "50").price, "18200.00");
});

test("redondea a centenas con corte estricto en 40 pesos", () => {
  for (const [cost, expected] of [
    ["1400", "1400.00"],
    ["1439.99", "1400.00"],
    ["1440", "1400.00"],
    ["1440.01", "1500.00"],
    ["1441", "1500.00"],
    ["1499.99", "1500.00"],
    ["1500", "1500.00"],
  ]) assert.equal(calculateFinalPrice(cost, "0", "0").price, expected, cost);
});

test("calcula porcentajes decimales y admite formatos de costo locales", () => {
  assert.equal(calculateFinalPrice("1.000,00", "10,5", "12.50").price, "1300.00");
  assert.equal(parsePercentage("0"), 0n);
  assert.equal(parsePercentage("21,50"), 2150n);
  assert.equal(parsePercentage("150"), 15000n);
});

test("no redondea resultados intermedios cerca del corte", () => {
  assert.equal(calculateFinalPrice("1440", "0", "0.01").price, "1500.00");
  assert.equal(calculateFinalPrice("1200", "20", "0").price, "1400.00");
});

test("rechaza costos y porcentajes invalidos en lugar de generar NaN", () => {
  for (const cost of ["", "0", "-100", "abc", "1.2345"]) {
    assert.equal(calculateFinalPrice(cost, "21", "50").price, null);
  }
  for (const rate of ["", "-1", "1.234", "abc", "Infinity"]) {
    assert.equal(calculateFinalPrice("1000", rate, "50").price, null);
    assert.equal(calculateFinalPrice("1000", "21", rate).price, null);
  }
});

test("detecta redondeos a cero y precios fuera del limite del inventario", () => {
  assert.match(calculateFinalPrice("40", "0", "0").error, /\$0/);
  assert.equal(calculateFinalPrice("41", "0", "0").price, "100.00");
  assert.equal(calculateFinalPrice("9999999900", "0", "0").price, "9999999900.00");
  assert.match(calculateFinalPrice("9999999999.99", "0", "0").error, /máximo/);
});

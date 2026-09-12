/**
 * Contrato monetario del frontend: entradas, centavos exactos y presentación.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  compareMoney,
  formatMoney,
  getPriceChange,
  normalizeMoneyInput,
} from "../src/utils/money.ts";

test("normaliza precios decimales sin convertirlos a Number", () => {
  assert.equal(normalizeMoneyInput("1234.56"), "1234.56");
  assert.equal(normalizeMoneyInput("10.50"), "10.50");
  assert.equal(normalizeMoneyInput("10,50"), "10.50");
  assert.equal(normalizeMoneyInput("1.234,56"), "1234.56");
  assert.equal(normalizeMoneyInput("1,234.56"), "1234.56");
  assert.equal(normalizeMoneyInput("10"), "10.00");

  const payload = JSON.stringify({ price: normalizeMoneyInput("1234.56") });
  assert.equal(payload, '{"price":"1234.56"}');
});

test("muestra el aumento o la disminucion respecto al precio anterior", () => {
  assert.deepEqual(getPriceChange("2300", "2600"), {
    direction: "increase", label: "$300 aumentado · Precio anterior: $ 2.300,00",
  });
  assert.deepEqual(getPriceChange("2600", "2300"), {
    direction: "decrease", label: "$300 disminuido · Precio anterior: $ 2.600,00",
  });
});

test("la diferencia conserva centavos exactos y formatos locales", () => {
  assert.deepEqual(getPriceChange("2.300,10", "2300.30"), {
    direction: "increase", label: "$0,20 aumentado · Precio anterior: $ 2.300,10",
  });
  assert.deepEqual(getPriceChange("9999999999.99", "9999999999.98"), {
    direction: "decrease", label: "$0,01 disminuido · Precio anterior: $ 9.999.999.999,99",
  });
  assert.equal(getPriceChange("1000", "2300").label, "$1.300 aumentado · Precio anterior: $ 1.000,00");
});

test("omite la diferencia si no cambia el precio o la entrada esta incompleta", () => {
  assert.equal(getPriceChange("2300", "2.300,00"), null);
  for (const value of ["", "2600,", "abc", "0", "-1"]) {
    assert.equal(getPriceChange("2300", value), null);
  }
});

test("rechaza valores ambiguos o con más de dos decimales", () => {
  assert.equal(normalizeMoneyInput("1234.567"), null);
  assert.equal(normalizeMoneyInput("0.001"), null);
  assert.equal(normalizeMoneyInput("12.34.56"), null);
  assert.equal(normalizeMoneyInput("0"), null);
});

test("formatea y ordena usando centavos enteros", () => {
  assert.equal(formatMoney("1234.56"), "$ 1.234,56");
  assert.equal(formatMoney("10.50"), "$ 10,50");
  assert.equal(compareMoney("10.50", "10.49"), 1);
  assert.equal(compareMoney("9999999999.99", "1234.56"), 1);
});

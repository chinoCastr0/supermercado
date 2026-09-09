/**
 * Contrato monetario del frontend: entradas, centavos exactos y presentación.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  compareMoney,
  formatMoney,
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

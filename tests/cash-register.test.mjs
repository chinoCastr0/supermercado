import assert from "node:assert/strict";
import test from "node:test";
import { addScan, articleCount, changeQuantity, normalizeQuantity, paymentBalance, removeLine, restoreSale, saleTotal } from "../src/utils/cashRegister.ts";
import { formatMoney, multiplyMoney, sumMoney } from "../src/utils/money.ts";

const product = { id: 1, name: "Caramelo", barcode: "7790000000001", price: "0.10" };
test("decimales exactos, sumas y totales mayores que un precio", () => {
  assert.equal(multiplyMoney("0.10", 3), "0.30");
  assert.equal(sumMoney(["0.10", "0.20"]), "0.30");
  assert.equal(formatMoney(multiplyMoney("9999999999.99", 3)), "$ 29.999.999.999,97");
});
test("escaneo repetido incrementa sin duplicar y aparece arriba", () => {
  const first = addScan([], product);
  const second = addScan(first, { ...product, id: 2, barcode: "2" });
  const third = addScan(second, { ...product, price: "0.20" });
  assert.equal(third.length, 2);
  assert.equal(third[0].id, 1);
  assert.equal(third[0].quantity, 2);
  assert.equal(third[0].price, "0.10");
  assert.equal(first[0].quantity, 1);
  assert.equal(articleCount(third), "3");
});
test("cantidad inválida vuelve a uno; edición y eliminación son inmutables", () => {
  for (const value of ["", "0", "-1", "1.5", "abc", "Infinity", "9007199254740992"]) assert.equal(normalizeQuantity(value), 1);
  const lines = addScan([], product);
  const edited = changeQuantity(lines, 1, "3");
  assert.equal(saleTotal(edited), "0.30");
  assert.equal(saleTotal(lines), "0.10");
  assert.deepEqual(removeLine(edited, 1), []);
});
test("vuelto exacto, faltan, formatos y pagos inválidos", () => {
  assert.deepEqual(paymentBalance("0.30", "0,50"), { enough: true, amount: "0.20" });
  assert.deepEqual(paymentBalance("1500.00", "1.500"), { enough: true, amount: "0.00" });
  assert.deepEqual(paymentBalance("1500.00", "1500,50"), { enough: true, amount: "0.50" });
  assert.deepEqual(paymentBalance("1500.00", "1000"), { enough: false, amount: "500.00" });
  assert.deepEqual(paymentBalance("0.30", "0"), { enough: false, amount: "0.30" });
  for (const raw of ["", "-1", "no", "1,2345"]) assert.equal(paymentBalance("0.30", raw), null);
});
test("venta vacía y vuelto cero se muestran correctamente", () => {
  assert.equal(saleTotal([]), "0.00");
  assert.equal(articleCount([]), "0");
  assert.equal(formatMoney("0.00"), "$ 0,00");
});
test("recuperación validada y rechazo de datos dañados", () => {
  const sale = { lines: addScan([], product), paid: "1.500" };
  assert.deepEqual(restoreSale(JSON.stringify(sale)), sale);
  for (const raw of [null, "{", "{}", JSON.stringify({ ...sale, lines: [{ ...sale.lines[0], quantity: 0 }] }),
    JSON.stringify({ ...sale, lines: [sale.lines[0], sale.lines[0]] })]) {
    assert.deepEqual(restoreSale(raw), { lines: [], paid: "" });
  }
});

/** Totales, errores por campo y diferencias del arqueo. */
import test from "node:test";
import assert from "node:assert/strict";
import { closureSummary } from "../src/utils/cashClosure.ts";
const amounts = { cash: ["0,10", "0,20"], transfers: [""], posnet: ["0"], orders: [""] };
test("suma exacta, vacíos y diferencia neutra", () => {
  const result = closureSummary(amounts, "0.30");
  assert.equal(result.total, "0.30");
  assert.equal(result.direction, "balanced");
  assert.deepEqual(result.invalid, []);
});
test("faltante y sobrante con importe absoluto", () => {
  assert.equal(closureSummary(amounts, "0.40").direction, "short");
  assert.equal(closureSummary(amounts, "0.20").direction, "over");
  assert.equal(closureSummary(amounts, "0.20").difference, "0.10");
});
test("un inválido no bloquea los otros grupos", () => {
  const result = closureSummary({ ...amounts, transfers: ["no", "1.500,50"] }, "0.00");
  assert.deepEqual(result.invalid, ["transfers-0"]);
  assert.equal(result.total, "1500.80");
});

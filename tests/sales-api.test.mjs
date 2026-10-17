/** Payload exacto, reintento idempotente y errores definitivos/ambiguos. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { normalizeMoneyInput } from "../src/utils/money.ts";
test("reintenta el mismo client_id sin confiar en totales del cliente", async () => {
  let source = stripTypeScriptTypes(await readFile(new URL("../src/api/sales.ts", import.meta.url), "utf8"));
  source = source.replace('import { API_URL, authFetch, readError, request } from "./products";',
    "const { API_URL, authFetch, readError, request } = globalThis.__salesTest;");
  source = source.replace('import { normalizeMoneyInput } from "../utils/money";',
    "const { normalizeMoneyInput } = globalThis.__salesTest;");
  const bodies = [];
  let status = 500;
  globalThis.__salesTest = {
    API_URL: "https://example.invalid", normalizeMoneyInput, request() {},
    readError: async () => "Error de prueba",
    authFetch: async (_, options) => {
      bodies.push(JSON.parse(options.body));
      return new Response(JSON.stringify({ id: 1, total: "0.30", change: "0.70" }), { status });
    },
  };
  try {
    const { salesApi, SaleRejectedError } = await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"));
    const sale = { clientId: crypto.randomUUID(), paid: "1,00", lines: [
      { kind: "manual", lineId: crypto.randomUUID(), name: "Pan", price: "0.10", quantity: 3 },
    ] };
    await assert.rejects(salesApi.create(sale), (error) => !(error instanceof SaleRejectedError));
    status = 201;
    assert.equal((await salesApi.create(sale)).id, 1);
    assert.deepEqual(bodies[0], bodies[1]);
    assert.equal(bodies[0].paid, "1.00");
    assert.equal(bodies[0].client_id, sale.clientId);
    assert.equal("total" in bodies[0], false);
    status = 422;
    await assert.rejects(salesApi.create(sale), SaleRejectedError);
    status = 201;
    await salesApi.create({ ...sale, paid: "" });
    assert.equal(bodies.at(-1).paid, null);
  } finally { delete globalThis.__salesTest; }
});

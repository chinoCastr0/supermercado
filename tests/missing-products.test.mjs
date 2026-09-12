/**
 * Pruebas de los helpers puros de la sección Faltantes: armado de la query HTTP
 * y normalización del borrador del formulario de alta rápida.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMissingListQuery,
  buildMissingPayload,
} from "../src/utils/missingProducts.ts";

test("la query incluye estado, búsqueda y paginación", () => {
  const query = new URLSearchParams(
    buildMissingListQuery(
      { search: "  coca  ", status: "pending" },
      0,
      500,
    ),
  );
  assert.equal(query.get("status"), "pending");
  assert.equal(query.get("search"), "coca");
  assert.equal(query.get("skip"), "0");
  assert.equal(query.get("limit"), "500");
});

test("una búsqueda vacía no agrega el parámetro search", () => {
  const query = new URLSearchParams(
    buildMissingListQuery({ search: "   ", status: "all" }, 0, 500),
  );
  assert.equal(query.has("search"), false);
});

test("el borrador recorta el nombre y conserva la cantidad como texto", () => {
  const payload = buildMissingPayload({
    name: "  COCA COLA 2.25L ",
    quantity: "media caja",
    notes: "  ",
    productId: 7,
  });
  assert.deepEqual(payload, {
    name: "COCA COLA 2.25L",
    quantity: "media caja",
    notes: null,
    product_id: 7,
  });
});

test("sin nombre utilizable el borrador no produce payload", () => {
  assert.equal(
    buildMissingPayload({
      name: "   ",
      quantity: "3 bultos",
      notes: "",
      productId: null,
    }),
    null,
  );
});

test("cantidad y nota vacías viajan como null, sin producto vinculado", () => {
  const payload = buildMissingPayload({
    name: "GALLETITAS SONRISA",
    quantity: "",
    notes: "",
    productId: null,
  });
  assert.equal(payload.quantity, null);
  assert.equal(payload.notes, null);
  assert.equal(payload.product_id, null);
});

// Cargar el adaptador Vite con el runner Node existente, sin dependencias nuevas.
const { registerHooks } = await import("node:module");
const { readFileSync } = await import("node:fs");
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && context.parentURL?.includes("/src/") && !/\.[a-z]+$/.test(specifier)) {
      return nextResolve(specifier + ".ts", context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith("/src/api/products.ts")) {
      return { format: "module-typescript", source: readFileSync(new URL(url), "utf8").replace("import.meta.env.VITE_API_URL", '"/api"'), shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
const { missingProductsApi, MissingProductConflictError } = await import("../src/api/missingProducts.ts");
const { readError } = await import("../src/api/products.ts");
hooks.deregister();

const existing = { id: 3, name: "Leche", product_id: 7, status: "pending", quantity: null, notes: null, created_at: "2026-09-12T00:00:00Z", resolved_at: null };
for (const [detail, message, typed] of [
  [{ message: "Pendiente existente del backend", existing }, "Pendiente existente del backend", true],
  [{ message: "Conflicto sin anotación" }, "Conflicto sin anotación", false],
  ["Conflicto textual", "Conflicto textual", false],
  [[{ msg: "Validación uno" }, { msg: "Validación dos" }], "Validación uno Validación dos", false],
  [null, "No se pudo completar la operación.", false],
]) {
  test("create 409 lee una sola vez: " + message, async t => {
    const response = new Response(JSON.stringify({ detail }), { status: 409 });
    const parse = response.json.bind(response);
    let reads = 0;
    t.mock.method(response, "json", () => { reads++; return parse(); });
    t.mock.method(globalThis, "fetch", async () => response);
    await assert.rejects(missingProductsApi.create({ name: "Leche", product_id: 7 }), error => {
      assert.equal(error.message, message);
      assert.equal(error instanceof MissingProductConflictError, typed);
      if (typed) assert.deepEqual(error.existing, existing);
      return true;
    });
    assert.equal(reads, 1);
    assert.equal(response.bodyUsed, true);
    assert.equal(await readError(new Response(JSON.stringify({ detail }))), message);
  });
}

test("create 409 con JSON inválido usa fallback sin releer", async t => {
  const response = new Response("no json", { status: 409 });
  const parse = response.json.bind(response);
  let reads = 0;
  t.mock.method(response, "json", () => { reads++; return parse(); });
  t.mock.method(globalThis, "fetch", async () => response);
  await assert.rejects(missingProductsApi.create({ name: "Leche" }), /No se pudo completar/);
  assert.equal(reads, 1);
});

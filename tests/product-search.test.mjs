/**
 * Pruebas de filtros, cancelación de temporizadores y reinicio de página.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  applySearchInput,
  buildProductListQuery,
  scheduleDebouncedSearch,
} from "../src/utils/productSearch.ts";

test("construye una búsqueda combinada con filtros y paginación", () => {
  const query = new URLSearchParams(
    buildProductListQuery(
      { search: "coca 500 ml", status: "active", printStatus: "pending" },
      500,
      500,
    ),
  );
  assert.equal(query.get("search"), "coca 500 ml");
  assert.equal(query.get("active_status"), "active");
  assert.equal(query.get("print_status"), "pending");
  assert.equal(query.get("skip"), "500");
  assert.equal(query.get("limit"), "500");
});

test("el debounce evita aplicar cada pulsación y conserva sólo la última", async () => {
  const applied = [];
  const cancelFirst = scheduleDebouncedSearch("co", (value) => applied.push(value), 15);
  cancelFirst();
  scheduleDebouncedSearch("coca", (value) => applied.push(value), 15);
  assert.deepEqual(applied, []);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(applied, ["coca"]);
});

test("cambiar o limpiar la búsqueda vuelve a la primera página", () => {
  let query = "anterior";
  let page = 7;
  applySearchInput("", (value) => { query = value; }, (value) => { page = value; });
  assert.equal(query, "");
  assert.equal(page, 1);
  const params = new URLSearchParams(
    buildProductListQuery(
      { search: query, status: "all", printStatus: "all" },
      0,
      500,
    ),
  );
  assert.equal(params.has("search"), false);
});

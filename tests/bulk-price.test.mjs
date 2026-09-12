/**
 * Pruebas puras de vista previa y transiciones; no ejercitan botones ni HTTP.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBulkPricePreview,
  bulkPriceTargets,
  bulkPriceTransition,
} from "../src/utils/bulkPrice.ts";

const products = [
  {
    id: 1,
    barcode: "779000000001",
    name: "Producto uno",
    price: "10.50",
    revision: 4,
    weight: null,
    weight_unit: null,
    last_updated: "2026-09-05T00:00:00Z",
    label_version: 1,
    printed: false,
    printed_at: null,
  },
  {
    id: 2,
    barcode: "779000000002",
    name: "Producto igual",
    price: "20.00",
    revision: 8,
    weight: null,
    weight_unit: null,
    last_updated: "2026-09-05T00:00:00Z",
    label_version: 2,
    printed: true,
    printed_at: "2026-09-05T00:00:00Z",
  },
];

test("la confirmación enumera todos los productos y marca los que no cambian", () => {
  const preview = buildBulkPricePreview(products, "20.00");

  assert.equal(preview.length, 2);
  assert.deepEqual(
    preview.map(({ name, barcode, currentPrice, newPrice, changes }) => ({
      name,
      barcode,
      currentPrice,
      newPrice,
      changes,
    })),
    [
      {
        name: "Producto uno",
        barcode: "779000000001",
        currentPrice: "10.50",
        newPrice: "20.00",
        changes: true,
      },
      {
        name: "Producto igual",
        barcode: "779000000002",
        currentPrice: "20.00",
        newPrice: "20.00",
        changes: false,
      },
    ],
  );
  assert.deepEqual(bulkPriceTargets(preview), [
    { id: 1, expected_revision: 4 },
    { id: 2, expected_revision: 8 },
  ]);
});

test("continuar y cancelar nunca solicitan aplicar cambios", () => {
  assert.deepEqual(bulkPriceTransition("entry", "continue"), {
    step: "confirmation",
    shouldSubmit: false,
  });
  assert.deepEqual(bulkPriceTransition("confirmation", "cancel"), {
    step: "closed",
    shouldSubmit: false,
  });
});

test("sólo la confirmación explícita habilita el request", () => {
  assert.deepEqual(bulkPriceTransition("confirmation", "confirm"), {
    step: "submitting",
    shouldSubmit: true,
  });
  assert.equal(
    bulkPriceTransition("entry", "confirm").shouldSubmit,
    false,
  );
});

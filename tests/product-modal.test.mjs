import assert from "node:assert/strict";
import test from "node:test";
import { closeProductEditor, saveProductAndReset } from "../src/utils/productModal.ts";

function editor() {
  const state = { query: "leche", debouncedQuery: "leche", page: 4, modal: "product", barcode: "123", focusCost: true };
  const focus = { current: false };
  const close = () => closeProductEditor({
    setNewProductBarcode: value => { state.barcode = value; },
    setFocusProductCost: value => { state.focusCost = value; },
    restoreSearchFocus: focus,
    closeModal: () => { state.modal = null; },
  });
  const reset = () => { state.query = ""; state.debouncedQuery = ""; state.page = 1; };
  return { state, focus, close, reset };
}

for (const button of ["Cancelar", "X"]) {
  test(button + " preserva búsqueda y página al invocar onClose", () => {
    const { state, focus, close } = editor();
    close();
    assert.deepEqual(state, { query: "leche", debouncedQuery: "leche", page: 4, modal: null, barcode: "", focusCost: false });
    assert.equal(focus.current, true);
  });
}

test("guardar sólo resetea después del éxito; el cierre posterior conserva el reset", async () => {
  const { state, close, reset } = editor();
  const payload = { name: "Leche", price: "10.00" };
  let finish;
  const pending = saveProductAndReset((received, id) => {
    assert.equal(received, payload);
    assert.equal(id, 7);
    return new Promise(resolve => { finish = resolve; });
  }, payload, 7, reset);
  assert.equal(state.page, 4);
  finish(true);
  assert.equal(await pending, true);
  close();
  assert.equal(state.query, "");
  assert.equal(state.debouncedQuery, "");
  assert.equal(state.page, 1);
});

test("guardar fallido o rechazado preserva navegación y modal", async () => {
  const { state, reset } = editor();
  assert.equal(await saveProductAndReset(async () => false, {}, undefined, reset), false);
  await assert.rejects(saveProductAndReset(async () => { throw new Error("red"); }, {}, undefined, reset), /red/);
  assert.equal(state.query, "leche");
  assert.equal(state.page, 4);
  assert.equal(state.modal, "product");
});

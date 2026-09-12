import type { ProductPayload } from "../types/product";

/** El cierre sólo limpia el modal; la navegación pertenece al guardado exitoso. */
export function closeProductEditor(actions: {
  setNewProductBarcode: (value: string) => void;
  setFocusProductCost: (value: boolean) => void;
  restoreSearchFocus: { current: boolean };
  closeModal: () => void;
}) {
  actions.setNewProductBarcode("");
  actions.setFocusProductCost(false);
  actions.restoreSearchFocus.current = true;
  actions.closeModal();
}

export async function saveProductAndReset(
  save: (payload: ProductPayload, productId?: number) => Promise<boolean>,
  payload: ProductPayload,
  productId: number | undefined,
  resetSearch: () => void,
): Promise<boolean> {
  const saved = await save(payload, productId);
  if (saved) resetSearch();
  return saved;
}

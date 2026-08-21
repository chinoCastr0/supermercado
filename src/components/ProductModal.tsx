import { useState } from 'react'
import type { FormEvent } from 'react'
import type { Product, ProductDraft, ProductPayload } from '../types/product'
import { Modal } from './Modal'

const EMPTY_DRAFT: ProductDraft = { barcode: '', name: '', price: '', active: true }
type Props = { product: Product | null; isSaving: boolean; onClose: () => void; onSave: (payload: ProductPayload, productId?: number) => Promise<boolean> }

export function ProductModal({ product, isSaving, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<ProductDraft>(() => product ? { barcode: product.barcode, name: product.name, price: String(product.price), active: product.active } : EMPTY_DRAFT)
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (await onSave({ ...draft, price: Number(draft.price) }, product?.id)) onClose()
  }
  return <Modal titleId="product-modal-title" isBusy={isSaving} onClose={onClose}>
    <div className="modal-header"><div><span className="modal-kicker">INVENTARIO</span><h2 id="product-modal-title">{product ? 'Editar producto' : 'Nuevo producto'}</h2></div><button type="button" onClick={onClose} aria-label="Cerrar">×</button></div>
    <form onSubmit={(event) => void submit(event)}>
      <label>Nombre del producto<input autoFocus required maxLength={255} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Ej. Yerba mate 1 kg" /></label>
      <label>Código de barras<input required maxLength={50} value={draft.barcode} onChange={(event) => setDraft({ ...draft, barcode: event.target.value })} placeholder="Ej. 7791234567890" /></label>
      <label>Precio<input required min="0.01" step="0.01" type="number" value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} placeholder="0,00" /></label>
      <label className="switch-row"><span><strong>Producto activo</strong><small>Visible y disponible en el inventario</small></span><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /></label>
      <div className="modal-actions"><button className="button secondary" type="button" onClick={onClose}>Cancelar</button><button className="button primary" disabled={isSaving} type="submit">{isSaving ? 'Guardando…' : product ? 'Guardar cambios' : 'Agregar producto'}</button></div>
    </form>
  </Modal>
}

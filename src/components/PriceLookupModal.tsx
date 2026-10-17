/** Presentación de consulta de precios; el lector lo controla Caja. */
import { Modal } from "./Modal";
import { formatMoney } from "../utils/money";
import type { CashProduct } from "../utils/cashRegister";
export function PriceLookupModal({ product, message, code, onCode, onLookup, onCamera, onClose }: {
  product: CashProduct | null; message: string; code: string;
  onCode: (value: string) => void; onLookup: () => void; onCamera: () => void; onClose: () => void;
}) {
  return <Modal titleId="price-title" isBusy={false} onClose={onClose}>
    <div data-barcode-dialog><h2 id="price-title">Consultar precio</h2>
      <div className="cash-scan"><label htmlFor="price-code">Código de barras</label><div>
        <input id="price-code" autoFocus data-barcode-search value={code} onChange={(e) => onCode(e.target.value)} />
        <button className="button secondary" onClick={onLookup}>Consultar</button>
        <button className="button secondary" onClick={onCamera}>Cámara</button>
      </div></div>
      <div className="price-result" role="status">{product ? <>
        <h3>{product.name}</h3><p>{product.barcode}</p><strong>{formatMoney(product.price)}</strong>
      </> : <p>{message}</p>}</div>
      <button className="button primary" onClick={onClose}>Cerrar</button>
    </div>
  </Modal>;
}

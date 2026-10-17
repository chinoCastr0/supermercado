import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useCashRegister } from "../hooks/useCashRegister";
import { useBarcodeKeyboard } from "../hooks/useBarcodeKeyboard";
import { articleCount, normalizeQuantity, paymentBalance } from "../utils/cashRegister";
import { formatMoney, multiplyMoney } from "../utils/money";

const BarcodeScanner = lazy(() => import("./BarcodeScanner").then((module) => ({ default: module.BarcodeScanner })));

export function CashRegisterView({ storageKey }: { storageKey: string }) {
  const cash = useCashRegister(storageKey);
  const [code, setCode] = useState("");
  const [camera, setCamera] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const paidRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const focusScanner = () => searchRef.current?.focus({ preventScroll: true });
  const balance = paymentBalance(cash.total, cash.paid);

  const scan = async (barcode: string) => {
    setCode(""); setConfirmed(false);
    const result = await cash.scan(barcode);
    listRef.current?.scrollTo({ top: 0 });
    return result;
  };
  useBarcodeKeyboard(!camera, scan, {
    queue: true,
    allowTextSearch: true,
    restoreEditable: (target, value) => {
      if (target === paidRef.current) cash.setPaid(value);
      else {
        const id = Number(target.dataset.productId);
        setDrafts((previous) => ({ ...previous, [id]: value }));
        cash.setQuantity(id, value);
      }
      focusScanner();
    },
  });

  useEffect(() => {
    searchRef.current?.focus({ preventScroll: true });
  }, [camera]);

  useEffect(() => {
    if (camera) return;
    const shortcuts = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault(); paidRef.current?.focus(); paidRef.current?.select();
      } else if (event.key === "Escape") {
        event.preventDefault(); setCode(""); searchRef.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  }, [camera]);

  const reset = () => {
    if ((cash.lines.length || cash.pending) && !window.confirm("¿Vaciar los productos e iniciar una nueva venta?")) return;
    cash.reset(); setDrafts({}); setCode(""); setConfirmed(false); focusScanner();
  };

  return (
    <section className="content cash-register" aria-label="Caja">
      <div className="page-heading">
        <div><h1>Caja</h1><p>Escaneá productos y calculá el vuelto. Esta caja no guarda ventas ni descuenta stock.</p></div>
        <button className="button secondary" onClick={reset}>Nueva venta</button>
      </div>
      <div className="cash-layout">
        <div className="cash-products">
          <div className="cash-scan">
            <label htmlFor="cash-code">Código de barras</label>
            <div>
              <input id="cash-code" ref={searchRef} data-barcode-search inputMode="numeric" autoComplete="off"
                value={code} onChange={(event) => setCode(event.target.value)} placeholder="Escaneá o escribí el código" />
              <button className="button secondary" onClick={() => { if (code.trim()) void scan(code); focusScanner(); }}>Agregar</button>
              <button className="button secondary" onClick={() => setCamera(true)}>Cámara</button>
            </div>
          </div>
          <p className="keyboard-hint"><kbd>Esc</kbd> limpiar código · <kbd>F2</kbd> paga con · <kbd>Enter</kbd> confirmar importe</p>
          <p className="cash-feedback" role="status">{cash.notice || "Listo para escanear."} {cash.pending > 0 && `Consultando ${cash.pending}…`}</p>
          <div className="cash-lines data-card" ref={listRef} aria-label="Productos de la venta">
            {!cash.lines.length && <div className="state-panel"><h2>Tu próxima venta empieza acá</h2><p>Usá el lector, ingresá un código o abrí la cámara.</p></div>}
            {cash.lines.map((line) => (
              <article key={line.id} className={`cash-line ${cash.highlight === line.id ? "cash-highlight" : ""}`}>
                <div className="cash-product-name"><strong>{line.name}</strong><small>{line.barcode}</small></div>
                <div><small>Precio unitario</small><span>{formatMoney(line.price)}</span></div>
                <label>Cantidad
                  <input aria-label={`Cantidad de ${line.name}`} inputMode="numeric" data-barcode-edit data-product-id={line.id}
                    value={drafts[line.id] ?? String(line.quantity)}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (!/^\d*$/.test(value) || (value && !Number.isSafeInteger(Number(value)))) return;
                      setDrafts((previous) => ({ ...previous, [line.id]: value }));
                      cash.setQuantity(line.id, value); setConfirmed(false);
                    }}
                    onBlur={(event) => {
                      setDrafts((previous) => { const next = { ...previous }; delete next[line.id]; return next; });
                      if (!event.relatedTarget) focusScanner();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") { event.preventDefault(); focusScanner(); }
                    }} />
                </label>
                <div><small>Subtotal</small><strong>{formatMoney(multiplyMoney(line.price, normalizeQuantity(line.quantity)))}</strong></div>
                <button className="button ghost" aria-label={`Quitar ${line.name}`} onClick={() => {
                  cash.remove(line.id); setConfirmed(false); focusScanner();
                }}>Quitar</button>
              </article>
            ))}
          </div>
        </div>
        <aside className="cash-payment data-card" aria-label="Total y pago">
          <div className="cash-total"><span>Total · {articleCount(cash.lines)} {articleCount(cash.lines) === "1" ? "artículo" : "artículos"}</span><strong>{formatMoney(cash.total)}</strong></div>
          <form onSubmit={(event) => { event.preventDefault(); setConfirmed(Boolean(balance?.enough && cash.lines.length && !cash.pending)); focusScanner(); }}>
            <label htmlFor="cash-paid">Paga con <kbd>F2</kbd></label>
            <div className="cash-pay-input"><input id="cash-paid" ref={paidRef} data-barcode-edit inputMode="decimal" autoComplete="off" placeholder="0,00"
              value={cash.paid} onChange={(event) => { cash.setPaid(event.target.value); setConfirmed(false); }}
              onBlur={(event) => { if (!event.relatedTarget) focusScanner(); }} />
              <button className="button primary" type="submit" disabled={!balance?.enough || !cash.lines.length || cash.pending > 0}>Confirmar</button></div>
            <div className="cash-quick">
              <button type="button" className="button secondary" onClick={() => { cash.setPaid(formatMoney(cash.total).replace("$ ", "")); setConfirmed(false); focusScanner(); }}>Justo</button>
              {["1000", "2000", "5000", "10000", "20000"].map((amount) => <button type="button" className="button secondary" key={amount}
                onClick={() => { cash.setPaid(amount); setConfirmed(false); focusScanner(); }}>{formatMoney(`${amount}.00`).replace(",00", "")}</button>)}
            </div>
          </form>
          <div className={`cash-balance ${balance?.enough ? "cash-enough" : "cash-short"}`} role="status">
            {balance ? <><span>{balance.enough ? "Vuelto" : "Faltan"}</span><strong>{formatMoney(balance.amount)}</strong></>
              : <span>{cash.paid ? "Ingresá un importe válido (ej. 1.500,50)." : "Ingresá el pago para calcular el vuelto."}</span>}
          </div>
          {confirmed && <p className="cash-confirmed" role="status">Importe confirmado. Usá Nueva venta para continuar.</p>}
        </aside>
      </div>
      {camera && <Suspense fallback={<p role="status">Cargando cámara…</p>}><BarcodeScanner
        onClose={() => setCamera(false)} onDetected={async (barcode) => {
          const result = await scan(barcode);
          if (result !== "error") setCamera(false);
          return result;
        }} /></Suspense>}
    </section>
  );
}

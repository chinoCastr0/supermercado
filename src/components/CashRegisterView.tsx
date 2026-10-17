/** Venta activa: escaneo, manuales y cobro. */
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useCashRegister } from "../hooks/useCashRegister";
import { useBarcodeKeyboard } from "../hooks/useBarcodeKeyboard";
import { articleCount, normalizeQuantity, paymentBalance } from "../utils/cashRegister";
import { formatMoney, multiplyMoney } from "../utils/money";

import { usePermissions } from "../hooks/usePermissions";
import { NoticeBanner } from "./NoticeBanner";
import { ManualProductForm } from "./ManualProductForm";
import { PriceLookupModal } from "./PriceLookupModal";
import { usePriceLookup } from "../hooks/usePriceLookup";

const BarcodeScanner = lazy(() => import("./BarcodeScanner").then((module) => ({ default: module.BarcodeScanner })));

export function CashRegisterView({ storageKey }: { storageKey: string }) {
  const cash = useCashRegister(storageKey);
  const { canCreateSales } = usePermissions();
  const [mode, setMode] = useState<"venta" | "consulta">("venta");
  const priceLookup = usePriceLookup();
  const [code, setCode] = useState("");
  const [camera, setCamera] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const searchRef = useRef<HTMLInputElement>(null);
  const paidRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const focusScanner = () => searchRef.current?.focus({ preventScroll: true });
  const balance = paymentBalance(cash.total, cash.paid.trim() || cash.total);

  const scan = async (barcode: string) => {
    setCode("");
    const result = await (mode === "consulta" ? priceLookup.lookup(barcode) : cash.scan(barcode));
    listRef.current?.scrollTo({ top: 0 });
    return result;
  };
  useBarcodeKeyboard(!camera && !cash.submitted && !cash.saving, scan, {
    queue: true,
    allowDialog: mode === "consulta",
    allowTextSearch: true,
    restoreEditable: (target, value) => {
      if (target === paidRef.current) cash.setPaid(value);
      else {
        const id = target.dataset.lineId ?? "";
        setDrafts((previous) => ({ ...previous, [id]: value }));
        cash.setQuantity(id, value);
      }
      focusScanner();
    },
  });

  useEffect(() => {
    if (mode === "venta" && !camera) searchRef.current?.focus({ preventScroll: true });
  }, [camera, mode, cash.submitted, cash.saving]);

  useEffect(() => {
    if (camera || mode === "consulta" || cash.submitted || cash.saving) return;
    const shortcuts = (event: KeyboardEvent) => {
      if (event.key === "F2") {
        event.preventDefault(); paidRef.current?.focus(); paidRef.current?.select();
      } else if (event.key === "Escape") {
        event.preventDefault(); setCode(""); searchRef.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener("keydown", shortcuts);
    return () => window.removeEventListener("keydown", shortcuts);
  }, [camera, mode, cash.submitted, cash.saving]);

  const reset = () => {
    if ((cash.lines.length || cash.pending) && !window.confirm("¿Vaciar los productos e iniciar una nueva venta?")) return;
    cash.reset(); setDrafts({}); setCode(""); focusScanner();
  };

  return (
    <section className="content cash-register" aria-label="Caja">
      <div className="page-heading">
        <div><h1>Caja</h1></div>
        <button className="button secondary" disabled={cash.saving || cash.submitted} onClick={reset}>Nueva venta</button>
      </div>
      <button disabled={cash.saving || cash.submitted} className="button secondary" onClick={() => { setCode(""); setMode("consulta"); }}>Consultar precio</button>
      <div className="cash-layout">
        <fieldset className="cash-products cash-sale-fields" disabled={cash.saving || cash.submitted}>
          <div className="cash-scan">
            <label htmlFor="cash-code">Código de barras</label>
            <div>
              <input id="cash-code" ref={searchRef} data-barcode-search inputMode="numeric" autoComplete="off"
                value={code} onChange={(event) => setCode(event.target.value)} placeholder="Escaneá o escribí el código" />
              <button className="button secondary" onClick={() => { if (code.trim()) void scan(code); focusScanner(); }}>Agregar</button>
              <button className="button secondary" onClick={() => setCamera(true)}>Cámara</button>
            </div>
          </div>
          <ManualProductForm onAdd={cash.addManual} />
          {(cash.notice || cash.pending > 0) && <p className="cash-feedback" role="status">{cash.notice} {cash.pending > 0 && `Consultando ${cash.pending}…`}</p>}
          <div className="cash-lines data-card" ref={listRef} aria-label="Productos de la venta">
            {!cash.lines.length && <div className="state-panel"><h2>Tu próxima venta empieza acá</h2></div>}
            {cash.lines.map((line) => (
              <article key={line.lineId} className={`cash-line ${line.kind === "product" && cash.highlight === line.productId ? "cash-highlight" : ""}`}>
                <div className="cash-product-name"><strong>{line.name}</strong><small>{line.barcode}</small></div>
                <div><small>Precio unitario</small><span>{formatMoney(line.price)}</span></div>
                <label>Cantidad
                  <input aria-label={`Cantidad de ${line.name}`} inputMode="numeric" data-barcode-edit data-line-id={line.lineId}
                    value={drafts[line.lineId] ?? String(line.quantity)}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (!/^\d*$/.test(value) || (value && !Number.isSafeInteger(Number(value)))) return;
                      setDrafts((previous) => ({ ...previous, [line.lineId]: value }));
                      cash.setQuantity(line.lineId, value);
                    }}
                    onBlur={(event) => {
                      setDrafts((previous) => { const next = { ...previous }; delete next[line.lineId]; return next; });
                      if (!event.relatedTarget) focusScanner();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") { event.preventDefault(); focusScanner(); }
                    }} />
                </label>
                <div><small>Subtotal</small><strong>{formatMoney(multiplyMoney(line.price, normalizeQuantity(line.quantity)))}</strong></div>
                <button className="button ghost" aria-label={`Quitar ${line.name}`} onClick={() => {
                  cash.remove(line.lineId); focusScanner();
                }}>Quitar</button>
              </article>
            ))}
          </div>
        </fieldset>
        <aside className="cash-payment data-card" aria-label="Total y pago">
          <div className="cash-total"><span>Total · {articleCount(cash.lines)} {articleCount(cash.lines) === "1" ? "artículo" : "artículos"}</span><strong>{formatMoney(cash.total)}</strong></div>
          <fieldset className="cash-sale-fields" disabled={cash.saving || cash.submitted}>
          <div className="cash-payment-fields">
            <label htmlFor="cash-paid">Paga con</label>
            <input id="cash-paid" ref={paidRef} data-barcode-edit inputMode="decimal" autoComplete="off" placeholder="0,00"
              value={cash.paid} onChange={(event) => { cash.setPaid(event.target.value); }}
              onBlur={(event) => { if (!event.relatedTarget) focusScanner(); }} />
            <div className="cash-quick">
              <button type="button" className="button secondary" onClick={() => { cash.setPaid(formatMoney(cash.total).replace("$ ", "")); focusScanner(); }}>Justo</button>
              {["1000", "2000", "5000", "10000", "20000"].map((amount) => <button type="button" className="button secondary" key={amount}
                onClick={() => { cash.setPaid(amount); focusScanner(); }}>{formatMoney(`${amount}.00`).replace(",00", "")}</button>)}
            </div>
          </div>
          </fieldset>
          <div className={`cash-balance ${balance?.enough ? "cash-enough" : "cash-short"}`} role="status">
            {balance ? <><span>{balance.enough ? "Vuelto" : "Faltan"}</span><strong>{formatMoney(balance.amount)}</strong></>
              : <span>{cash.paid ? "Ingresá un importe válido (ej. 1.500,50)." : "Ingresá el pago para calcular el vuelto."}</span>}
          </div>
      <div className="cash-finalize">
        {cash.resultNotice && <NoticeBanner notice={cash.resultNotice} onClose={cash.dismissNotice} />}
        {cash.submitted && !cash.saving && <p>La venta se conserva sin cambios. Reintentá para verificar su registro sin duplicarla.</p>}
        <button className="button primary" disabled={!canCreateSales || !balance?.enough || !cash.lines.length || cash.pending > 0 || cash.saving}
          onClick={() => void cash.finalize()}>{cash.saving ? "Registrando…" : cash.submitted ? "Reintentar finalizar venta" : "Finalizar venta"}</button>
        {!canCreateSales && <p>Tu rol no tiene permiso para registrar ventas.</p>}
      </div>
        </aside>
      </div>
      {mode === "consulta" && !camera && <PriceLookupModal product={priceLookup.product} message={priceLookup.message} code={code} onCode={setCode} onLookup={() => { if (code.trim()) void scan(code); }} onCamera={() => setCamera(true)} onClose={() => { setMode("venta"); setCode(""); }} />}
      {camera && <Suspense fallback={<p role="status">Cargando cámara…</p>}><BarcodeScanner
        onClose={() => setCamera(false)} onDetected={async (barcode) => {
          const result = await scan(barcode);
          if (result !== "error") setCamera(false);
          return result;
        }} /></Suspense>}
    </section>
  );
}

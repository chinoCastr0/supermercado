/** Edición transitoria de la promoción y vista previa, con limpieza de URLs blob. */
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { offersApi } from "../api/offers";
import type { Product } from "../types/product";
import { Modal } from "./Modal";
import { PdfPreview } from "./PdfPreview";

export function OfferTicketModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const [promoText, setPromoText] = useState("");
  const [copies, setCopies] = useState("1");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; filename: string } | null>(null);
  const pending = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview.url);
  }, [preview]);

  const generate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending.current) return;
    const count = Number(copies);
    if (!promoText.trim() || !Number.isInteger(count) || count < 1 || count > 1000) {
      setError("Ingresá la promoción y una cantidad entera de entre 1 y 1000 copias.");
      return;
    }
    pending.current = true;
    setIsGenerating(true);
    setError(null);
    try {
      const result = await offersApi.generateTicket(product.id, promoText.trim(), count);
      if (mounted.current) setPreview({ url: URL.createObjectURL(result.blob), filename: result.filename });
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "No se pudo generar el ticket.");
    } finally {
      pending.current = false;
      if (mounted.current) setIsGenerating(false);
    }
  };

  return <Modal titleId="offer-ticket-title" isBusy={isGenerating} onClose={onClose}
    className={preview ? "label-preview-modal" : "offer-ticket-modal"}>
    <div className="modal-header">
      <div>
        <span className="modal-kicker">A4 APAISADA · 2 × 2</span>
        <h2 id="offer-ticket-title">Crear oferta</h2>
      </div>
      <button type="button" onClick={onClose} disabled={isGenerating} aria-label="Volver al producto">×</button>
    </div>
    <p className="modal-description">{product.name}. El ticket usa los datos guardados del producto y su precio por kg, litro o unidad.</p>
    {preview ? <PdfPreview url={preview.url} filename={preview.filename} title="Previsualización del ticket de oferta">
      <button className="button primary" type="button" onClick={() => setPreview(null)}>Editar oferta</button>
    </PdfPreview> : <form onSubmit={(event) => void generate(event)}>
      {error && <p className="form-error" role="alert">{error}</p>}
      <label>Texto de la promoción
        <textarea autoFocus required maxLength={500} rows={3} value={promoText}
          disabled={isGenerating} onChange={(event) => setPromoText(event.target.value)}
          placeholder="Ej. 2x1, Antes $500 Ahora $350, 20% OFF" />
      </label>
      <label>Copias
        <input type="number" required min={1} max={1000} step={1} value={copies}
          disabled={isGenerating} onChange={(event) => setCopies(event.target.value)} />
      </label>
      <div className="modal-actions">
        <button className="button secondary" type="button" disabled={isGenerating} onClick={onClose}>Volver al producto</button>
        <button className="button primary" type="submit" disabled={isGenerating}>{isGenerating ? "Generando…" : "Generar PDF"}</button>
      </div>
    </form>}
  </Modal>;
}

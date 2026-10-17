/** Estado de un cierre; recarga después de conflictos sin perder ediciones locales. */
import { useEffect, useState } from "react";
import { closuresApi, type Closure } from "../api/cashClosures";
import { closureSummary, type Amounts } from "../utils/cashClosure";
const empty = (): Amounts => ({ cash: ["", ""], transfers: [""], posnet: [""], orders: [""] });
export function useCashClosure(date: string) {
  const [record, setRecord] = useState<Closure | null>(null);
  const [amounts, setAmounts] = useState<Amounts>(empty);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    closuresApi.get(date).then((value) => {
      if (active) { setRecord(value); setAmounts(value.amounts); setLoading(false); setError(""); }
    }).catch((reason: Error) => { if (active) { setError(reason.message); setLoading(false); } });
    return () => { active = false; };
  }, [date, revision]);
  const summary = closureSummary(amounts, record?.sales_total ?? "0.00");
  const run = async (action: "save" | "confirm" | "reopen") => {
    if (busy) return;
    if (action !== "reopen" && summary.invalid.length) { setError("Corregí los importes marcados antes de guardar."); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      let next: Closure;
      if (action === "reopen") next = await closuresApi.reopen(date);
      else {
        next = await closuresApi.save(date, summary.normalized);
        if (action === "confirm") next = await closuresApi.confirm(date);
      }
      setRecord(next); setAmounts(next.amounts);
      setMessage(action === "confirm" ? "Cierre confirmado." : action === "reopen" ? "Cierre reabierto." : "Borrador guardado.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo guardar."); }
    finally { setBusy(false); }
  };
  return { record, amounts, setAmounts, loading, busy, error, message, summary, run,
    dismiss: () => { setError(""); setMessage(""); },
    refresh: () => { setLoading(true); setRevision((value) => value + 1); } };
}

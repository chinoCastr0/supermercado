/** Subsecciones de Caja y fecha inicial informada por el servidor. */
import { useEffect, useState } from "react";
import { usePermissions } from "../hooks/usePermissions";
import { salesApi } from "../api/sales";
import { CashRegisterView } from "./CashRegisterView";
import { SalesHistory } from "./SalesHistory";
import { CashClosureView } from "./CashClosureView";
import { Skeleton } from "./Skeleton";
export function CashView({ storageKey }: { storageKey: string }) {
  const permissions = usePermissions();
  const [tab, setTab] = useState("sale");
  const [date, setDate] = useState("");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!permissions.canReadSales) return;
    let active = true;
    salesApi.list().then((result) => { if (active) { setDate(result.date); setError(""); } }).catch((reason: Error) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, [permissions.canReadSales, revision]);
  return <>
    <nav className="cash-tabs" aria-label="Secciones de Caja">
      <button className={`button ${tab === "sale" ? "primary" : "secondary"}`} aria-current={tab === "sale" ? "page" : undefined} onClick={() => setTab("sale")}>Venta</button>
      {permissions.canReadSales && <button className={`button ${tab === "history" ? "primary" : "secondary"}`} onClick={() => setTab("history")}>Ventas</button>}
      {permissions.canManageClosures && <button className={`button ${tab === "closure" ? "primary" : "secondary"}`} onClick={() => setTab("closure")}>Cierre</button>}
    </nav>
    {tab === "sale" ? <CashRegisterView storageKey={storageKey} /> : <section className="content">
      <div className="page-heading"><h1>{tab === "history" ? "Ventas" : "Cierre de caja"}</h1><label>Fecha<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label></div>
      {!date ? error ? <p role="alert">{error} <button className="button secondary" onClick={() => setRevision((value) => value + 1)}>Reintentar</button></p> : <Skeleton label="Consultando fecha del servidor" /> :
        tab === "history" ? <SalesHistory key={date} date={date} /> : <CashClosureView key={date} date={date} />}
    </section>}
  </>;
}

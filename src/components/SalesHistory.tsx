/** Lista diaria con detalles históricos expandibles. */
import { useSalesHistory } from "../hooks/useSalesHistory";
import { formatMoney } from "../utils/money";
import { Skeleton } from "./Skeleton";
import { NoticeBanner } from "./NoticeBanner";
export function SalesHistory({ date }: { date: string }) {
  const { data, error, loading, refresh } = useSalesHistory(date);
  if (loading) return <Skeleton label="Cargando ventas" />;
  if (error) return <><NoticeBanner notice={{ kind: "error", message: error }} onClose={refresh} /><button className="button secondary" onClick={refresh}>Reintentar</button></>;
  return <div className="cash-history">
    <div className="page-heading"><h2>Total del día: {formatMoney(data?.total ?? "0.00")}</h2><button className="button secondary" onClick={refresh}>Actualizar</button></div>
    {!data?.sales.length && <div className="state-panel"><h3>Sin ventas registradas</h3><p>No hay ventas para esta fecha.</p></div>}
    {data?.sales.map((sale) => <details className="data-card cash-sale" key={sale.id}>
      <summary>Venta #{sale.id} · {new Date(sale.created_at).toLocaleTimeString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit" })} · {sale.items.reduce((count, item) => count + item.quantity, 0)} artículos ? {formatMoney(sale.total)}<small>Cajero: {sale.cashier}</small></summary>
      {sale.items.map((item, index) => <div className="cash-sale-item" key={index}><span>{item.name}<small>{item.barcode || "Producto manual"} · {item.quantity} · {formatMoney(item.price)}</small></span><strong>{formatMoney(item.subtotal)}</strong></div>)}
      <p>Pago: {formatMoney(sale.paid)} · Vuelto: {formatMoney(sale.change)}</p>
    </details>)}
  </div>;
}

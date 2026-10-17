/** Formulario de arqueo y diferencia respecto de ventas del servidor. */
import { useCashClosure } from "../hooks/useCashClosure";
import { usePermissions } from "../hooks/usePermissions";
import { AmountGroup } from "./AmountGroup";
import { Skeleton } from "./Skeleton";
import { NoticeBanner } from "./NoticeBanner";
import { Icon } from "./Icon";
import { amountKeys } from "../utils/cashClosure";
import { formatMoney } from "../utils/money";
const labels = { cash: "Efectivo", transfers: "Transferencia", posnet: "Posnet", orders: "Pedido" };
export function CashClosureView({ date }: { date: string }) {
  const cash = useCashClosure(date);
  const { isAdmin } = usePermissions();
  if (cash.loading) return <Skeleton label="Cargando cierre" />;
  const locked = cash.record?.status === "confirmed";
  return <div className="cash-closure">
    {(cash.error || cash.message) && <NoticeBanner notice={{ kind: cash.error ? "error" : "success", message: cash.error || cash.message }} onClose={cash.dismiss} />}
    {!cash.record ? <button className="button secondary" onClick={cash.refresh}>Reintentar carga</button> : <>
      <p>{locked ? "Cierre confirmado · importes bloqueados" : "Borrador de cierre"} · <button className="button ghost" disabled={cash.busy} onClick={() => { if (window.confirm("¿Recargar el cierre y descartar los cambios sin guardar?")) cash.refresh(); }}>Recargar</button></p>
      <div className="closure-groups">{amountKeys.map((key) => <AmountGroup key={key} label={labels[key]} addLabel={`Agregar ${labels[key].toLowerCase()}`} items={cash.amounts[key]}
        fixed={key === "cash"} disabled={locked || cash.busy} subtotal={cash.summary.subtotals[key]}
        invalid={cash.amounts[key].map((_, index) => cash.summary.invalid.includes(`${key}-${index}`))}
        onChange={(items) => cash.setAmounts({ ...cash.amounts, [key]: items })} />)}</div>
      <div className="data-card closure-summary">
        <h2>Total de caja: {formatMoney(cash.summary.total)}</h2>
        <p>Total de ventas del sistema: {formatMoney(cash.record.sales_total)}</p>
        <p className={cash.summary.direction === "short" ? "cash-short" : cash.summary.direction === "over" ? "cash-enough" : ""}>
          <Icon name={cash.summary.direction === "balanced" ? "check" : "alert"} /> {cash.summary.direction === "balanced" ? "Cuadra" : `${cash.summary.direction === "short" ? "Faltan" : "Sobran"} ${formatMoney(cash.summary.difference)}`}
        </p>
        {cash.summary.invalid.length > 0 && <p>Los importes inválidos no se incluyen en los totales.</p>}
        {locked ? isAdmin && <button className="button secondary" disabled={cash.busy} onClick={() => void cash.run("reopen")}>Reabrir cierre</button> : <div className="cash-actions">
          <button className="button secondary" disabled={cash.busy} onClick={() => void cash.run("save")}>Guardar borrador</button>
          <button className="button primary" disabled={cash.busy} onClick={() => { if (window.confirm("¿Confirmar y bloquear el cierre de esta fecha?")) void cash.run("confirm"); }}>Confirmar cierre</button>
        </div>}
      </div>
    </>}
  </div>;
}

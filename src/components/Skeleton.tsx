/** Placeholder accesible compartido para listas que esperan datos. */
export function Skeleton({ label = "Cargando", rows = 5 }: { label?: string; rows?: number }) {
  return <div className="skeleton-panel" role="status" aria-busy="true">
    <span className="sr-only">{label}</span>
    {Array.from({ length: rows }, (_, index) => <div className="skeleton-row" key={index} aria-hidden="true"><span /><span /><span /></div>)}
  </div>;
}

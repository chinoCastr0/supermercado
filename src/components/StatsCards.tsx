/**
 * Indicadores calculados sobre la colección recibida.
 * Actualmente App entrega resultados filtrados; estos valores no equivalen
 * a totales globales cuando hay una búsqueda o un filtro activo.
 */
import type { Product } from "../types/product";

/** Resume únicamente los productos de la colección recibida. */
export function StatsCards({ products }: { products: Product[] }) {
  const active = products.filter((product) => product.active).length;
  const pending = products.filter((product) => !product.printed).length;
  return (
    <div className="stats-grid">
      <article className="stat-card">
        <div className="stat-icon violet">◦</div>
        <div>
          <span>Total de productos</span>
          <strong>{products.length.toLocaleString("es-AR")}</strong>
          <small>registros en la base</small>
        </div>
      </article>
      <article className="stat-card">
        <div className="stat-icon amber">!</div>
        <div>
          <span>Carteles pendientes</span>
          <strong>{pending.toLocaleString("es-AR")}</strong>
          <small>requieren impresión</small>
        </div>
      </article>
      <article className="stat-card">
        <div className="stat-icon green">✓</div>
        <div>
          <span>Productos activos</span>
          <strong>{active.toLocaleString("es-AR")}</strong>
          <small>
            {products.length ? Math.round((active / products.length) * 100) : 0}
            % del inventario
          </small>
        </div>
      </article>
    </div>
  );
}

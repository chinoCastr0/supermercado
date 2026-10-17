/**
 * Indicadores calculados sobre la colección recibida.
 * Actualmente App entrega resultados filtrados; estos valores no equivalen
 * a totales globales cuando hay una búsqueda o un filtro activo.
 */
import { Icon } from "./Icon";
import type { Product } from "../types/product";

/** Resume únicamente los productos de la colección recibida. */
export function StatsCards({ products }: { products: Product[] }) {
  const pending = products.filter((product) => !product.printed).length;
  return (
    <div className="stats-grid">
      <article className="stat-card">
        <div className="stat-icon violet"><Icon name="box" /></div>
        <div>
          <span>Productos en esta vista</span>
          <strong>{products.length.toLocaleString("es-AR")}</strong>
          <small>según búsqueda y filtros</small>
        </div>
      </article>
      <article className="stat-card">
        <div className="stat-icon amber"><Icon name="alert" /></div>
        <div>
          <span>Carteles pendientes</span>
          <strong>{pending.toLocaleString("es-AR")}</strong>
          <small>requieren impresión</small>
        </div>
      </article>
    </div>
  );
}

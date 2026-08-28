/**
 * IMPORTANCIA: resume indicadores derivados de la colección de productos.
 *
 * PATRÓN / SOLID: Presentational Component con datos derivados; aplica SRP al
 * mantener estos cálculos fuera de `App`. Las métricas elegidas son una solución
 * específica del negocio, no forman parte del patrón.
 */
import type { Product } from "../types/product";

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

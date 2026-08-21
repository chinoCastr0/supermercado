import type { Product } from '../types/product'
//import { money } from '../utils/formatters'

export function StatsCards({ products }: { products: Product[] }) {
  const active = products.filter((product) => product.active).length
  /*const average = products.length*/
    ? products.reduce((total, product) => total + Number(product.price), 0) / products.length
    : 0

  return <div className="stats-grid">
    <article className="stat-card">
      <div className="stat-icon violet">◦</div>
      <div><span>Total de productos</span><strong>{products.length.toLocaleString('es-AR')}</strong>
      <small>registros en la base</small></div></article>
    <article className="stat-card"><div className="stat-icon green">✓</div>
    <div><span>Productos activos</span><strong>{active.toLocaleString('es-AR')}</strong>
    <small>{products.length ? Math.round(active / products.length * 100) : 0}% del inventario</small></div></article>
  {/* <article className="stat-card"><div className="stat-icon amber">$</div><div><span>Precio promedio</span><strong>{money.format(average)}</strong><small>sobre todos los productos</small></div></article>*/}
  </div>
}

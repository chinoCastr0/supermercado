import type { Product } from '../types/product'
import { formatDate, money } from '../utils/formatters'

type Props = {
  products: Product[]
  total: number
  page: number
  totalPages: number
  isLoading: boolean
  hasAnyProducts: boolean
  onPageChange: (page: number) => void
  onCreate: () => void
  onEdit: (product: Product) => void
  onDelete: (product: Product) => void
}

export function ProductsTable({ products, total, page, totalPages, isLoading, hasAnyProducts, onPageChange, onCreate, onEdit, onDelete }: Props) {
  const start = total ? (page - 1) * 10 + 1 : 0
  const end = Math.min(page * 10, total)

  if (isLoading) return <div className="state-panel"><span className="loader" /><h3>Cargando inventario</h3><p>Estamos consultando la base de datos.</p></div>
  if (!products.length) return <div className="state-panel"><div className="empty-icon">⌕</div><h3>No encontramos productos</h3><p>{hasAnyProducts ? 'Probá cambiando la búsqueda o los filtros.' : 'Agregá tu primer producto o importá una planilla.'}</p>{!hasAnyProducts && <button className="button primary" type="button" onClick={onCreate}>＋ Nuevo producto</button>}</div>

  return <>
    <div className="table-wrap"><table>
      <thead><tr><th>Producto</th><th>Código de barras</th><th>Precio</th><th>Última actualización</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr></thead>
      <tbody>{products.map((product) => <tr key={product.id}>
        <td data-label="Producto"><div className="product-cell"><span className="product-avatar">{product.name.charAt(0).toLocaleUpperCase('es')}</span><div><strong>{product.name}</strong><small>ID #{product.id}</small></div></div></td>
        <td data-label="Código"><code>{product.barcode}</code></td>
        <td data-label="Precio"><strong className="price">{money.format(Number(product.price))}</strong></td>
        <td data-label="Actualizado"><time dateTime={product.last_updated}>{formatDate(product.last_updated)}</time></td>
        <td data-label="Estado"><span className={`status-pill ${product.active ? 'active' : 'inactive'}`}><i />{product.active ? 'Activo' : 'Inactivo'}</span></td>
        <td className="row-actions"><button type="button" onClick={() => onEdit(product)} aria-label={`Editar ${product.name}`}>Editar</button><button className="delete" type="button" onClick={() => onDelete(product)} aria-label={`Eliminar ${product.name}`}>×</button></td>
      </tr>)}</tbody>
    </table></div>
    <footer className="pagination"><p>Mostrando <strong>{start}–{end}</strong> de <strong>{total}</strong></p><div><button type="button" disabled={page === 1} onClick={() => onPageChange(page - 1)}>← Anterior</button><span>Página {page} de {totalPages}</span><button type="button" disabled={page === totalPages} onClick={() => onPageChange(page + 1)}>Siguiente →</button></div></footer>
  </>
}

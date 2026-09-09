/**
 * Representación de una página y emisión de acciones mediante callbacks.
 * No consulta la API. El cálculo del rango asume diez filas por página y debe
 * mantenerse sincronizado con PAGE_SIZE de App.
 */
import type { Product } from "../types/product";
import { formatDate } from "../utils/formatters";
import { formatMoney } from "../utils/money";

type Props = {
  products: Product[];
  total: number;
  page: number;
  totalPages: number;
  isLoading: boolean;
  hasAnyProducts: boolean;
  selectedIds: ReadonlySet<number>;
  onPageChange: (page: number) => void;
  onCreate: () => void;
  onEdit: (product: Product) => void;
  onDelete: (product: Product) => void;
  onToggleSelected: (productId: number) => void;
  onTogglePage: (productIds: number[], selected: boolean) => void;
  onPrintStatus: (product: Product, printed: boolean) => void;
};

/** Muestra una página y notifica selección, edición, borrado e impresión. */
export function ProductsTable({
  products,
  total,
  page,
  totalPages,
  isLoading,
  hasAnyProducts,
  selectedIds,
  onPageChange,
  onCreate,
  onEdit,
  onDelete,
  onToggleSelected,
  onTogglePage,
  onPrintStatus,
}: Props) {
  const start = total ? (page - 1) * 10 + 1 : 0;
  const end = Math.min(page * 10, total);
  const pageIds = products.map((product) => product.id);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((productId) => selectedIds.has(productId));

  if (isLoading)
    return (
      <div className="state-panel">
        <span className="loader" />
        <h3>Cargando inventario</h3>
        <p>Estamos consultando la base de datos.</p>
      </div>
    );
  if (!products.length)
    return (
      <div className="state-panel">
        <div className="empty-icon">⌕</div>
        <h3>No encontramos productos</h3>
        <p>
          {hasAnyProducts
            ? "Probá cambiando la búsqueda o los filtros."
            : "Agregá tu primer producto o importá una planilla."}
        </p>
        {!hasAnyProducts && (
          <button className="button primary" type="button" onClick={onCreate}>
            ＋ Nuevo producto
          </button>
        )}
      </div>
    );

  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th className="selection-cell">
                <input
                  type="checkbox"
                  checked={allPageSelected}
                  onChange={(event) =>
                    onTogglePage(pageIds, event.target.checked)
                  }
                  aria-label="Seleccionar productos de esta página"
                />
              </th>
              <th>Producto</th>
              <th>Código de barras</th>
              <th>Precio</th>
              <th>Última actualización</th>
              <th>Peso</th>
              <th>IMPRESO</th>
              <th>
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id}>
                <td className="selection-cell" data-label="Seleccionar">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(product.id)}
                    onChange={() => onToggleSelected(product.id)}
                    aria-label={`Seleccionar ${product.name}`}
                  />
                </td>
                <td data-label="Producto">
                  <div className="product-cell">
                    <span className="product-avatar">
                      {product.name.charAt(0).toLocaleUpperCase("es")}
                    </span>
                    <div>
                      <strong>{product.name}</strong>
                      <small>ID #{product.id}</small>
                    </div>
                  </div>
                </td>
                <td data-label="Código">
                  <code>{product.barcode}</code>
                </td>
                <td data-label="Precio">
                  <strong className="price">
                    {formatMoney(product.price)}
                  </strong>
                </td>
                <td data-label="Actualizado">
                  <time dateTime={product.last_updated}>
                    {formatDate(product.last_updated)}
                  </time>
                </td>
                <td data-label="Peso">
                  {product.weight !== null && product.weight_unit ? (
                    <strong>
                      {Number(product.weight).toLocaleString("es-AR", {
                        maximumFractionDigits: 2,
                      })}{" "}
                      {product.weight_unit}
                    </strong>
                  ) : (
                    <span className="muted-value">Sin especificar</span>
                  )}
                </td>
                <td data-label="Impreso">
                  <button
                    className={`print-status ${product.printed ? "printed" : "pending"}`}
                    type="button"
                    onClick={() => onPrintStatus(product, !product.printed)}
                    aria-label={
                      product.printed
                        ? `Volver a marcar ${product.name} como pendiente`
                        : `Marcar ${product.name} como impreso`
                    }
                  >
                    <i /> {product.printed ? "Impreso" : "Pendiente"}
                  </button>
                </td>
                <td className="row-actions">
                  <button
                    type="button"
                    onClick={() => onEdit(product)}
                    aria-label={`Editar ${product.name}`}
                  >
                    Editar
                  </button>
                  <button
                    className="delete"
                    type="button"
                    onClick={() => onDelete(product)}
                    aria-label={`Eliminar ${product.name}`}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="pagination">
        <p>
          Mostrando{" "}
          <strong>
            {start}–{end}
          </strong>{" "}
          de <strong>{total}</strong>
        </p>
        <div>
          <button
            type="button"
            disabled={page === 1}
            onClick={() => onPageChange(page - 1)}
          >
            ← Anterior
          </button>
          <span>
            Página {page} de {totalPages}
          </span>
          <button
            type="button"
            disabled={page === totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Siguiente →
          </button>
        </div>
      </footer>
    </>
  );
}

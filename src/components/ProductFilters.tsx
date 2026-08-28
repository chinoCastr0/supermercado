/**
 * IMPORTANCIA: agrupa los controles de búsqueda, estado y orden.
 *
 * PATRÓN / SOLID: Controlled Component. Aplica SRP e ISP porque sólo recibe los
 * valores y callbacks necesarios. El catálogo de filtros es solución específica.
 */
import type {
  PrintFilter,
  ProductSort,
  StatusFilter,
} from "../types/product";

type Props = {
  query: string;
  status: StatusFilter;
  printStatus: PrintFilter;
  sort: ProductSort;
  onQueryChange: (value: string) => void;
  onStatusChange: (value: StatusFilter) => void;
  onPrintStatusChange: (value: PrintFilter) => void;
  onSortChange: (value: ProductSort) => void;
};

export function ProductFilters({
  query,
  status,
  printStatus,
  sort,
  onQueryChange,
  onStatusChange,
  onPrintStatusChange,
  onSortChange,
}: Props) {
  return (
    <div className="filters">
      <label className="search">
        <span>⌕</span>
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Buscar por nombre o código..."
          aria-label="Buscar productos"
        />
      </label>
      <select
        value={status}
        onChange={(event) => onStatusChange(event.target.value as StatusFilter)}
        aria-label="Filtrar por estado"
      >
        <option value="all">Todos los estados</option>
        <option value="active">Activos</option>
        <option value="inactive">Inactivos</option>
      </select>
      <select
        value={printStatus}
        onChange={(event) =>
          onPrintStatusChange(event.target.value as PrintFilter)
        }
        aria-label="Filtrar por impresión"
      >
        <option value="all">Todos los carteles</option>
        <option value="pending">Pendientes</option>
        <option value="printed">Impresos</option>
      </select>
      <select
        value={sort}
        onChange={(event) => onSortChange(event.target.value as ProductSort)}
        aria-label="Ordenar productos"
      >
        <option value="name">Nombre A–Z</option>
        <option value="price-asc">Menor precio</option>
        <option value="price-desc">Mayor precio</option>
        <option value="updated-desc">Actualización reciente</option>
      </select>
    </div>
  );
}

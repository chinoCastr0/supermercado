/**
 * Controles de búsqueda, estado y orden administrados por el componente padre.
 * Los cambios se notifican por callbacks; el debounce se aplica fuera del formulario.
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

/** Presenta valores controlados y comunica cambios sin consultar datos. */
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
          placeholder="Buscar nombre, peso o código..."
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

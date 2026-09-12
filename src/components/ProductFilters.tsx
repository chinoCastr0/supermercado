/**
 * Controles de búsqueda, estado y orden administrados por el componente padre.
 * Los cambios se notifican por callbacks; el debounce se aplica fuera del formulario.
 */
import type { Ref } from "react";
import type {
  PrintFilter,
  ProductSort,
} from "../types/product";

type Props = {
  searchInputRef?: Ref<HTMLInputElement>;
  query: string;
  printStatus: PrintFilter;
  sort: ProductSort;
  onQueryChange: (value: string) => void;
  onPrintStatusChange: (value: PrintFilter) => void;
  onSortChange: (value: ProductSort) => void;
};

/** Presenta valores controlados y comunica cambios sin consultar datos. */
export function ProductFilters({
  searchInputRef,
  query,
  printStatus,
  sort,
  onQueryChange,
  onPrintStatusChange,
  onSortChange,
}: Props) {
  return (
    <div className="filters">
      <label className="search">
        <span>⌕</span>
        <input
          ref={searchInputRef}
          data-barcode-search
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Buscar nombre, peso o código..."
          aria-label="Buscar productos"
        />
      </label>
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

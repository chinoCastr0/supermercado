import type { ProductSort, StatusFilter } from '../types/product'

type Props = {
  query: string
  status: StatusFilter
  sort: ProductSort
  onQueryChange: (value: string) => void
  onStatusChange: (value: StatusFilter) => void
  onSortChange: (value: ProductSort) => void
}

export function ProductFilters({ query, status, sort, onQueryChange, onStatusChange, onSortChange }: Props) {
  return <div className="filters">
    <label className="search"><span>⌕</span><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Buscar por nombre o código..." aria-label="Buscar productos" /></label>
    <select value={status} onChange={(event) => onStatusChange(event.target.value as StatusFilter)} aria-label="Filtrar por estado">
      <option value="all">Todos los estados</option><option value="active">Activos</option><option value="inactive">Inactivos</option>
    </select>
    <select value={sort} onChange={(event) => onSortChange(event.target.value as ProductSort)} aria-label="Ordenar productos">
      <option value="name">Nombre A–Z</option><option value="price-asc">Menor precio</option><option value="price-desc">Mayor precio</option><option value="updated-desc">Actualización reciente</option>
    </select>
  </div>
}

import { useMemo, useState } from 'react'
import './App.css'
import { ImportModal } from './components/ImportModal'
import { Layout } from './components/Layout'
import { NoticeBanner } from './components/NoticeBanner'
import { ProductFilters } from './components/ProductFilters'
import { ProductModal } from './components/ProductModal'
import { ProductsTable } from './components/ProductsTable'
import { StatsCards } from './components/StatsCards'
import { useProducts } from './hooks/useProducts'
import type { Product, ProductSort, StatusFilter } from './types/product'

const PAGE_SIZE = 10

function App() {
  const inventory = useProducts()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [sort, setSort] = useState<ProductSort>('name')
  const [page, setPage] = useState(1)
  const [modal, setModal] = useState<'product' | 'import' | null>(null)
  const [editing, setEditing] = useState<Product | null>(null)

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es')
    return inventory.products.filter((product) => {
      const matchesText = !normalized || product.name.toLocaleLowerCase('es').includes(normalized) || product.barcode.toLocaleLowerCase('es').includes(normalized)
      const matchesStatus = status === 'all' || (status === 'active' ? product.active : !product.active)
      return matchesText && matchesStatus
    }).sort((left, right) => {
      if (sort === 'price-asc') return Number(left.price) - Number(right.price)
      if (sort === 'price-desc') return Number(right.price) - Number(left.price)
      if (sort === 'updated-desc') return Date.parse(right.last_updated) - Date.parse(left.last_updated)
      return left.name.localeCompare(right.name, 'es')
    })
  }, [inventory.products, query, sort, status])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const resetPage = <T,>(setter: (value: T) => void) => (value: T) => { setter(value); setPage(1) }
  const closeModal = () => setModal(null)
  const createProduct = () => { setEditing(null); setModal('product') }
  const editProduct = (product: Product) => { setEditing(product); setModal('product') }

  return <Layout onImport={() => setModal('import')} onRefresh={() => void inventory.load()}>
    <section className="content">
      <div className="page-heading">
        <div><h1>Productos</h1><p>Consultá y administrá todo tu inventario desde un solo lugar.</p></div>
        <div className="heading-actions">
          <button className="button secondary" type="button" onClick={() => setModal('import')}>⇧ <span>Importar</span></button>
          <button className="button primary" type="button" onClick={createProduct}>＋ <span>Nuevo producto</span></button>
        </div>
      </div>
      {inventory.notice && <NoticeBanner notice={inventory.notice} onClose={() => inventory.setNotice(null)} />}
      <StatsCards products={inventory.products} />
      <section className="data-card" aria-labelledby="table-title">
        <div className="table-toolbar">
          <div><h2 id="table-title">Base de productos</h2><p>{filtered.length} resultado{filtered.length === 1 ? '' : 's'}</p></div>
          <ProductFilters query={query} status={status} sort={sort} onQueryChange={resetPage(setQuery)} onStatusChange={resetPage(setStatus)} onSortChange={resetPage(setSort)} />
        </div>
        <ProductsTable products={visible} total={filtered.length} page={currentPage} totalPages={totalPages} isLoading={inventory.isLoading} hasAnyProducts={Boolean(inventory.products.length)} onPageChange={setPage} onCreate={createProduct} onEdit={editProduct} onDelete={(product) => void inventory.remove(product)} />
      </section>
    </section>
    {modal === 'product' && <ProductModal key={editing?.id ?? 'new'} product={editing} isSaving={inventory.isSaving} onClose={closeModal} onSave={inventory.save} />}
    {modal === 'import' && <ImportModal isSaving={inventory.isSaving} onClose={closeModal} onImport={inventory.importProducts} />}
  </Layout>
}

export default App

/**
 * Composición de la pantalla: filtros, selección, orden y apertura de modales.
 * El hook administra operaciones remotas. La paginación actual es local, sobre
 * todos los resultados descargados. Las selecciones conservan identidades entre filtros.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import type { ScannerLookupOutcome } from "./components/BarcodeScanner";
import { BulkPriceModal } from "./components/BulkPriceModal";
import { ImportModal } from "./components/ImportModal";
import {
  LabelPreviewModal,
  type LabelPreview,
} from "./components/LabelPreviewModal";
import { Layout, type AppView } from "./components/Layout";
import { MissingProductsView } from "./components/MissingProductsView";
import { Modal } from "./components/Modal";
import { NoticeBanner } from "./components/NoticeBanner";
import { ProductFilters } from "./components/ProductFilters";
import { ProductModal } from "./components/ProductModal";
import { ProductsTable } from "./components/ProductsTable";
import { StatsCards } from "./components/StatsCards";
import { useProducts } from "./hooks/useProducts";
import { useBarcodeKeyboard } from "./hooks/useBarcodeKeyboard";
import type {
  PrintFilter,
  Product,
  ProductSort,
  ProductPayload,
} from "./types/product";
import { closeProductEditor, saveProductAndReset } from "./utils/productModal";
import { compareMoney } from "./utils/money";
import {
  applySearchInput,
  scheduleDebouncedSearch,
} from "./utils/productSearch";

const PAGE_SIZE = 10;
const BarcodeScanner = lazy(() =>
  import("./components/BarcodeScanner").then(({ BarcodeScanner }) => ({
    default: BarcodeScanner,
  })),
);

/** Coordina el inventario visible y las acciones de sus componentes. */
function App() {
  const inventory = useProducts();
  const loadProducts = inventory.load;
  const [view, setView] = useState<AppView>("productos");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [printStatus, setPrintStatus] = useState<PrintFilter>("all");
  const [sort, setSort] = useState<ProductSort>("updated-desc");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<
    "product" | "import" | "scanner" | null
  >(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [newProductBarcode, setNewProductBarcode] = useState("");
  const [focusProductCost, setFocusProductCost] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const restoreSearchFocus = useRef(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [bulkPriceProducts, setBulkPriceProducts] = useState<Product[] | null>(
    null,
  );
  const [labelPreview, setLabelPreview] = useState<LabelPreview | null>(null);

  useEffect(() => {
    if (modal === null && restoreSearchFocus.current) {
      restoreSearchFocus.current = false;
      searchInputRef.current?.focus({ preventScroll: true });
    }
  }, [modal]);

  useEffect(
    () => scheduleDebouncedSearch(query, setDebouncedQuery),
    [query],
  );

  useEffect(() => {
    void loadProducts({ search: debouncedQuery, printStatus });
  }, [debouncedQuery, loadProducts, printStatus]);

  // El filtrado ya ocurrió en SQL. Este orden local reemplaza la relevancia del backend.
  const filtered = useMemo(() => {
    return inventory.products
      .slice()
      .sort((left, right) => {
        if (sort === "price-asc")
          return compareMoney(left.price, right.price);
        if (sort === "price-desc")
          return compareMoney(right.price, left.price);
        if (sort === "updated-desc")
          return Date.parse(right.last_updated) - Date.parse(left.last_updated);
        return left.name.localeCompare(right.name, "es");
      });
  }, [inventory.products, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const resetPage =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(1);
    };
  const closeModal = () => setModal(null);
  const closeProductModal = () => closeProductEditor({
    setNewProductBarcode, setFocusProductCost, restoreSearchFocus, closeModal,
  });
  const saveProduct = (payload: ProductPayload, productId?: number) =>
    saveProductAndReset(inventory.save, payload, productId, () => {
      setQuery("");
      setDebouncedQuery("");
      setPage(1);
    });
  const createProduct = () => {
    setFocusProductCost(false);
    setEditing(null);
    setNewProductBarcode("");
    setModal("product");
  };
  const editProduct = (product: Product) => {
    setFocusProductCost(false);
    setEditing(product);
    setNewProductBarcode("");
    setModal("product");
  };
  const handleScannedBarcode = async (
    barcode: string,
  ): Promise<ScannerLookupOutcome> => {
    const product = await inventory.findByBarcode(barcode);
    if (product === undefined) return "error";
    if (product === null) {
      createScannedProduct(barcode);
      return "not-found";
    }
    editProduct(product);
    setFocusProductCost(true);
    return "found";
  };
  const createScannedProduct = (barcode: string) => {
    setFocusProductCost(false);
    setEditing(null);
    setNewProductBarcode(barcode);
    setModal("product");
  };
  useBarcodeKeyboard(
    view === "productos" &&
      modal === null &&
      bulkPriceProducts === null &&
      labelPreview === null,
    handleScannedBarcode,
  );
  const pendingFiltered = filtered.filter((product) => !product.printed);
  const availableProductIds = new Set(
    inventory.products.map((product) => product.id),
  );
  // La selección efectiva excluye identidades que no están en el resultado actual.
  // selectedIds conserva otras identidades y pueden reaparecer al quitar filtros.
  const selectedProductIds = [...selectedIds].filter((productId) =>
    availableProductIds.has(productId),
  );
  const selectedProducts = inventory.products.filter((product) =>
    selectedIds.has(product.id),
  );
  const toggleSelected = (productId: number) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };
  const togglePage = (productIds: number[], selected: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      productIds.forEach((productId) =>
        selected ? next.add(productId) : next.delete(productId),
      );
      return next;
    });
  };
  const selectAllPending = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      pendingFiltered.forEach((product) => next.add(product.id));
      return next;
    });
  };
  const generateLabels = async () => {
    const requestedIds = selectedIds.size
      ? selectedProductIds
      : pendingFiltered.map((product) => product.id);
    if (!requestedIds.length) {
      inventory.setNotice({
        kind: "error",
        message: "Seleccioná productos o filtrá carteles pendientes.",
      });
      return;
    }
    const generated = await inventory.generateLabels(requestedIds);
    if (!generated) return;
    const skipped = new Set(generated.warnings.map((warning) => warning.product_id));
    setLabelPreview({
      ...generated,
      url: URL.createObjectURL(generated.blob),
      productIds: requestedIds.filter((productId) => !skipped.has(productId)),
    });
  };
  const closeLabelPreview = () => {
    if (labelPreview) URL.revokeObjectURL(labelPreview.url);
    setLabelPreview(null);
  };
  const confirmLabelBatch = async () => {
    if (!labelPreview) return;
    const confirmed = window.confirm(
      `¿Confirmás que se imprimieron ${labelPreview.productCount} carteles?`,
    );
    if (!confirmed) return;
    const result = await inventory.confirmLabelBatch(labelPreview.batchId);
    if (result) {
      setSelectedIds((current) => {
        const next = new Set(current);
        labelPreview.productIds.forEach((productId) => next.delete(productId));
        return next;
      });
      closeLabelPreview();
    }
  };
  const markSelection = async (printed: boolean) => {
    if (!selectedProductIds.length) {
      setSelectedIds(new Set());
      inventory.setNotice({
        kind: "error",
        message: "Los productos seleccionados ya no existen.",
      });
      return;
    }
    const label = printed ? "impresos" : "pendientes";
    if (
      !window.confirm(
        `¿Marcar ${selectedProductIds.length} producto${selectedProductIds.length === 1 ? "" : "s"} como ${label}?`,
      )
    )
      return;
    if (await inventory.setPrintStatus(selectedProductIds, printed)) {
      setSelectedIds(new Set());
    }
  };
  const deleteProduct = async (product: Product) => {
    if (!(await inventory.remove(product))) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      next.delete(product.id);
      return next;
    });
  };
  // La copia conserva las revisiones que el usuario revisará antes de confirmar.
  const openBulkPrice = () => {
    setBulkPriceProducts(
      selectedProducts.map((product) => ({ ...product })),
    );
  };
  const applyBulkPrice = async (
    price: string,
    products: { id: number; expected_revision: number }[],
  ) => {
    const applied = await inventory.bulkUpdatePrice(price, products);
    if (applied) {
      setSelectedIds(new Set());
      setBulkPriceProducts(null);
    }
    return applied;
  };
  const deleteSelected = async () => {
    if (!selectedProductIds.length) return;
    const confirmed = window.confirm(
      `¿Eliminar permanentemente ${selectedProductIds.length} producto${selectedProductIds.length === 1 ? "" : "s"}?`,
    );
    if (!confirmed) return;
    if (await inventory.bulkDelete(selectedProductIds)) {
      setSelectedIds(new Set());
    }
  };

  return (
    <Layout
      view={view}
      onNavigate={setView}
      onImport={() => setModal("import")}
      onRefresh={() => {
        if (view === "productos") void inventory.load();
      }}
    >
      {view === "faltantes" && <MissingProductsView />}
      {view === "productos" && (
      <section className="content">
        <div className="page-heading">
          <div>
            <h1>Productos</h1>
            <p>Consultá y administrá todo tu inventario desde un solo lugar.</p>
          </div>
          <div className="heading-actions">
            <button
              className="button secondary scan-button"
              type="button"
              onClick={() => setModal("scanner")}
            >
              ▣ <span>Escanear</span>
            </button>
            <button
              className="button secondary"
              type="button"
              disabled={inventory.isExporting}
              onClick={() => void inventory.exportRegister()}
            >
              {inventory.isExporting ? "Generando…" : "Exportar caja"}
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => setModal("import")}
            >
              ⇧ <span>Importar</span>
            </button>
            <button
              className="button primary"
              type="button"
              onClick={createProduct}
            >
              ＋ <span>Nuevo producto</span>
            </button>
          </div>
        </div>
        {inventory.notice && (
          <NoticeBanner
            notice={inventory.notice}
            onClose={() => inventory.setNotice(null)}
          />
        )}
        <StatsCards products={inventory.products} />
        <section className="data-card" aria-labelledby="table-title">
          <div className="print-toolbar">
            <div>
              <strong>{selectedProductIds.length} seleccionados</strong>
              <span>
                {pendingFiltered.length} pendientes en los resultados actuales
              </span>
            </div>
            <div>
              {selectedProductIds.length > 0 && (
                <>
                  <button
                    className="button secondary"
                    type="button"
                    disabled={inventory.isSaving}
                    onClick={openBulkPrice}
                  >
                    Cambiar precio
                  </button>
                  <button
                    className="button danger"
                    type="button"
                    disabled={inventory.isSaving}
                    onClick={() => void deleteSelected()}
                  >
                    Eliminar seleccionados
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    disabled={inventory.isSaving}
                    onClick={() => setSelectedIds(new Set())}
                  >
                    Limpiar selección
                  </button>
                </>
              )}
              <button
                className="button secondary"
                type="button"
                disabled={!pendingFiltered.length}
                onClick={selectAllPending}
              >
                Seleccionar todos los pendientes
              </button>
              <button
                className="button secondary"
                type="button"
                disabled={!selectedProductIds.length || inventory.isSaving}
                onClick={() => void markSelection(false)}
              >
                Volver a pendientes
              </button>
              <button
                className="button secondary"
                type="button"
                disabled={!selectedProductIds.length || inventory.isSaving}
                onClick={() => void markSelection(true)}
              >
                Marcar impresos
              </button>
              <button
                className="button primary"
                type="button"
                disabled={
                  inventory.isGeneratingLabels ||
                  (!selectedProductIds.length && !pendingFiltered.length)
                }
                onClick={() => void generateLabels()}
              >
                {inventory.isGeneratingLabels
                  ? "Generando…"
                  : "Generar carteles"}
              </button>
            </div>
          </div>
          <div className="table-toolbar">
            <div>
              <h2 id="table-title">Base de productos</h2>
              <p>
                {filtered.length} resultado{filtered.length === 1 ? "" : "s"}
              </p>
            </div>
            <ProductFilters
              searchInputRef={searchInputRef}
              query={query}
              printStatus={printStatus}
              sort={sort}
              onQueryChange={(value) =>
                applySearchInput(value, setQuery, setPage)
              }
              onPrintStatusChange={resetPage(setPrintStatus)}
              onSortChange={resetPage(setSort)}
            />
          </div>
          <ProductsTable
            products={visible}
            total={filtered.length}
            page={currentPage}
            totalPages={totalPages}
            isLoading={inventory.isLoading}
            hasAnyProducts={Boolean(inventory.products.length)}
            selectedIds={selectedIds}
            onPageChange={setPage}
            onCreate={createProduct}
            onEdit={editProduct}
            onDelete={(product) => void deleteProduct(product)}
            onToggleSelected={toggleSelected}
            onTogglePage={togglePage}
            onPrintStatus={(product, printed) =>
              void inventory.setPrintStatus([product.id], printed)
            }
          />
        </section>
      </section>
      )}
      {modal === "product" && (
        <ProductModal
          key={editing?.id ?? `new-${newProductBarcode || "blank"}`}
          product={editing}
          initialBarcode={newProductBarcode}
          focusCost={focusProductCost}
          isSaving={inventory.isSaving}
          onClose={closeProductModal}
          onSave={saveProduct}
        />
      )}
      {modal === "import" && (
        <ImportModal
          error={
            inventory.notice?.kind === "error"
              ? inventory.notice.message
              : null
          }
          isSaving={inventory.isSaving}
          onClose={closeModal}
          onImport={inventory.importProducts}
        />
      )}
      {modal === "scanner" && (
        <Suspense
          fallback={
            <Modal
              titleId="barcode-scanner-loading-title"
              isBusy={false}
              onClose={closeModal}
              className="barcode-scanner-modal"
            >
              <div className="modal-header scanner-header">
                <h2 id="barcode-scanner-loading-title">Cargando lector…</h2>
                <button type="button" onClick={closeModal} aria-label="Cerrar">
                  ×
                </button>
              </div>
              <div className="scanner-feedback" role="status">
                <strong>Preparando el lector…</strong>
              </div>
            </Modal>
          }
        >
          <BarcodeScanner
            onClose={closeModal}
            onDetected={handleScannedBarcode}
          />
        </Suspense>
      )}
      {bulkPriceProducts && (
        <BulkPriceModal
          products={bulkPriceProducts}
          isSaving={inventory.isSaving}
          error={
            inventory.notice?.kind === "error"
              ? inventory.notice.message
              : null
          }
          onClose={() => setBulkPriceProducts(null)}
          onConfirm={applyBulkPrice}
        />
      )}
      {labelPreview && (
        <LabelPreviewModal
          preview={labelPreview}
          isSaving={inventory.isSaving}
          onClose={closeLabelPreview}
          onConfirm={() => void confirmLabelBatch()}
        />
      )}
    </Layout>
  );
}

export default App;

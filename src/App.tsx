/**
 * IMPORTANCIA: es el punto de composición de la pantalla de inventario.
 *
 * PATRÓN / SOLID: funciona como Container Component y aplica SRP al coordinar
 * estado de interfaz sin conocer detalles de HTTP ni dibujar cada sección.
 *
 * SOLUCIÓN ESPECÍFICA: filtros, paginación y selección del modal de productos.
 * Estas reglas pueden cambiar sin modificar la API ni los componentes visuales.
 *
 * NOTA DIDÁCTICA: LSP no se marca en este frontend porque no existe una jerarquía
 * de subtipos intercambiables; atribuirlo aquí sería forzar el principio.
 */
import { lazy, Suspense, useMemo, useState } from "react";
import "./App.css";
import type { ScannerLookupOutcome } from "./components/BarcodeScanner";
import { ImportModal } from "./components/ImportModal";
import {
  LabelPreviewModal,
  type LabelPreview,
} from "./components/LabelPreviewModal";
import { Layout } from "./components/Layout";
import { Modal } from "./components/Modal";
import { NoticeBanner } from "./components/NoticeBanner";
import { ProductFilters } from "./components/ProductFilters";
import { ProductModal } from "./components/ProductModal";
import { ProductsTable } from "./components/ProductsTable";
import { StatsCards } from "./components/StatsCards";
import { useProducts } from "./hooks/useProducts";
import type {
  PrintFilter,
  Product,
  ProductSort,
  StatusFilter,
} from "./types/product";

const PAGE_SIZE = 10;
const BarcodeScanner = lazy(() =>
  import("./components/BarcodeScanner").then(({ BarcodeScanner }) => ({
    default: BarcodeScanner,
  })),
);

function App() {
  const inventory = useProducts();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [printStatus, setPrintStatus] = useState<PrintFilter>("all");
  const [sort, setSort] = useState<ProductSort>("name");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<
    "product" | "import" | "scanner" | null
  >(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [newProductBarcode, setNewProductBarcode] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [labelPreview, setLabelPreview] = useState<LabelPreview | null>(null);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("es");
    return inventory.products
      .filter((product) => {
        const matchesText =
          !normalized ||
          product.name.toLocaleLowerCase("es").includes(normalized) ||
          product.barcode.toLocaleLowerCase("es").includes(normalized);
        const matchesStatus =
          status === "all" ||
          (status === "active" ? product.active : !product.active);
        const matchesPrintStatus =
          printStatus === "all" ||
          (printStatus === "printed" ? product.printed : !product.printed);
        return matchesText && matchesStatus && matchesPrintStatus;
      })
      .sort((left, right) => {
        if (sort === "price-asc")
          return Number(left.price) - Number(right.price);
        if (sort === "price-desc")
          return Number(right.price) - Number(left.price);
        if (sort === "updated-desc")
          return Date.parse(right.last_updated) - Date.parse(left.last_updated);
        return left.name.localeCompare(right.name, "es");
      });
  }, [inventory.products, printStatus, query, sort, status]);

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
  const createProduct = () => {
    setEditing(null);
    setNewProductBarcode("");
    setModal("product");
  };
  const editProduct = (product: Product) => {
    setEditing(product);
    setNewProductBarcode("");
    setModal("product");
  };
  const handleScannedBarcode = async (
    barcode: string,
  ): Promise<ScannerLookupOutcome> => {
    const product = await inventory.findByBarcode(barcode);
    if (product === undefined) return "error";
    if (product === null) return "not-found";
    editProduct(product);
    return "found";
  };
  const createScannedProduct = (barcode: string) => {
    setEditing(null);
    setNewProductBarcode(barcode);
    setModal("product");
  };
  const pendingFiltered = filtered.filter((product) => !product.printed);
  const availableProductIds = new Set(
    inventory.products.map((product) => product.id),
  );
  const selectedProductIds = [...selectedIds].filter((productId) =>
    availableProductIds.has(productId),
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

  return (
    <Layout
      onImport={() => setModal("import")}
      onRefresh={() => void inventory.load()}
    >
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
              query={query}
              status={status}
              printStatus={printStatus}
              sort={sort}
              onQueryChange={resetPage(setQuery)}
              onStatusChange={resetPage(setStatus)}
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
      {modal === "product" && (
        <ProductModal
          key={editing?.id ?? `new-${newProductBarcode || "blank"}`}
          product={editing}
          initialBarcode={newProductBarcode}
          isSaving={inventory.isSaving}
          onClose={closeModal}
          onSave={inventory.save}
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
            onCreateProduct={createScannedProduct}
          />
        </Suspense>
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

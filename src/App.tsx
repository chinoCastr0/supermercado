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
import { useMemo, useState } from "react";
import "./App.css";
import { ImportModal } from "./components/ImportModal";
import {
  LabelPreviewModal,
  type LabelPreview,
} from "./components/LabelPreviewModal";
import { Layout } from "./components/Layout";
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

function App() {
  const inventory = useProducts();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [printStatus, setPrintStatus] = useState<PrintFilter>("all");
  const [sort, setSort] = useState<ProductSort>("name");
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<"product" | "import" | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
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
    setModal("product");
  };
  const editProduct = (product: Product) => {
    setEditing(product);
    setModal("product");
  };
  const pendingFiltered = filtered.filter((product) => !product.printed);
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
    const availableIds = new Set(inventory.products.map((product) => product.id));
    const requestedIds = selectedIds.size
      ? [...selectedIds].filter((productId) => availableIds.has(productId))
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
    if (!selectedIds.size) return;
    const label = printed ? "impresos" : "pendientes";
    if (
      !window.confirm(
        `¿Marcar ${selectedIds.size} producto${selectedIds.size === 1 ? "" : "s"} como ${label}?`,
      )
    )
      return;
    if (await inventory.setPrintStatus([...selectedIds], printed)) {
      setSelectedIds(new Set());
    }
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
              <strong>{selectedIds.size} seleccionados</strong>
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
                disabled={!selectedIds.size || inventory.isSaving}
                onClick={() => void markSelection(false)}
              >
                Volver a pendientes
              </button>
              <button
                className="button secondary"
                type="button"
                disabled={!selectedIds.size || inventory.isSaving}
                onClick={() => void markSelection(true)}
              >
                Marcar impresos
              </button>
              <button
                className="button primary"
                type="button"
                disabled={
                  inventory.isGeneratingLabels ||
                  (!selectedIds.size && !pendingFiltered.length)
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
            onDelete={(product) => void inventory.remove(product)}
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
          key={editing?.id ?? "new"}
          product={editing}
          isSaving={inventory.isSaving}
          onClose={closeModal}
          onSave={inventory.save}
        />
      )}
      {modal === "import" && (
        <ImportModal
          isSaving={inventory.isSaving}
          onClose={closeModal}
          onImport={inventory.importProducts}
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

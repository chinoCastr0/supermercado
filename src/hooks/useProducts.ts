/**
 * Estado remoto y operaciones del inventario para React.
 * Los contadores de carga descartan respuestas antiguas, pero no cancelan fetch.
 * Las mutaciones pueden completarse aunque falle la recarga posterior del listado.
 */
import { useCallback, useRef, useState } from "react";
import { BulkPriceConflictError, productsApi } from "../api/products";
import type {
  BulkProductRevision,
  GeneratedLabels,
  Notice,
  Product,
  ProductListFilters,
  ProductPayload,
} from "../types/product";

/** Conserva el mensaje de Error y usa un texto seguro para otros rechazos. */
function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/** Expone el listado, estados de operación, avisos y comandos del inventario. */
export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isGeneratingLabels, setIsGeneratingLabels] = useState(false);
  const [isSearchingBarcode, setIsSearchingBarcode] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  // Sólo la última carga puede publicar resultados; las anteriores siguen en red.
  const latestLoad = useRef(0);
  const latestFilters = useRef<ProductListFilters>({
    search: "",
    printStatus: "all",
  });

  const load = useCallback(async (filters?: ProductListFilters) => {
    if (filters) latestFilters.current = filters;
    const requestedFilters = latestFilters.current;
    const requestId = ++latestLoad.current;
    setIsLoading(true);
    try {
      const loadedProducts = await productsApi.listAll(requestedFilters);
      if (requestId === latestLoad.current) setProducts(loadedProducts);
    } catch (error) {
      if (requestId === latestLoad.current) {
        setNotice({
          kind: "error",
          message: errorMessage(
            error,
            "No se pudo conectar con la base de datos.",
          ),
        });
      }
    } finally {
      if (requestId === latestLoad.current) setIsLoading(false);
    }
  }, []);

  // El producto devuelto ya fue confirmado por el servidor; load sólo refresca la vista.
  const save = async (payload: ProductPayload, productId?: number) => {
    setIsSaving(true);
    setNotice(null);
    try {
      const saved = await productsApi.save(payload, productId);
      setProducts((current) => {
        const withoutSaved = current.filter(({ id }) => id !== saved.id);
        return [...withoutSaved, saved];
      });
      setNotice({
        kind: "success",
        message: productId ? "Producto actualizado." : "Producto agregado.",
      });
      await load();
      return true;
    } catch (error) {
      setNotice({
        kind: "error",
        message: errorMessage(error, "No se pudo guardar."),
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const findByBarcode = async (
    barcode: string,
  ): Promise<Product | null | undefined> => {
    setIsSearchingBarcode(true);
    setNotice(null);
    try {
      return await productsApi.findByBarcode(barcode);
    } catch (error) {
      setNotice({
        kind: "error",
        message: errorMessage(error, "No se pudo buscar el código escaneado."),
      });
      return undefined;
    } finally {
      setIsSearchingBarcode(false);
    }
  };

  const remove = async (product: Product) => {
    const confirmed = window.confirm(
      `¿Eliminar “${product.name}”? Esta acción no se puede deshacer.`,
    );

    if (!confirmed) return false;
    try {
      await productsApi.remove(product.id);
      setProducts((current) => current.filter(({ id }) => id !== product.id));
      setNotice({ kind: "success", message: "Producto eliminado." });
      return true;
    } catch (error) {
      setNotice({
        kind: "error",
        message: errorMessage(error, "No se pudo eliminar."),
      });
      return false;
    }
  };

  const bulkUpdatePrice = async (
    price: string,
    selectedProducts: BulkProductRevision[],
  ) => {
    setIsSaving(true);
    setNotice(null);
    try {
      const result = await productsApi.bulkUpdatePrice(price, selectedProducts);
      setNotice({
        kind: "success",
        message: `${result.updated_count} precio${result.updated_count === 1 ? "" : "s"} modificado${result.updated_count === 1 ? "" : "s"}${result.unchanged_count ? `; ${result.unchanged_count} sin cambios` : ""}.`,
      });
      await load();
      return true;
    } catch (error) {
      if (error instanceof BulkPriceConflictError) {
        const conflictIds = new Set(error.conflicts.map((conflict) => conflict.id));
        const names = products
          .filter((product) => conflictIds.has(product.id))
          .map((product) => `${product.name} (${product.barcode})`);
        setNotice({
          kind: "error",
          message: `${error.message}${names.length ? ` Desactualizados: ${names.join(", ")}.` : ""} Recargá y revisá la selección antes de volver a intentar.`,
        });
      } else {
        setNotice({
          kind: "error",
          message: errorMessage(error, "No se pudieron cambiar los precios."),
        });
      }
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const bulkDelete = async (productIds: number[]) => {
    setIsSaving(true);
    setNotice(null);
    try {
      const result = await productsApi.bulkDelete(productIds);
      setNotice({
        kind: "success",
        message: `${result.deleted_count} producto${result.deleted_count === 1 ? "" : "s"} eliminado${result.deleted_count === 1 ? "" : "s"}.`,
      });
      await load();
      return true;
    } catch (error) {
      setNotice({
        kind: "error",
        message: errorMessage(error, "No se pudieron eliminar los productos."),
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const importProducts = async (file: File) => {
    setIsSaving(true);
    setNotice(null);
    try {
      const result = await productsApi.import(file);
      const omitted = result.skipped_barcodes.length;
      const preserved = result.preserved_price_barcodes.length;
      const invalid = result.invalid_rows.length;
      setNotice({
        kind: invalid ? "error" : "success",
        message: `Importación completa: ${result.imported_count} nuevos, ${result.updated_count} existentes, ${result.price_updated_count} precios aumentados${preserved ? ` y ${preserved} precios menores rechazados` : ""}${omitted ? `; ${omitted} omitidos por no tener código de barras` : ""}${invalid ? `; ${invalid} filas rechazadas por datos inválidos: ${result.invalid_rows.join(" | ")}` : ""}.`,
      });
      await load();
      return true;
    } catch (error) {
      setNotice({
        kind: "error",
        message: errorMessage(error, "No se pudo importar."),
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const exportRegister = async () => {
    setIsExporting(true);
    setNotice(null);
    try {
      await productsApi.exportRegister();
      setNotice({
        kind: "success",
        message: "PRESUR1.DAT generado correctamente para la caja.",
      });
    } catch (error) {
      setNotice({
        kind: "error",
        message: errorMessage(error, "No se pudo generar PRESUR1.DAT."),
      });
    } finally {
      setIsExporting(false);
    }
  };

  const generateLabels = async (
    productIds: number[],
  ): Promise<GeneratedLabels | null> => {
    setIsGeneratingLabels(true);
    setNotice(null);
    try {
      return await productsApi.generateLabels(productIds);
    } catch (error) {
      setNotice({
        kind: "error",
        message: errorMessage(error, "No se pudieron generar los carteles."),
      });
      return null;
    } finally {
      setIsGeneratingLabels(false);
    }
  };

  const setPrintStatus = async (productIds: number[], printed: boolean) => {
    setIsSaving(true);
    setNotice(null);
    try {
      const result = await productsApi.setPrintStatus(productIds, printed);
      setNotice({
        kind: "success",
        message: `${result.updated_count} cartel${result.updated_count === 1 ? "" : "es"} marcado${result.updated_count === 1 ? "" : "s"} como ${printed ? "impreso" : "pendiente"}.`,
      });
      await load();
      return true;
    } catch (error) {
      setNotice({
        kind: "error",
        message: errorMessage(error, "No se pudo cambiar el estado de impresión."),
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const confirmLabelBatch = async (batchId: string) => {
    setIsSaving(true);
    setNotice(null);
    try {
      const result = await productsApi.confirmLabelBatch(batchId);
      const staleCount =
        result.stale_product_ids.length + result.missing_product_ids.length;
      setNotice({
        kind: staleCount ? "error" : "success",
        message: staleCount
          ? `${result.marked_count} carteles confirmados; ${staleCount} no se marcaron porque el producto cambió o ya no existe.`
          : `${result.marked_count} carteles marcados como impresos.`,
      });
      await load();
      return result;
    } catch (error) {
      setNotice({
        kind: "error",
        message: errorMessage(error, "No se pudo confirmar el lote impreso."),
      });
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  return {
    products,
    isLoading,
    isSaving,
    isExporting,
    isGeneratingLabels,
    isSearchingBarcode,
    notice,
    setNotice,
    load,
    save,
    findByBarcode,
    remove,
    bulkUpdatePrice,
    bulkDelete,
    importProducts,
    exportRegister,
    generateLabels,
    setPrintStatus,
    confirmLabelBatch,
  };
}

/**
 * IMPORTANCIA: administra el ciclo de vida y las operaciones del inventario.
 *
 * PATRÓN / SOLID: este Custom Hook actúa como servicio de aplicación para React.
 * Aplica SRP al separar estado/asíncronía de la presentación. Los componentes
 * consumen una interfaz estable en lugar de depender directamente de `fetch`.
 *
 * SOLUCIÓN ESPECÍFICA: mensajes en español, confirmación de borrado y recarga
 * completa luego de guardar o importar.
 */
import { useCallback, useEffect, useState } from "react";
import { productsApi } from "../api/products";
import type {
  GeneratedLabels,
  Notice,
  Product,
  ProductPayload,
} from "../types/product";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isGeneratingLabels, setIsGeneratingLabels] = useState(false);
  const [isSearchingBarcode, setIsSearchingBarcode] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setProducts(await productsApi.listAll());
    } catch (error) {
      setNotice({
        kind: "error",
        message: errorMessage(
          error,
          "No se pudo conectar con la base de datos.",
        ),
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const save = async (payload: ProductPayload, productId?: number) => {
    setIsSaving(true);
    setNotice(null);
    try {
      await productsApi.save(payload, productId);
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

  const importProducts = async (file: File) => {
    setIsSaving(true);
    setNotice(null);
    try {
      const result = await productsApi.import(file);
      const omitted = result.skipped_barcodes.length;
      setNotice({
        kind: "success",
        message: `Importación completa: ${result.imported_count} nuevos, ${result.updated_count} actualizados${omitted ? ` y ${omitted} omitidos por no tener código de barras` : ""}.`,
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
    importProducts,
    exportRegister,
    generateLabels,
    setPrintStatus,
    confirmLabelBatch,
  };
}

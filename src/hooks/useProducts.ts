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
import type { Notice, Product, ProductPayload } from "../types/product";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
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

  const remove = async (product: Product) => {
    const confirmed = window.confirm(
      `¿Eliminar “${product.name}”? Esta acción no se puede deshacer.`,
    );

    if (!confirmed) return;
    try {
      await productsApi.remove(product.id);
      setProducts((current) => current.filter(({ id }) => id !== product.id));
      setNotice({ kind: "success", message: "Producto eliminado." });
    } catch (error) {
      setNotice({
        kind: "error",
        message: errorMessage(error, "No se pudo eliminar."),
      });
    }
  };

  const importProducts = async (file: File) => {
    setIsSaving(true);
    setNotice(null);
    try {
      const result = await productsApi.import(file);
      const suffix = result.imported_count === 1 ? "" : "s";
      setNotice({
        kind: "success",
        message: `Importación completa: ${result.imported_count} producto${suffix} nuevo${suffix}.`,
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

  return {
    products,
    isLoading,
    isSaving,
    notice,
    setNotice,
    load,
    save,
    remove,
    importProducts,
  };
}

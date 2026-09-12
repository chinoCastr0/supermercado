/**
 * Estado remoto y operaciones de la lista de faltantes para React.
 * Sigue el mismo patrón que useProducts: un contador descarta respuestas de
 * cargas anteriores y cada mutación refresca la lista al terminar.
 * Ninguna operación de este hook toca el catálogo de productos.
 */
import { useCallback, useRef, useState } from "react";
import {
  MissingProductConflictError,
  missingProductsApi,
} from "../api/missingProducts";
import type {
  MissingListFilters,
  MissingProduct,
  MissingProductChanges,
  MissingProductPayload,
  MissingStatus,
} from "../types/missingProduct";
import type { Notice } from "../types/product";

/** Conserva el mensaje de Error y usa un texto seguro para otros rechazos. */
function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/** Expone la lista, estados de operación, avisos y comandos de faltantes. */
export function useMissingProducts() {
  const [items, setItems] = useState<MissingProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const latestLoad = useRef(0);
  const latestFilters = useRef<MissingListFilters>({
    search: "",
    status: "all",
  });

  const load = useCallback(async (filters?: MissingListFilters) => {
    if (filters) latestFilters.current = filters;
    const requestedFilters = latestFilters.current;
    const requestId = ++latestLoad.current;
    setIsLoading(true);
    try {
      const loaded = await missingProductsApi.list(requestedFilters);
      if (requestId === latestLoad.current) setItems(loaded);
    } catch (error) {
      if (requestId === latestLoad.current) {
        setNotice({
          kind: "error",
          message: errorMessage(
            error,
            "No se pudo cargar la lista de faltantes.",
          ),
        });
      }
    } finally {
      if (requestId === latestLoad.current) setIsLoading(false);
    }
  }, []);

  const create = async (payload: MissingProductPayload) => {
    setIsSaving(true);
    setNotice(null);
    try {
      await missingProductsApi.create(payload);
      setNotice({ kind: "success", message: "Faltante agregado." });
      await load();
      return true;
    } catch (error) {
      if (error instanceof MissingProductConflictError) {
        setNotice({
          kind: "error",
          message: `${error.message} Ya está anotado como “${error.existing.name}”.`,
        });
      } else {
        setNotice({
          kind: "error",
          message: errorMessage(error, "No se pudo agregar el faltante."),
        });
      }
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const update = async (
    missingId: number,
    changes: MissingProductChanges,
    successMessage = "Faltante actualizado.",
  ) => {
    setIsSaving(true);
    setNotice(null);
    try {
      const saved = await missingProductsApi.update(missingId, changes);
      setItems((current) =>
        current.map((item) => (item.id === saved.id ? saved : item)),
      );
      setNotice({ kind: "success", message: successMessage });
      await load();
      return true;
    } catch (error) {
      setNotice({
        kind: "error",
        message: errorMessage(error, "No se pudo actualizar el faltante."),
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const setStatus = (missingId: number, status: MissingStatus) =>
    update(
      missingId,
      { status },
      status === "resolved"
        ? "Faltante marcado como resuelto."
        : "Faltante reabierto.",
    );

  const remove = async (item: MissingProduct) => {
    if (
      !window.confirm(
        `¿Eliminar la anotación “${item.name}”? Esta acción no se puede deshacer.`,
      )
    )
      return false;
    setIsSaving(true);
    setNotice(null);
    try {
      await missingProductsApi.remove(item.id);
      setItems((current) => current.filter(({ id }) => id !== item.id));
      setNotice({ kind: "success", message: "Anotación eliminada." });
      return true;
    } catch (error) {
      setNotice({
        kind: "error",
        message: errorMessage(error, "No se pudo eliminar la anotación."),
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return {
    items,
    isLoading,
    isSaving,
    notice,
    setNotice,
    load,
    create,
    update,
    setStatus,
    remove,
  };
}

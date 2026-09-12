/**
 * Sección "Faltantes": alta rápida, búsqueda, filtro por estado y lista editable.
 * Prioriza la velocidad de uso en el negocio: escribir el nombre y Enter alcanza
 * para anotar. La vinculación con un producto del catálogo es opcional y solo
 * sirve como referencia; nunca copia precio, código de barras ni otros campos.
 */
import { useEffect, useRef, useState } from "react";
import { productsApi } from "../api/products";
import { useMissingProducts } from "../hooks/useMissingProducts";
import type { Product } from "../types/product";
import type {
  MissingDraft,
  MissingStatusFilter,
} from "../types/missingProduct";
import { buildMissingPayload } from "../utils/missingProducts";
import { scheduleDebouncedSearch } from "../utils/productSearch";
import { MissingProductsTable } from "./MissingProductsTable";
import { NoticeBanner } from "./NoticeBanner";

const EMPTY_DRAFT: MissingDraft = {
  name: "",
  quantity: "",
  notes: "",
  productId: null,
};

/** Coordina la lista de faltantes y el formulario de alta rápida. */
export function MissingProductsView() {
  const missing = useMissingProducts();
  const load = missing.load;

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<MissingStatusFilter>(
    "pending",
  );
  const [draft, setDraft] = useState<MissingDraft>(EMPTY_DRAFT);
  const [matches, setMatches] = useState<Product[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const linkedName = useRef<string | null>(null);

  useEffect(
    () => scheduleDebouncedSearch(query, setDebouncedQuery),
    [query],
  );

  useEffect(() => {
    void load({ search: debouncedQuery, status: statusFilter });
  }, [debouncedQuery, statusFilter, load]);

  // Sugerencias del catálogo para vincular; el faltante existe con o sin ellas.
  useEffect(() => {
    const term = draft.name.trim();
    if (term === linkedName.current) return;
    return scheduleDebouncedSearch(term, (value) => {
      if (value.trim().length < 2) {
        setMatches([]);
        return;
      }
      void productsApi
        .search(value)
        .then(setMatches)
        .catch(() => setMatches([]));
    });
  }, [draft.name]);

  const updateName = (value: string) => {
    if (linkedName.current !== null && value !== linkedName.current) {
      linkedName.current = null;
      setDraft((current) => ({ ...current, name: value, productId: null }));
      return;
    }
    setDraft((current) => ({ ...current, name: value }));
  };

  const linkProduct = (product: Product) => {
    linkedName.current = product.name;
    setDraft((current) => ({
      ...current,
      name: product.name,
      productId: product.id,
    }));
    setMatches([]);
    nameInputRef.current?.focus();
  };

  const clearLink = () => {
    linkedName.current = null;
    setDraft((current) => ({ ...current, productId: null }));
  };

  const submitAdd = async () => {
    const payload = buildMissingPayload(draft);
    if (!payload) {
      nameInputRef.current?.focus();
      return;
    }
    if (await missing.create(payload)) {
      linkedName.current = null;
      setDraft(EMPTY_DRAFT);
      setMatches([]);
      nameInputRef.current?.focus();
    }
  };

  const pendingCount = missing.items.filter(
    (item) => item.status === "pending",
  ).length;

  return (
    <section className="content">
      <div className="page-heading">
        <div>
          <h1>Faltantes</h1>
          <p>
            Anotá los productos que faltan reponer o comprar. Esta lista es
            operativa y no modifica el inventario.
          </p>
        </div>
        <div className="heading-actions">
          <button
            className="button secondary"
            type="button"
            onClick={() => void missing.load()}
          >
            ↻ <span>Actualizar</span>
          </button>
        </div>
      </div>

      {missing.notice && (
        <NoticeBanner
          notice={missing.notice}
          onClose={() => missing.setNotice(null)}
        />
      )}

      <form
        className="missing-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submitAdd();
        }}
      >
        <div className="missing-form-field missing-name-field">
          <label htmlFor="missing-name">Producto</label>
          <input
            id="missing-name"
            ref={nameInputRef}
            value={draft.name}
            onChange={(event) => updateName(event.target.value)}
            placeholder="ej: COCA COLA 2.25L"
            autoComplete="off"
          />
          {matches.length > 0 && (
            <ul className="missing-suggestions">
              {matches.map((product) => (
                <li key={product.id}>
                  <button type="button" onClick={() => linkProduct(product)}>
                    <strong>{product.name}</strong>
                    <span>{product.barcode}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {draft.productId !== null && (
            <p className="missing-link-chip">
              Vinculado a producto #{draft.productId}
              <button type="button" onClick={clearLink} aria-label="Quitar vínculo">
                ×
              </button>
            </p>
          )}
        </div>
        <div className="missing-form-field">
          <label htmlFor="missing-quantity">Cantidad (opcional)</label>
          <input
            id="missing-quantity"
            value={draft.quantity}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                quantity: event.target.value,
              }))
            }
            placeholder="ej: 3 bultos / media caja"
            autoComplete="off"
          />
        </div>
        <div className="missing-form-field">
          <label htmlFor="missing-notes">Nota (opcional)</label>
          <input
            id="missing-notes"
            value={draft.notes}
            onChange={(event) =>
              setDraft((current) => ({ ...current, notes: event.target.value }))
            }
            placeholder="ej: comprar si está menos de $X"
            autoComplete="off"
          />
        </div>
        <button
          className="button primary"
          type="submit"
          disabled={missing.isSaving || draft.name.trim() === ""}
        >
          ＋ <span>Agregar</span>
        </button>
      </form>

      <section className="data-card" aria-labelledby="missing-title">
        <div className="table-toolbar">
          <div>
            <h2 id="missing-title">Lista de faltantes</h2>
            <p>
              {pendingCount} pendiente{pendingCount === 1 ? "" : "s"} en la vista
              actual
            </p>
          </div>
          <div className="filters">
            <label className="search">
              <span>⌕</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nombre..."
                aria-label="Buscar faltantes"
              />
            </label>
            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as MissingStatusFilter)
              }
              aria-label="Filtrar por estado"
            >
              <option value="pending">Pendientes</option>
              <option value="resolved">Resueltos</option>
              <option value="all">Todos</option>
            </select>
          </div>
        </div>
        <MissingProductsTable
          items={missing.items}
          isLoading={missing.isLoading}
          isSaving={missing.isSaving}
          hasAny={missing.items.length > 0 || debouncedQuery !== "" || statusFilter !== "pending"}
          editingId={editingId}
          onEditStart={(item) => setEditingId(item.id)}
          onEditCancel={() => setEditingId(null)}
          onEditSave={(id, changes) => {
            void missing.update(id, changes).then((ok) => {
              if (ok) setEditingId(null);
            });
          }}
          onToggleStatus={(item) =>
            void missing.setStatus(
              item.id,
              item.status === "resolved" ? "pending" : "resolved",
            )
          }
          onDelete={(item) => void missing.remove(item)}
        />
      </section>
    </section>
  );
}

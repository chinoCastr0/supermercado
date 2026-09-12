/**
 * Tabla de faltantes con edición en línea (sin modal) para operaciones simples.
 * En móvil las filas se reordenan como tarjetas mediante los `data-label`,
 * igual que la tabla de productos. No consulta la API: notifica por callbacks.
 */
import { useState } from "react";
import type {
  MissingProduct,
  MissingProductChanges,
} from "../types/missingProduct";
import { formatDate } from "../utils/formatters";

type Props = {
  items: MissingProduct[];
  isLoading: boolean;
  isSaving: boolean;
  hasAny: boolean;
  editingId: number | null;
  onEditStart: (item: MissingProduct) => void;
  onEditCancel: () => void;
  onEditSave: (id: number, changes: MissingProductChanges) => void;
  onToggleStatus: (item: MissingProduct) => void;
  onDelete: (item: MissingProduct) => void;
};

/** Muestra la lista y notifica edición, cambio de estado y borrado. */
export function MissingProductsTable({
  items,
  isLoading,
  isSaving,
  hasAny,
  editingId,
  onEditStart,
  onEditCancel,
  onEditSave,
  onToggleStatus,
  onDelete,
}: Props) {
  if (isLoading)
    return (
      <div className="state-panel">
        <span className="loader" />
        <h3>Cargando faltantes</h3>
        <p>Estamos consultando la base de datos.</p>
      </div>
    );

  if (!items.length)
    return (
      <div className="state-panel">
        <div className="empty-icon">⌕</div>
        <h3>No hay faltantes para mostrar</h3>
        <p>
          {hasAny
            ? "Probá cambiando la búsqueda o el filtro de estado."
            : "Anotá el primer producto que falta reponer desde el formulario de arriba."}
        </p>
      </div>
    );

  return (
    <div className="table-wrap missing-table">
      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th>Cantidad</th>
            <th>Nota</th>
            <th>Fecha</th>
            <th>Estado</th>
            <th>
              <span className="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) =>
            item.id === editingId ? (
              <MissingEditRow
                key={item.id}
                item={item}
                isSaving={isSaving}
                onCancel={onEditCancel}
                onSave={onEditSave}
              />
            ) : (
              <tr key={item.id}>
                <td data-label="Producto">
                  <div className="product-cell">
                    <span className="product-avatar">
                      {item.name.charAt(0).toLocaleUpperCase("es")}
                    </span>
                    <div>
                      <strong>{item.name}</strong>
                      {item.product_id !== null && (
                        <small>Vinculado a producto #{item.product_id}</small>
                      )}
                    </div>
                  </div>
                </td>
                <td data-label="Cantidad">
                  {item.quantity ? (
                    <span>{item.quantity}</span>
                  ) : (
                    <span className="muted-value">—</span>
                  )}
                </td>
                <td data-label="Nota">
                  {item.notes ? (
                    <span>{item.notes}</span>
                  ) : (
                    <span className="muted-value">—</span>
                  )}
                </td>
                <td data-label="Fecha">
                  <time dateTime={item.created_at}>
                    {formatDate(item.created_at)}
                  </time>
                </td>
                <td data-label="Estado">
                  <span
                    className={`status-pill ${
                      item.status === "resolved" ? "active" : "inactive"
                    }`}
                  >
                    <i /> {item.status === "resolved" ? "Resuelto" : "Pendiente"}
                  </span>
                </td>
                <td className="row-actions">
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => onToggleStatus(item)}
                  >
                    {item.status === "resolved" ? "Reabrir" : "Resolver"}
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => onEditStart(item)}
                    aria-label={`Editar ${item.name}`}
                  >
                    Editar
                  </button>
                  <button
                    className="delete"
                    type="button"
                    disabled={isSaving}
                    onClick={() => onDelete(item)}
                    aria-label={`Eliminar ${item.name}`}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

type EditRowProps = {
  item: MissingProduct;
  isSaving: boolean;
  onCancel: () => void;
  onSave: (id: number, changes: MissingProductChanges) => void;
};

/** Fila en modo edición; su estado nace del ítem al montarse (key por id). */
function MissingEditRow({ item, isSaving, onCancel, onSave }: EditRowProps) {
  const [name, setName] = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity ?? "");
  const [notes, setNotes] = useState(item.notes ?? "");

  const save = () =>
    onSave(item.id, {
      name: name.trim(),
      quantity: quantity.trim() || null,
      notes: notes.trim() || null,
    });

  return (
    <tr>
      <td data-label="Producto">
        <input
          className="inline-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label="Nombre del faltante"
        />
      </td>
      <td data-label="Cantidad">
        <input
          className="inline-input"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          placeholder="ej: 2 bultos"
          aria-label="Cantidad deseada"
        />
      </td>
      <td data-label="Nota">
        <input
          className="inline-input"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Comentario opcional"
          aria-label="Nota"
        />
      </td>
      <td data-label="Fecha">
        <time dateTime={item.created_at}>{formatDate(item.created_at)}</time>
      </td>
      <td data-label="Estado">
        <span
          className={`status-pill ${
            item.status === "resolved" ? "active" : "inactive"
          }`}
        >
          <i /> {item.status === "resolved" ? "Resuelto" : "Pendiente"}
        </span>
      </td>
      <td className="row-actions">
        <button
          type="button"
          disabled={isSaving || name.trim() === ""}
          onClick={save}
        >
          Guardar
        </button>
        <button type="button" disabled={isSaving} onClick={onCancel}>
          Cancelar
        </button>
      </td>
    </tr>
  );
}

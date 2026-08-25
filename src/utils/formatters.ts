/**
 * IMPORTANCIA: mantiene una presentación consistente de dinero y fechas.
 *
 * PATRÓN / SOLID: aplica SRP al extraer reglas de formato puras y reutilizables.
 * No es lógica de negocio: transformar ARS y fechas a `es-AR` es una solución
 * específica de esta interfaz y puede sustituirse sin alterar los productos.
 */
export const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
});

export const dateTime = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
});

export function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin fecha" : dateTime.format(date);
}

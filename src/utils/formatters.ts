/**
 * Formato compartido de fechas en es-AR usando la zona horaria del navegador.
 * La instancia Intl se reutiliza para evitar recrearla en cada celda.
 */
export const dateTime = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
});

/** Presenta una fecha válida o una leyenda de ausencia. */
export function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin fecha" : dateTime.format(date);
}

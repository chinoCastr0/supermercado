# Caja (primera versión)

Calculadora local con precios del catálogo. No registra ventas ni modifica stock.
Acceso: `org:products:read`, tanto en navegación como en la vista.

- Reutiliza `productsApi.findByBarcode`, `useBarcodeKeyboard` / `createBarcodeKeyboardReader` y `BarcodeScanner`.
- Las consultas de escaneo se procesan en orden, incluso mientras otra consulta está pendiente. Nueva venta invalida respuestas anteriores.
- Una línea mantiene el precio obtenido al agregarla por primera vez; las lecturas repetidas incrementan su cantidad y la llevan arriba.
- Todos los importes se calculan con centavos `BigInt`; los precios y resultados se conservan como strings decimales.
- Enter en Paga con confirma el importe si alcanza, sin borrar la venta ni registrar un cobro. F2 enfoca el pago y Esc limpia el buscador. Enter al editar cantidad devuelve el foco al buscador.
- El lector reconoce ráfagas terminadas en Enter. En Cantidad/Paga con usa un umbral de 35 ms entre teclas y restaura el valor anterior al reconocer el código; en el buscador conserva el umbral habitual de 100 ms. Para lectores configurados con pausas mayores, usar el campo de escaneo. La escritura extremadamente rápida y un lector como teclado son indistinguibles sin un prefijo configurado en el dispositivo.
- `sessionStorage` conserva líneas y pago por usuario y organización; recupera únicamente datos válidos y tolera almacenamiento bloqueado o corrupto. Al volver a entrar en Caja se recupera el borrador. Los precios recuperados son los de ese borrador.

## Para guardar ventas más adelante

1. Tablas `sales` y `sale_items`, ambas vinculadas a la organización: usuario/cajero, fecha, estado, moneda, total, pago, vuelto e identificador de idempotencia; detalle con producto, código/nombre y precio histórico, cantidad y subtotal. Usar enteros de centavos o decimal exacto en la base.
2. Endpoint `POST /sales` autenticado, con aislamiento por organización, validación de cantidades y precios en el servidor, transacción atómica e idempotencia para evitar ventas duplicadas. Definir cómo resolver precios cambiados mientras se prepara la venta.
3. Permisos `org:sales:create` y `org:sales:read`; eventualmente permisos separados para anular y reembolsar. No ampliar implícitamente `org:products:read` para autorizar ventas.
4. Si se agrega stock, registrar sus movimientos en la misma transacción y definir una política para faltantes, anulaciones y devoluciones. Vaciar el borrador sólo después de la confirmación del servidor.

## Verificación

Pruebas puras en `tests/cash-register.test.mjs` y pruebas del lector en `tests/barcode-keyboard.test.mjs`. Ejecutar `npm run lint`, `npm run build` y `npm run test:frontend` (en PowerShell puede ser necesario `npm.cmd`).

Se probó la vista real en Chrome headless a 375 × 812 y 1440 × 1000, con catálogo simulado: escaneos, duplicados, cantidades, producto inexistente, error de conexión, pagos, vuelto, faltante, atajos, restauración del borrador y confirmación de nueva venta. También ráfagas en los campos editables. No se verificaron una cámara/lector físicos ni una sesión autenticada contra el backend real.

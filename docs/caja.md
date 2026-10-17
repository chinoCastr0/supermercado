# Caja

Caja registra ventas y permite consultar precios, ver ventas por fecha y guardar o confirmar el cierre diario. No descuenta stock. Anulaciones y devoluciones quedan fuera de esta etapa.

## Venta y consulta

- Cada línea tiene un `lineId` UUID. Los productos se fusionan por `productId` y conservan el primer precio; las líneas manuales nunca se fusionan. La descripción manual vacía se guarda como «Producto manual».
- Importes positivos normalizados con `normalizeMoneyInput`; cálculos con centavos BigInt. Cantidades enteras positivas. El backend aplica además sus límites de cantidad, tamaño del detalle y Numeric(12,2), rechazando desbordes.
- «Consultar precio» abre Modal. Un único handler dirige el lector a venta o consulta. El hook permite expresamente el diálogo marcado de consulta; otros diálogos conservan su protección. Cámara y teclado reutilizan el mismo destino.
- F2 enfoca el pago, Esc limpia el código o cierra consulta. «Aplicar pago»/Enter vuelve al escáner. «Finalizar venta» registra; pago vacío significa pago justo.
- Se conserva el borrador por usuario y organización en sessionStorage. Los borradores de la versión anterior se descartan; los nuevos conservan líneas, pago, clientId y el estado de envío.
- Cada venta mantiene un clientId UUID, reenviado al reintentar. El borrador se vacía únicamente después de una respuesta exitosa. Ante fallo de red o servidor, se bloquean las ediciones y se ofrece reintentar la misma venta. Ante un rechazo HTTP definitivo del primer intento se conservan los datos y se permite corregirlos. Si hubo un intento previo de resultado incierto, sigue bloqueada hasta recuperar la confirmación para no modificar una venta posiblemente registrada.
- Sin sessionStorage la venta funciona en memoria; cerrar o recargar esa pestaña pierde la capacidad de recuperar el borrador.
- El cajero se guarda como el ID de usuario autenticado de Clerk, mostrado en el historial. No se toma una identidad enviada por el cliente.

## Historial y cierre

Ventas muestra hora de Buenos Aires, artículos, total, cajero y detalle histórico expandible. El total del día se calcula en el backend. La fecha inicial viene del servidor.

Cierre tiene efectivo día/noche y grupos repetibles de transferencias, posnet y pedidos. AmountGroup se reutiliza para todos los grupos. Vacíos y cero valen cero; los inválidos se señalan y se excluyen del cálculo provisional sin impedir editar los demás campos. Guardar exige corregirlos.

closureSummary calcula subtotales, total y diferencia con dinero exacto. «Faltan», «Sobran» y «Cuadra» incluyen texto e icono además del color.

Hay un único cierre por organización y fecha. Guardar conserva un borrador editable; confirmar guarda el total de ventas de ese momento y bloquea los importes. Ventas posteriores no alteran la foto confirmada. Un admin puede reabrirlo; la próxima confirmación toma una nueva foto. Recargar descarta cambios locales tras confirmación del usuario.

## API y persistencia

- POST /sales: transacción de venta y detalle, unicidad (organization_id, client_id), recálculo de subtotales/total/pago/vuelto y validación del producto con get_owned.
- GET /sales?date=YYYY-MM-DD: ventas y total del día de la organización. Sin fecha usa America/Argentina/Buenos_Aires.
- GET y PUT /cash-closures/{date}: consulta y guardado del borrador.
- POST /cash-closures/{date}/confirm: confirma el borrador guardado.
- POST /cash-closures/{date}/reopen: exclusivo de org:admin.
- Las consultas de cierre filtran por organización y fecha; las escrituras usan bloqueo de fila. Crear simultáneamente el mismo cierre devuelve un conflicto recuperable.
- sales y sale_items guardan Decimal/Numeric(12,2). El detalle mantiene nombre/código históricos y precio enviado; nunca consulta precios nuevos para reescribir ventas previas.
- cash_closures guarda grupos JSON validados con strings decimales (consultables en PostgreSQL), total contado y total del sistema. No se usan números float en contratos ni cálculos de negocio.
- Migración aditiva: backend/migrations/20261017_add_sales_cash_closures.sql. No se aplicó a producción en esta tarea.

## Permisos

| Permiso | Empleado | Encargado | Admin |
|---|---|---|---|
| org:products:read (acceso a Caja y consulta) | Sí | Sí | Sí |
| org:sales:create | Sí | Sí | Sí |
| org:sales:read | Sí | Sí | Sí |
| org:closures:manage | No | Sí, mediante ENCARGADO_EXTRA | Sí |
| Reabrir | No | No | Sí, por rol |

El admin verificado recibe los tres permisos nuevos de Caja mediante ADMIN_EXTRA en el backend, incluso si su token de Clerk todavía no los incluye. /me/permissions devuelve esas mismas capacidades a la interfaz. Esta regla no concede otros permisos ni se aplica a empleados o encargados. Los permisos personalizados de ventas deben asignarse a member en Clerk; el encargado recibe cierres como permiso local adicional. Se mantienen las mismas claves en app/permissions.py y src/utils/permissions.ts.

**Pendiente de autorización específica:** crear/asignar permisos de ventas para empleados en Clerk de producción. No se modificó Clerk. El administrador puede operar Caja sin esta configuración; los empleados necesitan los permisos explícitos correspondientes.

## Verificación de esta ampliación

- npm run lint y npm run build.
- npm run test:frontend: 73 pruebas aprobadas; líneas manuales, restauración, dinero exacto, diferencias, permisos, lector en diálogo y adaptador HTTP con reintentos.
- Backend: 171 pruebas aprobadas; suite completa con SQLite, incluyendo idempotencia, total recalculado, snapshot, aislamiento, 403, cierre bloqueado, reapertura, faltante/sobrante y zona horaria.
- La suite backend omite 5 pruebas que requieren configuración adicional; no se verificó la migración ni concurrencia real contra PostgreSQL.
- **No verificado visualmente:** 375 px y 1440 px, claro y oscuro. La herramienta de navegador no ofrece navegadores y abrir Chrome responde «Browser is not available». Tampoco se verificaron cámara/lector físicos ni una sesión autenticada de producción.

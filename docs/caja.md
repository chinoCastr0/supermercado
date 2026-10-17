# Caja

Caja registra ventas y permite consultar precios, ver ventas por fecha y guardar o confirmar el cierre diario. No descuenta stock. Anulaciones y devoluciones quedan fuera de esta etapa.

## Venta y consulta

- Cada línea tiene un `lineId` UUID. Los productos se fusionan por `productId` y conservan el primer precio; las líneas manuales nunca se fusionan. La descripción manual vacía se guarda como «Producto manual».
- Importes positivos normalizados con `normalizeMoneyInput`; cálculos con centavos BigInt. Cantidades enteras positivas. El backend aplica además sus límites de cantidad, tamaño del detalle y Numeric(12,2), rechazando desbordes.
- «Consultar precio» abre Modal. Un único handler dirige el lector a venta o consulta. El hook permite expresamente el diálogo marcado de consulta; otros diálogos conservan su protección. Cámara y teclado reutilizan el mismo destino.
- F2 enfoca el pago y Esc limpia el código o cierra consulta. Se quitaron las leyendas visibles de atajos y el botón «Aplicar pago». Enter al escribir un pago no envía ni confirma nada; una ráfaga del lector terminada en Enter conserva su comportamiento de escaneo. «Finalizar venta» registra; pago vacío significa pago justo.
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
| org:products:read (consulta del catálogo) | Según permisos explícitos | Según permisos explícitos | Sí |
| org:sales:create | Sí | Sí | Sí |
| org:sales:read | No | Sí | Sí |
| org:closures:manage | No | Sí, mediante ENCARGADO_EXTRA | Sí |
| Reabrir | No | No | Sí, por rol |

ROLE_EXTRAS es idéntica en app/permissions.py y src/utils/permissions.ts: admin recibe todas las capacidades de aplicación; member recibe sales:create; encargado recibe sales:create, sales:read y closures:manage además de products:manage, prices:edit y export:register. Los permisos explícitos existentes se conservan. Reabrir y administrar miembros exige org:admin; no se infiere de un permiso de cierre. Caja se puede abrir con products:read o sales:create.

No hace falta crear estos permisos nuevos en Clerk. No se modificaron permisos ni roles de Clerk de producción. El rol encargado es local y requiere la respuesta del backend; no se lo deduce de un token member. PermissionsProvider repite /me/permissions al cambiar usuario, organización o rol, ignora respuestas anteriores y muestra un aviso con reintento si la consulta falla. Admin y empleado pueden vender mientras esperan esa respuesta.

## Diagnóstico del bloqueo y espaciado

Antes de corregir, una reproducción HTTP aislada (SQLite en memoria, identidad admin de organización de prueba sin permisos Clerk) devolvió /me/permissions 200 con los tres permisos de Caja y POST /sales 201. En cambio, la función usada por el frontend devolvía canCreateSales=false sin respuesta del servidor. Esto confirma la discrepancia local; no prueba qué versión está desplegada en el VPS ni reemplaza una sesión real de Clerk.

El espaciado compartido usa --page-gutter, --card-padding, --section-gap y --form-gap, derivados de la escala base 4:

| Ancho | Gutter | Tarjeta | Secciones | Formularios |
|---|---|---|---|---|
| >1050 | 32 | 24 | 24 | 16 |
| ≤1050 | 24 | 20 | 20 | 12 |
| ≤760 | 20 | 16 | 20 | 12 |
| ≤470 | 16 | 16 | 16 | 12 |

Se aplican a Productos, Faltantes, Equipo, Caja y modales. El calculador deja de ser una tarjeta anidada; se reducen bordes secundarios y los pagos rápidos se distribuyen en una grilla sin scroll horizontal. Se conservan avisos de error, restricciones del rol y contadores de límites del catálogo porque comunican estados o validaciones, no instrucciones de botones.

## Verificación de esta ampliación

- npm run lint y npm run build.
- npm run test:frontend: 78 pruebas aprobadas; incluye demora/error de permisos, cambio de organización, matriz por rol, líneas manuales, restauración, dinero exacto, diferencias, lector en diálogo y adaptador HTTP con reintentos.
- Backend: 176 pruebas aprobadas; suite con SQLite, incluyendo admin de organización nueva y empleado vendiendo sin permisos Clerk, empleado sin historial/cierre, encargado con cierre pero sin reapertura, idempotencia, aislamiento y snapshots.
- La suite backend omite 5 pruebas que requieren configuración adicional; no se verificó la migración ni concurrencia real contra PostgreSQL.
- **No verificado visualmente:** capturas antes/después a 375, 768, 1050 y 1440 px en claro y oscuro. El inventario de la herramienta devuelve apps y browsers vacíos; no se generaron capturas ni se certifica ausencia de desbordes. Tampoco se verificaron cámara/lector físicos ni una sesión autenticada de producción. Los comandos de diagnóstico/despliegue están en docs/VPS_COMMANDS.md y requieren autorización antes de ejecutarlos en producción.

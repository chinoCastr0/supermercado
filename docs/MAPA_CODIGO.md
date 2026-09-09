# Mapa de código y documentación

Índice de revisión de los archivos fuente actuales. No representa una promesa
de ausencia de defectos; consultar [AUDITORIA.md](AUDITORIA.md) para evidencia,
límites y propuestas. Las dependencias descargadas, binarios compilados y datos
de configuración privados no forman parte del código comentado.

## Backend

| Archivo | Responsabilidad y punto de mantenimiento |
| --- | --- |
| `backend/app/main.py` | Composición de rutas/CORS; arranque con DDL y health sin DB (A01/A06) |
| `backend/app/database.py` | Motor, sesión y adaptación del esquema; separar migración de runtime |
| `backend/app/money.py` | Parser decimal y convención de separadores; controlar magnitudes (A08) |
| `backend/app/api/products.py` | CRUD, búsqueda, lotes, importación y exportación; extraer casos de uso |
| `backend/app/api/labels.py` | Snapshots, PDF, marcado y confirmación; revisar transacciones (A07/A12) |
| `backend/app/models/__init__.py` | Registra todos los modelos en metadata por importación |
| `backend/app/models/product.py` | Catálogo, revisiones y versión impresa; faltan CHECK de dominio |
| `backend/app/models/price_change.py` | Historial sin FK destructiva al catálogo; falta actor e inmutabilidad |
| `backend/app/models/print_batch.py` | Lotes y snapshots, incluidas columnas nulas de compatibilidad |
| `backend/app/schemas/product.py` | DTOs Pydantic; validar null y estado final de modificaciones parciales |
| `backend/app/services/__init__.py` | Exportación del parser; importar el paquete carga pandas |
| `backend/app/services/excel_import.py` | Alias y normalización tabular; identidad y errores por fila (A02/A09) |
| `backend/app/services/label_pdf.py` | Precio comparable, EAN/Code128, ajuste y matriz A4; desacoplado por Protocol |
| `backend/app/services/label_state.py` | Invalidación por contenido visible; mover definición de campos al dominio |
| `backend/app/services/register_export.py` | Contrato PRESUR binario y control float32; identidad PLU y complejidad |

Los módulos, clases y funciones de aplicación tienen docstrings de responsabilidad
y contrato. Se agregaron explicaciones en decisiones críticas sin alterar las
operaciones ejecutables. La inmutabilidad de una dataclass no vuelve inmutables
las listas anidadas ni las filas de la base.

Verificación por AST: **15 módulos y 85 clases/funciones del backend**, sin
docstrings faltantes. El resto del alcance se documenta por módulo, operación
y bloques relevantes, sin contabilizar callbacks triviales como funciones públicas.

## Frontend

| Archivo | Responsabilidad y punto de mantenimiento |
| --- | --- |
| `src/main.tsx` | Montaje de React y registro del worker sólo en producción |
| `src/App.tsx` | Composición, selección, orden y modales; paginación local y acciones tardías |
| `src/hooks/useProducts.ts` | Estado remoto y comandos; distinguir invalidación de cancelación |
| `src/api/products.ts` | Transporte HTTP, error y descarga; tipos no validan JSON en runtime |
| `src/types/product.ts` | Contratos del frontend; sincronizar con los DTOs del backend |
| `src/utils/money.ts` | Dinero textual y centavos BigInt; mantener contrato con Python |
| `src/utils/formatters.ts` | Formato de fecha reutilizado; zona del navegador |
| `src/utils/registerFormat.ts` | Subconjunto CP1252 y límites de texto para caja |
| `src/utils/bulkPrice.ts` | Vista previa, revisiones y transiciones puras de confirmación |
| `src/utils/productSearch.ts` | Parámetros de búsqueda, debounce y reinicio de página |
| `src/components/BarcodeScanner.tsx` | Cámara, sesión y consulta; liberar recursos al cerrar |
| `src/components/BulkPriceModal.tsx` | Precio absoluto, vista previa y confirmación con revisiones congeladas |
| `src/components/ImportModal.tsx` | Archivo y feedback; el servidor impone los límites |
| `src/components/LabelPreviewModal.tsx` | Previsualización y descarga separadas de confirmación |
| `src/components/Layout.tsx` | Navegación; mensaje de conexión actualmente estático |
| `src/components/Modal.tsx` | Contenedor ARIA y cierres; faltan foco y bloqueo de todos los botones |
| `src/components/NoticeBanner.tsx` | Presentación de resultados, sin operaciones remotas |
| `src/components/ProductFilters.tsx` | Inputs controlados; no ejecuta consultas |
| `src/components/ProductModal.tsx` | Borrador, validación y envío; mostrar conflictos dentro del formulario |
| `src/components/ProductsTable.tsx` | Página visible y callbacks; tamaño de página duplicado |
| `src/components/StatsCards.tsx` | Indicadores de la colección recibida, no necesariamente globales |
| `src/App.css` | Tokens, componentes, estados y responsive; dividir por feature al crecer |
| `src/index.css` | Reset y fuente externa; considerar fuente local para offline |
| `public/service-worker.js` | Caché de interfaz, sin inventario; revisar actualizaciones y alcance de borrado |

Los módulos y funciones declaradas de TS/JS tienen comentarios de contrato.
Callbacks locales breves conservan nombres explícitos; se comentaron especialmente
selección, revisiones, ciclo de carga y recursos para no duplicar cada instrucción.

## Pruebas

| Archivo | Garantía ejercitada |
| --- | --- |
| `backend/tests/test_excel_import.py` | Alias, archivos Excel, fechas y medidas |
| `backend/tests/test_product_import.py` | Importación con datos existentes y nuevos |
| `backend/tests/test_product_validation.py` | Límites Pydantic para caja y pareja peso/unidad |
| `backend/tests/test_price_integrity.py` | Centavos, revisión obsoleta, sólo aumentos y snapshots |
| `backend/tests/test_bulk_products.py` | Lotes atómicos y supervivencia del historial/snapshots |
| `backend/tests/test_product_search.py` | Nombre, peso, unidad, filtros y paginación |
| `backend/tests/test_product_barcode_lookup.py` | Barcode exacto, ceros iniciales y ausencia |
| `backend/tests/test_label_batches.py` | Rechazo de versión obsoleta en ejecución secuencial |
| `backend/tests/test_label_state.py` | Campos visibles y transición a pendiente |
| `backend/tests/test_label_pdf.py` | Contenido, geometría y paginación PDF |
| `backend/tests/test_register_export.py` | Bytes, orden, límites y exactitud de centavos en caja |
| `tests/money.test.mjs` | Normalización, rechazo y orden monetario |
| `tests/bulk-price.test.mjs` | Vista previa y transición de confirmación |
| `tests/product-search.test.mjs` | Query string, debounce y página inicial |

Cada suite tiene una cabecera de alcance y tests con nombre de escenario.
Las pruebas SQLite no simulan bloqueo PostgreSQL. Las pruebas Node no simulan
el DOM ni una petición HTTP real. El diagnóstico de auditoría es separado de
las regresiones: reproduce defectos actuales, no exige perpetuarlos.

## Scripts operativos

| Archivo | Efectos y limitaciones |
| --- | --- |
| `backend/scripts/audit_edge_cases.py` | Nuevo diagnóstico: datos sintéticos y SQLite en memoria, salida JSON |
| `backend/scripts/audit_price_database.py` | Lectura de metadata/triggers/reglas de la base configurada |
| `backend/scripts/apply_price_integrity_schema.py` | Escribe esquema real; la huella posterior no revierte DDL |
| `backend/scripts/trace_price_transaction.py` | Ensayo con rollback de filas; puede consumir secuencias |
| `backend/scripts/verify_business_price_flow.py` | Escenario 5300/7000/6000 y PDF; rollback y mensajes de diagnóstico |
| `backend/scripts/generate_price_trace_pdf.py` | Ejemplos persistidos en SQLite y sobrescritura del PDF indicado |
| `backend/scripts/generate_sample_labels.py` | Ejemplos PDF de paginación; sobrescribe destino |
| `backend/scripts/render_pdf_pages.py` | Renderiza PNGs en destino; sobrescribe nombres iguales |
| `scripts/generate-pwa-icons.ps1` | Genera y reemplaza iconos PNG con System.Drawing |

Los scripts originales con sentencias al nivel de módulo se ejecutan al importar.
Propuesta: CLI con `main`, argumentos validados y contexto de base explícito.

## Configuración y artefactos

| Archivo/grupo | Lectura y mantenimiento |
| --- | --- |
| `backend/migrations/20260827_add_label_printing.sql` | Tablas/versiones de carteles; no incluye snapshots posteriores |
| `backend/migrations/20260904_price_integrity.sql` | Revisión, snapshots e historial; migración aditiva |
| `backend/requirements.txt` | Dependencias fijadas, runtime y herramientas mezcladas; faltan tests |
| `backend/.env.example` | Ejemplo público, DATABASE_URL obligatoria; DB_* es referencia sin implementación |
| `docker-compose.yml` | PostgreSQL 17 y volumen local; no configura backups ni aislamiento de red |
| `package.json` | Scripts dev/build/lint/test; JSON estricto, no admite comentarios |
| `package-lock.json` | Resolución npm; generado, no editar manualmente ni comentar |
| `vite.config.ts` | Plugins, proxy y hosts de desarrollo/preview; no configura servidor productivo |
| `eslint.config.js` | Análisis TS/TSX e ignores; no configura revisión equivalente de Python |
| `tsconfig.json` | Referencias de proyectos TypeScript |
| `tsconfig.app.json` | Compilación frontend; strict no está activado |
| `tsconfig.node.json` | Configuración de tooling Node |
| `index.html` | Host React, manifest y metadatos |
| `public/manifest.webmanifest` | JSON PWA con raíz `/`; subdirectorios necesitan ajuste de rutas |
| `.gitignore` | Reglas de exclusión; no retira archivos ya versionados |
| `.gitattributes` | Trato binario de DAT, PDF, PNG y XLSX |
| `README.md` | Reglas de negocio y operación; enlaza auditoría y plan |
| `public/*.png`, `public/*.svg`, `src/assets/*` | Recursos visuales; no son lógica; verificar uso antes de retirar ejemplos |
| `output/pdf/*.pdf` | Muestras existentes, no respaldo de catálogo |
| `backend/app.zip`, `**/__pycache__/*.pyc` | Artefactos versionados, no fuente mantenible; contenido no decompilado |

## Reproducción de verificaciones

Desde la raíz, con el entorno Python del proyecto disponible:

```powershell
$env:DATABASE_URL = 'sqlite:///:memory:'
$env:PYTHONPATH = 'backend'
$env:PYTHONDONTWRITEBYTECODE = '1'
& backend/.venv/Scripts/python.exe -B -m pytest backend/tests -q -p no:cacheprovider
& backend/.venv/Scripts/python.exe -B backend/scripts/audit_edge_cases.py
npm.cmd run test:frontend
npm.cmd run lint
npm.cmd run build
```

Usar una terminal dedicada para no conservar la URL de pruebas al iniciar el
servidor del negocio. No ejecutar los scripts de migración ni los de ensayo
contra la base real para repetir esta auditoría.

El diagnóstico produjo: barcode `Arroz` sin columna de código, cero filas ante
precio inválido, `InvalidOperation` para 40 dígitos, nombre importado de 20
caracteres, peso persistido `0.00`, null aceptado en precio parcial, unidad `g`
sin peso y precio negativo por escritura ORM directa. Estos resultados son
evidencia de problemas abiertos, no criterios de aceptación deseables.
